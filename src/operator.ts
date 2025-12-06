import { Observable } from './observable.js'
import { createSubject, createReplaySubject } from './subject.js'

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
  (transform) => (source) => (sub) =>
    source((x) => sub(transform(x)))

/**
 * Projects each emitted source value to an Observable which is merged in the output
 * Observable, emitting values only from the most recently projected Observable.
 *
 * @param transform The function to apply to each value emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
 * where the emitted values are transformed.
 */
export const switchMap: <A, B>(transform: (a: A) => Observable<B>) => (source: Observable<A>) => Observable<B> =
  (transform) => (source) => {
    let last = () => {}
    return (sub) => {
      const current = source((x) => {
        last()
        last = transform(x)((y) => sub(y))
      })
      return () => (last(), current())
    }
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
  (transform) => (source) => (sub) => {
    const innerSubs: (() => void)[] = []
    const sourceSub = source((x) => {
      innerSubs.push(transform(x)(sub))
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
 * Note: Works correctly for synchronous inner Observables. For async inner Observables,
 * completion cannot be detected, so queued values are processed immediately.
 *
 * @param transform The function to apply to each value emitted by the source Observable.
 * @return A function that accepts an Observable and returns an Observable
 * that emits values from inner Observables sequentially.
 */
export const concatMap =
  <A, B>(transform: (a: A) => Observable<B>) =>
  (source: Observable<A>): Observable<B> =>
  (sub) => {
    const queue: A[] = []
    let currentUnsub: (() => void) | null = null
    let active = false
    const processNext = () => {
      if (active || queue.length === 0) return
      active = true
      const value = queue.shift()!
      currentUnsub = transform(value)(sub)
      active = false
      processNext()
    }
    const sourceSub = source((x) => {
      queue.push(x)
      processNext()
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
} =
  (pred) =>
  (oa) =>
  (sub = (_x) => {}) =>
    oa((x: any) => pred(x) && sub(x))

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
  (initial, accumulator) => (source) => {
    let c = initial
    return (sub) =>
      source((x) => {
        c = accumulator(c, x)
        return sub(c)
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
  (operator) => (ob) => (sub) =>
    ob((x) => (operator(x), sub(x)))

/**
 * Emits only the first n values from the source Observable, then completes.
 *
 * @param count The maximum number of values to emit
 * @return A function that returns an Observable that emits only the first n values
 */
export const take: <A>(count: number) => (source: Observable<A>) => Observable<A> = (count) => (source) => (sub) => {
  let emitted = 0
  let unsubscribe: () => void
  unsubscribe = source((x) => {
    if (emitted < count) {
      sub(x)
      emitted++
      if (emitted >= count) {
        unsubscribe()
      }
    }
  })
  return unsubscribe
}

/**
 * Emits values from the source Observable until the notifier Observable emits.
 *
 * @param notifier The Observable that causes the output to stop when it emits
 * @return A function that returns an Observable that emits until the notifier emits
 */
export const takeUntil: <A>(notifier: Observable<any>) => (source: Observable<A>) => Observable<A> =
  (notifier) => (source) => (sub) => {
    let completed = false
    const notifierUnsub = notifier(() => {
      completed = true
      sourceUnsub()
      notifierUnsub()
    })
    const sourceUnsub = source((x) => {
      if (!completed) sub(x)
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
) => (source: Observable<A>) => Observable<A> = (predicate) => (source) => (sub) => {
  let index = 0
  let taking = true
  const unsubscribe = source((x) => {
    if (taking && predicate(x, index++)) {
      sub(x)
    } else {
      taking = false
      unsubscribe()
    }
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
  (sub) => {
    values.forEach((value) => sub(value))
    return source(sub)
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
  (sub) => {
    let hasPrevious = false
    let previous: A
    return source((x) => {
      if (!hasPrevious || !compareFn(previous, x)) {
        hasPrevious = true
        previous = x
        sub(x)
      }
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
  (sub) => {
    const values: any[] = new Array(others.length)
    const hasValue: boolean[] = new Array(others.length).fill(false)
    let ready = false
    const otherUnsubs = others.map((other, i) =>
      other((x) => {
        values[i] = x
        hasValue[i] = true
        if (!ready) ready = hasValue.every(Boolean)
      }),
    )
    const sourceUnsub = source((x) => {
      if (ready) sub([x, ...values] as any)
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
  (sub) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const sourceUnsub = source((x) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => sub(x), duration)
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
  (sub) => {
    let lastEmit = 0
    return source((x) => {
      const now = Date.now()
      if (now - lastEmit >= duration) {
        lastEmit = now
        sub(x)
      }
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
  (sub) => {
    const timeoutIds: ReturnType<typeof setTimeout>[] = []
    const sourceUnsub = source((x) => {
      timeoutIds.push(setTimeout(() => sub(x), duration))
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
  (sub) => {
    let buffer: A[] = []
    const intervalId = setInterval(() => {
      if (buffer.length > 0) {
        sub(buffer)
        buffer = []
      }
    }, duration)
    const sourceUnsub = source((x) => {
      buffer.push(x)
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
    const subject = createSubject<A>()
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    return (sub) => {
      const subjectUnsub = subject(sub)
      if (refCount++ === 0) {
        sourceUnsub = source((x) => subject.next(x))
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
    const subject = createReplaySubject<A>(bufferSize)
    let refCount = 0
    let sourceUnsub: (() => void) | null = null
    return (sub) => {
      const subjectUnsub = subject(sub)
      if (refCount++ === 0) {
        sourceUnsub = source((x) => subject.next(x))
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
