/**
 * This module contains functions to combine multiple observables.
 * @module
 */

import { Observable, ObservableValue } from './observable.js'
import { pipe } from './util.js'

/**
 * Creates an output Observable which concurrently emits all values from every
 * given input Observable.
 *
 * @param sources Input Observables to merge together.
 * @return Observable that emits items from all input Observables.
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * const keys$ = fromEvent(document, 'keydown')
 * const both$ = merge(clicks$, keys$)
 * subscribe(both$, (event) => console.log('user interaction'))
 * ```
 */
export const merge: <A extends Observable<any>[]>(...sources: A) => Observable<ObservableValue<A[number]>> =
  (...sources) =>
  (observer) =>
    pipe(
      sources.map((source) => source({ next: observer.next, error: observer.error, complete: () => {} })),
      (unsubs) => () => void unsubs.forEach((fn) => fn()),
    )

/**
 * Combines multiple Observables to create an Observable whose values are
 * calculated from the latest values of each input Observable.
 * Emits only after all inputs have emitted at least once.
 *
 * @param sources Input Observables to combine.
 * @return Observable that emits arrays of the latest values.
 *
 * @example
 * ```ts
 * const width$ = subject<number>()
 * const height$ = subject<number>()
 * const area$ = pipe(
 *   combineLatest(width$, height$),
 *   map(([w, h]) => w * h)
 * )
 * ```
 */
export const combineLatest = <T extends Observable<any>[]>(
  ...sources: T
): Observable<{ [K in keyof T]: ObservableValue<T[K]> }> => {
  return (observer) => {
    const values: any[] = new Array(sources.length)
    const hasValue: boolean[] = new Array(sources.length).fill(false)
    let ready = false
    const unsubs = sources.map((source, i) =>
      source({
        next: (x) => {
          values[i] = x
          hasValue[i] = true
          if (!ready) ready = hasValue.every(Boolean)
          if (ready) observer.next([...values] as any)
        },
        error: observer.error,
        complete: () => {},
      }),
    )
    return () => unsubs.forEach((fn) => fn())
  }
}

/**
 * Combines multiple Observables by emitting arrays of values at matching indices.
 * Emits when all sources have emitted a value at the current index.
 *
 * @param sources Input Observables to zip together.
 * @return Observable that emits arrays of values at matching indices.
 *
 * @example
 * ```ts
 * const letters$ = of('a', 'b', 'c')
 * const numbers$ = of(1, 2, 3)
 * const zipped$ = zip(letters$, numbers$)
 * subscribe(zipped$, console.log) // ['a', 1], ['b', 2], ['c', 3]
 * ```
 */
export const zip = <T extends Observable<any>[]>(
  ...sources: T
): Observable<{ [K in keyof T]: ObservableValue<T[K]> }> => {
  return (observer) => {
    const buffers: any[][] = sources.map(() => [])
    const tryEmit = () => {
      if (buffers.every((b) => b.length > 0)) {
        observer.next(buffers.map((b) => b.shift()!) as any)
      }
    }
    const unsubs = sources.map((source, i) =>
      source({
        next: (x) => {
          buffers[i]!.push(x)
          tryEmit()
        },
        error: observer.error,
        complete: () => {},
      }),
    )
    return () => unsubs.forEach((fn) => fn())
  }
}

/**
 * Creates an output Observable which sequentially emits all values from the first
 * given Observable and then moves on to the next.
 *
 * Subscribes to each source only after the previous one completes.
 * If a source never completes, subsequent sources will not be subscribed.
 *
 * @param sources Input Observables to concatenate.
 * @return Observable that emits values from sources in sequence.
 *
 * @example
 * ```ts
 * const first$ = of(1, 2)
 * const second$ = of(3, 4)
 * const all$ = concat(first$, second$)
 * subscribe(all$, console.log) // 1, 2, 3, 4
 * ```
 */
export const concat = <T>(...sources: Observable<T>[]): Observable<T> => {
  return (observer) => {
    let currentIndex = 0
    let currentUnsub: () => void = () => {}
    const subscribeNext = () => {
      if (currentIndex >= sources.length) {
        observer.complete()
        return
      }
      currentUnsub = sources[currentIndex]!({
        next: observer.next,
        error: observer.error,
        complete: () => {
          currentIndex++
          subscribeNext()
        },
      })
    }
    subscribeNext()
    return () => currentUnsub()
  }
}

/**
 * Returns an Observable that mirrors the first source Observable to emit.
 * All other sources are unsubscribed once a winner is determined.
 *
 * @param sources Input Observables to race.
 * @return Observable that mirrors the first source to emit.
 *
 * @example
 * ```ts
 * const fast$ = timer(100).pipe(map(() => 'fast'))
 * const slow$ = timer(500).pipe(map(() => 'slow'))
 * const winner$ = race(fast$, slow$)
 * subscribe(winner$, console.log) // 'fast'
 * ```
 */
export const race = <T>(...sources: Observable<T>[]): Observable<T> => {
  return (observer) => {
    let winnerIndex: number | null = null
    const unsubs: (() => void)[] = []
    for (let i = 0; i < sources.length; i++) {
      if (winnerIndex !== null) break
      unsubs.push(
        sources[i]!({
          next: (x) => {
            if (winnerIndex === null) {
              winnerIndex = i
              unsubs.forEach((fn, j) => j !== i && fn())
            }
            if (winnerIndex === i) observer.next(x)
          },
          error: observer.error,
          complete: observer.complete,
        }),
      )
    }
    return () => unsubs.forEach((fn) => fn())
  }
}
