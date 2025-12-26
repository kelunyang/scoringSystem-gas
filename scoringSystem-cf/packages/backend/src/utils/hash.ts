/**
 * @fileoverview Simple hashing utilities for non-cryptographic use cases
 * These are NOT for password hashing - use password.ts for that!
 *
 * Use cases:
 * - Deterministic random seed generation
 * - Consistent project selection from email
 * - Cache keys and simple checksums
 */

/**
 * Generate a simple hash from a string
 *
 * This is a non-cryptographic hash function based on Java's String.hashCode()
 * algorithm. It's deterministic (same input always produces same output) and
 * fast, but NOT suitable for security purposes.
 *
 * BUG FIX: Changed from `hash & hash` (meaningless) to `hash & 0xFFFFFFFF`
 * to convert to 32-bit unsigned integer and prevent overflow issues.
 *
 * @param str - String to hash
 * @returns 32-bit integer hash value (always positive)
 *
 * @example
 * const hash1 = simpleHash('user@example.com'); // Always same result
 * const hash2 = simpleHash('user@example.com'); // Same as hash1
 * const hash3 = simpleHash('other@example.com'); // Different result
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    // Convert to 32-bit unsigned integer
    // BUG FIX: Was `hash & hash` which does nothing
    hash = hash & 0xFFFFFFFF;
  }
  return Math.abs(hash);
}

/**
 * Hash a string to a value within a specific range
 * Useful for selecting items deterministically from an array
 *
 * @param str - String to hash
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Integer in range [min, max)
 *
 * @example
 * // Select one of 6 projects deterministically
 * const projectIndex = hashToRange('user@example.com', 0, 6);
 * const project = projects[projectIndex];
 */
export function hashToRange(str: string, min: number, max: number): number {
  const hash = simpleHash(str);
  const range = max - min;
  return min + (hash % range);
}

/**
 * Generate multiple hash values from a string with different seeds
 * Useful when you need multiple deterministic values from one input
 *
 * @param str - String to hash
 * @param count - Number of hash values to generate
 * @returns Array of hash values
 *
 * @example
 * // Get 3 different hash values from same email
 * const hashes = multiHash('user@example.com', 3);
 * // [12345, 67890, 54321] - always same for this email
 */
export function multiHash(str: string, count: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    // Add index as prefix to get different hashes
    results.push(simpleHash(`${i}_${str}`));
  }
  return results;
}

/**
 * Create a deterministic seed from a string for use with seeded random
 *
 * @param str - String to convert to seed
 * @returns Positive integer seed value
 *
 * @example
 * import { createSeededRandom } from './random';
 * const seed = stringToSeed('user@example.com');
 * const rng = createSeededRandom(seed);
 * const value = rng(); // Deterministic random value
 */
export function stringToSeed(str: string): number {
  return simpleHash(str);
}
