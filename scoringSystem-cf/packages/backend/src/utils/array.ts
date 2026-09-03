/**
 * @fileoverview Array manipulation utilities
 * Includes deterministic shuffling, chunking, and selection helpers
 */

import { createSeededRandom } from './random';

/**
 * Shuffle an array using Fisher-Yates algorithm
 * Can be deterministic (with seed) or random (without seed)
 *
 * @param array - Array to shuffle (not modified)
 * @param seed - Optional seed for deterministic shuffle
 * @returns New shuffled array
 *
 * @example
 * // Random shuffle (different each time)
 * const shuffled = shuffleArray([1, 2, 3, 4, 5]);
 *
 * @example
 * // Deterministic shuffle (same result for same seed)
 * const shuffled1 = shuffleArray([1, 2, 3, 4, 5], 12345);
 * const shuffled2 = shuffleArray([1, 2, 3, 4, 5], 12345);
 * // shuffled1 === shuffled2
 *
 * @example
 * // Shuffle projects deterministically based on email
 * import { stringToSeed } from './hash';
 * const seed = stringToSeed('user@example.com');
 * const shuffled = shuffleArray(allProjects, seed);
 */
export function shuffleArray<T>(array: T[], seed?: number): T[] {
  const result = [...array];

  if (seed !== undefined) {
    // Deterministic shuffle with seeded RNG
    const rng = createSeededRandom(seed);
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  } else {
    // Random shuffle with crypto.getRandomValues
    const randomValues = new Uint32Array(result.length);
    crypto.getRandomValues(randomValues);

    for (let i = result.length - 1; i > 0; i--) {
      const j = randomValues[i] % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
  }

  return result;
}

/**
 * Get random elements from an array without replacement
 *
 * @param array - Array to select from
 * @param count - Number of elements to select
 * @param seed - Optional seed for deterministic selection
 * @returns Array of selected elements
 *
 * @example
 * const projects = [p1, p2, p3, p4, p5];
 * const selected = getRandomElements(projects, 3);
 * // Returns 3 different projects
 *
 * @example
 * // Deterministic selection
 * import { stringToSeed } from './hash';
 * const seed = stringToSeed('user@example.com');
 * const selected = getRandomElements(projects, 3, seed);
 * // Always same 3 projects for this email
 */
export function getRandomElements<T>(
  array: T[],
  count: number,
  seed?: number
): T[] {
  if (count >= array.length) {
    return [...array];
  }

  const shuffled = shuffleArray(array, seed);
  return shuffled.slice(0, count);
}

/**
 * Get the difference of two arrays (elements in first but not second)
 *
 * @param array1 - First array
 * @param array2 - Second array
 * @returns Elements in array1 that are not in array2
 *
 * @example
 * const a = [1, 2, 3, 4];
 * const b = [3, 4, 5, 6];
 * const diff = difference(a, b);
 * // [1, 2]
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return array1.filter(item => !set2.has(item));
}
