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
 * Split an array into chunks of specified size
 *
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * const data = [1, 2, 3, 4, 5, 6, 7];
 * const chunks = chunkArray(data, 3);
 * // [[1, 2, 3], [4, 5, 6], [7]]
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Remove duplicate elements from an array
 *
 * @param array - Array with potential duplicates
 * @param keyFn - Optional function to extract comparison key
 * @returns Array with duplicates removed
 *
 * @example
 * const numbers = [1, 2, 2, 3, 3, 3];
 * const unique = uniqueArray(numbers);
 * // [1, 2, 3]
 *
 * @example
 * const users = [{id: 1, name: 'A'}, {id: 2, name: 'B'}, {id: 1, name: 'C'}];
 * const unique = uniqueArray(users, u => u.id);
 * // [{id: 1, name: 'A'}, {id: 2, name: 'B'}]
 */
export function uniqueArray<T>(
  array: T[],
  keyFn?: (item: T) => any
): T[] {
  if (!keyFn) {
    return Array.from(new Set(array));
  }

  const seen = new Set();
  const result: T[] = [];

  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

/**
 * Group array elements by a key function
 *
 * @param array - Array to group
 * @param keyFn - Function to extract grouping key
 * @returns Map of key to array of items
 *
 * @example
 * const users = [
 *   {id: 1, role: 'admin'},
 *   {id: 2, role: 'user'},
 *   {id: 3, role: 'admin'}
 * ];
 * const grouped = groupBy(users, u => u.role);
 * // Map { 'admin' => [{id: 1, ...}, {id: 3, ...}], 'user' => [{id: 2, ...}] }
 */
export function groupBy<T, K>(
  array: T[],
  keyFn: (item: T) => K
): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const item of array) {
    const key = keyFn(item);
    const group = groups.get(key);

    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

/**
 * Partition an array into two arrays based on a predicate
 *
 * @param array - Array to partition
 * @param predicate - Function that returns true for first partition
 * @returns Tuple of [matching, notMatching]
 *
 * @example
 * const numbers = [1, 2, 3, 4, 5, 6];
 * const [even, odd] = partition(numbers, n => n % 2 === 0);
 * // even = [2, 4, 6], odd = [1, 3, 5]
 */
export function partition<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const matching: T[] = [];
  const notMatching: T[] = [];

  for (const item of array) {
    if (predicate(item)) {
      matching.push(item);
    } else {
      notMatching.push(item);
    }
  }

  return [matching, notMatching];
}

/**
 * Get the intersection of two arrays (elements in both)
 *
 * @param array1 - First array
 * @param array2 - Second array
 * @returns Array of common elements
 *
 * @example
 * const a = [1, 2, 3, 4];
 * const b = [3, 4, 5, 6];
 * const common = intersect(a, b);
 * // [3, 4]
 */
export function intersect<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return array1.filter(item => set2.has(item));
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

/**
 * Flatten a nested array by one level
 *
 * @param array - Array of arrays
 * @returns Flattened array
 *
 * @example
 * const nested = [[1, 2], [3, 4], [5]];
 * const flat = flatten(nested);
 * // [1, 2, 3, 4, 5]
 */
export function flatten<T>(array: T[][]): T[] {
  return array.reduce((acc, curr) => acc.concat(curr), []);
}
