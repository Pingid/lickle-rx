/**
 * Operators that transform, filter, or combine values from observables.
 * @module
 */

import { Observable, type Observer } from './observable.js'
import { subject, replaySubject } from './subject.js'

/**
 * Applies a given transform function to each value emitted by the source
 * Observable, and emits the resulting values as an Observable.
 *
 * @param {function(value: A): B} transform The function to apply
 * to each `value` emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
 * where the emitted values are transformed.
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
 */
export const filter: {
  <A, B extends A = A>(predicate: (a: A) => a is B): (oa: Observable<A>) => Observable<B>
  <A, B extends A = A>(predicate: (a: A) => boolean): (oa: Observable<A>) => Observable<B>
} = (pred) => (oa) => (observer) =>
  oa({
    next: (x: any) => {
      try {
        if (pred(x)) observer.next(x)
      } catch (err) {
        observer.error(err)
      }
    },
    ...forward(observer),
  })

/**
 * Maintains some state based on the values emited from a source observable and emits the state
 * when the source emits.
 *
 * @param initial A starting value to initialize the internal state
 * @param accumulator A "reducer function". This will be called for each value after an initial state is
 * acquired.
 *
 * @return A function that returns an Observable of the accumulated values.
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
 * Used to perform side-effects for notifications from the source observable
 *
 * @param operator A callback to execute every type source observable emits
 *
 * @return A function that returns an Observable identical to the source, but
 * runs the specified Observer or callback(s) for each item.
 */
export const tap: <A>(operator: (a: A) => any) => (source: Observable<A>) => Observable<A> =
  (sideEffect) => (source) => (observer) =>
    source({
      next: (x) => {
        try {
          sideEffect(x)
          observer.next(x)
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
 */
export const take: <A>(count: number) => (source: Observable<A>) => Observable<A> =
  (count) => (source) => (observer) => {
    let emitted = 0
    // We rely on the source checking if it is closed,
    // or we ignore subsequent emissions.
    const unsub = source({
      next: (x) => {
        if (emitted < count) {
          emitted++
          observer.next(x)
          if (emitted >= count) {
            observer.complete()
            // If synchronous, we can't 'unsub' here safely.
            // We rely on the returned function to clean up.
            if (unsub) unsub()
          }
        }
      },
      error: observer.error,
      complete: () => {},
    })

    // If we finished synchronously, unsub immediately
    if (emitted >= count) {
      unsub()
    }
    return unsub
  }

/**
 * Emits values from the source Observable until the notifier Observable emits.
 *
 * @param notifier The Observable that causes the output to stop when it emits
 * @return A function that returns an Observable that emits until the notifier emits
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
 */
export const startWith: <A>(...values: A[]) => (source: Observable<A>) => Observable<A> =
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
 * Combines the source Observable with the latest values from other Observables.
 * Emits only when the source emits, and only after all others have emitted at least once.
 *
 * @param others Observables to combine with the source.
 * @return A function that returns an Observable emitting arrays of [source, ...others].
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
 * @return A function that returns an Observable that debounces emissions.
 */
export const debounceTime =
  (duration: number) =>
  <A>(source: Observable<A>): Observable<A> =>
  (observer) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let lastValue: A | undefined
    let hasValue = false
    const sourceUnsub = source({
      next: (x) => {
        lastValue = x
        hasValue = true
        if (timeoutId !== undefined) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          hasValue = false
          observer.next(x)
        }, duration)
      },
      ...forwardError(observer),
      complete: () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
        if (hasValue) observer.next(lastValue!)
        observer.complete()
      },
    })
    return () => {
      sourceUnsub()
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }

/**
 * Emits a value, then ignores subsequent values for a specified duration.
 *
 * @param duration The throttle duration in milliseconds.
 * @return A function that returns an Observable that throttles emissions.
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
 */
export const share =
  <A>() =>
  (source: Observable<A>): Observable<A> => {
    const subj = subject<A>()
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    return (observer) => {
      const subjectUnsub = subj(observer)
      if (refCount++ === 0) {
        sourceUnsub = source({
          next: (x) => subj.next(x),
          error: (e) => subj.error(e),
          complete: () => subj.complete(),
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

// ---------------- Utility Functions ----------------
const forwardError = <E>(o: Observer<any, E>): Pick<Observer<any, E>, 'error'> => ({ error: o.error })
const forward = <E>(o: Observer<any, E>) => ({ error: o.error, complete: o.complete })
