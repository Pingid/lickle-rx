import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  asyncScheduler,
  animationFrameScheduler,
  asapScheduler,
  idleScheduler,
  createQueueScheduler,
  createVirtualScheduler,
} from './scheduler.js'

describe('asyncScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('executes work after delay', () => {
    const work = vi.fn()
    asyncScheduler.schedule(work, 100)

    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('executes immediately with zero delay', () => {
    const work = vi.fn()
    asyncScheduler.schedule(work, 0)

    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('defaults delay to zero', () => {
    const work = vi.fn()
    asyncScheduler.schedule(work)

    vi.advanceTimersByTime(0)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('cancels scheduled work', () => {
    const work = vi.fn()
    const unsub = asyncScheduler.schedule(work, 100)

    vi.advanceTimersByTime(50)
    unsub()
    vi.advanceTimersByTime(100)

    expect(work).not.toHaveBeenCalled()
  })

  it('now returns current time', () => {
    const before = Date.now()
    const now = asyncScheduler.now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })
})

describe('animationFrameScheduler', () => {
  let rafId = 0
  let rafCallbacks: Map<number, () => void>

  beforeEach(() => {
    rafId = 0
    rafCallbacks = new Map()
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      const id = ++rafId
      rafCallbacks.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id)
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const flushRaf = () => {
    rafCallbacks.forEach((cb) => cb())
    rafCallbacks.clear()
  }

  it('executes work on next animation frame', () => {
    const work = vi.fn()
    animationFrameScheduler.schedule(work, 0)

    expect(work).not.toHaveBeenCalled()
    flushRaf()
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('uses setTimeout for delayed work', () => {
    const work = vi.fn()
    animationFrameScheduler.schedule(work, 100)

    vi.advanceTimersByTime(100)
    expect(work).not.toHaveBeenCalled()

    flushRaf()
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('cancels zero-delay work', () => {
    const work = vi.fn()
    const unsub = animationFrameScheduler.schedule(work, 0)

    unsub()
    flushRaf()

    expect(work).not.toHaveBeenCalled()
  })

  it('cancels delayed work', () => {
    const work = vi.fn()
    const unsub = animationFrameScheduler.schedule(work, 100)

    vi.advanceTimersByTime(50)
    unsub()
    vi.advanceTimersByTime(100)
    flushRaf()

    expect(work).not.toHaveBeenCalled()
  })

  it('now returns current time', () => {
    vi.useRealTimers()
    const before = Date.now()
    const now = animationFrameScheduler.now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })
})

describe('asapScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('executes work as microtask', async () => {
    vi.useRealTimers()
    const work = vi.fn()
    asapScheduler.schedule(work, 0)

    expect(work).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('uses setTimeout for delayed work', () => {
    const work = vi.fn()
    asapScheduler.schedule(work, 100)

    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('cancels microtask work', async () => {
    vi.useRealTimers()
    const work = vi.fn()
    const unsub = asapScheduler.schedule(work, 0)

    unsub()
    await Promise.resolve()

    expect(work).not.toHaveBeenCalled()
  })

  it('cancels delayed work', () => {
    const work = vi.fn()
    const unsub = asapScheduler.schedule(work, 100)

    vi.advanceTimersByTime(50)
    unsub()
    vi.advanceTimersByTime(100)

    expect(work).not.toHaveBeenCalled()
  })

  it('now returns current time', () => {
    const before = Date.now()
    const now = asapScheduler.now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })
})

describe('idleScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('executes work when idle', () => {
    const work = vi.fn()
    idleScheduler.schedule(work, 0)

    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1) // fallback uses setTimeout with 1ms
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('uses setTimeout for delayed work', () => {
    const work = vi.fn()
    idleScheduler.schedule(work, 100)

    vi.advanceTimersByTime(100)
    expect(work).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1) // idle callback
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('cancels zero-delay work', () => {
    const work = vi.fn()
    const unsub = idleScheduler.schedule(work, 0)

    unsub()
    vi.advanceTimersByTime(10)

    expect(work).not.toHaveBeenCalled()
  })

  it('cancels delayed work', () => {
    const work = vi.fn()
    const unsub = idleScheduler.schedule(work, 100)

    vi.advanceTimersByTime(50)
    unsub()
    vi.advanceTimersByTime(100)

    expect(work).not.toHaveBeenCalled()
  })

  it('now returns current time', () => {
    const before = Date.now()
    const now = idleScheduler.now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })
})

describe('createQueueScheduler()', () => {
  it('executes work synchronously', () => {
    const scheduler = createQueueScheduler()
    const order: number[] = []

    order.push(1)
    scheduler.schedule(() => order.push(2))
    order.push(3)

    expect(order).toEqual([1, 2, 3])
  })

  it('queues nested scheduled work (trampoline)', () => {
    const scheduler = createQueueScheduler()
    const order: number[] = []

    scheduler.schedule(() => {
      order.push(1)
      scheduler.schedule(() => order.push(2))
      order.push(3)
    })

    expect(order).toEqual([1, 3, 2])
  })

  it('prevents stack overflow with deep recursion', () => {
    const scheduler = createQueueScheduler()
    let count = 0
    const limit = 10000

    const recurse = () => {
      if (count++ < limit) {
        scheduler.schedule(recurse)
      }
    }

    scheduler.schedule(recurse)
    expect(count).toBe(limit + 1)
  })

  it('falls back to setTimeout for delays', () => {
    vi.useFakeTimers()
    const scheduler = createQueueScheduler()
    const work = vi.fn()

    scheduler.schedule(work, 100)

    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(work).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancels queued work', () => {
    const scheduler = createQueueScheduler()
    const order: number[] = []

    scheduler.schedule(() => {
      order.push(1)
      const unsub = scheduler.schedule(() => order.push(2))
      unsub()
      scheduler.schedule(() => order.push(3))
    })

    expect(order).toEqual([1, 3])
  })

  it('cancels delayed work', () => {
    vi.useFakeTimers()
    const scheduler = createQueueScheduler()
    const work = vi.fn()

    const unsub = scheduler.schedule(work, 100)
    vi.advanceTimersByTime(50)
    unsub()
    vi.advanceTimersByTime(100)

    expect(work).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('each instance has isolated queue', () => {
    const scheduler1 = createQueueScheduler()
    const scheduler2 = createQueueScheduler()
    const order: string[] = []

    scheduler1.schedule(() => {
      order.push('1a')
      scheduler1.schedule(() => order.push('1b'))
    })

    scheduler2.schedule(() => {
      order.push('2a')
      scheduler2.schedule(() => order.push('2b'))
    })

    expect(order).toEqual(['1a', '1b', '2a', '2b'])
  })

  it('now returns current time', () => {
    const scheduler = createQueueScheduler()
    const before = Date.now()
    const now = scheduler.now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })

  it('resets flushing state after error', () => {
    const scheduler = createQueueScheduler()
    const order: number[] = []

    expect(() => {
      scheduler.schedule(() => {
        order.push(1)
        throw new Error('fail')
      })
    }).toThrow('fail')

    // Scheduler should still work after error
    scheduler.schedule(() => order.push(2))
    expect(order).toEqual([1, 2])
  })
})

describe('createVirtualScheduler()', () => {
  it('executes work synchronously on flush', () => {
    const scheduler = createVirtualScheduler()
    const work = vi.fn()

    scheduler.schedule(work, 100)

    expect(work).not.toHaveBeenCalled()
    scheduler.flush()
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('advances time on flush', () => {
    const scheduler = createVirtualScheduler()

    expect(scheduler.now()).toBe(0)
    scheduler.schedule(() => {}, 100)
    scheduler.flush()
    expect(scheduler.now()).toBe(100)
  })

  it('executes in time order', () => {
    const scheduler = createVirtualScheduler()
    const order: number[] = []

    scheduler.schedule(() => order.push(3), 300)
    scheduler.schedule(() => order.push(1), 100)
    scheduler.schedule(() => order.push(2), 200)

    scheduler.flush()
    expect(order).toEqual([1, 2, 3])
  })

  it('executes same-time work in insertion order', () => {
    const scheduler = createVirtualScheduler()
    const order: string[] = []

    scheduler.schedule(() => order.push('a'), 100)
    scheduler.schedule(() => order.push('b'), 100)
    scheduler.schedule(() => order.push('c'), 100)

    scheduler.flush()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('handles zero delay', () => {
    const scheduler = createVirtualScheduler()
    const work = vi.fn()

    scheduler.schedule(work, 0)
    scheduler.flush()

    expect(work).toHaveBeenCalledTimes(1)
    expect(scheduler.now()).toBe(0)
  })

  it('handles work scheduling more work', () => {
    const scheduler = createVirtualScheduler()
    const order: number[] = []

    scheduler.schedule(() => {
      order.push(1)
      scheduler.schedule(() => order.push(2), 50)
    }, 100)

    scheduler.flush()
    expect(order).toEqual([1, 2])
    expect(scheduler.now()).toBe(150)
  })

  it('cancels scheduled work', () => {
    const scheduler = createVirtualScheduler()
    const work = vi.fn()

    const unsub = scheduler.schedule(work, 100)
    unsub()
    scheduler.flush()

    expect(work).not.toHaveBeenCalled()
  })

  it('now returns virtual time', () => {
    const scheduler = createVirtualScheduler()

    scheduler.schedule(() => {}, 500)
    expect(scheduler.now()).toBe(0)

    scheduler.flush()
    expect(scheduler.now()).toBe(500)
  })

  it('handles empty flush', () => {
    const scheduler = createVirtualScheduler()
    scheduler.flush() // should not throw
    expect(scheduler.now()).toBe(0)
  })

  it('each instance has isolated state', () => {
    const scheduler1 = createVirtualScheduler()
    const scheduler2 = createVirtualScheduler()

    scheduler1.schedule(() => {}, 100)
    scheduler1.flush()

    scheduler2.schedule(() => {}, 200)
    scheduler2.flush()

    expect(scheduler1.now()).toBe(100)
    expect(scheduler2.now()).toBe(200)
  })

  it('defaults delay to zero', () => {
    const scheduler = createVirtualScheduler()
    const work = vi.fn()

    scheduler.schedule(work)
    scheduler.flush()

    expect(work).toHaveBeenCalledTimes(1)
  })
})
