export type Unsubscribe = () => void
export type Observable<T> = (subscriber: (x: T) => void) => Unsubscribe
export type ObservableValue<T> = T extends Observable<infer D> ? D : never
