/**
 * @fileoverview Unified error handling utilities
 * @module ErrorHandling
 */

// ============ ERROR TYPES ============

/**
 * Custom error types for better error handling
 */
class ValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

class PermissionError extends Error {
  constructor(message, code = 'ACCESS_DENIED') {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
  }
}

class DatabaseError extends Error {
  constructor(message, code = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

class NotFoundError extends Error {
  constructor(message, code = 'NOT_FOUND') {
    super(message);
    this.name = 'NotFoundError';
    this.code = code;
  }
}

// ============ ERROR HANDLING ============

/**
 * Enhanced error logging with context
 * @param {string} operation - Operation name
 * @param {Error} error - Error object
 * @param {Object} context - Additional context information
 */
function logErrorWithContext(operation, error, context = {}) {
  const errorInfo = {
    operation: operation,
    errorType: error.name || 'UnknownError',
    errorMessage: error.message,
    errorCode: error.code,
    timestamp: getCurrentTimestamp(),
    context: context,
    stack: error.stack
  };
  
  // Log to console with structure
  console.error(`[ERROR] ${operation}:`, errorInfo);
  
  // In production, you might also want to:
  // - Send to error tracking service
  // - Write to error log sheet
  // - Send alerts for critical errors
  
  return errorInfo;
}

/**
 * Create standardized error response based on error type
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
function createErrorResponseFromException(error, context = {}) {
  // Log the error with context
  logErrorWithContext(context.operation || 'Unknown Operation', error, context);
  
  // Handle specific error types
  if (error instanceof ValidationError) {
    return createErrorResponse(error.code || 'VALIDATION_ERROR', error.message);
  }
  
  if (error instanceof PermissionError) {
    return createErrorResponse(error.code || 'ACCESS_DENIED', error.message);
  }
  
  if (error instanceof DatabaseError) {
    return createErrorResponse(error.code || 'DATABASE_ERROR', 'Database operation failed');
  }
  
  if (error instanceof NotFoundError) {
    return createErrorResponse(error.code || 'NOT_FOUND', error.message);
  }
  
  // Default system error
  return createErrorResponse('SYSTEM_ERROR', 'An unexpected error occurred');
}

/**
 * Wrap function with error handling
 * @param {Function} fn - Function to wrap
 * @param {string} operationName - Name of the operation
 * @returns {Function} Wrapped function with error handling
 */
function withErrorHandling(fn, operationName) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      const context = {
        operation: operationName,
        arguments: args.length > 0 ? args : undefined
      };
      return createErrorResponseFromException(error, context);
    }
  };
}

// ============ VALIDATION HELPERS ============

/**
 * Assert condition with error
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @param {string} code - Error code
 * @throws {ValidationError} If condition is false
 */
function assert(condition, message, code = 'VALIDATION_ERROR') {
  if (!condition) {
    throw new ValidationError(message, code);
  }
}

/**
 * Assert not null or undefined
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {ValidationError} If value is null or undefined
 */
function assertNotNull(value, fieldName) {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`, 'MISSING_FIELD');
  }
}

/**
 * Assert valid email format
 * @param {string} email - Email to validate
 * @throws {ValidationError} If email format is invalid
 */
function assertValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
  }
}

// ============ PERMISSION HELPERS ============

/**
 * Require specific permission with proper error
 * @param {boolean} hasPermission - Whether user has permission
 * @param {string} permissionName - Name of required permission
 * @throws {PermissionError} If permission is missing
 */
function requirePermission(hasPermission, permissionName) {
  if (!hasPermission) {
    throw new PermissionError(`${permissionName} permission required`, 'INSUFFICIENT_PERMISSIONS');
  }
}

/**
 * Require teacher privilege
 * @param {string} userEmail - User email to check
 * @throws {PermissionError} If user doesn't have teacher privilege
 */
function requireTeacherPrivilege(userEmail) {
  if (!hasTeacherPrivilege(userEmail)) {
    throw new PermissionError('Teacher privilege required', 'TEACHER_PRIVILEGE_REQUIRED');
  }
}

// Export functions and classes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Error classes
    ValidationError,
    PermissionError,
    DatabaseError,
    NotFoundError,
    // Error handling functions
    logErrorWithContext,
    createErrorResponseFromException,
    withErrorHandling,
    // Validation helpers
    assert,
    assertNotNull,
    assertValidEmail,
    // Permission helpers
    requirePermission,
    requireTeacherPrivilege
  };
}