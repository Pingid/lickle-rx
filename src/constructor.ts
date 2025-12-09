/**
 * Functions to create observables from various sources.
 * @module
 */

import { Observable, Observer } from './observable.js'

/**
 * Converts the arguments to an observable sequence.
 *
 * @param args Values to emit
 * @return Observable that emits the arguments and then completes.
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * subscribe(source$, console.log) // 1, 2, 3
 * ```
 */
export const of: <T extends any[]>(...args: T) => Observable<T[number]> =
  (...args: any[]) =>
  (observer: Observer<any>) => {
    let subbed = true
    args.forEach((x) => subbed && observer.next(x))
    if (subbed) observer.complete()
    return () => (subbed = false)
  }

/**
 * Creates an observable from an async function with cancellation support.
 * The AbortSignal is aborted when the observable is unsubscribed.
 *
 * @param fn Async function that receives an AbortSignal
 * @param onError Optional error transformer
 * @return Observable that emits the resolved value and completes
 *
 * @example
 * ```ts
 * const user$ = fromAsync((signal) => fetch('/api/user', { signal }).then(r => r.json()))
 * const unsub = subscribe(user$, console.log)
 * unsub() // aborts the fetch request
 * ```
 */
export const fromAsync = <T, E = unknown>(
  fn: (signal: AbortSignal) => Promise<T>,
  onError?: (error: unknown) => E,
): Observable<T, E> => {
  return (observer) => {
    const controller = new AbortController()
    fn(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          observer.next(value)
          observer.complete()
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (onError) observer.error(onError(err))
        else observer.error(err)
      })
    return () => controller.abort()
  }
}

/**
 * Creates an observable from a Promise.
 *
 * @param promise The promise to convert
 * @return Observable that emits the resolved value and completes
 *
 * @example
 * ```ts
 * const data$ = fromPromise(fetch('/api/data').then(r => r.json()))
 * subscribe(data$, console.log)
 * ```
 */
export const fromPromise = <T, E = unknown>(promise: Promise<T>, onError?: (error: unknown) => E): Observable<T, E> => {
  return (observer) => {
    let cancelled = false
    promise
      .then((value) => {
        if (!cancelled) {
          observer.next(value)
          observer.complete()
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (onError) observer.error(onError(err))
        else observer.error(err)
      })
    return () => (cancelled = true)
  }
}

/**
 * Alias for fromPromise for compatibility.
 */
export const from = fromPromise

/**
 * Creates an observable that emits sequential numbers at specified intervals.
 *
 * @param period The interval period in milliseconds
 * @return Observable that emits incrementing numbers
 *
 * @example
 * ```ts
 * const ticks$ = interval(1000)
 * subscribe(ticks$, console.log) // 0, 1, 2, ... (every second)
 * ```
 */
export const interval = (period: number): Observable<number> => {
  return (observer) => {
    let count = 0
    const id = setInterval(() => observer.next(count++), period)
    return () => clearInterval(id)
  }
}

/**
 * Creates an observable that emits after a delay, optionally repeating.
 *
 * @param delay Initial delay in milliseconds
 * @param period Optional period for repeating emissions
 * @return Observable that emits after delay (and optionally at intervals)
 *
 * @example
 * ```ts
 * const delayed$ = timer(2000)
 * subscribe(delayed$, () => console.log('2 seconds passed'))
 *
 * const repeating$ = timer(1000, 500)
 * subscribe(repeating$, console.log) // 0 after 1s, then 1, 2, 3... every 500ms
 * ```
 */
export const timer = (delay: number, period?: number): Observable<number> => {
  return (observer) => {
    let count = 0
    let intervalId: ReturnType<typeof setInterval> | undefined

    const timeoutId = setTimeout(() => {
      observer.next(count++)
      if (period !== undefined) {
        intervalId = setInterval(() => observer.next(count++), period)
      } else {
        observer.complete()
      }
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }
}

/**
 * Creates an observable that never emits any values.
 *
 * @return Observable that never emits
 *
 * @example
 * ```ts
 * const infinite$ = never()
 * subscribe(infinite$, console.log) // never logs anything
 * ```
 */
export const never = <T = never>(): Observable<T> => {
  return () => () => {}
}

/**
 * Creates an observable that immediately completes without emitting.
 *
 * @return Observable that completes immediately
 *
 * @example
 * ```ts
 * const empty$ = empty()
 * subscribe(empty$, { complete: () => console.log('done') }) // logs 'done' immediately
 * ```
 */
export const empty = <T = never>(): Observable<T> => {
  return (observer) => {
    observer.complete()
    return () => {}
  }
}

/**
 * Creates an observable from DOM events.
 *
 * @param target The event target (Element, Document, Window, etc)
 * @param eventName The name of the event to listen for
 * @param options Optional event listener options
 * @return Observable that emits events when they occur
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * subscribe(clicks$, (event) => console.log('clicked', event.target))
 * ```
 */
export const fromEvent: <T extends EventTarget>(
  target: T,
  eventName: string,
  options?: EventTargetOptions<T>,
) => Observable<EventTargetNext<T>> = (target: EventTarget, eventName: string, options?: any) => {
  return (observer: any) => {
    const handler = (e: any) => observer.next(e)
    target.addEventListener(eventName, handler, options)
    return () => target.removeEventListener(eventName, handler, options)
  }
}

type EventTarget = {
  addEventListener: (eventName: string, handler: (e: any) => void, options?: any) => void
  removeEventListener: (eventName: string, handler: (e: any) => void, options?: any) => void
}
type EventTargetOptions<T extends EventTarget> = Parameters<T['addEventListener']>[2]
type EventTargetNext<T extends EventTarget> = Parameters<Parameters<T['addEventListener']>[1]>[0]
