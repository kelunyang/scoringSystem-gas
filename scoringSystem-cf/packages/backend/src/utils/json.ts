/**
 * @fileoverview Safe JSON parsing and manipulation utilities
 * Prevents errors from malformed JSON in database
 */

/**
 * Safely parse JSON string with fallback
 * Equivalent to GAS safeJsonParse()
 *
 * @param jsonString - JSON string to parse
 * @param defaultValue - Value to return if parsing fails
 * @returns Parsed object or default value
 *
 * @example
 * const permissions = safeJsonParse(group.globalPermissions, []);
 * // Returns array if valid JSON, empty array if invalid
 */
export function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
  defaultValue: T
): T {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error);
    return defaultValue;
  }
}

/**
 * Safely stringify object with error handling
 *
 * @param obj - Object to stringify
 * @param defaultValue - Value to return if stringification fails
 * @returns JSON string or default value
 *
 * @example
 * const jsonStr = safeJsonStringify({ key: 'value' }, '{}');
 */
export function safeJsonStringify(
  obj: any,
  defaultValue: string = '{}'
): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn('Failed to stringify object:', obj, error);
    return defaultValue;
  }
}

/**
 * Parse JSON array field from database
 * Common pattern for permissions, tags, etc.
 *
 * @param field - Database field containing JSON array
 * @returns Parsed array or empty array
 *
 * @example
 * const permissions = parseJsonArray(group.globalPermissions);
 * // Always returns an array
 */
export function parseJsonArray(field: string | null | undefined): any[] {
  return safeJsonParse(field, []);
}

// Aliases for backwards compatibility
export { safeJsonParse as parseJSON };
export { safeJsonStringify as stringifyJSON };
