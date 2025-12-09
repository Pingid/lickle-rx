import { describe, it, expect, vi } from 'vitest'

import { Observable, subscribe } from './observable.js'
import { of } from './constructor.js'
import { share } from './operator.js'
import { pipe } from './util.js'

describe('share()', () => {
  it('should reset state and allow resubscription after source completes', () => {
    const shared$ = pipe(of('A', 'B'), share())
    // This runs to completion immediately because 'of' is synchronous.
    sees(shared$, 'A', 'B')
    // Second Subscription: should trigger a fresh subscription to the source.
    sees(shared$, 'A', 'B')
  })
})

const sees = <T>(obs: Observable<T>, ...args: T[]) => {
  const observer = vi.fn()
  subscribe(obs, observer)
  args.forEach((arg) => expect(observer).toHaveBeenCalledWith(arg))
  return observer
}
