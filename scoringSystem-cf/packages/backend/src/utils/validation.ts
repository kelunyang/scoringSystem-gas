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
 * Validate username format
 *
 * Rules:
 * - 3-30 characters long
 * - Can contain letters, numbers, underscores, hyphens
 * - Must start with a letter or number
 * - No spaces or special characters except _ and -
 *
 * @param username - Username to validate
 * @returns true if valid username format
 *
 * @example
 * validateUsername('john_doe');      // true
 * validateUsername('user123');       // true
 * validateUsername('alice-wonderland'); // true
 * validateUsername('ab');            // false (too short)
 * validateUsername('has spaces');    // false
 * validateUsername('_starts_underscore'); // false
 */
export function validateUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // 3-30 characters, alphanumeric plus _ and -, must start with alphanumeric
  const usernameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$/;
  return usernameRegex.test(username);
}

/**
 * Validate project name format
 *
 * Rules:
 * - 1-100 characters long
 * - Can contain any printable characters
 * - Cannot be only whitespace
 *
 * @param projectName - Project name to validate
 * @returns true if valid project name
 *
 * @example
 * validateProjectName('My Project');           // true
 * validateProjectName('项目2024');              // true
 * validateProjectName('');                     // false
 * validateProjectName('   ');                  // false (only whitespace)
 */
export function validateProjectName(projectName: string): boolean {
  if (!projectName || typeof projectName !== 'string') {
    return false;
  }

  const trimmed = projectName.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
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

/**
 * Validate UUID format with optional prefix
 *
 * @param id - ID to validate
 * @param expectedPrefix - Optional expected prefix (e.g., 'usr_', 'proj_')
 * @returns true if valid UUID format
 *
 * @example
 * validateId('usr_550e8400-e29b-41d4-a716-446655440000');           // true
 * validateId('usr_550e8400-e29b-41d4-a716-446655440000', 'usr_');   // true
 * validateId('usr_550e8400-e29b-41d4-a716-446655440000', 'proj_');  // false
 * validateId('not-a-uuid');                                         // false
 */
export function validateId(id: string, expectedPrefix?: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Check prefix if specified
  if (expectedPrefix && !id.startsWith(expectedPrefix)) {
    return false;
  }

  // UUID v4 format (with optional prefix)
  const uuidRegex = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return uuidRegex.test(id);
}

/**
 * Validate a URL format
 *
 * @param url - URL to validate
 * @param allowedProtocols - Optional array of allowed protocols (default: ['http', 'https'])
 * @returns true if valid URL
 *
 * @example
 * validateUrl('https://example.com');           // true
 * validateUrl('http://sub.example.com/path');   // true
 * validateUrl('ftp://files.example.com');       // false (protocol not allowed)
 * validateUrl('not a url');                     // false
 */
export function validateUrl(
  url: string,
  allowedProtocols: string[] = ['http', 'https']
): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

/**
 * Sanitize string by removing/escaping dangerous characters
 *
 * Prevents XSS and injection attacks by escaping HTML special characters.
 *
 * @param input - String to sanitize
 * @returns Sanitized string
 *
 * @example
 * sanitizeString('<script>alert("xss")</script>');
 * // '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate that a number is within a range
 *
 * @param value - Number to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns true if value is in range
 *
 * @example
 * validateNumberRange(50, 0, 100);    // true
 * validateNumberRange(-10, 0, 100);   // false
 * validateNumberRange(150, 0, 100);   // false
 */
export function validateNumberRange(
  value: number,
  min: number,
  max: number
): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
}

/**
 * Validate that a value is one of allowed values
 *
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @returns true if value is in allowed values
 *
 * @example
 * validateEnum('active', ['active', 'inactive', 'pending']);  // true
 * validateEnum('deleted', ['active', 'inactive', 'pending']); // false
 */
export function validateEnum<T>(value: T, allowedValues: T[]): boolean {
  return allowedValues.includes(value);
}
