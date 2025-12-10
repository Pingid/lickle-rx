/**
 * Operators that transform, filter, or combine values from observables.
 * @module
 */

import { subject, replaySubject, replayByKeySubject, type Subject } from './subject.js'
import { Observable, Unsubscribe, type Observer } from './observable.js'
import { asyncScheduler, Scheduler } from './scheduler.js'

/**
 * Applies a given transform function to each value emitted by the source
 * Observable, and emits the resulting values as an Observable.
 *
 * @param {function(value: A): B} transform The function to apply
 * to each `value` emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
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
          const value = transform(x)
          observer.next(value)
        } catch (err) {
          observer.error(err)
        }
      },
      ...forward(observer),
    })

/**
 * Projects each emitted source value to an Observable which is merged in the output
 * Observable, emitting values only from the most recently projected Observable.
 *
 * @param transform The function to apply to each value emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
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
export const switchMap: <A, B>(transform: (a: A) => Observable<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) => {
    let innerUnsub: () => void = () => {}
    let hasActiveInner = false
    let sourceCompleted = false
    const tryComplete = () => {
      if (sourceCompleted && !hasActiveInner) observer.complete()
    }
    const sourceUnsub = source({
      next: (x) => {
        try {
          innerUnsub()
          hasActiveInner = true
          innerUnsub = transform(x)({
            next: observer.next,
            ...forwardError(observer),
            complete: () => {
              hasActiveInner = false
              tryComplete()
            },
          })
        } catch (err) {
          observer.error(err)
        }
      },
      ...forwardError(observer),
      complete: () => {
        sourceCompleted = true
        tryComplete()
      },
    })
    return () => (innerUnsub(), sourceUnsub())
  }

/**
 * Projects each source value to an Observable which is merged in the output Observable.
 * All inner Observables are subscribed to concurrently.
 *
 * @param transform The function to apply to each value emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
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
export const mergeMap: <A, B>(transform: (a: A) => Observable<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => (observer) => {
    const innerSubs = new Set<() => void>()
    let activeCount = 0
    let sourceCompleted = false
    const tryComplete = () => {
      if (sourceCompleted && activeCount === 0) observer.complete()
    }
    const sourceSub = source({
      next: (x) => {
        try {
          activeCount++
          let innerUnsub: () => void
          innerUnsub = transform(x)({
            next: observer.next,
            ...forwardError(observer),
            complete: () => {
              activeCount--
              innerSubs.delete(innerUnsub)
              tryComplete()
            },
          })
          innerSubs.add(innerUnsub)
        } catch (err) {
          observer.error(err)
        }
      },
      ...forwardError(observer),
      complete: () => {
        sourceCompleted = true
        tryComplete()
      },
    })
    return () => {
      sourceSub()
      innerSubs.forEach((fn) => fn())
    }
  }

/**
 * Projects each source value to an Observable which is concatenated in the output Observable.
 * Subscribes to each inner Observable in sequence, waiting for each to complete
 * before subscribing to the next.
 *
 * @param transform The function to apply to each value emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
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
  <A, B>(transform: (a: A) => Observable<B>) =>
  (source: Observable<A>): Observable<B> =>
  (observer) => {
    const queue: A[] = []
    let currentUnsub: (() => void) | null = null
    let active = false
    let sourceCompleted = false
    const tryComplete = () => {
      if (sourceCompleted && !active && queue.length === 0) observer.complete()
    }
    const processNext = () => {
      if (active || queue.length === 0) {
        tryComplete()
        return
      }
      active = true
      const value = queue.shift()!
      try {
        currentUnsub = transform(value)({
          next: observer.next,
          ...forwardError(observer),
          complete: () => {
            active = false
            processNext()
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
        processNext()
      },
      ...forwardError(observer),
      complete: () => {
        sourceCompleted = true
        tryComplete()
      },
    })
    return () => {
      sourceSub()
      if (currentUnsub) currentUnsub()
    }
  }

/**
 * Filter items emitted by the source Observable by only emitting those that
 * satisfy a specified predicate.
 *
 * @param predicate The function to apply
 * evaluates each value emitted by the source Observable. If it returns `true`,
 * the value is emitted, if `false` the value is not passed to the output
 * Observable.
 *
 * @return A function that returns an Observable that emits items from the
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
    const predicate = pred ?? (() => false)
    return oa({
      next: (x) => {
        try {
          if (predicate(x)) observer.next(x as B)
        } catch (err) {
          observer.error(err)
        }
      },
      ...forward(observer),
    })
  }) as any

/**
 * Catches errors on the source Observable and handles them by returning a new Observable.
 * If the selector throws, that error is forwarded to the observer.
 *
 * @param selector Function that receives the error and returns an Observable to continue with
 * @return A function that returns an Observable that recovers from errors
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
  <A, B>(selector: (err: any) => Observable<B>) =>
  (source: Observable<A>): Observable<A | B> =>
  (observer) => {
    let innerUnsub: (() => void) | null = null
    let sourceUnsub: (() => void) | null = null

    sourceUnsub = source({
      next: observer.next,
      complete: observer.complete,
      error: (err) => {
        try {
          const result$ = selector(err)
          innerUnsub = result$({
            next: observer.next,
            error: observer.error,
            complete: observer.complete,
          })
        } catch (e) {
          observer.error(e)
        }
      },
    })

    return () => {
      if (sourceUnsub) sourceUnsub()
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
 * @param initial A starting value to initialize the internal state
 * @param accumulator A "reducer function". This will be called for each value after an initial state is
 * acquired.
 *
 * @return A function that returns an Observable of the accumulated values.
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
      ...forward(observer),
    })
  }

/**
 * Used to perform side-effects for notifications from the source observable.
 * Accepts either a function (called on next) or a partial Observer to tap into
 * next, error, and/or complete.
 *
 * @param observerOrNext A callback or partial Observer to execute on emissions
 *
 * @return A function that returns an Observable identical to the source, but
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
    const tapObserver = typeof observerOrNext === 'function' ? { next: observerOrNext } : observerOrNext
    return source({
      next: (x) => {
        try {
          tapObserver.next?.(x)
          observer.next(x)
        } catch (err) {
          observer.error(err)
        }
      },
      error: (e) => {
        try {
          tapObserver.error?.(e)
        } catch (e) {
          console.error('Uncaught Error in tap error handler:', e)
        }
        observer.error(e)
      },
      complete: () => {
        try {
          tapObserver.complete?.()
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
 * @param fn The function to execute for each value
 * @return A function that returns an Observable that emits nothing but completes
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
      ...forward(observer),
    })

/**
 * Emits only the first n values from the source Observable, then completes.
 *
 * @param count The maximum number of values to emit
 * @return A function that returns an Observable that emits only the first n values
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
    let sourceUnsub: Unsubscribe | undefined
    let completed = false

    const complete = () => {
      completed = true
      observer.complete()
      if (sourceUnsub) sourceUnsub()
    }

    sourceUnsub = source({
      next: (x) => {
        if (emitted < count) {
          emitted++
          observer.next(x)
          if (emitted >= count) {
            complete()
          }
        }
      },
      error: observer.error,
      complete: () => {
        if (!completed) observer.complete()
      },
    })

    // Handle synchronous completion case
    if (emitted >= count && !completed) {
      complete()
    }

    return () => {
      completed = true
      if (sourceUnsub) sourceUnsub()
    }
  }

/**
 * Emits values from the source Observable until the notifier Observable emits.
 *
 * @param notifier The Observable that causes the output to stop when it emits
 * @return A function that returns an Observable that emits until the notifier emits
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
    let notifierUnsub: () => void = () => {}
    let sourceUnsub: () => void = () => {}
    sourceUnsub = source({
      next: (x) => {
        if (!completed) observer.next(x)
      },
      ...forward(observer),
    })
    notifierUnsub = notifier({
      next: () => {
        completed = true
        sourceUnsub()
        notifierUnsub()
        observer.complete()
      },
      error: observer.error,
      complete: () => {},
    })
    return () => {
      completed = true
      sourceUnsub()
      notifierUnsub()
    }
  }

/**
 * Emits values from the source Observable while the predicate returns true.
 *
 * @param predicate The function that evaluates each value
 * @return A function that returns an Observable that emits while the predicate is true
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
  let index = 0
  let taking = true
  let unsubscribe: () => void = () => {}
  unsubscribe = source({
    next: (x) => {
      try {
        if (taking && predicate(x, index++)) {
          observer.next(x)
        } else {
          taking = false
          unsubscribe()
          observer.complete()
        }
      } catch (err) {
        observer.error(err)
      }
    },
    error: observer.error,
    complete: () => {},
  })
  return unsubscribe
}

/**
 * Prepends values to the beginning of the Observable sequence.
 *
 * @param values The values to prepend
 * @return A function that returns an Observable with the values prepended
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
    for (const value of values) {
      try {
        observer.next(value)
      } catch (err) {
        observer.error(err)
        return () => {}
      }
    }
    return source(observer)
  }

/**
 * Emits values that are distinct from the previous emission.
 *
 * @param compareFn Optional comparison function (defaults to ===)
 * @return A function that returns an Observable that filters consecutive duplicates
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
    let hasPrevious = false
    let previous: A
    return source({
      next: (x) => {
        try {
          if (!hasPrevious || !compareFn(previous, x)) {
            hasPrevious = true
            previous = x
            observer.next(x)
          }
        } catch (err) {
          observer.error(err)
        }
      },
      ...forward(observer),
    })
  }

/**
 * Emits consecutive pairs of values from the source Observable.
 * The first emission occurs after the second value is received.
 *
 * @return A function that returns an Observable emitting [previous, current] pairs
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
    let hasPrevious = false
    let previous: A
    return source({
      next: (x) => {
        if (hasPrevious) {
          observer.next([previous, x])
        }
        hasPrevious = true
        previous = x
      },
      ...forward(observer),
    })
  }

/**
 * Emits [previous, current] pairs for each value, starting with [null, firstValue].
 * Unlike pairwise(), this emits on the first value with null as the previous.
 *
 * @return A function that returns an Observable emitting [previous, current] pairs
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
    let previous: B | A = initial ?? (null as B)
    return source({
      next: (x) => {
        observer.next([previous, x])
        previous = x
      },
      ...forward(observer),
    })
  }

/**
 * Combines the source Observable with the latest values from other Observables.
 * Emits only when the source emits, and only after all others have emitted at least once.
 *
 * @param others Observables to combine with the source.
 * @return A function that returns an Observable emitting arrays of [source, ...others].
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
    const values: any[] = new Array(others.length)
    const hasValue: boolean[] = new Array(others.length).fill(false)
    let ready = false
    const otherUnsubs = others.map((other, i) =>
      other({
        next: (x) => {
          values[i] = x
          hasValue[i] = true
          if (!ready) ready = hasValue.every(Boolean)
        },
        error: observer.error,
        complete: () => {},
      }),
    )
    const sourceUnsub = source({
      next: (x) => {
        if (ready) observer.next([x, ...values] as any)
      },
      ...forward(observer),
    })
    return () => {
      sourceUnsub()
      otherUnsubs.forEach((fn) => fn())
    }
  }

/**
 * Emits a value only after a specified time has passed without another emission.
 *
 * @param duration The debounce duration in milliseconds.
 * @param scheduler Scheduler to use for timing. Defaults to `asyncScheduler`.
 *   Use `animationFrameScheduler` for frame-synced debouncing, or
 *   `createVirtualScheduler()` for testing.
 * @return A function that returns an Observable that debounces emissions.
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
    let lastValue: A | undefined
    let hasValue = false

    const sourceUnsub = source({
      next: (x) => {
        lastValue = x
        hasValue = true
        // Cancel previous scheduled emission
        if (taskUnsub) taskUnsub()

        // Schedule new emission
        taskUnsub = scheduler.schedule(() => {
          hasValue = false
          observer.next(x)
        }, duration)
      },
      error: observer.error,
      complete: () => {
        if (taskUnsub) taskUnsub()
        if (hasValue) observer.next(lastValue!)
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
 * @param duration The throttle duration in milliseconds.
 * @return A function that returns an Observable that throttles emissions.
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
    let lastEmit = 0
    return source({
      next: (x) => {
        const now = Date.now()
        if (now - lastEmit >= duration) {
          lastEmit = now
          observer.next(x)
        }
      },
      ...forward(observer),
    })
  }

/**
 * Delays the emission of each value by a specified time.
 *
 * @param duration The delay duration in milliseconds.
 * @return A function that returns an Observable that delays emissions.
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
    const timeoutIds: ReturnType<typeof setTimeout>[] = []
    let pending = 0
    let sourceCompleted = false
    const tryComplete = () => {
      if (sourceCompleted && pending === 0) observer.complete()
    }
    const sourceUnsub = source({
      next: (x) => {
        pending++
        timeoutIds.push(
          setTimeout(() => {
            pending--
            observer.next(x)
            tryComplete()
          }, duration),
        )
      },
      ...forwardError(observer),
      complete: () => {
        sourceCompleted = true
        tryComplete()
      },
    })
    return () => {
      sourceUnsub()
      timeoutIds.forEach((id) => clearTimeout(id))
    }
  }

/**
 * Collects values into arrays and emits them at specified intervals.
 *
 * @param duration The buffer duration in milliseconds.
 * @return A function that returns an Observable that emits buffered arrays.
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
    let buffer: A[] = []
    const intervalId = setInterval(() => {
      if (buffer.length > 0) {
        observer.next(buffer)
        buffer = []
      }
    }, duration)
    const sourceUnsub = source({
      next: (x) => buffer.push(x),
      ...forwardError(observer),
      complete: () => {
        clearInterval(intervalId)
        if (buffer.length > 0) observer.next(buffer)
        observer.complete()
      },
    })
    return () => {
      sourceUnsub()
      clearInterval(intervalId)
    }
  }

/**
 * Shares a single subscription to the source among multiple subscribers.
 * Subscribes to source on first subscriber, unsubscribes when all unsubscribe.
 *
 * @return A function that returns a shared Observable.
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
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    const reset = () => {
      subj = null
      refCount = 0
      sourceUnsub = null
    }
    return (observer) => {
      if (!subj) subj = subject<A>()
      const subjectUnsub = subj(observer)
      if (refCount++ === 0) {
        const currentSubj = subj
        sourceUnsub = source({
          next: (x) => currentSubj.next(x),
          error: (e) => {
            currentSubj.error(e)
            reset()
          },
          complete: () => {
            currentSubj.complete()
            reset()
          },
        })
      }
      return () => {
        subjectUnsub()
        if (--refCount === 0 && sourceUnsub) {
          sourceUnsub()
          sourceUnsub = null
        }
      }
    }
  }

/**
 * Shares a single subscription and replays the last N values to new subscribers.
 *
 * @param bufferSize Number of values to replay (default: 1)
 * @return A function that returns a shared Observable with replay.
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
    const subject = replaySubject<A>(bufferSize)
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    return (observer) => {
      const subjectUnsub = subject(observer)
      if (refCount++ === 0) {
        sourceUnsub = source({
          next: (x) => subject.next(x),
          error: (e) => subject.error(e),
          complete: () => subject.complete(),
        })
      }
      return () => {
        subjectUnsub()
        if (--refCount === 0 && sourceUnsub) {
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
 * @param getKey Function to extract the key from a value
 * @param options.maxKeys Maximum number of keys to cache (default: Infinity). When exceeded, oldest keys are evicted.
 * @return A function that returns a shared Observable with replay by key.
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
    const subject = replayByKeySubject<A, K>(getKey, options)
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    return (observer) => {
      const subjectUnsub = subject(observer)
      if (refCount++ === 0) {
        sourceUnsub = source({
          next: (x) => subject.next(x),
          error: (e) => subject.error(e),
          complete: () => subject.complete(),
        })
      }
      return () => {
        subjectUnsub()
        if (--refCount === 0 && sourceUnsub) {
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
 * @param scheduler The scheduler to use for re-emitting notifications.
 * @param delay Optional delay in milliseconds (defaults to 0).
 * @return A function that returns an Observable emitting on the scheduler.
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
    let sourceUnsub: Unsubscribe | undefined

    sourceUnsub = source({
      next: (x) => {
        if (closed) return
        scheduler.schedule(() => {
          if (!closed) observer.next(x)
        }, delay)
      },
      error: (e) => {
        if (closed) return
        scheduler.schedule(() => {
          if (!closed) observer.error(e)
        }, delay)
      },
      complete: () => {
        if (closed) return
        scheduler.schedule(() => {
          if (!closed) observer.complete()
        }, delay)
      },
    })

    return () => {
      closed = true
      if (sourceUnsub) sourceUnsub()
    }
  }

// ---------------- Utility Functions ----------------
const forwardError = <E>(o: Observer<any, E>): Pick<Observer<any, E>, 'error'> => ({ error: o.error })
const forward = <A, E>(o: Observer<A, E>) => ({ error: o.error, complete: o.complete })
