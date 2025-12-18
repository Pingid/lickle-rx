/**
 * Subjects for multicasting and state management.
 *
 * A Subject is a special type of Observable that allows values to be
 * multicasted to many Observers. Subjects are like EventEmitters.
 *
 * Key exports:
 * - {@link subject}: Simple multicast subject.
 * - {@link behaviorSubject}: Holds the current value and emits it to new subscribers.
 * - {@link replaySubject}: Buffers and replays values to new subscribers.
 * - {@link replayByKeySubject}: Caches and replays the latest value for each key.
 *
 * @module subject
 */

import { Observable, Observer } from './observable.js'

/**
 * Creates a Subject that multicasts to multiple subscribers.
 *
 * @example
 * ```ts
 * const clicks$ = subject<MouseEvent>()
 * subscribe(clicks$, (e) => console.log('A:', e.clientX))
 * subscribe(clicks$, (e) => console.log('B:', e.clientX))
 * clicks$.next(event) // both subscribers receive the event
 * ```
 */
export const subject = <T, E = unknown>(): Subject<T, E> => {
  const observers = new Set<Observer<T, E>>()
  let closed = false
  const subject: Subject<T, E> = (observer: Observer<T, E>) => {
    if (closed) return () => {}
    observers.add(observer)
    return () => observers.delete(observer)
  }
  subject.next = (x: T) => {
    if (!closed) observers.forEach((o) => o.next(x))
  }
  subject.error = (e: E) => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.error(e))
    observers.clear()
  }
  subject.complete = () => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.complete())
    observers.clear()
  }
  return subject
}

/**
 * A Subject is both an Observable and an Observer.
 * It multicasts values to all subscribed observers.
 *
 * @typeParam T - The type of values emitted
 * @typeParam E - The type of error that may be emitted
 */
export type Subject<T, E = unknown> = Observable<T, E> & {
  /** Emit a value to all subscribers */
  next: (x: T) => void
  /** Emit an error to all subscribers and close the subject */
  error: (e: E) => void
  /** Complete all subscriptions and close the subject */
  complete: () => void
}

/**
 * Creates a ReplaySubject that buffers values and replays them to new subscribers.
 *
 * @param bufferSize - Maximum number of values to buffer (default: Infinity)
 *
 * @example
 * ```ts
 * const messages$ = replaySubject<string>(3)
 * messages$.next('a')
 * messages$.next('b')
 * messages$.next('c')
 * messages$.next('d')
 * subscribe(messages$, console.log) // 'b', 'c', 'd' (last 3 values)
 * ```
 */
export const replaySubject = <T, E = unknown>(bufferSize = Infinity): ReplaySubject<T, E> => {
  const observers = new Set<Observer<T, E>>()
  const buffer: T[] = []
  let closed = false
  const subject: ReplaySubject<T, E> = (observer: Observer<T, E>) => {
    buffer.forEach((x) => observer.next(x))
    if (closed) {
      observer.complete()
      return () => {}
    }
    observers.add(observer)
    return () => observers.delete(observer)
  }
  subject.next = (x: T) => {
    if (closed) return
    buffer.push(x)
    if (buffer.length > bufferSize) buffer.shift()
    observers.forEach((o) => o.next(x))
  }
  subject.error = (e: E) => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.error(e))
    observers.clear()
  }
  subject.complete = () => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.complete())
    observers.clear()
  }
  subject.bufferSize = bufferSize
  subject.getBuffer = () => [...buffer]
  return subject
}

/**
 * A ReplaySubject buffers emitted values and replays them to new subscribers.
 * Extends Subject with buffer access capabilities.
 *
 * @typeParam T - The type of values emitted
 * @typeParam E - The type of error that may be emitted
 */
export type ReplaySubject<T, E = unknown> = Subject<T, E> & {
  /** Maximum number of values stored in the buffer */
  bufferSize: number
  /** Returns a copy of the current buffer contents */
  getBuffer: () => T[]
}

/**
 * Creates a BehaviorSubject that holds a current value and emits it to new subscribers.
 *
 * @param initialValue - The initial value
 *
 * @example
 * ```ts
 * const count$ = behaviorSubject(0)
 * subscribe(count$, console.log) // 0 (initial value)
 * count$.next(1) // logs 1
 * console.log(count$.getValue()) // 1
 * ```
 */
export const behaviorSubject = <T, E = unknown>(initialValue: T): BehaviorSubject<T, E> => {
  const observers = new Set<Observer<T, E>>()
  let current = initialValue
  let closed = false
  const subject: BehaviorSubject<T, E> = (observer: Observer<T, E>) => {
    observer.next(current)
    if (closed) {
      observer.complete()
      return () => {}
    }
    observers.add(observer)
    return () => observers.delete(observer)
  }
  subject.next = (x: T) => {
    if (closed) return
    current = x
    observers.forEach((o) => o.next(x))
  }
  subject.error = (e: E) => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.error(e))
    observers.clear()
  }
  subject.complete = () => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.complete())
    observers.clear()
  }
  subject.getValue = () => current
  return subject
}

/**
 * A BehaviorSubject holds a current value and emits it immediately to new subscribers.
 * Extends Subject with synchronous value access.
 *
 * @typeParam T - The type of values emitted
 * @typeParam E - The type of error that may be emitted
 */
export type BehaviorSubject<T, E = unknown> = Subject<T, E> & {
  /** Returns the current value synchronously */
  getValue: () => T
}

/**
 * Creates a ReplayByKeySubject that caches the latest value for each key and replays
 * all cached values to new subscribers.
 *
 * Useful for event streams with discriminated unions where you want to replay
 * the latest event of each type.
 *
 * @param getKey - Function to extract the key from a value
 * @param options.maxKeys - Maximum number of keys to cache (default: Infinity). When exceeded, oldest keys are evicted.
 *
 * @example
 * ```ts
 * type Event =
 *   | { type: "user"; data: User }
 *   | { type: "config"; data: Config }
 *
 * const events$ = replayByKeySubject<Event, Event['type']>((e) => e.type)
 * events$.next({ type: "user", data: user1 })
 * events$.next({ type: "config", data: config1 })
 * events$.next({ type: "user", data: user2 }) // overwrites previous "user"
 *
 * // New subscriber receives: { type: "user", data: user2 }, { type: "config", data: config1 }
 * ```
 */
export const replayByKeySubject = <T, K extends string | number | symbol = string | number | symbol, E = unknown>(
  getKey: (value: T) => K,
  options?: { maxKeys?: number },
): ReplayByKeySubject<T, K, E> => {
  const maxKeys = options?.maxKeys ?? Infinity
  const observers = new Set<Observer<T, E>>()
  const cache = new Map<K, T>()
  let closed = false
  const subject: ReplayByKeySubject<T, K, E> = (observer: Observer<T, E>) => {
    cache.forEach((x) => observer.next(x))
    if (closed) {
      observer.complete()
      return () => {}
    }
    observers.add(observer)
    return () => observers.delete(observer)
  }
  subject.next = (x: T) => {
    if (closed) return
    const key = getKey(x)
    if (cache.has(key)) cache.delete(key)
    cache.set(key, x)
    while (cache.size > maxKeys) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    observers.forEach((o) => o.next(x))
  }
  subject.error = (e: E) => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.error(e))
    observers.clear()
  }
  subject.complete = () => {
    if (closed) return
    closed = true
    observers.forEach((o) => o.complete())
    observers.clear()
  }
  subject.get = (key: K) => cache.get(key)
  subject.getCache = () => new Map(cache)
  subject.maxKeys = maxKeys
  return subject
}

/**
 * A ReplayByKeySubject caches the latest value for each key and replays all cached
 * values to new subscribers.
 *
 * @typeParam T - The type of values emitted
 * @typeParam K - The type of the key
 * @typeParam E - The type of error that may be emitted
 */
export type ReplayByKeySubject<T, K, E = unknown> = Subject<T, E> & {
  /** Returns the cached value for a key, or undefined if not present */
  get: (key: K) => T | undefined
  /** Returns a copy of the current cache as a Map */
  getCache: () => Map<K, T>
  /** Maximum number of keys stored in the cache */
  maxKeys: number
}
