import { Observable } from './observable.js'

export type Subject<T> = Observable<T> & { next: (x: T) => void }

/**
 * Creates a Subject that multicasts to multiple subscribers.
 */
export const createSubject = <T>(): Subject<T> => {
  const subscribers = new Set<(x: T) => void>()
  const subject: Subject<T> = (sub: (x: T) => void) => {
    subscribers.add(sub)
    return () => subscribers.delete(sub)
  }
  subject.next = (x: T) => subscribers.forEach((sub) => sub(x))
  return subject
}

/**
 * Creates a ReplaySubject that buffers values and replays them to new subscribers.
 *
 * @param bufferSize Maximum number of values to buffer (default: Infinity)
 */
export const createReplaySubject = <T>(bufferSize = Infinity): Subject<T> => {
  const subscribers = new Set<(x: T) => void>()
  const buffer: T[] = []
  const subject: Subject<T> = (sub: (x: T) => void) => {
    buffer.forEach((x) => sub(x))
    subscribers.add(sub)
    return () => subscribers.delete(sub)
  }
  subject.next = (x: T) => {
    buffer.push(x)
    if (buffer.length > bufferSize) buffer.shift()
    subscribers.forEach((sub) => sub(x))
  }
  return subject
}

/**
 * Creates a BehaviorSubject that holds a current value and emits it to new subscribers.
 *
 * @param initialValue The initial value
 */
export const createBehaviorSubject = <T>(initialValue: T): Subject<T> => {
  const subscribers = new Set<(x: T) => void>()
  let current = initialValue
  const subject: Subject<T> = (sub: (x: T) => void) => {
    sub(current)
    subscribers.add(sub)
    return () => subscribers.delete(sub)
  }
  subject.next = (x: T) => {
    current = x
    subscribers.forEach((sub) => sub(x))
  }
  return subject
}
