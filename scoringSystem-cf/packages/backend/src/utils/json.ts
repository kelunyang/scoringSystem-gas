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

/**
 * Parse JSON object field from database
 * Common pattern for settings, metadata, etc.
 *
 * @param field - Database field containing JSON object
 * @returns Parsed object or empty object
 *
 * @example
 * const settings = parseJsonObject(user.preferences);
 * // Always returns an object
 */
export function parseJsonObject(field: string | null | undefined): Record<string, any> {
  return safeJsonParse(field, {});
}

/**
 * Deep clone an object using JSON parse/stringify
 * Useful for avoiding reference mutations
 *
 * @param obj - Object to clone
 * @returns Deep cloned object
 *
 * @example
 * const cloned = deepClone(originalData);
 * cloned.field = 'changed'; // Does not affect original
 */
export function deepClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.warn('Failed to deep clone object:', obj, error);
    return obj;
  }
}

/**
 * Merge multiple objects safely
 * Later objects override earlier ones
 *
 * @param objects - Objects to merge
 * @returns Merged object
 *
 * @example
 * const merged = mergeObjects({ a: 1 }, { b: 2 }, { a: 3 });
 * // Returns: { a: 3, b: 2 }
 */
export function mergeObjects<T extends Record<string, any>>(
  ...objects: Partial<T>[]
): T {
  return Object.assign({}, ...objects) as T;
}

/**
 * Check if a value is a valid JSON string
 *
 * @param value - Value to check
 * @returns true if valid JSON string
 *
 * @example
 * isValidJson('{"key": "value"}'); // true
 * isValidJson('invalid');          // false
 */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty print JSON for logging/debugging
 *
 * @param obj - Object to pretty print
 * @param indent - Number of spaces for indentation
 * @returns Formatted JSON string
 *
 * @example
 * console.log(prettyJson({ key: 'value' }));
 * // {
 * //   "key": "value"
 * // }
 */
export function prettyJson(obj: any, indent: number = 2): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch (error) {
    return String(obj);
  }
}

// Aliases for backwards compatibility
export { safeJsonParse as parseJSON };
export { safeJsonStringify as stringifyJSON };
