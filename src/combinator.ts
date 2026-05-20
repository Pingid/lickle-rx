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

const noop = () => {}

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
  (observer) => {
    const unsubs = sources.map((s) => s({ next: observer.next, error: observer.error, complete: noop }))
    return () => {
      for (let i = 0; i < unsubs.length; i++) unsubs[i]!()
    }
  }

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
    const n = sources.length
    const values: any[] = new Array(n)
    const has: boolean[] = new Array(n).fill(false)
    let pending = n
    const unsubs = sources.map((source, i) =>
      source({
        next: (x) => {
          values[i] = x
          if (!has[i]) {
            has[i] = true
            pending--
          }
          if (pending === 0) observer.next(values.slice() as any)
        },
        error: observer.error,
        complete: noop,
      }),
    )
    return () => {
      for (let i = 0; i < unsubs.length; i++) unsubs[i]!()
    }
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
    const n = sources.length
    const buffers: any[][] = new Array(n)
    const completed: boolean[] = new Array(n).fill(false)
    const unsubs: (() => void)[] = new Array(n)
    for (let i = 0; i < n; i++) buffers[i] = []
    let hasError = false
    const cleanup = () => {
      for (let i = 0; i < n; i++) unsubs[i]?.()
    }
    const tryEmit = () => {
      outer: while (true) {
        for (let i = 0; i < n; i++) if (buffers[i]!.length === 0) break outer
        const out = new Array(n)
        for (let i = 0; i < n; i++) out[i] = buffers[i]!.shift()
        observer.next(out)
      }
      for (let i = 0; i < n; i++) {
        if (completed[i] && buffers[i]!.length === 0) {
          cleanup()
          observer.complete()
          return
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const idx = i
      unsubs[i] = (sources[i] as Observable<any>)({
        next: (x) => {
          if (hasError) return
          if (buffers[idx]!.length >= limit) {
            hasError = true
            cleanup()
            observer.error(new Error(`zip buffer overflow: source ${idx} exceeded ${limit} buffered values`))
            return
          }
          buffers[idx]!.push(x)
          tryEmit()
        },
        error: (e) => {
          hasError = true
          cleanup()
          observer.error(e)
        },
        complete: () => {
          completed[idx] = true
          tryEmit()
        },
      })
    }
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
    let i = 0
    let unsub: () => void = noop
    const next = () => {
      if (i >= sources.length) return observer.complete()
      unsub = sources[i]!({
        next: observer.next,
        error: observer.error,
        complete: () => {
          i++
          next()
        },
      })
    }
    next()
    return () => unsub()
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
    let winner: number | null = null
    const unsubs: (() => void)[] = []
    for (let i = 0; i < sources.length; i++) {
      if (winner !== null) break
      const idx = i
      unsubs.push(
        sources[i]!({
          next: (x) => {
            if (winner === null) {
              winner = idx
              for (let j = 0; j < unsubs.length; j++) if (j !== idx) unsubs[j]!()
            }
            if (winner === idx) observer.next(x)
          },
          error: observer.error,
          complete: observer.complete,
        }),
      )
    }
    return () => {
      for (let i = 0; i < unsubs.length; i++) unsubs[i]!()
    }
  }
}
