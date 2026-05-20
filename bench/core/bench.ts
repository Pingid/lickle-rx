import { run, bench, group } from 'mitata'

import {
  subject,
  replaySubject,
  behaviorSubject,
  replayByKeySubject,
} from '../../src/subject.js'
import { subscribe } from '../../src/observable.js'
import { of, from, empty, never } from '../../src/constructor.js'
import {
  map,
  filter,
  scan,
  tap,
  take,
  takeUntil,
  switchMap,
  mergeMap,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  pairwise,
  withLatestFrom,
  observeOn,
  share,
  shareReplay,
} from '../../src/operator.js'
import { combineLatest, merge, concat, zip, race } from '../../src/combinator.js'
import { pipe } from '../../src/util.js'
import { asapScheduler } from '../../src/scheduler.js'

// ---------------- fixtures ----------------

const nums = Array.from({ length: 100 }, (_, i) => i)
const ints10 = Array.from({ length: 10 }, (_, i) => i)
const ints1k = Array.from({ length: 1000 }, (_, i) => i)

const noop = () => {}
const inc = (x: number) => x + 1
const isEven = (x: number) => (x & 1) === 0
const sum = (a: number, b: number) => a + b

// ---------------- subject emission ----------------

group('subject.next', () => {
  bench('1 sub × 1000 emits', () => {
    const s = subject<number>()
    const unsub = s(makeObs())
    for (let i = 0; i < 1000; i++) s.next(i)
    unsub()
  })

  bench('10 subs × 1000 emits', () => {
    const s = subject<number>()
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 10; i++) unsubs.push(s(makeObs()))
    for (let i = 0; i < 1000; i++) s.next(i)
    for (const u of unsubs) u()
  })

  bench('100 subs × 100 emits', () => {
    const s = subject<number>()
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 100; i++) unsubs.push(s(makeObs()))
    for (let i = 0; i < 100; i++) s.next(i)
    for (const u of unsubs) u()
  })
})

group('behaviorSubject.next', () => {
  bench('1 sub × 1000 emits', () => {
    const s = behaviorSubject(0)
    const unsub = s(makeObs())
    for (let i = 0; i < 1000; i++) s.next(i)
    unsub()
  })

  bench('10 subs × 1000 emits', () => {
    const s = behaviorSubject(0)
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 10; i++) unsubs.push(s(makeObs()))
    for (let i = 0; i < 1000; i++) s.next(i)
    for (const u of unsubs) u()
  })
})

group('replaySubject.next', () => {
  bench('buf=10 / 1 sub × 1000 emits', () => {
    const s = replaySubject<number>(10)
    const unsub = s(makeObs())
    for (let i = 0; i < 1000; i++) s.next(i)
    unsub()
  })

  bench('buf=Inf / 1 sub × 1000 emits', () => {
    const s = replaySubject<number>()
    const unsub = s(makeObs())
    for (let i = 0; i < 1000; i++) s.next(i)
    unsub()
  })
})

group('replayByKeySubject.next', () => {
  bench('10 keys / 1 sub × 1000 emits', () => {
    const s = replayByKeySubject<{ k: number; v: number }>((x) => x.k)
    const unsub = s(makeObs())
    for (let i = 0; i < 1000; i++) s.next({ k: i % 10, v: i })
    unsub()
  })
})

// ---------------- subscribe churn ----------------

group('subscribe overhead', () => {
  const src = of(1)
  bench('of(1) subscribe+unsubscribe', () => {
    const u = subscribe(src, noop)
    u()
  })

  const pipeline = pipe(of(1, 2, 3), map(inc), filter(isEven), map(inc))
  bench('chain 3 ops subscribe+unsubscribe', () => {
    const u = subscribe(pipeline, noop)
    u()
  })
})

// ---------------- operator chains ----------------

group('operator chains', () => {
  bench('map x1 over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, map(inc)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('map x3 over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(
      pipe(
        s,
        map(inc),
        map(inc),
        map(inc),
      ),
      noop,
    )
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('map+filter+map over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, map(inc), filter(isEven), map(inc)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('scan over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, scan(0, sum)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('tap+map over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, tap(noop), map(inc)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('distinctUntilChanged over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, distinctUntilChanged()), noop)
    for (let i = 0; i < 1000; i++) s.next(i >> 1)
    u()
  })

  bench('pairwise over subject 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, pairwise()), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('take(100) over 100 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, take(100)), noop)
    for (let i = 0; i < 100; i++) s.next(i)
    u()
  })
})

// ---------------- higher-order operators ----------------

group('switchMap', () => {
  bench('switchMap(of) × 1000 source emits', () => {
    const s = subject<number>()
    const u = subscribe(
      pipe(
        s,
        switchMap((x) => of(x, x + 1)),
      ),
      noop,
    )
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })

  bench('switchMap(subject) × 100 churn', () => {
    const s = subject<number>()
    const u = subscribe(
      pipe(
        s,
        switchMap(() => subject<number>()),
      ),
      noop,
    )
    for (let i = 0; i < 100; i++) s.next(i)
    u()
  })
})

group('mergeMap', () => {
  bench('mergeMap(of) × 1000 source emits', () => {
    const s = subject<number>()
    const u = subscribe(
      pipe(
        s,
        mergeMap((x) => of(x, x + 1)),
      ),
      noop,
    )
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })
})

group('concatMap', () => {
  bench('concatMap(of) × 1000 source emits', () => {
    const s = subject<number>()
    const u = subscribe(
      pipe(
        s,
        concatMap((x) => of(x, x + 1)),
      ),
      noop,
    )
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })
})

// ---------------- combinators ----------------

group('combinators', () => {
  bench('combineLatest(a,b,c) × 100 emits', () => {
    const a = subject<number>()
    const b = subject<number>()
    const c = subject<number>()
    const u = subscribe(combineLatest(a, b, c), noop)
    a.next(0)
    b.next(0)
    c.next(0)
    for (let i = 0; i < 100; i++) {
      a.next(i)
      b.next(i)
      c.next(i)
    }
    u()
  })

  bench('withLatestFrom(b,c) × 1000 emits', () => {
    const a = subject<number>()
    const b = subject<number>()
    const c = subject<number>()
    const u = subscribe(pipe(a, withLatestFrom(b, c)), noop)
    b.next(0)
    c.next(0)
    for (let i = 0; i < 1000; i++) a.next(i)
    u()
  })

  bench('merge(a,b,c) × 1000 emits', () => {
    const a = subject<number>()
    const b = subject<number>()
    const c = subject<number>()
    const u = subscribe(merge(a, b, c), noop)
    for (let i = 0; i < 1000; i++) (i % 3 === 0 ? a : i % 3 === 1 ? b : c).next(i)
    u()
  })

  bench('zip(a,b) × 1000 emits', () => {
    const a = subject<number>()
    const b = subject<number>()
    const u = subscribe(zip(a, b), noop)
    for (let i = 0; i < 1000; i++) {
      a.next(i)
      b.next(i)
    }
    u()
  })

  bench('concat(of, of)', () => {
    const u = subscribe(concat(of(1, 2, 3), of(4, 5, 6)), noop)
    u()
  })

  bench('race(of, never)', () => {
    const u = subscribe(race(of(1), never<number>()), noop)
    u()
  })
})

// ---------------- multicast ----------------

group('multicast', () => {
  bench('share() × 10 subs × 100 emits', () => {
    const s = subject<number>()
    const shared = pipe(s, share<number>())
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 10; i++) unsubs.push(subscribe(shared, noop))
    for (let i = 0; i < 100; i++) s.next(i)
    for (const u of unsubs) u()
  })

  bench('shareReplay(1) × 10 subs × 100 emits', () => {
    const s = subject<number>()
    const shared = pipe(s, shareReplay<number>(1))
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 10; i++) unsubs.push(subscribe(shared, noop))
    for (let i = 0; i < 100; i++) s.next(i)
    for (const u of unsubs) u()
  })
})

// ---------------- constructors ----------------

group('constructors', () => {
  bench('of(1,2,3) subscribe', () => {
    const u = subscribe(of(1, 2, 3), noop)
    u()
  })

  bench('from(array[100]) subscribe', () => {
    const u = subscribe(from(nums), noop)
    u()
  })

  bench('from(array[1000]) subscribe', () => {
    const u = subscribe(from(ints1k), noop)
    u()
  })

  bench('empty subscribe', () => {
    const u = subscribe(empty(), noop)
    u()
  })
})

// ---------------- scheduler ----------------

group('scheduler', () => {
  bench('asapScheduler.schedule × 1000', async () => {
    const done: Promise<void>[] = []
    for (let i = 0; i < 1000; i++) {
      done.push(new Promise<void>((res) => asapScheduler.schedule(res)))
    }
    await Promise.all(done)
  })

  bench('observeOn(asapScheduler) × 1000 emits', async () => {
    const s = subject<number>()
    let n = 0
    const target = 1000
    const finished = new Promise<void>((res) => {
      const u = subscribe(pipe(s, observeOn(asapScheduler)), () => {
        if (++n === target) {
          u()
          res()
        }
      })
    })
    for (let i = 0; i < target; i++) s.next(i)
    await finished
  })
})

// ---------------- termination ----------------

group('termination', () => {
  bench('takeUntil(notifier) 1000 emits then stop', () => {
    const s = subject<number>()
    const stop = subject<void>()
    const u = subscribe(pipe(s, takeUntil(stop)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    stop.next()
    u()
  })

  bench('debounceTime(0) × 1000 emits', () => {
    const s = subject<number>()
    const u = subscribe(pipe(s, debounceTime(0)), noop)
    for (let i = 0; i < 1000; i++) s.next(i)
    u()
  })
})

// ---------------- helpers ----------------

function makeObs() {
  return { next: noop, error: noop, complete: noop }
}

// silence unused-warn on small fixture
void ints10

await run({ format: process.env['BENCH_JSON'] ? { json: { samples: false } } : 'mitata' })
