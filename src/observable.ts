/**
 * Core observable types.
 * @module
 */

export type Unsubscribe = () => void
export type Observer<T, E = unknown> = {
  next: (value: T) => void
  error?: (err: E) => void
  complete?: () => void
}
export type Observable<T, E = unknown> = (observer: Observer<T, E>) => Unsubscribe
export type ObservableValue<T> = T extends Observable<infer D> ? D : never
export type ObservableError<T> = T extends Observable<any, infer E> ? E : never

/**
 * Creates an observable from a callback function.
 * @param cb The callback function to create the observable from.
 * @returns The observable.
 */
export const observable = <T, E = unknown>(cb: (observer: Observer<T, E>) => Unsubscribe): Observable<T, E> => cb

/**
 * Subscribes to an observable.
 * @param observable The observable to subscribe to.
 * @param observer The observer to subscribe to the observable.
 * @returns The unsubscribe function.
 */
export const subscribe = <T, E = unknown>(observable: Observable<T, E>, observer: Observer<T, E>): Unsubscribe =>
  observable(observer)
