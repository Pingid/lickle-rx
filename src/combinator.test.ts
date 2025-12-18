import { describe, it, expect, vi } from 'vitest'

import { merge, combineLatest, zip, concat, race } from './combinator.js'
import { Observable, subscribe } from './observable.js'
import { of } from './constructor.js'
import { subject } from './subject.js'

describe('merge()', () => {
  it('emits from all sources concurrently', () => {
    const a = subject<string>()
    const b = subject<string>()
    const results = collect(merge(a, b))

    a.next('a1')
    b.next('b1')
    a.next('a2')
    b.next('b2')

    expect(results.values).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('handles synchronous sources', () => {
    const results = collect(merge(of(1, 2), of(3, 4)))
    expect(results.values).toEqual([1, 2, 3, 4])
  })

  it('forwards errors', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(merge(a, b))

    a.next(1)
    const err = new Error('fail')
    b.error(err)

    expect(results.values).toEqual([1])
    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('unsubscribes from all sources', () => {
    const unsubA = vi.fn()
    const unsubB = vi.fn()
    const a: Observable<number> = () => unsubA
    const b: Observable<number> = () => unsubB

    const unsub = subscribe(merge(a, b), () => {})
    unsub()

    expect(unsubA).toHaveBeenCalled()
    expect(unsubB).toHaveBeenCalled()
  })

  it('handles single source', () => {
    const results = collect(merge(of(1, 2, 3)))
    expect(results.values).toEqual([1, 2, 3])
  })

  it('handles empty sources', () => {
    const results = collect(merge())
    expect(results.values).toEqual([])
  })
})

describe('combineLatest()', () => {
  it('emits after all sources have emitted', () => {
    const a = subject<string>()
    const b = subject<number>()
    const results = collect(combineLatest(a, b))

    a.next('a')
    expect(results.values).toEqual([])

    b.next(1)
    expect(results.values).toEqual([['a', 1]])
  })

  it('emits on each subsequent update', () => {
    const a = subject<string>()
    const b = subject<number>()
    const results = collect(combineLatest(a, b))

    a.next('a')
    b.next(1)
    a.next('b')
    b.next(2)

    expect(results.values).toEqual([
      ['a', 1],
      ['b', 1],
      ['b', 2],
    ])
  })

  it('handles synchronous sources', () => {
    const results = collect(combineLatest(of('x'), of(1)))
    expect(results.values).toEqual([['x', 1]])
  })

  it('emits copies of array', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(combineLatest(a, b))

    a.next(1)
    b.next(2)
    a.next(3)

    expect(results.values[0]).not.toBe(results.values[1])
  })

  it('forwards errors', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(combineLatest(a, b))

    const err = new Error('fail')
    a.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('unsubscribes from all sources', () => {
    const unsubA = vi.fn()
    const unsubB = vi.fn()
    const a: Observable<number> = () => unsubA
    const b: Observable<number> = () => unsubB

    const unsub = subscribe(combineLatest(a, b), () => {})
    unsub()

    expect(unsubA).toHaveBeenCalled()
    expect(unsubB).toHaveBeenCalled()
  })

  it('handles three sources', () => {
    const a = subject<string>()
    const b = subject<number>()
    const c = subject<boolean>()
    const results = collect(combineLatest(a, b, c))

    a.next('x')
    b.next(1)
    c.next(true)

    expect(results.values).toEqual([['x', 1, true]])
  })
})

describe('zip()', () => {
  it('emits at matching indices', () => {
    const results = collect(zip(of('a', 'b', 'c'), of(1, 2, 3)))
    expect(results.values).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    expect(results.complete).toHaveBeenCalled()
  })

  it('completes when shortest source completes', () => {
    const results = collect(zip(of('a', 'b'), of(1, 2, 3, 4)))
    expect(results.values).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(results.complete).toHaveBeenCalled()
  })

  it('buffers values until pairs available', () => {
    const a = subject<string>()
    const b = subject<number>()
    const results = collect(zip(a, b))

    a.next('a')
    a.next('b')
    a.next('c')
    expect(results.values).toEqual([])

    b.next(1)
    expect(results.values).toEqual([['a', 1]])

    b.next(2)
    b.next(3)
    expect(results.values).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('errors on buffer overflow with maxBuffer', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(zip({ maxBuffer: 2 }, a, b))

    a.next(1)
    a.next(2)
    expect(results.error).not.toHaveBeenCalled()

    a.next(3) // exceeds buffer
    expect(results.error).toHaveBeenCalled()
  })

  it('forwards errors', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(zip(a, b))

    const err = new Error('fail')
    a.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('unsubscribes from all sources on error', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(zip(a, b))

    a.next(1)
    b.error(new Error('fail'))

    expect(results.error).toHaveBeenCalled()
    // After error, further emissions are ignored
    a.next(2)
    expect(results.values).toEqual([])
  })

  it('handles three sources', () => {
    const results = collect(zip(of('a', 'b'), of(1, 2), of(true, false)))
    expect(results.values).toEqual([
      ['a', 1, true],
      ['b', 2, false],
    ])
  })
})

describe('concat()', () => {
  it('emits from sources in sequence', () => {
    const results = collect(concat(of(1, 2), of(3, 4)))
    expect(results.values).toEqual([1, 2, 3, 4])
    expect(results.complete).toHaveBeenCalled()
  })

  it('waits for each source to complete', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(concat(a, b))

    a.next(1)
    b.next(99) // should be ignored - b not subscribed yet
    a.next(2)
    a.complete()
    b.next(3)
    b.next(4)
    b.complete()

    expect(results.values).toEqual([1, 2, 3, 4])
    expect(results.complete).toHaveBeenCalled()
  })

  it('forwards errors', () => {
    const a = subject<number>()
    const results = collect(concat(a, of(2)))

    const err = new Error('fail')
    a.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('unsubscribes from current source', () => {
    const unsub = vi.fn()
    const a: Observable<number> = () => unsub

    const unsubAll = subscribe(concat(a, of(1)), () => {})
    unsubAll()

    expect(unsub).toHaveBeenCalled()
  })

  it('handles single source', () => {
    const results = collect(concat(of(1, 2, 3)))
    expect(results.values).toEqual([1, 2, 3])
    expect(results.complete).toHaveBeenCalled()
  })

  it('handles empty sources', () => {
    const results = collect(concat())
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })

  it('handles three sources', () => {
    const results = collect(concat(of(1), of(2), of(3)))
    expect(results.values).toEqual([1, 2, 3])
  })
})

describe('race()', () => {
  it('mirrors first source to emit', () => {
    const a = subject<string>()
    const b = subject<string>()
    const results = collect(race(a, b))

    b.next('b1')
    a.next('a1') // ignored - b won
    b.next('b2')

    expect(results.values).toEqual(['b1', 'b2'])
  })

  it('unsubscribes losers after winner determined', () => {
    const a = subject<string>()
    const b = subject<string>()
    const results = collect(race(a, b))

    a.next('a1')
    // b is now a loser, its emissions are ignored
    b.next('b1')
    a.next('a2')

    expect(results.values).toEqual(['a1', 'a2'])
  })

  it('forwards winner complete', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(race(a, b))

    a.next(1)
    a.complete()

    expect(results.values).toEqual([1])
    expect(results.complete).toHaveBeenCalled()
  })

  it('forwards errors', () => {
    const a = subject<number>()
    const b = subject<number>()
    const results = collect(race(a, b))

    const err = new Error('fail')
    a.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('unsubscribes from all sources', () => {
    const unsubA = vi.fn()
    const unsubB = vi.fn()
    const a: Observable<number> = () => unsubA
    const b: Observable<number> = () => unsubB

    const unsub = subscribe(race(a, b), () => {})
    unsub()

    expect(unsubA).toHaveBeenCalled()
    expect(unsubB).toHaveBeenCalled()
  })

  it('handles synchronous winner', () => {
    const results = collect(race(of(1, 2), of(3, 4)))
    expect(results.values).toEqual([1, 2])
    expect(results.complete).toHaveBeenCalled()
  })

  it('handles single source', () => {
    const results = collect(race(of(1, 2, 3)))
    expect(results.values).toEqual([1, 2, 3])
    expect(results.complete).toHaveBeenCalled()
  })
})

// ─── Test Helpers ────────────────────────────────────────────────────────────

const collect = <T>(obs: Observable<T>) => {
  const values: T[] = []
  const error = vi.fn()
  const complete = vi.fn()
  subscribe(obs, { next: (x) => values.push(x), error, complete })
  return { values, error, complete }
}
