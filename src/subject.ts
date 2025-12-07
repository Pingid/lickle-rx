/**
 * Subjects for multicasting values to multiple subscribers.
 * @module
 */

import { Observable, Observer } from './observable.js'

export type Subject<T, E = unknown> = Observable<T, E> & {
  next: (x: T) => void
  error: (e: E) => void
  complete: () => void
}

/**
 * Creates a Subject that multicasts to multiple subscribers.
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
 * Creates a ReplaySubject that buffers values and replays them to new subscribers.
 *
 * @param bufferSize Maximum number of values to buffer (default: Infinity)
 */
export const replaySubject = <T, E = unknown>(bufferSize = Infinity): Subject<T, E> => {
  const observers = new Set<Observer<T, E>>()
  const buffer: T[] = []
  let closed = false
  const subject: Subject<T, E> = (observer: Observer<T, E>) => {
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
  return subject
}

/**
 * Creates a BehaviorSubject that holds a current value and emits it to new subscribers.
 *
 * @param initialValue The initial value
 */
export const behaviorSubject = <T, E = unknown>(initialValue: T): Subject<T, E> => {
  const observers = new Set<Observer<T, E>>()
  let current = initialValue
  let closed = false
  const subject: Subject<T, E> = (observer: Observer<T, E>) => {
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
  return subject
}
