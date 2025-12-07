/**
 * Utility functions for composing observables.
 * @module
 */

import { Unsubscribe } from './observable.js'

export const pipe: {
  <A>(x: A): A
  <A, B>(x: A, f1: (x: A) => B): B
  <A, B, C>(x: A, f1: (x: A) => B, f2: (x: B) => C): C
  <A, B, C, D>(x: A, f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D): D
  <A, B, C, D, E>(x: A, f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D, f4: (x: D) => E): E
  <A, B, C, D, E, F>(x: A, f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D, f4: (x: D) => E, f5: (x: E) => F): F
  <A, B, C, D, E, F, G>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
  ): G
} = (h: any, ...t: any[]) => t.reduce<any>((a, b) => b(a), h)

export const flow: {
  <A, B>(f1: (x: A) => B): (x: A) => B
  <A, B, C>(f1: (x: A) => B, f2: (x: B) => C): (x: A) => C
  <A, B, C, D>(f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D): (x: A) => D
  <A, B, C, D, E>(f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D, f4: (x: D) => E): (x: A) => E
  <A, B, C, D, E, F>(f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D, f4: (x: D) => E, f5: (x: E) => F): (x: A) => F
  <A, B, C, D, E, F, G>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
  ): (x: A) => G
} =
  (h: any, ...t: any[]) =>
  (x: any) =>
    pipe(h(x), ...(t as [any]))

export const dispose =
  (...args: Unsubscribe[] | Unsubscribe[][] | Unsubscribe[][][]): Unsubscribe =>
  () =>
    (args.flat(Infinity) as Unsubscribe[]).forEach((x) => x())
