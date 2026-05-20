/**
 * Pipeable operators for transforming, filtering, and managing Observable streams.
 *
 * Operators are functions that take an Observable and return a new Observable.
 * They are typically used with the `pipe` function.
 *
 * Categories:
 * - Transformation: `map`, `switchMap`, `mergeMap`, `concatMap`, `scan`
 * - Filtering: `filter`, `take`, `takeUntil`, `debounceTime`, `distinctUntilChanged`
 * - Utility: `tap`, `delay`, `catchError`
 * - Multicasting: `share`, `shareReplay`
 *
 * @module operator
 */

import { Observable, Unsubscribe, type Observer, ObservableInput } from './observable.js'
import { subject, replaySubject, replayByKeySubject, type Subject } from './subject.js'
import { asyncScheduler, Scheduler, animationFrameScheduler, createVirtualScheduler } from './scheduler.js'
import { from } from './constructor.js'

const noop = () => {}

/**
 * Applies a given transform function to each value emitted by the source
 * Observable, and emits the resulting values as an Observable.
 *
 * @param transform - The function to apply
 * to each `value` emitted by the source Observable.
 * @returns A function that accepts an Observable and returns an Observable
 * where the emitted values are transformed.
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const doubled$ = pipe(source$, map((x) => x * 2))
 * subscribe(doubled$, console.log) // 2, 4, 6
 * ```
 */
export const map: <A, B>(transform: (a: A) => B) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) =>
    source({
      next: (x) => {
        try {
          observer.next(transform(x))
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })

/**
 * Projects each emitted source value to an Observable which is merged in the output
 * Observable, emitting values only from the most recently projected Observable.
 *
 * @param transform - The function to apply to each value emitted by the source Observable.
 * @returns A function that accepts an Observable and returns an Observable
 * where the emitted values are transformed.
 *
 * @example
 * ```ts
 * const search$ = subject<string>()
 * const results$ = pipe(
 *   search$,
 *   switchMap((query) => fetchResults(query)) // cancels previous request
 * )
 * ```
 */
export const switchMap: <A, B>(transform: (a: A) => ObservableInput<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) => {
    let innerUnsub: () => void = noop
    let active = false
    let done = false
    const tryComplete = () => {
      if (done && !active) observer.complete()
    }
    const innerComplete = () => {
      active = false
      tryComplete()
    }
    const sourceUnsub = source({
      next: (x) => {
        try {
          innerUnsub()
          active = true
          innerUnsub = from(transform(x))({
            next: observer.next,
            error: observer.error,
            complete: innerComplete,
          })
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: () => {
        done = true
        tryComplete()
      },
    })
    return () => (innerUnsub(), sourceUnsub())
  }

/**
 * Projects each source value to an Observable which is merged in the output Observable
 * only if the previous projected Observable has completed.
 *
 * @param transform - The function to apply to each value emitted by the source Observable.
 * @returns A function that accepts an Observable and returns an Observable
 * that ignores source values while the inner Observable is active.
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * const result$ = pipe(
 *   clicks$,
 *   exhaustMap(() => interval(1000).pipe(take(3)))
 * )
 * // multiple clicks are ignored while the interval is running
 * ```
 */
export const exhaustMap: <A, B>(transform: (a: A) => ObservableInput<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) => {
    let innerUnsub: () => void = noop
    let active = false
    let done = false
    const tryComplete = () => {
      if (done && !active) observer.complete()
    }
    const innerComplete = () => {
      active = false
      tryComplete()
    }
    const sourceUnsub = source({
      next: (x) => {
        if (active) return
        active = true
        try {
          innerUnsub = from(transform(x))({
            next: observer.next,
            error: observer.error,
            complete: innerComplete,
          })
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: () => {
        done = true
        tryComplete()
      },
    })
    return () => (innerUnsub(), sourceUnsub())
  }

/**
 * Projects each source value to an Observable which is merged in the output Observable.
 * All inner Observables are subscribed to concurrently.
 *
 * @param transform - The function to apply to each value emitted by the source Observable.
 * @returns A function that accepts an Observable and returns an Observable
 * that emits values from all inner Observables concurrently.
 *
 * @example
 * ```ts
 * const ids$ = of(1, 2, 3)
 * const users$ = pipe(
 *   ids$,
 *   mergeMap((id) => fetchUser(id)) // all requests run in parallel
 * )
 * ```
 */
export const mergeMap: <A, B>(transform: (a: A) => ObservableInput<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) => {
    const subs = new Set<() => void>()
    let active = 0
    let done = false
    const tryComplete = () => {
      if (done && active === 0) observer.complete()
    }
    const sourceSub = source({
      next: (x) => {
        try {
          active++
          let unsub: () => void
          unsub = from(transform(x))({
            next: observer.next,
            error: observer.error,
            complete: () => {
              active--
              subs.delete(unsub)
              tryComplete()
            },
          })
          subs.add(unsub)
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: () => {
        done = true
        tryComplete()
      },
    })
    return () => {
      sourceSub()
      for (const fn of subs) fn()
    }
  }

/**
 * Projects each source value to an Observable which is concatenated in the output Observable.
 * Subscribes to each inner Observable in sequence, waiting for each to complete
 * before subscribing to the next.
 *
 * @param transform - The function to apply to each value emitted by the source Observable.
 * @returns A function that accepts an Observable and returns an Observable
 * that emits values from inner Observables sequentially.
 *
 * @example
 * ```ts
 * const ids$ = of(1, 2, 3)
 * const users$ = pipe(
 *   ids$,
 *   concatMap((id) => fetchUser(id)) // requests run one after another
 * )
 * ```
 */
export const concatMap =
  <A, B>(transform: (a: A) => ObservableInput<B>) =>
  (source: Observable<A>): Observable<B> =>
  (observer) => {
    let queue: A[] = []
    let head = 0
    let curUnsub: (() => void) | null = null
    let active = false
    let done = false
    const tryComplete = () => {
      if (done && !active && head >= queue.length) observer.complete()
    }
    const next = () => {
      if (active || head >= queue.length) return tryComplete()
      active = true
      const v = queue[head]!
      ;(queue as any)[head++] = undefined
      if (head > 32 && head * 2 >= queue.length) {
        queue = queue.slice(head)
        head = 0
      }
      try {
        curUnsub = from(transform(v))({
          next: observer.next,
          error: observer.error,
          complete: () => {
            active = false
            next()
          },
        })
      } catch (err) {
        active = false
        observer.error(err)
      }
    }
    const sourceSub = source({
      next: (x) => {
        queue.push(x)
        next()
      },
      error: observer.error,
      complete: () => {
        done = true
        tryComplete()
      },
    })
    return () => {
      sourceSub()
      if (curUnsub) curUnsub()
    }
  }

/**
 * Filter items emitted by the source Observable by only emitting those that
 * satisfy a specified predicate.
 *
 * @param predicate - The function to apply
 * evaluates each value emitted by the source Observable. If it returns `true`,
 * the value is emitted, if `false` the value is not passed to the output
 * Observable.
 *
 * @returns A function that returns an Observable that emits items from the
 * source Observable that satisfy the specified `predicate`.
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3, 4, 5)
 * const evens$ = pipe(source$, filter((x) => x % 2 === 0))
 * subscribe(evens$, console.log) // 2, 4
 * ```
 */
export const filter: {
  <A>(): (oa: Observable<A>) => Observable<never>
  <A, B extends A = A>(predicate: (a: A) => a is B): (oa: Observable<A>) => Observable<B>
  <A, B extends A = A>(predicate: (a: A) => boolean): (oa: Observable<A>) => Observable<B>
} = (<A, B extends A>(pred?: ((a: A) => a is B) | ((a: A) => boolean)) =>
  (oa: Observable<A>): Observable<B> =>
  (observer) => {
    const p = pred ?? (() => false)
    return oa({
      next: (x) => {
        try {
          if (p(x)) observer.next(x as B)
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })
  }) as any

/**
 * Catches errors on the source Observable and handles them by returning a new Observable.
 * If the selector throws, that error is forwarded to the observer.
 *
 * @param selector - Function that receives the error and returns an Observable to continue with
 * @returns A function that returns an Observable that recovers from errors
 *
 * @example
 * ```ts
 * const data$ = pipe(
 *   fromAsync((signal) => fetch('/api/data', { signal })),
 *   catchError((err) => of({ error: true, message: err.message }))
 * )
 * ```
 */
export const catchError =
  <A, B>(selector: (err: any) => ObservableInput<B>) =>
  (source: Observable<A>): Observable<A | B> =>
  (observer) => {
    let innerUnsub: (() => void) | null = null
    const sourceUnsub = source({
      next: observer.next,
      complete: observer.complete,
      error: (err) => {
        try {
          innerUnsub = from(selector(err))(observer as any)
        } catch (e) {
          observer.error(e)
        }
      },
    })
    return () => {
      sourceUnsub()
      if (innerUnsub) innerUnsub()
    }
  }

/**
 * Call a function when the observable completes, errors, or is unsubscribed.
 */
export const finalize =
  <A>(callback: () => void) =>
  (source: Observable<A>): Observable<A> =>
  (observer) => {
    const unsub = source({
      next: observer.next,
      error: (e) => {
        observer.error(e)
        callback()
      },
      complete: () => {
        observer.complete()
        callback()
      },
    })

    return () => {
      unsub()
      callback()
    }
  }

/**
 * Maintains some state based on the values emited from a source observable and emits the state
 * when the source emits.
 *
 * @param initial - A starting value to initialize the internal state
 * @param accumulator - A "reducer function". This will be called for each value after an initial state is
 * acquired.
 *
 * @returns A function that returns an Observable of the accumulated values.
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * const count$ = pipe(clicks$, scan(0, (count) => count + 1))
 * subscribe(count$, console.log) // 1, 2, 3, ...
 * ```
 */
export const scan: <A, B>(initial: A, accumulator: (a: A, b: B) => A) => (source: Observable<B>) => Observable<A> =
  (initial, accumulator) => (source) => (observer) => {
    let c = initial
    return source({
      next: (x) => {
        try {
          c = accumulator(c, x)
          observer.next(c)
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })
  }

/**
 * Used to perform side-effects for notifications from the source observable.
 * Accepts either a function (called on next) or a partial Observer to tap into
 * next, error, and/or complete.
 *
 * @param observerOrNext - A callback or partial Observer to execute on emissions
 *
 * @returns A function that returns an Observable identical to the source, but
 * runs the specified Observer or callback(s) for each notification.
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const logged$ = pipe(
 *   source$,
 *   tap((x) => console.log('value:', x)),
 *   map((x) => x * 2)
 * )
 *
 * // Or with full observer:
 * const tracked$ = pipe(
 *   source$,
 *   tap({
 *     next: (x) => console.log('value:', x),
 *     error: (e) => console.error('error:', e),
 *     complete: () => console.log('done'),
 *   })
 * )
 * ```
 */
export const tap =
  <A>(observerOrNext: Partial<Observer<A>> | ((value: A) => void)) =>
  (source: Observable<A>): Observable<A> =>
  (observer) => {
    const t = typeof observerOrNext === 'function' ? { next: observerOrNext } : observerOrNext
    return source({
      next: (x) => {
        try {
          t.next?.(x)
          observer.next(x)
        } catch (err) {
          observer.error(err)
        }
      },
      error: (e) => {
        try {
          t.error?.(e)
        } catch (e) {
          console.error('Uncaught Error in tap error handler:', e)
        }
        observer.error(e)
      },
      complete: () => {
        try {
          t.complete?.()
        } catch (e) {
          console.error('Uncaught Error in tap complete handler:', e)
        }
        observer.complete()
      },
    })
  }

/**
 * Runs a side effect for each value emitted by the source Observable,
 * without emitting any values. Completes when the source completes.
 *
 * Use this operator when you only care about performing side effects
 * and don't need to pass values downstream.
 *
 * @param fn - The function to execute for each value
 * @returns A function that returns an Observable that emits nothing but completes
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * pipe(source$, effect((x) => console.log('processed:', x)))
 * // logs: processed: 1, processed: 2, processed: 3
 * // emits nothing
 * ```
 */
export const effect =
  <A>(fn: (value: A) => void) =>
  (source: Observable<A>): Observable<never> =>
  (observer) =>
    source({
      next: (x) => {
        try {
          fn(x)
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })

/**
 * Emits only the first n values from the source Observable, then completes.
 *
 * @param count - The maximum number of values to emit
 * @returns A function that returns an Observable that emits only the first n values
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3, 4, 5)
 * const first3$ = pipe(source$, take(3))
 * subscribe(first3$, console.log) // 1, 2, 3
 * ```
 */
export const take =
  <A>(count: number) =>
  (source: Observable<A>): Observable<A> =>
  (observer) => {
    let emitted = 0
    let completed = false
    let sUnsub: Unsubscribe | undefined
    const finish = () => {
      completed = true
      observer.complete()
      if (sUnsub) sUnsub()
    }
    sUnsub = source({
      next: (x) => {
        if (emitted >= count) return
        emitted++
        observer.next(x)
        if (emitted >= count) finish()
      },
      error: observer.error,
      complete: () => {
        if (!completed) observer.complete()
      },
    })
    if (emitted >= count && !completed) finish()
    return () => {
      completed = true
      if (sUnsub) sUnsub()
    }
  }

/**
 * Emits values from the source Observable until the notifier Observable emits.
 *
 * @param notifier - The Observable that causes the output to stop when it emits
 * @returns A function that returns an Observable that emits until the notifier emits
 *
 * @example
 * ```ts
 * const stop$ = subject<void>()
 * const ticks$ = pipe(interval(1000), takeUntil(stop$))
 * subscribe(ticks$, console.log) // 0, 1, 2, ...
 * stop$.next() // stops the subscription
 * ```
 */
export const takeUntil: <A>(notifier: Observable<any>) => (source: Observable<A>) => Observable<A> =
  (notifier) => (source) => (observer) => {
    let completed = false
    let nUnsub: () => void = noop
    let sUnsub: () => void = noop
    sUnsub = source({
      next: (x) => {
        if (!completed) observer.next(x)
      },
      error: observer.error,
      complete: observer.complete,
    })
    nUnsub = notifier({
      next: () => {
        completed = true
        sUnsub()
        nUnsub()
        observer.complete()
      },
      error: observer.error,
      complete: noop,
    })
    return () => {
      completed = true
      sUnsub()
      nUnsub()
    }
  }

/**
 * Emits values from the source Observable while the predicate returns true.
 *
 * @param predicate - The function that evaluates each value
 * @returns A function that returns an Observable that emits while the predicate is true
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3, 4, 5, 1)
 * const result$ = pipe(source$, takeWhile((x) => x < 4))
 * subscribe(result$, console.log) // 1, 2, 3
 * ```
 */
export const takeWhile: <A>(
  predicate: (value: A, index: number) => boolean,
) => (source: Observable<A>) => Observable<A> = (predicate) => (source) => (observer) => {
  let i = 0
  let taking = true
  let unsub: () => void = noop
  unsub = source({
    next: (x) => {
      try {
        if (taking && predicate(x, i++)) {
          observer.next(x)
        } else {
          taking = false
          unsub()
          observer.complete()
        }
      } catch (err) {
        observer.error(err)
      }
    },
    error: observer.error,
    complete: observer.complete,
  })
  return unsub
}

/**
 * Prepends values to the beginning of the Observable sequence.
 *
 * @param values - The values to prepend
 * @returns A function that returns an Observable with the values prepended
 *
 * @example
 * ```ts
 * const source$ = of(2, 3)
 * const result$ = pipe(source$, startWith(0, 1))
 * subscribe(result$, console.log) // 0, 1, 2, 3
 * ```
 */
export const startWith: <A, B>(...values: A[]) => (source: Observable<B>) => Observable<A | B> =
  (...values) =>
  (source) =>
  (observer) => {
    for (let i = 0; i < values.length; i++) {
      try {
        observer.next(values[i]!)
      } catch (err) {
        observer.error(err)
        return noop
      }
    }
    return source(observer)
  }

/**
 * Emits values that are distinct from the previous emission.
 *
 * @param compareFn - Optional comparison function (defaults to ===)
 * @returns A function that returns an Observable that filters consecutive duplicates
 *
 * @example
 * ```ts
 * const source$ = of(1, 1, 2, 2, 3, 1)
 * const distinct$ = pipe(source$, distinctUntilChanged())
 * subscribe(distinct$, console.log) // 1, 2, 3, 1
 * ```
 */
export const distinctUntilChanged =
  <A>(compareFn: (prev: A, curr: A) => boolean = (a, b) => a === b) =>
  (source: Observable<A>): Observable<A> =>
  (observer) => {
    let has = false
    let prev: A
    return source({
      next: (x) => {
        try {
          if (!has || !compareFn(prev, x)) {
            has = true
            prev = x
            observer.next(x)
          }
        } catch (err) {
          observer.error(err)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })
  }

/**
 * Emits consecutive pairs of values from the source Observable.
 * The first emission occurs after the second value is received.
 *
 * @returns A function that returns an Observable emitting [previous, current] pairs
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const pairs$ = pipe(source$, pairwise())
 * subscribe(pairs$, console.log) // [1, 2], [2, 3]
 * ```
 */
export const pairwise =
  <A>() =>
  (source: Observable<A>): Observable<[A, A]> =>
  (observer) => {
    let has = false
    let prev: A
    return source({
      next: (x) => {
        if (has) observer.next([prev, x])
        has = true
        prev = x
      },
      error: observer.error,
      complete: observer.complete,
    })
  }

/**
 * Emits [previous, current] pairs for each value, starting with [null, firstValue].
 * Unlike {@link pairwise}(), this emits on the first value with null as the previous.
 *
 * @returns A function that returns an Observable emitting [previous, current] pairs
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const result$ = pipe(source$, withPrevious(null))
 * subscribe(result$, console.log) // [null, 1], [1, 2], [2, 3]
 * ```
 */
export const withPrevious =
  <A, B = null>(initial: B) =>
  (source: Observable<A>): Observable<[A | B, A]> =>
  (observer) => {
    let prev: B | A = initial ?? (null as B)
    return source({
      next: (x) => {
        observer.next([prev, x])
        prev = x
      },
      error: observer.error,
      complete: observer.complete,
    })
  }

/**
 * Combines the source Observable with the latest values from other Observables.
 * Emits only when the source emits, and only after all others have emitted at least once.
 *
 * @param others - Observables to combine with the source.
 * @returns A function that returns an Observable emitting arrays of [source, ...others].
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * const config$ = of({ theme: 'dark' })
 * const result$ = pipe(clicks$, withLatestFrom(config$))
 * subscribe(result$, ([event, config]) => console.log(config.theme))
 * ```
 */
export const withLatestFrom =
  <A, T extends Observable<any>[]>(...others: T) =>
  (source: Observable<A>): Observable<[A, ...{ [K in keyof T]: T[K] extends Observable<infer U> ? U : never }]> =>
  (observer) => {
    const n = others.length
    const values: any[] = new Array(n)
    const has: boolean[] = new Array(n).fill(false)
    let pending = n
    const otherUnsubs = others.map((o, i) =>
      o({
        next: (x) => {
          values[i] = x
          if (!has[i]) {
            has[i] = true
            pending--
          }
        },
        error: observer.error,
        complete: noop,
      }),
    )
    const sourceUnsub = source({
      next: (x) => {
        if (pending !== 0) return
        const out = new Array(n + 1)
        out[0] = x
        for (let i = 0; i < n; i++) out[i + 1] = values[i]
        observer.next(out as any)
      },
      error: observer.error,
      complete: observer.complete,
    })
    return () => {
      sourceUnsub()
      for (let i = 0; i < otherUnsubs.length; i++) otherUnsubs[i]!()
    }
  }

/**
 * Emits a value only after a specified time has passed without another emission.
 *
 * @param duration - The debounce duration in milliseconds.
 * @param scheduler - Scheduler to use for timing. Defaults to {@link asyncScheduler}.
 *   Use {@link animationFrameScheduler} for frame-synced debouncing, or
 *   {@link createVirtualScheduler} for testing.
 * @returns A function that returns an Observable that debounces emissions.
 *
 * @example
 * ```ts
 * const input$ = fromEvent(input, 'input')
 * const debounced$ = pipe(
 *   input$,
 *   map((e) => e.target.value),
 *   debounceTime(300)
 * )
 * subscribe(debounced$, (value) => search(value))
 * ```
 *
 * @example With virtual scheduler for testing
 * ```ts
 * const scheduler = createVirtualScheduler()
 * const results: number[] = []
 * pipe(of(1, 2, 3), debounceTime(100, scheduler), subscribe((x) => results.push(x)))
 * scheduler.flush()
 * // results is [3] - only the last value after debounce
 * ```
 */
export const debounceTime =
  (duration: number, scheduler: Scheduler = asyncScheduler) =>
  <A>(source: Observable<A>): Observable<A> =>
  (observer) => {
    let taskUnsub: Unsubscribe | undefined
    let last: A | undefined
    let has = false
    const fire = () => {
      has = false
      observer.next(last!)
    }
    const sourceUnsub = source({
      next: (x) => {
        last = x
        has = true
        if (taskUnsub) taskUnsub()
        taskUnsub = scheduler.schedule(fire, duration)
      },
      error: observer.error,
      complete: () => {
        if (taskUnsub) taskUnsub()
        if (has) observer.next(last!)
        observer.complete()
      },
    })
    return () => {
      sourceUnsub()
      if (taskUnsub) taskUnsub()
    }
  }

/**
 * Emits a value, then ignores subsequent values for a specified duration.
 *
 * @param duration - The throttle duration in milliseconds.
 * @returns A function that returns an Observable that throttles emissions.
 *
 * @example
 * ```ts
 * const scroll$ = fromEvent(window, 'scroll')
 * const throttled$ = pipe(scroll$, throttleTime(100))
 * subscribe(throttled$, () => updatePosition())
 * ```
 */
export const throttleTime =
  (duration: number) =>
  <A>(source: Observable<A>): Observable<A> =>
  (observer) => {
    let last = 0
    return source({
      next: (x) => {
        const now = Date.now()
        if (now - last >= duration) {
          last = now
          observer.next(x)
        }
      },
      error: observer.error,
      complete: observer.complete,
    })
  }

/**
 * Delays the emission of each value by a specified time.
 *
 * @param duration - The delay duration in milliseconds.
 * @returns A function that returns an Observable that delays emissions.
 *
 * @example
 * ```ts
 * const source$ = of(1, 2, 3)
 * const delayed$ = pipe(source$, delay(1000))
 * subscribe(delayed$, console.log) // 1, 2, 3 (each after 1 second)
 * ```
 */
export const delay =
  (duration: number) =>
  <A>(source: Observable<A>): Observable<A> =>
  (observer) => {
    const ids = new Set<ReturnType<typeof setTimeout>>()
    let done = false
    const tryComplete = () => {
      if (done && ids.size === 0) observer.complete()
    }
    const sourceUnsub = source({
      next: (x) => {
        let id: ReturnType<typeof setTimeout>
        id = setTimeout(() => {
          ids.delete(id)
          observer.next(x)
          tryComplete()
        }, duration)
        ids.add(id)
      },
      error: observer.error,
      complete: () => {
        done = true
        tryComplete()
      },
    })
    return () => {
      sourceUnsub()
      for (const id of ids) clearTimeout(id)
      ids.clear()
    }
  }

/**
 * Collects values into arrays and emits them at specified intervals.
 *
 * @param duration - The buffer duration in milliseconds.
 * @returns A function that returns an Observable that emits buffered arrays.
 *
 * @example
 * ```ts
 * const clicks$ = fromEvent(button, 'click')
 * const buffered$ = pipe(clicks$, bufferTime(1000))
 * subscribe(buffered$, (clicks) => console.log(`${clicks.length} clicks`))
 * ```
 */
export const bufferTime =
  (duration: number) =>
  <A>(source: Observable<A>): Observable<A[]> =>
  (observer) => {
    let buf: A[] = []
    const id = setInterval(() => {
      if (buf.length === 0) return
      const out = buf
      buf = []
      observer.next(out)
    }, duration)
    const sourceUnsub = source({
      next: (x) => buf.push(x),
      error: observer.error,
      complete: () => {
        clearInterval(id)
        if (buf.length > 0) observer.next(buf)
        observer.complete()
      },
    })
    return () => {
      sourceUnsub()
      clearInterval(id)
    }
  }

/**
 * Shares a single subscription to the source among multiple subscribers.
 * Subscribes to source on first subscriber, unsubscribes when all unsubscribe.
 *
 * @returns A function that returns a shared Observable.
 *
 * @example
 * ```ts
 * const source$ = pipe(interval(1000), share())
 * subscribe(source$, (x) => console.log('A:', x))
 * subscribe(source$, (x) => console.log('B:', x)) // shares same interval
 * ```
 */
export const share =
  <A>() =>
  (source: Observable<A>): Observable<A> => {
    let subj: Subject<A> | null = null
    let refs = 0
    let sourceUnsub: (() => void) | null = null
    const reset = () => {
      subj = null
      refs = 0
      sourceUnsub = null
    }
    return (observer) => {
      if (!subj) subj = subject<A>()
      const s = subj
      const sub = s(observer)
      if (refs++ === 0) {
        sourceUnsub = source({
          next: s.next,
          error: (e) => (s.error(e), reset()),
          complete: () => (s.complete(), reset()),
        })
      }
      return () => {
        sub()
        if (--refs === 0 && sourceUnsub) {
          sourceUnsub()
          sourceUnsub = null
        }
      }
    }
  }

/**
 * Shares a single subscription and replays the last N values to new subscribers.
 *
 * @param bufferSize - Number of values to replay (default: 1)
 * @returns A function that returns a shared Observable with replay.
 *
 * @example
 * ```ts
 * const source$ = pipe(of(1, 2, 3), shareReplay(2))
 * subscribe(source$, (x) => console.log('A:', x)) // A: 1, A: 2, A: 3
 * subscribe(source$, (x) => console.log('B:', x)) // B: 2, B: 3 (replays last 2)
 * ```
 */
export const shareReplay =
  <A>(bufferSize = 1) =>
  (source: Observable<A>): Observable<A> => {
    const subj = replaySubject<A>(bufferSize)
    let refs = 0
    let sourceUnsub: (() => void) | null = null
    return (observer) => {
      const sub = subj(observer)
      if (refs++ === 0) sourceUnsub = source(subj)
      return () => {
        sub()
        if (--refs === 0 && sourceUnsub) {
          sourceUnsub()
          sourceUnsub = null
        }
      }
    }
  }

/**
 * Shares a single subscription and replays the latest value for each key to new subscribers.
 *
 * Useful for sharing event streams with discriminated unions where you want late
 * subscribers to receive the latest event of each type.
 *
 * @param getKey - Function to extract the key from a value
 * @param options.maxKeys - Maximum number of keys to cache (default: Infinity). When exceeded, oldest keys are evicted.
 * @returns A function that returns a shared Observable with replay by key.
 *
 * @example
 * ```ts
 * type Event =
 *   | { type: "user"; data: User }
 *   | { type: "config"; data: Config }
 *
 * const source$ = subject<Event>()
 * const shared$ = pipe(
 *   source$,
 *   shareReplayByKey((e) => e.type)
 * )
 *
 * source$.next({ type: "user", data: user1 })
 * source$.next({ type: "config", data: config1 })
 * source$.next({ type: "user", data: user2 })
 *
 * subscribe(shared$, (e) => console.log(e)) // { type: "config", data: config1 }, { type: "user", data: user2 }
 * subscribe(shared$, (e) => console.log(e)) // { type: "config", data: config1 }, { type: "user", data: user2 }
 * ```
 */
export const shareReplayByKey =
  <A, K extends string | number | symbol = string | number | symbol>(
    getKey: (value: A) => K,
    options?: { maxKeys?: number },
  ) =>
  (source: Observable<A>): Observable<A> => {
    const subj = replayByKeySubject<A, K>(getKey, options)
    let refs = 0
    let sourceUnsub: (() => void) | null = null
    return (observer) => {
      const sub = subj(observer)
      if (refs++ === 0) sourceUnsub = source(subj)
      return () => {
        sub()
        if (--refs === 0 && sourceUnsub) {
          sourceUnsub()
          sourceUnsub = null
        }
      }
    }
  }

/**
 * Re-emits all notifications from the source Observable on a specified Scheduler.
 *
 * Use cases:
 * - Break synchronous execution to keep the UI responsive
 * - Schedule work to run on animation frames for smooth visuals
 * - Defer low-priority work until the browser is idle
 * - Control microtask vs macrotask execution order
 *
 * @param scheduler - The scheduler to use for re-emitting notifications.
 * @param delay - Optional delay in milliseconds (defaults to 0).
 * @returns A function that returns an Observable emitting on the scheduler.
 *
 * @example Sync to animation frames for smooth rendering
 * ```ts
 * pipe(
 *   dataStream$,
 *   observeOn(animationFrameScheduler),
 *   subscribe((data) => renderToCanvas(data))
 * )
 * ```
 *
 * @example Defer heavy processing to idle time
 * ```ts
 * pipe(
 *   events$,
 *   observeOn(idleScheduler),
 *   subscribe((event) => analytics.track(event))
 * )
 * ```
 *
 * @example Break sync loops to unblock the UI
 * ```ts
 * pipe(
 *   of(...largeArray),
 *   observeOn(asyncScheduler),
 *   subscribe((item) => processItem(item))
 * )
 * ```
 */
export const observeOn =
  <A>(scheduler: Scheduler, delay = 0) =>
  (source: Observable<A>): Observable<A> =>
  (observer) => {
    let closed = false
    const queue: A[] = []
    let errVal: unknown
    let hasErr = false
    let hasDone = false
    let scheduled = false
    let drainUnsub: Unsubscribe | undefined
    const drain = () => {
      scheduled = false
      if (closed) return
      for (let i = 0; i < queue.length && !closed; i++) observer.next(queue[i]!)
      queue.length = 0
      if (closed) return
      if (hasErr) {
        hasErr = false
        observer.error(errVal as any)
        return
      }
      if (hasDone) {
        hasDone = false
        observer.complete()
      }
    }
    const ensure = () => {
      if (scheduled || closed) return
      scheduled = true
      drainUnsub = scheduler.schedule(drain, delay)
    }
    const sourceUnsub = source({
      next: (x) => {
        if (closed) return
        queue.push(x)
        ensure()
      },
      error: (e) => {
        if (closed) return
        hasErr = true
        errVal = e
        ensure()
      },
      complete: () => {
        if (closed) return
        hasDone = true
        ensure()
      },
    })
    return () => {
      closed = true
      if (drainUnsub) drainUnsub()
      sourceUnsub()
    }
  }

