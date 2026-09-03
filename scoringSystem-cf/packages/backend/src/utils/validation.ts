/**
 * @fileoverview Input validation utilities
 * Centralizes common validation logic to ensure consistency
 */

/**
 * Validate email address format
 *
 * Uses a reasonable regex that covers most valid email addresses.
 * Not 100% RFC-compliant but practical for real-world use.
 *
 * @param email - Email address to validate
 * @returns true if valid email format
 *
 * @example
 * validateEmail('user@example.com');     // true
 * validateEmail('user.name+tag@sub.example.co.uk'); // true
 * validateEmail('invalid@');             // false
 * validateEmail('not-an-email');         // false
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex - practical and reasonable
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate invitation code format
 *
 * Invitation codes should be:
 * - 6-50 characters long
 * - Alphanumeric only (case-insensitive)
 *
 * @param code - Invitation code to validate
 * @returns true if valid invitation code format
 *
 * @example
 * validateInvitationCode('ABC123');     // true
 * validateInvitationCode('invite2024'); // true
 * validateInvitationCode('abc');        // false (too short)
 * validateInvitationCode('has-dash');   // false (invalid char)
 */
export function validateInvitationCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  const codeRegex = /^[a-zA-Z0-9]{6,50}$/;
  return codeRegex.test(code);
}
