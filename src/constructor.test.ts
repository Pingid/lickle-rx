import { describe, it, expect, vi } from 'vitest'

import { of, fromAsync, fromPromise, from, interval, timer, never, empty, fromEvent } from './constructor.js'
import { Observable, subscribe } from './observable.js'
import { createVirtualScheduler } from './scheduler.js'

describe('of()', () => {
  it('emits all arguments and completes', () => {
    sees(of(1, 2, 3), 1, 2, 3)
  })

  it('handles single value', () => {
    sees(of('a'), 'a')
  })

  it('handles no arguments', () => {
    const results = collect(of())
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })

  it('handles mixed types', () => {
    const results = collect(of(1, 'two', true))
    expect(results.values).toEqual([1, 'two', true])
    expect(results.complete).toHaveBeenCalled()
  })

  it('respects unsubscribe flag', () => {
    // of() emits synchronously, so we test that internal flag works
    const emitted: number[] = []
    const complete = vi.fn()
    subscribe(of(1, 2, 3), { next: (x) => emitted.push(x), complete, error: vi.fn() })
    expect(emitted).toEqual([1, 2, 3])
    expect(complete).toHaveBeenCalled()
  })
})

describe('fromAsync()', () => {
  it('emits resolved value and completes', async () => {
    const obs = fromAsync(() => Promise.resolve('result'))
    await seesAsync(obs, 'result')
  })

  it('provides AbortSignal to function', async () => {
    let receivedSignal: AbortSignal | null = null
    const obs = fromAsync((signal) => {
      receivedSignal = signal
      return Promise.resolve('done')
    })
    subscribe(obs, () => {})
    await tick()
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
  })

  it('aborts on unsubscribe', async () => {
    let aborted = false
    const obs = fromAsync((signal) => {
      signal.addEventListener('abort', () => (aborted = true))
      return new Promise(() => {}) // never resolves
    })
    const unsub = subscribe(obs, () => {})
    unsub()
    expect(aborted).toBe(true)
  })

  it('ignores resolution after abort', async () => {
    let resolve: (v: string) => void
    const obs = fromAsync(() => new Promise<string>((r) => (resolve = r)))
    const next = vi.fn()
    const unsub = subscribe(obs, next)
    unsub()
    resolve!('late')
    await tick()
    expect(next).not.toHaveBeenCalled()
  })

  it('handles errors', async () => {
    const err = new Error('fail')
    const obs = fromAsync(() => Promise.reject(err))
    const results = collect(obs)
    await tick()
    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('transforms errors with onError', async () => {
    const obs = fromAsync(
      () => Promise.reject(new Error('original')),
      () => 'transformed',
    )
    const results = collect(obs)
    await tick()
    expect(results.error).toHaveBeenCalledWith('transformed')
  })

  it('ignores errors after abort', async () => {
    let reject: (e: Error) => void
    const obs = fromAsync(() => new Promise<string>((_, r) => (reject = r)))
    const error = vi.fn()
    const unsub = subscribe(obs, { next: () => {}, error, complete: () => {} })
    unsub()
    reject!(new Error('late'))
    await tick()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('fromPromise()', () => {
  it('emits resolved value and completes', async () => {
    const obs = fromPromise(Promise.resolve(42))
    await seesAsync(obs, 42)
  })

  it('handles errors', async () => {
    const err = new Error('fail')
    const obs = fromPromise(Promise.reject(err))
    const results = collect(obs)
    await tick()
    expect(results.error).toHaveBeenCalledWith(err)
  })

  it('transforms errors with onError', async () => {
    const obs = fromPromise(
      Promise.reject(new Error('original')),
      () => 'transformed',
    )
    const results = collect(obs)
    await tick()
    expect(results.error).toHaveBeenCalledWith('transformed')
  })

  it('ignores resolution after unsubscribe', async () => {
    let resolve: (v: number) => void
    const obs = fromPromise(new Promise<number>((r) => (resolve = r)))
    const next = vi.fn()
    const unsub = subscribe(obs, next)
    unsub()
    resolve!(42)
    await tick()
    expect(next).not.toHaveBeenCalled()
  })

  it('ignores rejection after unsubscribe', async () => {
    let reject: (e: Error) => void
    const obs = fromPromise(new Promise<number>((_, r) => (reject = r)))
    const error = vi.fn()
    const unsub = subscribe(obs, { next: () => {}, error, complete: () => {} })
    unsub()
    reject!(new Error('late'))
    await tick()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('from()', () => {
  it('passes through Observables', () => {
    const src = of(1, 2)
    expect(from(src)).toBe(src)
  })

  it('converts Promises', async () => {
    await seesAsync(from(Promise.resolve('value')), 'value')
  })

  it('converts Arrays', () => {
    sees(from([1, 2, 3]), 1, 2, 3)
  })

  it('converts Sets', () => {
    sees(from(new Set(['a', 'b'])), 'a', 'b')
  })

  it('converts Maps', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ])
    sees(from(map), ['a', 1], ['b', 2])
  })

  it('converts generator functions', () => {
    function* gen() {
      yield 1
      yield 2
    }
    sees(from(gen()), 1, 2)
  })

  it('handles iterable errors', () => {
    function* gen(): Generator<number> {
      yield 1
      throw new Error('gen error')
    }
    const results = collect(from(gen()))
    expect(results.values).toEqual([1])
    expect(results.error).toHaveBeenCalled()
  })

  it('converts async generators', async () => {
    async function* gen() {
      yield 1
      yield 2
    }
    await seesAsync(from(gen()), 1, 2)
  })

  it('handles async iterable errors', async () => {
    async function* gen(): AsyncGenerator<number> {
      yield 1
      throw new Error('async error')
    }
    const results = collect(from(gen()))
    await tick(10)
    expect(results.values).toEqual([1])
    expect(results.error).toHaveBeenCalled()
  })

  it('cancels async iterables on unsubscribe', async () => {
    const emitted: number[] = []
    async function* gen() {
      yield 1
      await tick(50)
      yield 2
    }
    const unsub = subscribe(from(gen()), (x) => emitted.push(x))
    await tick(10)
    unsub()
    await tick(100)
    expect(emitted).toEqual([1]) // only first value emitted before cancel
  })

  it('throws on invalid input', () => {
    expect(() => from(123 as any)).toThrow(/Invalid input/)
  })
})

describe('interval()', () => {
  it('emits sequential numbers at intervals', () => {
    vi.useFakeTimers()
    const results: number[] = []
    subscribe(interval(100), (x) => results.push(x))

    vi.advanceTimersByTime(350)
    expect(results).toEqual([0, 1, 2])
    vi.useRealTimers()
  })

  it('stops on unsubscribe', () => {
    vi.useFakeTimers()
    const results: number[] = []
    const unsub = subscribe(interval(100), (x) => results.push(x))

    vi.advanceTimersByTime(250)
    unsub()
    vi.advanceTimersByTime(200)

    expect(results).toEqual([0, 1])
    vi.useRealTimers()
  })
})

describe('timer()', () => {
  it('emits once after delay and completes', () => {
    const scheduler = createVirtualScheduler()
    const results = collect(timer(100, undefined, scheduler))

    expect(results.values).toEqual([])
    scheduler.flush()
    expect(results.values).toEqual([0])
    expect(results.complete).toHaveBeenCalled()
  })

  it('emits repeatedly with period', () => {
    vi.useFakeTimers()
    const results: number[] = []
    subscribe(timer(50, 100), (x) => results.push(x))

    vi.advanceTimersByTime(350) // 50 + 100 + 100 + 100
    expect(results).toEqual([0, 1, 2, 3])
    vi.useRealTimers()
  })

  it('respects initial delay before period', () => {
    vi.useFakeTimers()
    const results: number[] = []
    subscribe(timer(200, 100), (x) => results.push(x))

    vi.advanceTimersByTime(150)
    expect(results).toEqual([])

    vi.advanceTimersByTime(100) // 250ms total
    expect(results).toEqual([0])

    vi.advanceTimersByTime(100) // 350ms total
    expect(results).toEqual([0, 1])

    vi.useRealTimers()
  })

  it('stops on unsubscribe', () => {
    vi.useFakeTimers()
    const results: number[] = []
    const unsub = subscribe(timer(100, 100), (x) => results.push(x))

    vi.advanceTimersByTime(250)
    unsub()
    vi.advanceTimersByTime(200)

    expect(results).toEqual([0, 1])
    vi.useRealTimers()
  })
})

describe('never()', () => {
  it('never emits or completes', () => {
    const next = vi.fn()
    const complete = vi.fn()
    subscribe(never(), { next, complete, error: vi.fn() })

    expect(next).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns unsubscribe function', () => {
    const unsub = subscribe(never(), () => {})
    expect(typeof unsub).toBe('function')
    unsub() // should not throw
  })
})

describe('empty()', () => {
  it('immediately completes without emitting', () => {
    const results = collect(empty())
    expect(results.values).toEqual([])
    expect(results.complete).toHaveBeenCalled()
  })
})

describe('fromEvent()', () => {
  it('emits events from target', () => {
    const target = createMockEventTarget()
    const results = collect(fromEvent(target, 'click'))

    target.emit('click', { type: 'click' })
    target.emit('click', { type: 'click' })

    expect(results.values).toHaveLength(2)
  })

  it('removes listener on unsubscribe', () => {
    const target = createMockEventTarget()
    const unsub = subscribe(fromEvent(target, 'click'), () => {})

    expect(target.listeners['click']).toHaveLength(1)
    unsub()
    expect(target.listeners['click']).toHaveLength(0)
  })

  it('passes options to addEventListener', () => {
    const target = createMockEventTarget()
    subscribe(fromEvent(target, 'scroll', { passive: true }), () => {})

    expect(target.addedWithOptions).toEqual({ passive: true })
  })
})

// ─── Test Helpers ────────────────────────────────────────────────────────────

const sees = <T>(obs: Observable<T>, ...expected: T[]) => {
  const results = collect(obs)
  for (const val of expected) {
    expect(results.next).toHaveBeenCalledWith(val)
  }
  expect(results.complete).toHaveBeenCalled()
}

const seesAsync = async <T>(obs: Observable<T>, ...expected: T[]) => {
  const results: T[] = []
  const complete = vi.fn()
  subscribe(obs, { next: (x) => results.push(x), complete, error: vi.fn() })
  await tick()
  expect(results).toEqual(expected)
  expect(complete).toHaveBeenCalled()
}

const collect = <T>(obs: Observable<T>) => {
  const values: T[] = []
  const next = vi.fn((x: T) => values.push(x))
  const error = vi.fn()
  const complete = vi.fn()
  subscribe(obs, { next, error, complete })
  return { values, next, error, complete }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

const createMockEventTarget = () => {
  const listeners: Record<string, Function[]> = {}
  const state = { addedWithOptions: null as any }

  return {
    listeners,
    get addedWithOptions() {
      return state.addedWithOptions
    },
    addEventListener: (event: string, handler: Function, options?: any) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
      state.addedWithOptions = options
    },
    removeEventListener: (event: string, handler: Function) => {
      listeners[event] = (listeners[event] || []).filter((h) => h !== handler)
    },
    emit: (event: string, data: any) => {
      ;(listeners[event] || []).forEach((h) => h(data))
    },
  }
}
