/**
 * General utility functions for functional composition and cleanup.
 *
 * These utilities are used to compose operators and manage subscriptions.
 *
 * Key exports:
 * - {@link pipe}: Compose functions left-to-right (used for operators).
 * - {@link flow}: Compose functions left-to-right into a new function.
 * - {@link dispose}: Combine multiple unsubscribe functions.
 *
 * @module util
 */

import { Unsubscribe } from './observable.js'

/**
 * Pipes a value through a series of functions, left to right.
 *
 * @param x - The initial value
 * @param fns - Functions to apply in sequence
 * @returns The result of applying all functions
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
  <T>(x: T): T
  <T, A>(x: T, op1: Unary<T, A>): A
  <T, A, B>(x: T, op1: Unary<T, A>, op2: Unary<A, B>): B
  <T, A, B, C>(x: T, op1: Unary<T, A>, op2: Unary<A, B>, op3: Unary<B, C>): C
  <T, A, B, C, D>(x: T, op1: Unary<T, A>, op2: Unary<A, B>, op3: Unary<B, C>, op4: Unary<C, D>): D
  <T, A, B, C, D, E>(x: T, op1: Unary<T, A>, op2: Unary<A, B>, op3: Unary<B, C>, op4: Unary<C, D>, op5: Unary<D, E>): E
  <T, A, B, C, D, E, F>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
  ): F
  <T, A, B, C, D, E, F, G>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
  ): G
  <T, A, B, C, D, E, F, G, H>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
    op8: Unary<G, H>,
  ): H
  <T, A, B, C, D, E, F, G, H, I>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
    op8: Unary<G, H>,
    op9: Unary<H, I>,
  ): I
  <T, A, B, C, D, E, F, G, H, I, J>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
    op8: Unary<G, H>,
    op9: Unary<H, I>,
    op10: Unary<I, J>,
  ): J
  <T, A, B, C, D, E, F, G, H, I, J, K>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
    op8: Unary<G, H>,
    op9: Unary<H, I>,
    op10: Unary<I, J>,
    op11: Unary<J, K>,
  ): K
  <T, A, B, C, D, E, F, G, H, I, J, K, L>(
    x: T,
    op1: Unary<T, A>,
    op2: Unary<A, B>,
    op3: Unary<B, C>,
    op4: Unary<C, D>,
    op5: Unary<D, E>,
    op6: Unary<E, F>,
    op7: Unary<F, G>,
    op8: Unary<G, H>,
    op9: Unary<H, I>,
    op10: Unary<I, J>,
    op11: Unary<J, K>,
    op12: Unary<K, L>,
  ): L
  <T>(x: T, ...ops: Unary<any, any>[]): any
} = (h: any, ...t: any[]) => t.reduce<any>((a, b) => b(a), h)

/**
 * Composes functions left to right, returning a new function.
 *
 * @param fns - Functions to compose
 * @returns A function that applies all functions in sequence
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
  <A, B>(op1: Unary<A, B>): (x: A) => B
  <A, B, C>(op1: Unary<A, B>, op2: Unary<B, C>): (x: A) => C
  <A, B, C, D>(op1: Unary<A, B>, op2: Unary<B, C>, op3: Unary<C, D>): (x: A) => D
  <A, B, C, D, E>(op1: Unary<A, B>, op2: Unary<B, C>, op3: Unary<C, D>, op4: Unary<D, E>): (x: A) => E
  <A, B, C, D, E, F>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
  ): (x: A) => F
  <A, B, C, D, E, F, G>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
  ): (x: A) => G
  <A, B, C, D, E, F, G, H>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
  ): (x: A) => H
  <A, B, C, D, E, F, G, H, I>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
    op8: Unary<H, I>,
  ): (x: A) => I
  <A, B, C, D, E, F, G, H, I, J>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
    op8: Unary<H, I>,
    op9: Unary<I, J>,
  ): (x: A) => J
  <A, B, C, D, E, F, G, H, I, J, K>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
    op8: Unary<H, I>,
    op9: Unary<I, J>,
    op10: Unary<J, K>,
  ): (x: A) => K
  <A, B, C, D, E, F, G, H, I, J, K, L>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
    op8: Unary<H, I>,
    op9: Unary<I, J>,
    op10: Unary<J, K>,
    op11: Unary<K, L>,
  ): (x: A) => L
  <A, B, C, D, E, F, G, H, I, J, K, L, M>(
    op1: Unary<A, B>,
    op2: Unary<B, C>,
    op3: Unary<C, D>,
    op4: Unary<D, E>,
    op5: Unary<E, F>,
    op6: Unary<F, G>,
    op7: Unary<G, H>,
    op8: Unary<H, I>,
    op9: Unary<I, J>,
    op10: Unary<J, K>,
    op11: Unary<K, L>,
    op12: Unary<L, M>,
  ): (x: A) => M
  (...ops: Unary<any, any>[]): (x: any) => any
} =
  (h: any, ...t: any[]) =>
  (x: any) =>
    pipe(h(x), ...(t as [any]))

export type Unary<T, R> = (source: T) => R

/**
 * Combines multiple unsubscribe functions into a single function.
 * Accepts nested arrays which are flattened before disposal.
 *
 * @param args - Unsubscribe functions or arrays of them
 * @returns A single function that calls all provided unsubscribe functions
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
