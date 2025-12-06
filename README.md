# @lickle/rx

A minimal reactive programming library with Observables, Subjects, and composable operators.

[![Build Status](https://img.shields.io/github/actions/workflow/status/Pingid/lickle-rx/test.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/Pingid/lickle-rx/actions?query=workflow:Test)
[![Build Size](https://img.shields.io/bundlephobia/minzip/@lickle/rx?label=bundle%20size&style=flat&colorA=000000&colorB=000000)](https://bundlephobia.com/result?p=@lickle/rx)
[![Version](https://img.shields.io/npm/v/@lickle/rx?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@lickle/rx)
[![Downloads](https://img.shields.io/npm/dt/@lickle/rx.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@lickle/rx)

## Install

```bash
npm install @lickle/rx
```

---

## Quick Start

```ts
import { of, map, filter } from '@lickle/rx'
import { pipe } from '@lickle/rx/util'

// Create and compose observables
const source = of(1, 2, 3, 4, 5)

const doubled = pipe(
  source,
  filter((x) => x % 2 === 0),
  map((x) => x * 2),
)

// Subscribe to receive values
doubled((value) => console.log(value))
// Output: 4, 8
```

---

## Core Concepts

### Observable

An `Observable` is a function that accepts a subscriber callback and returns an unsubscribe function:

```ts
type Observable<T> = (subscriber: (x: T) => void) => Unsubscribe
```

### Subject

Subjects are observables that can be manually triggered:

```ts
import { createSubject } from '@lickle/rx'

const subject = createSubject<number>()

subject((x) => console.log('Subscriber 1:', x))
subject((x) => console.log('Subscriber 2:', x))

subject.next(42) // Both subscribers receive 42
```

---

## Constructors

Create observables from various sources:

```ts
import { of, from, interval, timer, fromEvent } from '@lickle/rx'

// From values
of(1, 2, 3)

// From Promise
from(fetch('/api/data'))

// Time-based
interval(1000) // emit every second
timer(1000, 500) // emit after 1s, then every 500ms

// From DOM events
fromEvent(button, 'click')
```

---

## Operators

Transform and combine observables:

```ts
import { map, filter, scan, debounceTime, switchMap } from '@lickle/rx'
import { pipe } from '@lickle/rx/util'

pipe(
  source,
  map((x) => x * 2),
  filter((x) => x > 10),
  debounceTime(300),
  switchMap((x) => fetch(`/api/${x}`)),
)
```

### Available Operators

- **Transform:** `map`, `scan`, `switchMap`, `mergeMap`, `concatMap`
- **Filter:** `filter`, `take`, `takeUntil`, `takeWhile`, `distinctUntilChanged`
- **Time:** `debounceTime`, `throttleTime`, `delay`, `bufferTime`
- **Combine:** `withLatestFrom`, `startWith`
- **Utility:** `tap`, `share`, `shareReplay`

---

## Combinators

Combine multiple observables:

```ts
import { merge, combineLatest, zip, concat, race } from '@lickle/rx'

// Merge all emissions
merge(obs1, obs2, obs3)

// Combine latest values
combineLatest(obs1, obs2) // emits [val1, val2]

// Zip values by index
zip(obs1, obs2) // emits pairs

// Sequential emission
concat(obs1, obs2)

// First to emit wins
race(obs1, obs2)
```

---

## Subjects

Three types of subjects for different use cases:

```ts
import { createSubject, createReplaySubject, createBehaviorSubject } from '@lickle/rx'

// Standard subject
const subject = createSubject<number>()

// Replay last N values to new subscribers
const replay = createReplaySubject<number>(3)

// Behavior subject with initial value
const behavior = createBehaviorSubject(0)
```

---

## License

MIT © [Dan Beaven](https://github.com/Pingid)
