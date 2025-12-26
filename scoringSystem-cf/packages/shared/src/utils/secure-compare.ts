/**
 * Constant-time string comparison to prevent timing attacks
 *
 * JavaScript's `===` operator performs short-circuit comparison, which means
 * it stops as soon as it finds a differing character. This can leak information
 * about which characters are correct via timing analysis.
 *
 * This implementation uses bitwise XOR to compare all characters in constant time,
 * preventing attackers from using timing information to deduce parts of the string.
 *
 * @see https://codahale.com/a-lesson-in-timing-attacks/
 */

/**
 * Compare two strings in constant time to prevent timing attacks
 *
 * SECURITY: This function takes the same amount of time regardless of where
 * the strings differ, making it safe for comparing security-sensitive values
 * like verification codes, session tokens, or passwords.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 *
 * @example
 * // Safe comparison for verification codes
 * if (constantTimeCompare(userCode, storedCode)) {
 *   // Grant access
 * }
 *
 * @example
 * // Different lengths return false immediately (not timing-sensitive)
 * constantTimeCompare('abc', 'abcd') // Returns: false
 *
 * @example
 * // Same length but different content
 * constantTimeCompare('abc', 'abd') // Returns: false (takes same time as equal strings)
 */
export function constantTimeCompare(a: string, b: string): boolean {
  // Early return for different lengths (not timing-sensitive information)
  // Attackers typically know the expected length from other sources
  if (a.length !== b.length) {
    return false;
  }

  // XOR all characters and accumulate result
  // This ensures we compare all characters regardless of differences
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    // Bitwise OR accumulates any differences
    // XOR returns 0 only if characters are identical
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  // Only return true if all bits are 0 (all characters matched)
  // This final comparison is constant-time in most JavaScript engines
  return result === 0;
}

/**
 * Compare two byte arrays in constant time
 * Useful for comparing binary data like hashed passwords
 *
 * @param a - First byte array
 * @param b - Second byte array
 * @returns true if arrays are equal, false otherwise
 */
export function constantTimeCompareBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}
