import { describe, it, expect, vi } from 'vitest'

import { Observable, subscribe } from './observable.js'
import { map, share, exhaustMap } from './operator.js'
import { of } from './constructor.js'
import { subject } from './subject.js'
import { pipe } from './util.js'

describe('exhaustMap()', () => {
  it('should ignore values while inner is active', () => {
    const source = subject<string>()
    const results: string[] = []
    let innerObserver: any = null

    const result$ = pipe(
      source,
      exhaustMap<string, string>((val) => (observer) => {
        innerObserver = observer
        observer.next('start ' + val)
        return () => {}
      }),
    )

    subscribe(result$, (x) => results.push(x))

    source.next('A') // Inner A active
    // results: ['start A']

    source.next('B') // Should be ignored

    innerObserver.complete() // Inner A completes

    source.next('C') // Inner C active
    // results: ['start A', 'start C']

    expect(results).toEqual(['start A', 'start C'])
  })
})

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
