import { describe, it, expect, vi } from 'vitest'

import {
  map,
  switchMap,
  exhaustMap,
  mergeMap,
  concatMap,
  filter,
  catchError,
  finalize,
  scan,
  tap,
  effect,
  take,
  takeUntil,
  takeWhile,
  startWith,
  distinctUntilChanged,
  pairwise,
  withPrevious,
  withLatestFrom,
  debounceTime,
  throttleTime,
  delay,
  bufferTime,
  share,
  shareReplay,
  shareReplayByKey,
  observeOn,
} from './operator.js'
import { createVirtualScheduler, asyncScheduler } from './scheduler.js'
import { Observable, Observer, subscribe } from './observable.js'
import { subject } from './subject.js'
import { of } from './constructor.js'
import { pipe } from './util.js'

/** Creates an observable that immediately errors */
const throwError =
  <E>(errorFn: () => E): Observable<never, E> =>
  (obs) => {
    obs.error(errorFn())
    return () => {}
  }

describe('map()', () => {
  it('transforms each value', () => {
    sees(
      pipe(
        of(1, 2, 3),
        map((x) => x * 2),
      ),
      2,
      4,
      6,
    )
  })

  it('catches errors in transform', () => {
    const err = new Error('oops')
    sees(
      pipe(
        of(1, 2),
        map((x) => {
          if (x === 2) throw err
          return x
        }),
      ),
      1,
      { error: err },
    )
  })
})

describe('switchMap()', () => {
  it('switches to latest inner observable', () => {
    const src = subject<string>()
    const results = collect(
      pipe(
        src,
        switchMap((x) => of(x + '1', x + '2')),
      ),
    )
    src.next('A')
    src.next('B')
    src.complete()
    expect(results.values).toEqual(['A1', 'A2', 'B1', 'B2'])
  })

  it('cancels previous inner on new emission', () => {
    const src = subject<string>()
    const ctrl = controllable<string>()
    const results = collect(
      pipe(
        src,
        switchMap(() => ctrl.inner),
      ),
    )

    src.next('A')
    ctrl.emit('A1')
    src.next('B') // cancels A
    ctrl.emit('B1')
    ctrl.complete()
    src.complete()

    expect(results.values).toEqual(['A1', 'B1'])
  })

  it('supports promises', async () => {
    await seesAsync(
      pipe(
        of('A', 'B'),
        switchMap((x) => Promise.resolve(x + '!')),
      ),
      'B!',
    )
  })
})

describe('exhaustMap()', () => {
  it('ignores values while inner is active', () => {
    const src = subject<string>()
    const ctrl = controllable<string>()
    const results = collect(
      pipe(
        src,
        exhaustMap<string, string>((val) => (obs) => {
          ctrl.inner(obs)
          obs.next('start ' + val)
          return () => {}
        }),
      ),
    )

    src.next('A')
    src.next('B') // ignored
    ctrl.complete()
    src.next('C')
    ctrl.complete()
    src.complete()

    expect(results.values).toEqual(['start A', 'start C'])
  })

  it('supports promises', async () => {
    await seesAsync(
      pipe(
        of('A'),
        exhaustMap((x) => Promise.resolve(x + '!')),
      ),
      'A!',
    )
  })
})

describe('mergeMap()', () => {
  it('runs all inners concurrently', () => {
    const src = subject<string>()
    const ctrlA = controllable<string>()
    const ctrlB = controllable<string>()
    let first = true
    const results = collect(
      pipe(
        src,
        mergeMap(() => (first ? ((first = false), ctrlA.inner) : ctrlB.inner)),
      ),
    )

    src.next('A')
    src.next('B')
    ctrlA.emit('A1')
    ctrlB.emit('B1')
    ctrlA.emit('A2')
    ctrlB.complete()
    ctrlA.complete()
    src.complete()

    expect(results.values).toEqual(['A1', 'B1', 'A2'])
  })

  it('supports promises', async () => {
    await seesAsync(
      pipe(
        of('A', 'B'),
        mergeMap((x) => Promise.resolve(x + '!')),
      ),
      'A!',
      'B!',
    )
  })
})

describe('concatMap()', () => {
  it('waits for each inner to complete', () => {
    const src = subject<string>()
    const ctrl = controllable<string>()
    const results = collect(
      pipe(
        src,
        concatMap(() => ctrl.inner),
      ),
    )

    src.next('A')
    src.next('B') // queued
    ctrl.emit('A1')
    ctrl.complete() // now B starts
    ctrl.emit('B1')
    ctrl.complete()
    src.complete()

    expect(results.values).toEqual(['A1', 'B1'])
  })

  it('supports promises', async () => {
    await seesAsync(
      pipe(
        of('A', 'B'),
        concatMap((x) => Promise.resolve(x + '!')),
      ),
      'A!',
      'B!',
    )
  })
})

describe('filter()', () => {
  it('filters values by predicate', () => {
    sees(
      pipe(
        of(1, 2, 3, 4),
        filter((x) => x % 2 === 0),
      ),
      2,
      4,
    )
  })

  it('filters all when no predicate', () => {
    const results = collect(pipe(of(1, 2, 3), filter()))
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })

  it('catches errors in predicate', () => {
    const err = new Error('oops')
    sees(
      pipe(
        of(1, 2),
        filter((x) => {
          if (x === 2) throw err
          return true
        }),
      ),
      1,
      { error: err },
    )
  })
})

describe('catchError()', () => {
  it('catches and recovers from errors', () => {
    sees(
      pipe(
        throwError(() => new Error('fail')),
        catchError(() => of('recovered')),
      ),
      'recovered',
    )
  })

  it('forwards selector errors', () => {
    const err = new Error('selector fail')
    const results = collect(
      pipe(
        throwError(() => new Error('source')),
        catchError(() => {
          throw err
        }),
      ),
    )
    expect(results.error).toHaveBeenCalledWith(err)
  })
})

describe('finalize()', () => {
  it('calls callback on complete', () => {
    const cb = vi.fn()
    sees(pipe(of(1), finalize(cb)), 1)
    expect(cb).toHaveBeenCalled()
  })

  it('calls callback on error', () => {
    const cb = vi.fn()
    const err = new Error('oops')
    const results = collect(
      pipe(
        throwError(() => err),
        finalize(cb),
      ),
    )
    expect(results.error).toHaveBeenCalledWith(err)
    expect(cb).toHaveBeenCalled()
  })

  it('calls callback on unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribe(pipe(subject<number>(), finalize(cb)), () => {})
    unsub()
    expect(cb).toHaveBeenCalled()
  })
})

describe('scan()', () => {
  it('accumulates values', () => {
    sees(
      pipe(
        of(1, 2, 3),
        scan(0, (acc, x) => acc + x),
      ),
      1,
      3,
      6,
    )
  })

  it('catches errors in accumulator', () => {
    const err = new Error('oops')
    sees(
      pipe(
        of(1, 2),
        scan(0, (_, x) => {
          if (x === 2) throw err
          return x
        }),
      ),
      1,
      { error: err },
    )
  })
})

describe('tap()', () => {
  it('calls function for each value', () => {
    const spy = vi.fn()
    sees(pipe(of(1, 2), tap(spy)), 1, 2)
    expect(spy).toHaveBeenCalledWith(1)
    expect(spy).toHaveBeenCalledWith(2)
  })

  it('accepts partial observer', () => {
    const obs = { next: vi.fn(), complete: vi.fn() }
    sees(pipe(of(1), tap(obs)), 1)
    expect(obs.next).toHaveBeenCalledWith(1)
    expect(obs.complete).toHaveBeenCalled()
  })

  it('catches errors in tap', () => {
    const err = new Error('oops')
    sees(
      pipe(
        of(1),
        tap(() => {
          throw err
        }),
      ),
      { error: err },
    )
  })
})

describe('effect()', () => {
  it('runs side effect without emitting', () => {
    const spy = vi.fn()
    const results = collect(pipe(of(1, 2, 3), effect(spy)))
    expect(spy).toHaveBeenCalledTimes(3)
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })

  it('catches errors', () => {
    const err = new Error('oops')
    const results = collect(
      pipe(
        of(1),
        effect(() => {
          throw err
        }),
      ),
    )
    expect(results.error).toHaveBeenCalledWith(err)
  })
})

describe('take()', () => {
  it('takes first n values', () => {
    sees(pipe(of(1, 2, 3, 4, 5), take(3)), 1, 2, 3)
  })

  it('completes if source has fewer values', () => {
    sees(pipe(of(1, 2), take(5)), 1, 2)
  })

  it('unsubscribes from source after taking', () => {
    const src = subject<number>()
    const results = collect(pipe(src, take(2)))

    src.next(1)
    src.next(2)
    src.next(3) // should be ignored

    expect(results.values).toEqual([1, 2])
    expect(results.complete).toHaveBeenCalled()
  })
})

describe('takeUntil()', () => {
  it('completes when notifier emits', () => {
    const src = subject<number>()
    const stop = subject<void>()
    const results = collect(pipe(src, takeUntil(stop)))

    src.next(1)
    src.next(2)
    stop.next()
    src.next(3) // ignored

    expect(results.values).toEqual([1, 2])
    expect(results.complete).toHaveBeenCalled()
  })
})

describe('takeWhile()', () => {
  it('takes while predicate is true', () => {
    sees(
      pipe(
        of(1, 2, 3, 4, 1),
        takeWhile((x) => x < 3),
      ),
      1,
      2,
    )
  })

  it('provides index to predicate', () => {
    sees(
      pipe(
        of('a', 'b', 'c'),
        takeWhile((_, i) => i < 2),
      ),
      'a',
      'b',
    )
  })
})

describe('startWith()', () => {
  it('prepends values', () => {
    sees(pipe(of(3, 4), startWith(1, 2)), 1, 2, 3, 4)
  })
})

describe('distinctUntilChanged()', () => {
  it('filters consecutive duplicates', () => {
    sees(pipe(of(1, 1, 2, 2, 3, 1), distinctUntilChanged()), 1, 2, 3, 1)
  })

  it('uses custom comparator', () => {
    sees(
      pipe(
        of({ x: 1 }, { x: 1 }, { x: 2 }),
        distinctUntilChanged((a, b) => a.x === b.x),
      ),
      { x: 1 },
      { x: 2 },
    )
  })
})

describe('pairwise()', () => {
  it('emits consecutive pairs', () => {
    sees(pipe(of(1, 2, 3), pairwise()), [1, 2], [2, 3])
  })

  it('emits nothing for single value', () => {
    const results = collect(pipe(of(1), pairwise()))
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })
})

describe('withPrevious()', () => {
  it('emits pairs with initial value', () => {
    sees(pipe(of(1, 2, 3), withPrevious(null)), [null, 1], [1, 2], [2, 3])
  })
})

describe('withLatestFrom()', () => {
  it('combines with latest from others', () => {
    const src = subject<string>()
    const other = subject<number>()
    const results = collect(pipe(src, withLatestFrom(other)))

    src.next('A') // no value yet from other
    other.next(1)
    src.next('B')
    other.next(2)
    src.next('C')

    expect(results.values).toEqual([
      ['B', 1],
      ['C', 2],
    ])
  })
})

describe('debounceTime()', () => {
  it('debounces values', () => {
    vi.useFakeTimers()
    const src = subject<number>()
    const results = collect(pipe(src, debounceTime(100)))

    src.next(1)
    vi.advanceTimersByTime(50)
    src.next(2)
    vi.advanceTimersByTime(50)
    src.next(3)
    vi.advanceTimersByTime(100)

    expect(results.values).toEqual([3])
    vi.useRealTimers()
  })

  it('flushes on complete', () => {
    vi.useFakeTimers()
    const src = subject<number>()
    const results = collect(pipe(src, debounceTime(100)))

    src.next(1)
    src.complete()

    expect(results.values).toEqual([1])
    expect(results.complete).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('throttleTime()', () => {
  it('throttles values', () => {
    vi.useFakeTimers()
    const src = subject<number>()
    const results = collect(pipe(src, throttleTime(100)))

    src.next(1) // emitted
    vi.advanceTimersByTime(50)
    src.next(2) // throttled
    vi.advanceTimersByTime(60)
    src.next(3) // emitted

    expect(results.values).toEqual([1, 3])
    vi.useRealTimers()
  })
})

describe('delay()', () => {
  it('delays each value', async () => {
    vi.useFakeTimers()
    const results = collect(pipe(of(1, 2), delay(100)))

    expect(results.values).toEqual([])
    vi.advanceTimersByTime(100)
    expect(results.values).toEqual([1, 2])
    vi.useRealTimers()
  })

  it('completes after all values delayed', async () => {
    vi.useFakeTimers()
    const results = collect(pipe(of(1), delay(100)))

    expect(results.complete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(results.complete).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('bufferTime()', () => {
  it('buffers values over time', () => {
    vi.useFakeTimers()
    const src = subject<number>()
    const results = collect(pipe(src, bufferTime(100)))

    src.next(1)
    src.next(2)
    vi.advanceTimersByTime(100)
    src.next(3)
    vi.advanceTimersByTime(100)

    expect(results.values).toEqual([[1, 2], [3]])
    vi.useRealTimers()
  })

  it('flushes remaining on complete', () => {
    vi.useFakeTimers()
    const src = subject<number>()
    const results = collect(pipe(src, bufferTime(100)))

    src.next(1)
    src.complete()

    expect(results.values).toEqual([[1]])
    vi.useRealTimers()
  })
})

describe('share()', () => {
  it('shares subscription among subscribers', () => {
    let subscriptions = 0
    const src: Observable<number> = (obs) => {
      subscriptions++
      obs.next(1)
      obs.complete()
      return () => {}
    }
    const shared = pipe(src, share())

    subscribe(shared, () => {})
    subscribe(shared, () => {})

    expect(subscriptions).toBe(2) // resets after complete
  })

  it('resubscribes after completion', () => {
    const shared = pipe(of(1, 2), share())
    sees(shared, 1, 2)
    sees(shared, 1, 2)
  })
})

describe('shareReplay()', () => {
  it('replays last n values to late subscribers', () => {
    const src = subject<number>()
    const shared = pipe(src, shareReplay(2))

    // First subscriber triggers connection
    const first = collect(shared)
    src.next(1)
    src.next(2)
    src.next(3)

    // Late subscriber gets replay
    const late = collect(shared)
    expect(late.values).toEqual([2, 3])
    expect(first.values).toEqual([1, 2, 3])
  })
})

describe('shareReplayByKey()', () => {
  it('replays latest value per key', () => {
    type Event = { type: string; value: number }
    const src = subject<Event>()
    const shared = pipe(
      src,
      shareReplayByKey((e) => e.type),
    )

    subscribe(shared, () => {}) // first subscriber
    src.next({ type: 'a', value: 1 })
    src.next({ type: 'b', value: 2 })
    src.next({ type: 'a', value: 3 })

    const results = collect(shared)
    expect(results.values).toContainEqual({ type: 'a', value: 3 })
    expect(results.values).toContainEqual({ type: 'b', value: 2 })
  })
})

describe('observeOn()', () => {
  it('schedules emissions on scheduler', () => {
    const scheduler = createVirtualScheduler()
    const results = collect(pipe(of(1, 2), observeOn(scheduler)))

    expect(results.values).toEqual([])
    scheduler.flush()
    expect(results.values).toEqual([1, 2])
  })

  it('supports delay parameter', () => {
    vi.useFakeTimers()
    const results = collect(pipe(of(1), observeOn(asyncScheduler, 100)))

    vi.advanceTimersByTime(50)
    expect(results.values).toEqual([])
    vi.advanceTimersByTime(50)
    expect(results.values).toEqual([1])
    vi.useRealTimers()
  })
})

// ─── Test Helpers ────────────────────────────────────────────────────────────

const sees = <T>(obs: Observable<T>, ...expected: (T | { error: any })[]) => {
  const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() }
  subscribe(obs, observer)
  for (const arg of expected) {
    if (typeof arg === 'object' && arg !== null && 'error' in arg) {
      expect(observer.error).toHaveBeenCalledWith(arg.error)
    } else {
      expect(observer.next).toHaveBeenCalledWith(arg)
    }
  }
  expect(observer.complete).toHaveBeenCalled()
}

const seesAsync = async <T>(obs: Observable<T>, ...expected: T[]) => {
  const results: T[] = []
  const complete = vi.fn()
  subscribe(obs, { next: (x) => results.push(x), complete, error: vi.fn() })
  await new Promise((r) => setTimeout(r, 0))
  expect(results).toEqual(expected)
  expect(complete).toHaveBeenCalled()
}

const collect = <T>(obs: Observable<T>) => {
  const values: T[] = []
  const error = vi.fn()
  const complete = vi.fn()
  subscribe(obs, { next: (x) => values.push(x), error, complete })
  return { values, error, complete }
}

const controllable = <T>() => {
  let observer: Observer<T> | null = null
  const inner: Observable<T> = (obs) => {
    observer = obs
    return () => {}
  }
  return {
    inner,
    emit: (val: T) => observer?.next(val),
    complete: () => observer?.complete(),
  }
}
