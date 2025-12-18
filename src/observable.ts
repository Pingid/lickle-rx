/**
 * Core observable types and functions.
 * @module
 */
import 'symbol-observable'

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
 * A type that can be converted to an Observable.
 * Can be an Observable or a PromiseLike.
 */
export type ObservableInput<T, E = unknown> = Observable<T, E> | PromiseLike<T>

/** Extracts the value type from an ObservableInput */
export type ObservableInputValue<T> = T extends Observable<infer V> ? V : T extends PromiseLike<infer V> ? V : never

/**
 * An observable that conforms to the TC39 Observable proposal and interoperates
 * with other reactive libraries (RxJS, etc.) via Symbol.observable.
 *
 * @typeParam T - The type of values emitted
 */
export type InteropObservable<T> = {
  /** Subscribe to the observable with a partial observer */
  subscribe(observer: Partial<Observer<T>>): Unsubscribe
  /** Returns itself for Symbol.observable interop */
  [Symbol.observable](): InteropObservable<T>
}

/**
 * Converts a lickle-rx Observable to an InteropObservable that can be consumed
 * by other reactive libraries via Symbol.observable.
 *
 * @param obs The observable to convert
 * @returns An InteropObservable with subscribe and Symbol.observable methods
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const interop$ = toInterop(source$)
 *
 * // Works with RxJS
 * import { from } from 'rxjs'
 * const rxjs$ = from(interop$)
 * ```
 */
export const toInterop = <T>(obs: Observable<T>): InteropObservable<T> => {
  const interop = {
    subscribe: (observer: Partial<Observer<T>>) => subscribe(obs, observer),
    [Symbol.observable]() {
      return interop
    },
  }
  return interop as InteropObservable<T>
}

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
