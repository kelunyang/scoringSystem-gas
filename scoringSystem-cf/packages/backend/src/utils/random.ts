/**
 * @fileoverview Deterministic random number generation utilities
 * Uses Linear Congruential Generator (LCG) for reproducible randomness
 *
 * Use cases:
 * - Password reset fake project generation (always same projects per email)
 * - Testing with reproducible random data
 * - Shuffling arrays deterministically
 */

/**
 * Create a seeded random number generator using LCG algorithm
 *
 * This implements a Linear Congruential Generator with parameters:
 * - Multiplier: 1664525
 * - Increment: 1013904223
 * - Modulus: 2^31 (2147483648)
 *
 * These are the same parameters used by Numerical Recipes and POSIX rand48.
 *
 * @param seed - Integer seed value (use same seed for same sequence)
 * @returns Function that returns next random number in [0, 1)
 *
 * @example
 * // Create two generators with same seed - they produce same sequence
 * const rng1 = createSeededRandom(12345);
 * const rng2 = createSeededRandom(12345);
 * console.log(rng1()); // 0.123...
 * console.log(rng2()); // 0.123... (same as rng1)
 *
 * @example
 * // Use with email hash for deterministic selection
 * import { stringToSeed } from './hash';
 * const seed = stringToSeed('user@example.com');
 * const rng = createSeededRandom(seed);
 * const value = rng(); // Always same for this email
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;

  return function(): number {
    // LCG algorithm: state = (a * state + c) mod m
    state = (state * 1664525 + 1013904223) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Generate a random integer in range [min, max) using seeded RNG
 *
 * @param rng - Seeded random number generator function
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Random integer in range [min, max)
 *
 * @example
 * const rng = createSeededRandom(12345);
 * const dice = randomInt(rng, 1, 7); // 1-6 inclusive
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min)) + min;
}

/**
 * Generate multiple random integers from a seeded RNG
 *
 * @param rng - Seeded random number generator function
 * @param count - Number of integers to generate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Array of random integers
 *
 * @example
 * const rng = createSeededRandom(12345);
 * const values = randomInts(rng, 5, 0, 100); // 5 random numbers 0-99
 */
export function randomInts(
  rng: () => number,
  count: number,
  min: number,
  max: number
): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(randomInt(rng, min, max));
  }
  return results;
}

/**
 * Select a random element from an array using seeded RNG
 *
 * @param rng - Seeded random number generator function
 * @param array - Array to select from
 * @returns Random element from array
 *
 * @example
 * const rng = createSeededRandom(12345);
 * const colors = ['red', 'green', 'blue'];
 * const color = randomChoice(rng, colors);
 */
export function randomChoice<T>(rng: () => number, array: T[]): T {
  const index = randomInt(rng, 0, array.length);
  return array[index];
}

/**
 * Select multiple random elements from an array (with replacement)
 *
 * @param rng - Seeded random number generator function
 * @param array - Array to select from
 * @param count - Number of elements to select
 * @returns Array of randomly selected elements
 *
 * @example
 * const rng = createSeededRandom(12345);
 * const deck = ['A', 'B', 'C', 'D', 'E'];
 * const hand = randomChoices(rng, deck, 3); // ['B', 'D', 'B']
 */
export function randomChoices<T>(
  rng: () => number,
  array: T[],
  count: number
): T[] {
  const results: T[] = [];
  for (let i = 0; i < count; i++) {
    results.push(randomChoice(rng, array));
  }
  return results;
}

/**
 * Generate a random boolean with specified probability
 *
 * @param rng - Seeded random number generator function
 * @param probability - Probability of true (0.0 to 1.0)
 * @returns true or false
 *
 * @example
 * const rng = createSeededRandom(12345);
 * const coinFlip = randomBool(rng, 0.5); // 50% chance of true
 * const biased = randomBool(rng, 0.8);   // 80% chance of true
 */
export function randomBool(rng: () => number, probability: number = 0.5): boolean {
  return rng() < probability;
}
