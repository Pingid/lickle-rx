import { describe, it, expect, vi } from 'vitest'

import { Observable, subscribe } from './observable.js'
import { map, share } from './operator.js'
import { of } from './constructor.js'
import { pipe } from './util.js'

describe('map()', () => {
  it('should apply the transform function to each value emitted by the source', () => {
    const doubled$ = pipe(
      of(1, 2, 3),
      map((x: number) => x * 2),
    )
    sees(doubled$, 2, 4, 6)
  })

  it('should catch errors', () => {
    const err = new Error('Error in map')
    const source$ = of(1, 2, 3)
    const doubled$ = pipe(
      source$,
      map((x) => {
        if (x === 2) throw err
        return x * 2
      }),
    )
    sees(doubled$, 2, { error: err })
  })
})

describe('share()', () => {
  it('should reset state and allow resubscription after source completes', () => {
    const shared$ = pipe(of('A', 'B'), share())
    // This runs to completion immediately because 'of' is synchronous.
    sees(shared$, 'A', 'B')
    // Second Subscription: should trigger a fresh subscription to the source.
    sees(shared$, 'A', 'B')
  })
})

const sees = <T>(obs: Observable<T>, ...args: (T | { error: any })[]) => {
  const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() }
  subscribe(obs, observer)
  args.forEach((arg) => {
    if (typeof arg === 'object' && 'error' in (arg as any)) {
      expect(observer.error).toHaveBeenCalledWith((arg as any).error)
    } else {
      expect(observer.next).toHaveBeenCalledWith(arg)
    }
  })
  expect(observer.complete).toHaveBeenCalled()
  return observer
}
