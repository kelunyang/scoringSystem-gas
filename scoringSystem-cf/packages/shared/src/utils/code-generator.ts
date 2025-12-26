/**
 * Unified code generation utilities for invitation codes and verification codes
 *
 * Security Strategy:
 * - Actual character set: 27 characters (A-Z excluding I,O + @#!)
 * - Frontend "deception": Accepts all printable ASCII to reduce fingerprinting
 *   - Prevents attackers from knowing exact character set
 *   - Makes automated attacks more difficult
 * - Backend validation: Strictly validates against actual character set
 *   - All validation happens server-side for security
 *   - Frontend is convenience layer only
 *
 * Security Considerations:
 * - Uses crypto.getRandomValues() for cryptographic randomness
 * - 12-character codes provide ~57 bits of entropy
 * - Combined with rate limiting and expiration for defense in depth
 */

/**
 * Character set for code generation
 * - Letters: A-Z excluding I and O (24 characters)
 *   - I excluded: visually similar to 1 and l
 *   - O excluded: visually similar to 0
 * - Symbols: @#! (3 characters) - easily accessible on mobile keyboard main page
 * - Total: 27 characters
 * - Entropy: log₂(27^12) ≈ 57.06 bits
 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ@#!';

/**
 * Generate cryptographically secure random index
 * Uses crypto.getRandomValues() instead of Math.random() for security
 *
 * This implementation uses rejection sampling to avoid modulo bias:
 * - Generate random 32-bit value
 * - Calculate maximum unbiased value
 * - Reject and retry if value exceeds threshold (rare)
 *
 * @param max - Maximum value (exclusive)
 * @returns Random index between 0 and max-1
 */
function getSecureRandomIndex(max: number): number {
  // Use 32-bit random value for better distribution
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);

  // Calculate maximum unbiased value to avoid modulo bias
  // Example: if max=27, maxValue will be largest multiple of 27 that fits in 32 bits
  const maxValue = Math.floor(0xFFFFFFFF / max) * max;

  const randomValue = randomBytes[0];

  // Rejection sampling: retry if value would cause bias
  // This happens rarely (< 1% of the time for max=27)
  if (randomValue >= maxValue) {
    return getSecureRandomIndex(max);
  }

  return randomValue % max;
}

/**
 * Generate a random readable code with specified format
 *
 * SECURITY: Uses crypto.getRandomValues() for cryptographically secure randomness
 *
 * @param options - Configuration options
 * @param options.length - Total code length (default: 12)
 * @param options.format - Format pattern, e.g., '4-4-4' for XXXX-XXXX-XXXX (default: '4-4-4')
 * @returns Generated code with optional formatting
 *
 * @example
 * generateReadableCode() // Returns: "K@WH-NM#A-!QRS"
 * generateReadableCode({ length: 6, format: '3-3' }) // Returns: "A@B-C#D"
 */
export function generateReadableCode(options?: {
  length?: number;
  format?: string;
}): string {
  const {
    length = 12,
    format = '4-4-4'
  } = options || {};

  // Generate random characters using cryptographically secure method
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = getSecureRandomIndex(CODE_CHARS.length);
    code += CODE_CHARS[randomIndex];
  }

  // Apply formatting if specified
  if (format) {
    const segments = format.split('-').map(Number);
    let formatted = '';
    let offset = 0;

    for (let i = 0; i < segments.length; i++) {
      if (i > 0) formatted += '-';
      formatted += code.substring(offset, offset + segments[i]);
      offset += segments[i];
    }

    return formatted;
  }

  return code;
}

/**
 * Generate a 12-character invitation code
 * Format: XXXX-XXXX-XXXX
 *
 * @returns Formatted invitation code
 *
 * @example
 * generateInvitationCode() // Returns: "KFWH-NMDA-TQRS"
 */
export function generateInvitationCode(): string {
  return generateReadableCode({ length: 12, format: '4-4-4' });
}

/**
 * Generate a 12-character verification code for 2FA
 * Format: XXXX-XXXX-XXXX
 *
 * @returns Formatted verification code
 *
 * @example
 * generateVerificationCode() // Returns: "A@BC-D#EF-!GHJ"
 */
export function generateVerificationCode(): string {
  return generateReadableCode({ length: 12, format: '4-4-4' });
}

/**
 * Validate if a code matches the expected character set
 * Used for backend validation
 *
 * @param code - Code to validate (can include hyphens as separators)
 * @param expectedLength - Expected length without hyphens (default: 12)
 * @returns true if code is valid
 *
 * @example
 * validateCodeFormat('KFWH-NMDA-TQRS') // Returns: true
 * validateCodeFormat('K0WH-NMDA-TQRS') // Returns: false (contains 0)
 * validateCodeFormat('KIWH-NMDA-TQRS') // Returns: false (contains I)
 * validateCodeFormat('K@WH-NM#A-!QRS') // Returns: true (symbols allowed)
 */
export function validateCodeFormat(code: string, expectedLength: number = 12): boolean {
  // Remove hyphens (separators only, not part of character set)
  const cleanCode = code.replace(/-/g, '');

  // Check length
  if (cleanCode.length !== expectedLength) {
    return false;
  }

  // Check all characters are in valid set (no hyphens in CODE_CHARS)
  // Using regex for better performance: only uppercase letters A-Z (excluding I,O) and @#!
  return /^[A-Z@#!]+$/.test(cleanCode) && cleanCode.split('').every(char => CODE_CHARS.includes(char));
}

/**
 * Get the character set used for code generation
 * Useful for documentation and testing
 *
 * @returns The character set string
 */
export function getCodeCharacterSet(): string {
  return CODE_CHARS;
}
