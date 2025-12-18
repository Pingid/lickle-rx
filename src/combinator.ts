/**
 * Functions to combine multiple Observables into one.
 *
 * These functions take multiple input Observables and merge, concatenate,
 * or combine their values in various ways to produce a new Observable.
 *
 * Key exports:
 * - {@link merge}: Interleave values from multiple observables.
 * - {@link combineLatest}: Combine the latest values from multiple observables.
 * - {@link zip}: Combine values from multiple observables by index.
 * - {@link concat}: Subscribe to observables in sequence.
 * - {@link race}: Mirror the first observable to emit.
 *
 * @module combinator
 */

import { Observable, ObservableValue } from './observable.js'
import { pipe } from './util.js'

/**
 * Creates an output Observable which concurrently emits all values from every
 * given input Observable.
 *
 * @param sources - Input Observables to merge together.
 * @returns Observable that emits items from all input Observables.
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
 * @param sources - Input Observables to combine.
 * @returns Observable that emits arrays of the latest values.
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
          if (ready) observer.next(values.slice() as any)
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
 * @param options - Optional configuration object with `maxBuffer` to limit memory usage.
 *   - `maxBuffer`: Maximum values to buffer per source before throwing an error.
 *     Defaults to `Infinity`. Set this to prevent memory leaks when sources emit at
 *     different rates.
 * @param sources - Input Observables to zip together.
 * @returns Observable that emits arrays of values at matching indices.
 *
 * @example
 * ```ts
 * const letters$ = of('a', 'b', 'c')
 * const numbers$ = of(1, 2, 3)
 * const zipped$ = zip(letters$, numbers$)
 * subscribe(zipped$, console.log) // ['a', 1], ['b', 2], ['c', 3]
 * ```
 *
 * @example With buffer limit
 * ```ts
 * const fast$ = interval(10)
 * const slow$ = interval(1000)
 * const zipped$ = zip({ maxBuffer: 100 }, fast$, slow$)
 * // Errors if fast$ emits more than 100 values before slow$ emits
 * ```
 */
export const zip: {
  /** Zip with buffer limit to prevent memory leaks */
  <T extends Observable<any>[]>(
    options: { maxBuffer: number },
    ...sources: T
  ): Observable<{ [K in keyof T]: ObservableValue<T[K]> }>
  /** Zip with unlimited buffer (default) */
  <T extends Observable<any>[]>(...sources: T): Observable<{ [K in keyof T]: ObservableValue<T[K]> }>
} = (...args: any[]): Observable<any> => {
  const first = args[0]
  const hasOptions = first && typeof first === 'object' && 'maxBuffer' in first
  const limit = hasOptions ? (first as { maxBuffer: number }).maxBuffer : Infinity
  const sources = hasOptions ? args.slice(1) : args

  return (observer) => {
    const buffers: any[][] = sources.map(() => [])
    const completed: boolean[] = sources.map(() => false)
    const unsubs: (() => void)[] = []
    let hasError = false

    const cleanup = () => unsubs.forEach((fn) => fn?.())

    const tryEmit = () => {
      while (buffers.every((b) => b.length > 0)) {
        observer.next(buffers.map((b) => b.shift()))
      }
      // Complete if any source is done and its buffer is empty
      if (completed.some((done, i) => done && buffers[i]!.length === 0)) {
        cleanup()
        observer.complete()
      }
    }

    sources.forEach((source: Observable<any>, i: number) => {
      unsubs.push(
        source({
          next: (x) => {
            if (hasError) return
            if (buffers[i]!.length >= limit) {
              hasError = true
              cleanup()
              observer.error(new Error(`zip buffer overflow: source ${i} exceeded ${limit} buffered values`))
              return
            }
            buffers[i]!.push(x)
            tryEmit()
          },
          error: (e) => {
            hasError = true
            cleanup()
            observer.error(e)
          },
          complete: () => {
            completed[i] = true
            tryEmit()
          },
        }),
      )
    })

    return cleanup
  }
}

/**
 * Creates an output Observable which sequentially emits all values from the first
 * given Observable and then moves on to the next.
 *
 * Subscribes to each source only after the previous one completes.
 * If a source never completes, subsequent sources will not be subscribed.
 *
 * @param sources - Input Observables to concatenate.
 * @returns Observable that emits values from sources in sequence.
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
 * @param sources - Input Observables to race.
 * @returns Observable that mirrors the first source to emit.
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
