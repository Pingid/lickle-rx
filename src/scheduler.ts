/**
 * Schedulers control when work is executed.
 *
 * A scheduler provides two capabilities:
 * - `now()`: Returns the current time
 * - `schedule(work, delay?)`: Executes work after an optional delay
 *
 * Built-in schedulers:
 * - `asyncScheduler`: Uses `setTimeout`, suitable for most time-based operations
 * - `asapScheduler`: Uses microtasks (Promise.resolve), faster than setTimeout
 * - `animationFrameScheduler`: Uses `requestAnimationFrame`, ideal for UI animations
 * - `idleScheduler`: Uses `requestIdleCallback`, for low-priority background work
 * - `createQueueScheduler()`: Synchronous trampoline scheduler, prevents stack overflow
 * - `createVirtualScheduler()`: Virtual time scheduler for testing
 *
 * @module
 */

import { Unsubscribe } from './observable.js'

/**
 * Interface for schedulers that control execution timing.
 */
export interface Scheduler {
  /** Returns the current time */
  now: () => number
  /** Schedules a function to run after a delay */
  schedule: (work: () => void, delay?: number) => Unsubscribe
}

/**
 * Standard scheduler that uses setTimeout.
 * Used for time-based operations like delay, debounceTime, etc.
 */
export const asyncScheduler: Scheduler = {
  now: Date.now,
  schedule: (work, delay = 0) => {
    const id = setTimeout(work, delay)
    return () => clearTimeout(id)
  },
}

/**
 * Scheduler that uses requestAnimationFrame.
 * Essential for UI animations and smooth visual updates.
 */
export const animationFrameScheduler: Scheduler = {
  now: Date.now,
  schedule: (work, delay = 0) => {
    // If delay is 0, use rAF directly
    if (delay === 0) {
      const id = requestAnimationFrame(work)
      return () => cancelAnimationFrame(id)
    }
    // If there is a delay, fallback to setTimeout
    const id = setTimeout(() => {
      requestAnimationFrame(work)
    }, delay)
    return () => clearTimeout(id)
  },
}

/**
 * Scheduler that uses microtasks (Promise.resolve).
 *
 * Executes after synchronous code finishes but before the browser paints.
 * Faster than `setTimeout` and avoids the 4ms minimum delay clamping.
 * Falls back to `setTimeout` when a delay is specified.
 */
export const asapScheduler: Scheduler = {
  now: Date.now,
  schedule: (work, delay = 0) => {
    // If delay > 0, we must fall back to the async scheduler (setTimeout)
    if (delay > 0) {
      const id = setTimeout(work, delay)
      return () => clearTimeout(id)
    }

    let active = true
    Promise.resolve().then(() => {
      if (active) work()
    })

    return () => {
      active = false
    }
  },
}

/**
 * Scheduler that uses requestIdleCallback.
 *
 * Executes work only when the browser is idle, ideal for low-priority
 * background tasks that shouldn't interfere with user interactions.
 * Falls back to `setTimeout` in environments without `requestIdleCallback`.
 */
export const idleScheduler: Scheduler = {
  now: Date.now,
  schedule: (work, delay = 0) => {
    if (delay > 0) {
      const id = setTimeout(() => {
        requestIdleCallback(work)
      }, delay)
      return () => clearTimeout(id)
    }

    const id = requestIdleCallback(work)
    return () => cancelIdleCallback(id)
  },
}

const requestIdleCallback =
  globalThis.requestIdleCallback || ((cb: Function) => setTimeout(() => cb({ timeRemaining: () => 0 }), 1))

const cancelIdleCallback = globalThis.cancelIdleCallback || ((id: any) => clearTimeout(id))

/**
 * Creates a synchronous trampoline scheduler.
 *
 * When a task schedules another task synchronously, the new task is queued
 * and executed after the current one finishes, preventing stack overflow
 * from deep recursion. Each call creates an isolated scheduler instance.
 *
 * Falls back to `setTimeout` when a delay is specified.
 *
 * @returns A Scheduler instance with its own isolated queue.
 */
export const createQueueScheduler = (): Scheduler => {
  const queue: Array<{ id: number; work: () => void }> = []
  let flushing = false
  let idCounter = 0

  return {
    now: Date.now,

    schedule: (work, delay = 0) => {
      // 1. If there is a delay, we must drop back to the macro-task queue (setTimeout).
      // A synchronous queue cannot handle time delays.
      if (delay > 0) {
        const id = setTimeout(work, delay)
        return () => clearTimeout(id)
      }

      // 2. Assign an ID for cancellation support
      const currentId = idCounter++
      const task = { id: currentId, work }
      queue.push(task)

      // 3. If we are already flushing (iterating the queue), do nothing.
      // The while-loop below will pick up this new task automatically.
      if (!flushing) {
        flushing = true
        try {
          // 4. The Trampoline Loop
          while (queue.length > 0) {
            // We shift (remove from front) to execute in order
            const nextTask = queue.shift()
            if (nextTask) {
              nextTask.work()
            }
          }
        } finally {
          // Ensure we reset state even if a task throws an error
          flushing = false
        }
      }

      // 5. Unsubscribe function
      return () => {
        const index = queue.findIndex((t) => t.id === currentId)
        if (index !== -1) {
          queue.splice(index, 1)
        }
      }
    },
  }
}

/**
 * A Virtual Time Scheduler for testing.
 * It queues actions and executes them synchronously when flush() is called.
 * This allows you to test a 10-second sequence in 0 milliseconds.
 */
export const createVirtualScheduler = (): Scheduler & { flush: () => void } => {
  let currentTime = 0
  let actions: Array<{ time: number; id: number; work: () => void }> = []
  let actionIdCounter = 0

  return {
    now: () => currentTime,

    schedule: (work, delay = 0) => {
      const id = actionIdCounter++
      const action = { time: currentTime + delay, id, work }
      actions.push(action)
      // Sort by time, then by insertion order (stable sort)
      actions.sort((a, b) => a.time - b.time || a.id - b.id)

      return () => {
        const index = actions.indexOf(action)
        if (index !== -1) actions.splice(index, 1)
      }
    },

    flush: () => {
      while (actions.length > 0) {
        const action = actions.shift()!
        currentTime = action.time
        action.work()
      }
    },
  }
}
