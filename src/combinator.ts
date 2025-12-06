import { Observable, ObservableValue } from './observable.js'
import { pipe } from './util.js'

/**
 * Creates an output Observable which concurrently emits all values from every
 * given input Observable.
 *
 * @param sources Input Observables to merge together.
 * @return Observable that emits items from all input Observables.
 */
export const merge: <A extends Observable<any>[]>(...sources: A) => Observable<ObservableValue<A[number]>> =
  (...oas) =>
  (sub) =>
    pipe(
      oas.map((x) => x(sub as any)),
      (s) => () => void s.forEach((fn) => fn()),
    )

/**
 * Combines multiple Observables to create an Observable whose values are
 * calculated from the latest values of each input Observable.
 * Emits only after all inputs have emitted at least once.
 *
 * @param sources Input Observables to combine.
 * @return Observable that emits arrays of the latest values.
 */
export const combineLatest = <T extends Observable<any>[]>(
  ...sources: T
): Observable<{ [K in keyof T]: ObservableValue<T[K]> }> => {
  return (sub) => {
    const values: any[] = new Array(sources.length)
    const hasValue: boolean[] = new Array(sources.length).fill(false)
    let ready = false
    const unsubs = sources.map((source, i) =>
      source((x) => {
        values[i] = x
        hasValue[i] = true
        if (!ready) ready = hasValue.every(Boolean)
        if (ready) sub([...values] as any)
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
 */
export const zip = <T extends Observable<any>[]>(
  ...sources: T
): Observable<{ [K in keyof T]: ObservableValue<T[K]> }> => {
  return (sub) => {
    const buffers: any[][] = sources.map(() => [])
    const tryEmit = () => {
      if (buffers.every((b) => b.length > 0)) {
        sub(buffers.map((b) => b.shift()!) as any)
      }
    }
    const unsubs = sources.map((source, i) =>
      source((x) => {
        buffers[i]!.push(x)
        tryEmit()
      }),
    )
    return () => unsubs.forEach((fn) => fn())
  }
}

/**
 * Creates an output Observable which sequentially emits all values from the first
 * given Observable and then moves on to the next.
 *
 * Note: Without completion signals, this subscribes to all sources immediately
 * but only forwards values from sources whose predecessors have emitted.
 * For true sequential behavior, use synchronous observables.
 *
 * @param sources Input Observables to concatenate.
 * @return Observable that emits values from sources in sequence.
 */
export const concat = <T>(...sources: Observable<T>[]): Observable<T> => {
  return (sub) => {
    const unsubs: (() => void)[] = []
    let currentIndex = 0
    sources.forEach((source, i) => {
      unsubs.push(
        source((x) => {
          if (i === currentIndex) {
            sub(x)
          } else if (i === currentIndex + 1) {
            currentIndex = i
            sub(x)
          }
        }),
      )
    })
    return () => unsubs.forEach((fn) => fn())
  }
}

/**
 * Returns an Observable that mirrors the first source Observable to emit.
 * All other sources are unsubscribed once a winner is determined.
 *
 * @param sources Input Observables to race.
 * @return Observable that mirrors the first source to emit.
 */
export const race = <T>(...sources: Observable<T>[]): Observable<T> => {
  return (sub) => {
    let winnerIndex: number | null = null
    const unsubs = sources.map((source, i) =>
      source((x) => {
        if (winnerIndex === null) {
          winnerIndex = i
          unsubs.forEach((fn, j) => j !== i && fn())
        }
        if (winnerIndex === i) sub(x)
      }),
    )
    return () => unsubs.forEach((fn) => fn())
  }
}
