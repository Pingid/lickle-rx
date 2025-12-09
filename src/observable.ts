/**
 * Core observable types and functions.
 * @module
 */

/** Function to clean up a subscription */
export type Unsubscribe = () => void

/**
 * An observer receives values from an Observable.
 *
 * @typeParam T - The type of values received
 * @typeParam E - The type of error that may be received
 */
export type Observer<T, E = unknown> = {
  /** Called when the observable emits a value */
  next: (value: T) => void
  /** Called when the observable encounters an error */
  error: (err: E) => void
  /** Called when the observable completes */
  complete: () => void
}

/**
 * A function that accepts an Observer and returns an Unsubscribe function.
 * Observables are lazy - they don't execute until subscribed to.
 *
 * @typeParam T - The type of values emitted
 * @typeParam E - The type of error that may be emitted
 */
export type Observable<T, E = unknown> = (observer: Observer<T, E>) => Unsubscribe

/** Extracts the value type from an Observable */
export type ObservableValue<T> = T extends Observable<infer D> ? D : never

/** Extracts the error type from an Observable */
export type ObservableError<T> = T extends Observable<any, infer E> ? E : never

/**
 * Creates an observable from a callback function.
 * This is an identity function useful for type inference.
 *
 * @param cb Function that receives an observer and returns an unsubscribe function
 * @returns The observable
 *
 * @example
 * ```ts
 * const clicks$ = observable<MouseEvent>((observer) => {
 *   const handler = (e: MouseEvent) => observer.next(e)
 *   document.addEventListener('click', handler)
 *   return () => document.removeEventListener('click', handler)
 * })
 * ```
 */
export const observable = <T, E = unknown>(cb: (observer: Observer<T, E>) => Unsubscribe): Observable<T, E> => cb

/**
 * Subscribes to an observable with a callback or partial observer.
 * Provides default handlers: empty next/complete, console.error for errors.
 *
 * @param observable The observable to subscribe to
 * @param observer A callback for next values, or a partial Observer
 * @returns Function to unsubscribe
 *
 * @example
 * ```ts
 * // Simple callback
 * const unsub = subscribe(source$, (value) => console.log(value))
 *
 * // Partial observer
 * const unsub = subscribe(source$, {
 *   next: (value) => console.log(value),
 *   complete: () => console.log('done'),
 * })
 * ```
 */
export const subscribe = <T, E = unknown>(
  observable: Observable<T, E>,
  observer: Partial<Observer<T, E>> | ((value: T) => void),
): Unsubscribe =>
  observable({
    next: () => {},
    error: (e) => console.error('Uncaught Observable Error:', e),
    complete: () => {},
    ...(typeof observer === 'function' ? { next: observer } : observer),
  })
