/**
 * Utility functions for composing observables.
 * @module
 */

import { Unsubscribe } from './observable.js'

/**
 * Pipes a value through a series of functions, left to right.
 *
 * @param x The initial value
 * @param fns Functions to apply in sequence
 * @return The result of applying all functions
 *
 * @example
 * ```ts
 * const result$ = pipe(
 *   interval(1000),
 *   map((x) => x * 2),
 *   filter((x) => x > 5),
 *   take(3)
 * )
 * ```
 */
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
  <A, B, C, D, E, F, G, H>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
  ): H
  <A, B, C, D, E, F, G, H, I>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
  ): I
  <A, B, C, D, E, F, G, H, I, J>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
  ): J
  <A, B, C, D, E, F, G, H, I, J, K>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
  ): K
  <A, B, C, D, E, F, G, H, I, J, K, L>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
  ): L
  <A, B, C, D, E, F, G, H, I, J, K, L, M>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
  ): M
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
  ): N
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
  ): O
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
    f15: (x: O) => P,
  ): P
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
    x: A,
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
    f15: (x: O) => P,
    f16: (x: P) => Q,
  ): Q
} = (h: any, ...t: any[]) => t.reduce<any>((a, b) => b(a), h)

/**
 * Composes functions left to right, returning a new function.
 *
 * @param fns Functions to compose
 * @return A function that applies all functions in sequence
 *
 * @example
 * ```ts
 * const double = (x: number) => x * 2
 * const addOne = (x: number) => x + 1
 * const transform = flow(double, addOne)
 * transform(5) // 11
 * ```
 */
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
  <A, B, C, D, E, F, G, H>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
  ): (x: A) => H
  <A, B, C, D, E, F, G, H, I>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
  ): (x: A) => I
  <A, B, C, D, E, F, G, H, I, J>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
  ): (x: A) => J
  <A, B, C, D, E, F, G, H, I, J, K>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
  ): (x: A) => K
  <A, B, C, D, E, F, G, H, I, J, K, L>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
  ): (x: A) => L
  <A, B, C, D, E, F, G, H, I, J, K, L, M>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
  ): (x: A) => M
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
  ): (x: A) => N
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
  ): (x: A) => O
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
    f15: (x: O) => P,
  ): (x: A) => P
  <A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
    f1: (x: A) => B,
    f2: (x: B) => C,
    f3: (x: C) => D,
    f4: (x: D) => E,
    f5: (x: E) => F,
    f6: (x: F) => G,
    f7: (x: G) => H,
    f8: (x: H) => I,
    f9: (x: I) => J,
    f10: (x: J) => K,
    f11: (x: K) => L,
    f12: (x: L) => M,
    f13: (x: M) => N,
    f14: (x: N) => O,
    f15: (x: O) => P,
    f16: (x: P) => Q,
  ): (x: A) => Q
} =
  (h: any, ...t: any[]) =>
  (x: any) =>
    pipe(h(x), ...(t as [any]))

/**
 * Combines multiple unsubscribe functions into a single function.
 * Accepts nested arrays which are flattened before disposal.
 *
 * @param args Unsubscribe functions or arrays of them
 * @return A single function that calls all provided unsubscribe functions
 *
 * @example
 * ```ts
 * const unsub1 = subscribe(source1$, console.log)
 * const unsub2 = subscribe(source2$, console.log)
 * const cleanup = dispose(unsub1, unsub2)
 * cleanup() // unsubscribes from both
 * ```
 */
export const dispose =
  (...args: Unsubscribe[] | Unsubscribe[][] | Unsubscribe[][][]): Unsubscribe =>
  () =>
    (args.flat(Infinity) as Unsubscribe[]).forEach((x) => x())
