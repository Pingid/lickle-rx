import { Observable } from './observable.js'

/**
 * Converts the arguments to an observable sequence.
 *
 * @param args Values to emit
 * @return Observable that emits the arguments and then completes.
 */
export const of: <T extends any[]>(...args: T) => Observable<T[number]> =
  (...args: any[]) =>
  (sub: any) => {
    let subbed = true
    args.forEach((x) => subbed && sub(x))
    return () => (subbed = false)
  }

/**
 * Creates an observable from a Promise.
 *
 * @param promise The promise to convert
 * @return Observable that emits the resolved value and completes
 */
export const fromPromise = <T>(promise: Promise<T>): Observable<T> => {
  return (sub) => {
    let cancelled = false
    promise.then((value) => !cancelled && sub(value)).catch(() => {}) // Silently ignore errors
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
 */
export const interval = (period: number): Observable<number> => {
  return (sub) => {
    let count = 0
    const id = setInterval(() => sub(count++), period)
    return () => clearInterval(id)
  }
}

/**
 * Creates an observable that emits after a delay, optionally repeating.
 *
 * @param delay Initial delay in milliseconds
 * @param period Optional period for repeating emissions
 * @return Observable that emits after delay (and optionally at intervals)
 */
export const timer = (delay: number, period?: number): Observable<number> => {
  return (sub) => {
    let count = 0
    let intervalId: ReturnType<typeof setInterval> | undefined

    const timeoutId = setTimeout(() => {
      sub(count++)
      if (period !== undefined) {
        intervalId = setInterval(() => sub(count++), period)
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
 */
export const never = <T = never>(): Observable<T> => {
  return () => () => {}
}

/**
 * Creates an observable that immediately completes without emitting.
 *
 * @return Observable that completes immediately
 */
export const empty = <T = never>(): Observable<T> => {
  return () => () => {}
}
