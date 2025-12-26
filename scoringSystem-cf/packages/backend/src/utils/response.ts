/**
 * @fileoverview Standardized API response helpers
 * Maintains consistent response format across all endpoints
 */

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;  // Optional message for success responses
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    context?: any;
    attemptsLeft?: number;  // For 2FA verification attempts
  };
}

/**
 * Combined response type
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Create a success response
 *
 * @param data - The response data
 * @param message - Optional success message
 * @returns Response object with success JSON
 *
 * @example
 * return successResponse({ userId: 'usr_123', displayName: 'John Doe' });
 * // Returns Response with: { success: true, data: { userId: 'usr_123', displayName: 'John Doe' } }
 */
export function successResponse<T>(data: T, message?: string): Response {
  const responseBody: any = {
    success: true,
    data
  };

  if (message) {
    responseBody.message = message;
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Create an error response
 *
 * @param code - Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
 * @param message - Human-readable error message
 * @param context - Optional additional error context
 * @returns Response object with error JSON
 *
 * @example
 * return errorResponse('NOT_FOUND', 'Project not found', { projectId: 'proj_123' });
 */
export function errorResponse(
  code: string,
  message: string,
  context?: any
): Response {
  const errorBody: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(context && { context })
    }
  };

  const status = getHttpStatus(code);

  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Common error codes
 */
export const ERROR_CODES = {
  // Authentication errors (401)
  NO_SESSION: 'NO_SESSION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_SESSION: 'INVALID_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_DISABLED: 'USER_DISABLED',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NOT_PROJECT_MEMBER: 'NOT_PROJECT_MEMBER',
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',

  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_INVITATION_CODE: 'INVALID_INVITATION_CODE',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',

  // Business logic errors (400)
  STAGE_NOT_ACTIVE: 'STAGE_NOT_ACTIVE',
  SUBMISSION_DEADLINE_PASSED: 'SUBMISSION_DEADLINE_PASSED',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  USER_ALREADY_IN_PROJECT_GROUP: 'USER_ALREADY_IN_PROJECT_GROUP',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  GROUP_EXISTS: 'GROUP_EXISTS',
  PROPOSAL_EXISTS: 'PROPOSAL_EXISTS',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Convert error code to HTTP status code
 */
export function getHttpStatus(errorCode: string): number {
  // Authentication errors
  if (
    errorCode === ERROR_CODES.NO_SESSION ||
    errorCode === ERROR_CODES.UNAUTHORIZED ||
    errorCode === ERROR_CODES.INVALID_SESSION ||
    errorCode === ERROR_CODES.SESSION_EXPIRED ||
    errorCode === ERROR_CODES.INVALID_CREDENTIALS
  ) {
    return 401;
  }

  // Authorization errors
  if (
    errorCode === ERROR_CODES.FORBIDDEN ||
    errorCode === ERROR_CODES.INSUFFICIENT_PERMISSIONS ||
    errorCode === ERROR_CODES.NOT_PROJECT_MEMBER ||
    errorCode === ERROR_CODES.USER_DISABLED ||
    errorCode === ERROR_CODES.ACCESS_DENIED
  ) {
    return 403;
  }

  // Not found errors
  if (
    errorCode === ERROR_CODES.NOT_FOUND ||
    errorCode === ERROR_CODES.USER_NOT_FOUND ||
    errorCode === ERROR_CODES.PROJECT_NOT_FOUND ||
    errorCode === ERROR_CODES.STAGE_NOT_FOUND ||
    errorCode === ERROR_CODES.SUBMISSION_NOT_FOUND ||
    errorCode === ERROR_CODES.GROUP_NOT_FOUND ||
    errorCode === ERROR_CODES.ENTITY_NOT_FOUND
  ) {
    return 404;
  }

  // Validation and business logic errors
  if (
    errorCode === ERROR_CODES.VALIDATION_ERROR ||
    errorCode === ERROR_CODES.INVALID_INPUT ||
    errorCode === ERROR_CODES.MISSING_PARAMETER ||
    errorCode === ERROR_CODES.INVALID_INVITATION_CODE ||
    errorCode === ERROR_CODES.USERNAME_TAKEN ||
    errorCode === ERROR_CODES.EMAIL_TAKEN ||
    errorCode === ERROR_CODES.STAGE_NOT_ACTIVE ||
    errorCode === ERROR_CODES.SUBMISSION_DEADLINE_PASSED ||
    errorCode === ERROR_CODES.ALREADY_SUBMITTED ||
    errorCode === ERROR_CODES.USER_ALREADY_IN_PROJECT_GROUP ||
    errorCode === ERROR_CODES.INSUFFICIENT_BALANCE ||
    errorCode === ERROR_CODES.TRANSACTION_FAILED ||
    errorCode === ERROR_CODES.GROUP_EXISTS ||
    errorCode === ERROR_CODES.PROPOSAL_EXISTS ||
    errorCode === ERROR_CODES.LIMIT_EXCEEDED
  ) {
    return 400;
  }

  // Server errors
  if (
    errorCode === ERROR_CODES.INTERNAL_ERROR ||
    errorCode === ERROR_CODES.DATABASE_ERROR ||
    errorCode === ERROR_CODES.UNKNOWN_ERROR
  ) {
    return 500;
  }

  // Default
  return 500;
}

/**
 * Create a JSON response with proper status code
 *
 * @param response - API response object
 * @param statusOverride - Optional status code override
 * @returns Response object ready to return from handler
 *
 * @example
 * // Success response
 * return jsonResponse(successResponse({ userId: 'usr_123' }));
 *
 * // Error response with auto status
 * return jsonResponse(errorResponse('NOT_FOUND', 'User not found'));
 *
 * // Error response with custom status
 * return jsonResponse(errorResponse('CUSTOM', 'Custom error'), 418);
 */
export function jsonResponse(
  response: ApiResponse,
  statusOverride?: number
): Response {
  // Handle invalid response objects
  if (!response || typeof response !== 'object') {
    console.error('Invalid response object passed to jsonResponse:', response);
    response = {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Invalid response format'
      }
    };
  }

  const status = statusOverride || (response.success ? 200 : getHttpStatus(response.error?.code || ERROR_CODES.INTERNAL_ERROR));

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Get error message from unknown error type
 *
 * @param error - The caught error (unknown type)
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
}

/**
 * Handle caught errors and convert to error response
 *
 * @param error - The caught error
 * @param context - Optional error context
 * @returns Error Response object
 *
 * @example
 * try {
 *   // Some operation
 * } catch (error) {
 *   return handleError(error, { userId: 'usr_123' });
 * }
 */
export function handleError(error: unknown, context?: any): Response {
  console.error('Error occurred:', error, context);

  // Handle known error types
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return errorResponse(String(error.code), String(error.message), context);
  }

  // Handle generic errors
  return errorResponse(
    ERROR_CODES.INTERNAL_ERROR,
    getErrorMessage(error),
    context
  );
}

/**
 * Validate required parameters
 *
 * @param params - Object containing parameters
 * @param required - Array of required parameter names
 * @returns Error Response if validation fails, null if valid
 *
 * @example
 * const validation = validateRequired(params, ['userEmail', 'password']);
 * if (validation) {
 *   return validation;
 * }
 */
export function validateRequired(
  params: Record<string, any>,
  required: string[]
): Response | null {
  const missing = required.filter(key => !params[key]);

  if (missing.length > 0) {
    return errorResponse(
      ERROR_CODES.MISSING_PARAMETER,
      `Missing required parameters: ${missing.join(', ')}`,
      { missing }
    );
  }

  return null;
}
