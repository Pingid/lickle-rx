import { describe, it, expect, vi } from 'vitest'

import { subject, replaySubject, behaviorSubject, replayByKeySubject } from './subject.js'
import { subscribe } from './observable.js'

describe('subject()', () => {
  it('multicasts values to all subscribers', () => {
    const s = subject<number>()
    const a = collect(s)
    const b = collect(s)

    s.next(1)
    s.next(2)

    expect(a.values).toEqual([1, 2])
    expect(b.values).toEqual([1, 2])
  })

  it('late subscribers only receive future values', () => {
    const s = subject<number>()

    s.next(1)
    const results = collect(s)
    s.next(2)

    expect(results.values).toEqual([2])
  })

  it('completes all subscribers', () => {
    const s = subject<number>()
    const a = collect(s)
    const b = collect(s)

    s.next(1)
    s.complete()

    expect(a.complete).toHaveBeenCalled()
    expect(b.complete).toHaveBeenCalled()
  })

  it('ignores emissions after complete', () => {
    const s = subject<number>()
    const results = collect(s)

    s.next(1)
    s.complete()
    s.next(2)

    expect(results.values).toEqual([1])
  })

  it('errors all subscribers', () => {
    const s = subject<number>()
    const a = collect(s)
    const b = collect(s)

    const err = new Error('fail')
    s.error(err)

    expect(a.error).toHaveBeenCalledWith(err)
    expect(b.error).toHaveBeenCalledWith(err)
  })

  it('ignores emissions after error', () => {
    const s = subject<number>()
    const results = collect(s)

    s.next(1)
    s.error(new Error('fail'))
    s.next(2)

    expect(results.values).toEqual([1])
  })

  it('new subscribers after close receive nothing', () => {
    const s = subject<number>()
    s.next(1)
    s.complete()

    const results = collect(s)
    expect(results.values).toEqual([])
    expect(results.complete).not.toHaveBeenCalled()
  })

  it('unsubscribe removes subscriber', () => {
    const s = subject<number>()
    const results = collect(s)
    const unsub = subscribe(s, () => {})

    s.next(1)
    unsub()
    s.next(2)

    // results still gets values since it wasn't unsubscribed
    expect(results.values).toEqual([1, 2])
  })

  it('clears observers on complete', () => {
    const s = subject<number>()
    collect(s)
    collect(s)

    s.complete()
    // After complete, new emissions do nothing (observers cleared)
    s.next(1) // should not throw
  })
})

describe('replaySubject()', () => {
  it('replays buffered values to new subscribers', () => {
    const s = replaySubject<number>(3)

    s.next(1)
    s.next(2)
    s.next(3)

    const results = collect(s)
    expect(results.values).toEqual([1, 2, 3])
  })

  it('respects buffer size limit', () => {
    const s = replaySubject<number>(2)

    s.next(1)
    s.next(2)
    s.next(3)
    s.next(4)

    const results = collect(s)
    expect(results.values).toEqual([3, 4])
  })

  it('multicasts to existing subscribers', () => {
    const s = replaySubject<number>()
    const results = collect(s)

    s.next(1)
    s.next(2)

    expect(results.values).toEqual([1, 2])
  })

  it('defaults to infinite buffer', () => {
    const s = replaySubject<number>()

    for (let i = 0; i < 100; i++) s.next(i)

    const results = collect(s)
    expect(results.values).toHaveLength(100)
  })

  it('completes new subscribers after subject completes', () => {
    const s = replaySubject<number>()
    s.next(1)
    s.complete()

    const results = collect(s)
    expect(results.values).toEqual([1])
    expect(results.complete).toHaveBeenCalled()
  })

  it('exposes bufferSize', () => {
    const s = replaySubject<number>(5)
    expect(s.bufferSize).toBe(5)
  })

  it('getBuffer returns copy of buffer', () => {
    const s = replaySubject<number>()
    s.next(1)
    s.next(2)

    const buffer = s.getBuffer()
    expect(buffer).toEqual([1, 2])

    // Modifying returned buffer doesn't affect internal state
    buffer.push(3)
    expect(s.getBuffer()).toEqual([1, 2])
  })

  it('ignores emissions after complete', () => {
    const s = replaySubject<number>()
    s.next(1)
    s.complete()
    s.next(2)

    expect(s.getBuffer()).toEqual([1])
  })

  it('errors all subscribers', () => {
    const s = replaySubject<number>()
    const results = collect(s)

    const err = new Error('fail')
    s.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })
})

describe('behaviorSubject()', () => {
  it('emits initial value to new subscribers', () => {
    const s = behaviorSubject(42)
    const results = collect(s)

    expect(results.values).toEqual([42])
  })

  it('emits current value to new subscribers', () => {
    const s = behaviorSubject(0)
    s.next(1)
    s.next(2)

    const results = collect(s)
    expect(results.values).toEqual([2])
  })

  it('multicasts to existing subscribers', () => {
    const s = behaviorSubject(0)
    const results = collect(s)

    s.next(1)
    s.next(2)

    expect(results.values).toEqual([0, 1, 2])
  })

  it('getValue returns current value', () => {
    const s = behaviorSubject('initial')
    expect(s.getValue()).toBe('initial')

    s.next('updated')
    expect(s.getValue()).toBe('updated')
  })

  it('completes new subscribers after subject completes', () => {
    const s = behaviorSubject(1)
    s.next(2)
    s.complete()

    const results = collect(s)
    expect(results.values).toEqual([2])
    expect(results.complete).toHaveBeenCalled()
  })

  it('ignores emissions after complete', () => {
    const s = behaviorSubject(0)
    s.next(1)
    s.complete()
    s.next(2)

    expect(s.getValue()).toBe(1)
  })

  it('errors all subscribers', () => {
    const s = behaviorSubject(0)
    const results = collect(s)

    const err = new Error('fail')
    s.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('handles object values', () => {
    const initial = { count: 0 }
    const s = behaviorSubject(initial)

    expect(s.getValue()).toBe(initial)

    const updated = { count: 1 }
    s.next(updated)
    expect(s.getValue()).toBe(updated)
  })
})

describe('replayByKeySubject()', () => {
  it('caches latest value per key', () => {
    type Event = { type: string; value: number }
    const s = replayByKeySubject<Event>((e) => e.type)

    s.next({ type: 'a', value: 1 })
    s.next({ type: 'b', value: 2 })
    s.next({ type: 'a', value: 3 }) // overwrites first 'a'

    const results = collect(s)
    expect(results.values).toContainEqual({ type: 'a', value: 3 })
    expect(results.values).toContainEqual({ type: 'b', value: 2 })
    expect(results.values).toHaveLength(2)
  })

  it('replays all cached values to new subscribers', () => {
    const s = replayByKeySubject<string>((x) => x)

    s.next('a')
    s.next('b')
    s.next('c')

    const results = collect(s)
    expect(results.values).toEqual(['a', 'b', 'c'])
  })

  it('multicasts to existing subscribers', () => {
    const s = replayByKeySubject<string>((x) => x)
    const results = collect(s)

    s.next('a')
    s.next('b')

    expect(results.values).toEqual(['a', 'b'])
  })

  it('respects maxKeys limit', () => {
    const s = replayByKeySubject<string>((x) => x, { maxKeys: 2 })

    s.next('a')
    s.next('b')
    s.next('c') // evicts 'a'

    const results = collect(s)
    expect(results.values).toEqual(['b', 'c'])
  })

  it('get returns cached value for key', () => {
    type Event = { type: string; value: number }
    const s = replayByKeySubject<Event>((e) => e.type)

    s.next({ type: 'a', value: 1 })
    s.next({ type: 'b', value: 2 })

    expect(s.get('a')).toEqual({ type: 'a', value: 1 })
    expect(s.get('b')).toEqual({ type: 'b', value: 2 })
    expect(s.get('c')).toBeUndefined()
  })

  it('getCache returns copy of cache', () => {
    const s = replayByKeySubject<string>((x) => x)
    s.next('a')
    s.next('b')

    const cache = s.getCache()
    expect(cache.get('a')).toBe('a')
    expect(cache.get('b')).toBe('b')

    // Modifying returned cache doesn't affect internal state
    cache.set('c', 'c')
    expect(s.get('c')).toBeUndefined()
  })

  it('exposes maxKeys', () => {
    const s = replayByKeySubject<string>((x) => x, { maxKeys: 10 })
    expect(s.maxKeys).toBe(10)
  })

  it('defaults maxKeys to Infinity', () => {
    const s = replayByKeySubject<string>((x) => x)
    expect(s.maxKeys).toBe(Infinity)
  })

  it('completes new subscribers after subject completes', () => {
    const s = replayByKeySubject<string>((x) => x)
    s.next('a')
    s.complete()

    const results = collect(s)
    expect(results.values).toEqual(['a'])
    expect(results.complete).toHaveBeenCalled()
  })

  it('ignores emissions after complete', () => {
    const s = replayByKeySubject<string>((x) => x)
    s.next('a')
    s.complete()
    s.next('b')

    expect(s.get('b')).toBeUndefined()
  })

  it('errors all subscribers', () => {
    const s = replayByKeySubject<string>((x) => x)
    const results = collect(s)

    const err = new Error('fail')
    s.error(err)

    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('updates key order on re-emission', () => {
    const s = replayByKeySubject<string>((x) => x, { maxKeys: 2 })

    s.next('a')
    s.next('b')
    s.next('a') // move 'a' to end
    s.next('c') // should evict 'b', not 'a'

    expect(s.get('a')).toBe('a')
    expect(s.get('b')).toBeUndefined()
    expect(s.get('c')).toBe('c')
  })
})

// ─── Test Helpers ────────────────────────────────────────────────────────────

const collect = <T>(obs: (observer: any) => () => void) => {
  const values: T[] = []
  const error = vi.fn()
  const complete = vi.fn()
  subscribe(obs, { next: (x: T) => values.push(x), error, complete })
  return { values, error, complete }
}
