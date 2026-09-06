/**
 * @fileoverview Standardized API response helpers
 * Maintains consistent response format across all endpoints
 */

/**
 * The response contract lives in @repo/shared so the frontend reads back
 * exactly what these helpers write. Re-exported here because every handler
 * already imports from this module.
 */
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse
} from '@repo/shared/types/api-responses';

import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse
} from '@repo/shared/types/api-responses';
import type { TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * 一個「帶 body 型別」的 JSON Response。
 *
 * DOM 的 `Response` 不帶 body 資訊，所以 handler 只要宣告回傳 `Response`，
 * Hono 的 RPC 推導就只能得到 `unknown`——前端拿到的每個回應都要自己猜。
 * Hono 官方的做法就是讓介面同時繼承 `Response` 與 `TypedResponse`
 * （見 hono/dist/types/types.d.ts 的 NotFoundResponse 範例）。
 *
 * runtime 依然是一個普通的 JSON Response，這裡只是把「body 是什麼形狀」
 * 這件事告訴型別系統。
 */
export interface JsonResponse<T, S extends ContentfulStatusCode = ContentfulStatusCode>
  extends Response, TypedResponse<T, S, 'json'> {}

/** @deprecated Use ApiSuccessResponse. */
export type SuccessResponse<T = unknown> = ApiSuccessResponse<T>;
/** @deprecated Use ApiErrorResponse. */
export type ErrorResponse = ApiErrorResponse;

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
export function successResponse<T>(data: T, message?: string): JsonResponse<ApiSuccessResponse<T>, 200> {
  const responseBody: ApiSuccessResponse<T> = {
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
  }) as JsonResponse<ApiSuccessResponse<T>, 200>;
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
  /** 附在 error.context 上一起序列化，不會被讀取。 */
  context?: unknown
): JsonResponse<ApiErrorResponse> {
  const errorBody: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(context ? { context } : {})
    }
  };

  const status = getHttpStatus(code);

  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  }) as JsonResponse<ApiErrorResponse>;
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
  SUDO_NO_WRITE: 'SUDO_NO_WRITE',
  NOT_GROUP_MEMBER: 'NOT_GROUP_MEMBER',
  NOT_GROUP_LEADER: 'NOT_GROUP_LEADER',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  PROPOSAL_NOT_FOUND: 'PROPOSAL_NOT_FOUND',

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
  MISSING_FIELDS: 'MISSING_FIELDS',
  PROPOSAL_NOT_PENDING: 'PROPOSAL_NOT_PENDING',
  NO_GROUP_MEMBERS: 'NO_GROUP_MEMBERS',
  NO_VOTES: 'NO_VOTES',
  NOT_ALL_VOTED: 'NOT_ALL_VOTED',
  PROPOSAL_PASSED: 'PROPOSAL_PASSED',
  RESET_LIMIT_EXCEEDED: 'RESET_LIMIT_EXCEEDED',
  RESET_FAILED: 'RESET_FAILED',
  ALREADY_WITHDRAWN: 'ALREADY_WITHDRAWN',
  CANNOT_WITHDRAW: 'CANNOT_WITHDRAW',
  CANNOT_WITHDRAW_SETTLED: 'CANNOT_WITHDRAW_SETTLED',
  WITHDRAW_FAILED: 'WITHDRAW_FAILED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Error code → HTTP status.
 *
 * Anything absent falls back to 500, and for a long time most codes were
 * absent: 115 of the 167 codes the handlers actually pass to errorResponse()
 * were missing, so 「Insufficient permissions」(PERMISSION_DENIED),
 * 「Comment not found」(COMMENT_NOT_FOUND) and 「You have already voted」
 * (ALREADY_VOTED) all left as 500 Internal Server Error. Clients could not
 * tell their own mistakes from ours, and the 5xx rate was meaningless.
 *
 * Conflicts (USER_EXISTS, INVITATION_EXISTS, ALREADY_VOTED …) map to 400
 * rather than 409, matching the codes that were already in the table
 * (USERNAME_TAKEN, GROUP_EXISTS, ALREADY_SUBMITTED).
 *
 * `tests/error-response-shape.test.ts` fails if a code is used without
 * appearing here.
 */
export const HTTP_STATUS_BY_ERROR_CODE: Readonly<Record<string, number>> = {
  // 401 — not authenticated
  NO_SESSION: 401,
  UNAUTHORIZED: 401,
  INVALID_SESSION: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  NO_TOKEN: 401,
  INVALID_TOKEN: 401,
  AUTH_FAILED: 401,

  // 403 — authenticated, but not allowed
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  NOT_PROJECT_MEMBER: 403,
  USER_DISABLED: 403,
  ACCESS_DENIED: 403,
  /** 階段狀態不允許這個操作（例如已暫停時發評論） */
  STAGE_STATUS_NOT_ALLOWED: 403,
  /** Cloudflare Email 測試失敗——是設定或外部服務的問題，不是伺服器錯誤 */
  CF_EMAIL_TEST_FAILED: 400,
  /** 批次重設只有部分成功 */
  PARTIAL_RESET_FAILURE: 500,
  SUDO_NO_WRITE: 403,
  NOT_GROUP_MEMBER: 403,
  NOT_GROUP_LEADER: 403,
  NOT_AUTHORIZED: 403,
  PERMISSION_DENIED: 403,
  NO_ACCESS: 403,
  TEACHER_ONLY: 403,
  NOT_PARTICIPANT: 403,
  NOT_IN_GROUP: 403,
  NOT_SAME_GROUP: 403,
  NOT_ELIGIBLE: 403,
  REPLY_NOT_ALLOWED: 403,
  VOTING_NOT_ALLOWED: 403,
  OPERATION_NOT_ALLOWED: 403,
  STAGE_PAUSED: 403,

  // 404 — no such thing
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  STAGE_NOT_FOUND: 404,
  SUBMISSION_NOT_FOUND: 404,
  GROUP_NOT_FOUND: 404,
  ENTITY_NOT_FOUND: 404,
  PROPOSAL_NOT_FOUND: 404,
  COMMENT_NOT_FOUND: 404,
  PARENT_NOT_FOUND: 404,
  INVITATION_NOT_FOUND: 404,
  TRANSACTION_NOT_FOUND: 404,
  SETTLEMENT_NOT_FOUND: 404,
  REACTION_NOT_FOUND: 404,
  VIEWER_NOT_FOUND: 404,
  MEMBERSHIP_NOT_FOUND: 404,
  NO_INVITATION_CODE: 404,
  NO_ACTIVE_SUBMISSION: 404,
  NO_TRANSACTIONS: 404,

  // 426 — protocol upgrade required
  NOT_WEBSOCKET: 426,

  // 429 — slow down
  EMAIL_RATE_LIMITED: 429,

  // 400 — bad input, or an operation the current state forbids
  VALIDATION_ERROR: 400,
  VALIDATION_FAILED: 400,
  INVALID_INPUT: 400,
  INVALID_PARAMS: 400,
  INVALID_DATA: 400,
  INVALID_REFERENCE: 400,
  INVALID_ENTITY_TYPE: 400,
  UNSUPPORTED_ENTITY_TYPE: 400,
  MISSING_PARAMETER: 400,
  MISSING_FIELDS: 400,
  MISSING_REASON: 400,
  MISSING_PROJECT_ID: 400,
  MISSING_STAGE_ID: 400,
  NO_CHANGES: 400,
  NO_TARGET_EMAIL: 400,
  NOT_CONFIGURED: 400,
  CONNECTION_FAILED: 400,
  AI_CONNECTION_FAILED: 400,
  DEPRECATED: 400,

  // 400 — invitations
  INVALID_INVITATION_CODE: 400,
  INVALID_INVITATION: 400,
  INVITATION_EXISTS: 400,
  INVITATION_EXPIRED: 400,
  INVITATION_NOT_ACTIVE: 400,
  INVITATION_ALREADY_USED: 400,
  EMAIL_MISMATCH: 400,
  TOO_MANY_CODES: 400,

  // 400 — accounts and membership
  USERNAME_TAKEN: 400,
  EMAIL_TAKEN: 400,
  USER_EXISTS: 400,
  EMAIL_ALREADY_EXISTS: 400,
  USER_NOT_LOCKED: 400,
  USER_ALREADY_IN_GROUP: 400,
  USER_ALREADY_IN_PROJECT_GROUP: 400,
  USER_NOT_IN_GROUP: 400,
  INVALID_ROLE: 400,
  ROLE_CONFLICT: 400,
  GROUP_EXISTS: 400,
  GROUP_LOCKED: 400,
  GROUP_NOT_EMPTY: 400,
  GROUP_HAS_DATA: 400,
  GROUP_HAS_ACTIVE_SUBMISSION: 400,
  NO_ACTIVE_MEMBERS: 400,
  NO_GROUP_MEMBERS: 400,
  INVALID_GROUPS: 400,
  LIMIT_EXCEEDED: 400,

  // 400 — stages and submissions
  STAGE_NOT_ACTIVE: 400,
  STAGE_NOT_COMPLETED: 400,
  STAGE_ALREADY_SETTLED: 400,
  INVALID_STAGE: 400,
  INVALID_STAGE_STATUS: 400,
  INVALID_STATUS: 400,
  INVALID_OPERATION: 400,
  INVALID_TARGET: 400,
  INVALID_HOURS: 400,
  SUBMISSION_DEADLINE_PASSED: 400,
  ALREADY_SUBMITTED: 400,
  SUBMISSION_WITHDRAWN: 400,
  SUBMISSION_NOT_APPROVED: 400,
  INVALID_SUBMISSION: 400,
  ALREADY_WITHDRAWN: 400,
  CANNOT_WITHDRAW: 400,
  CANNOT_WITHDRAW_SETTLED: 400,
  CANNOT_WITHDRAW_APPROVED: 400,
  WITHDRAW_BLOCKED_VOTED: 400,
  RESTORE_BLOCKED_VOTED: 400,
  RESTORE_BLOCKED_APPROVED: 400,
  CAN_ONLY_DELETE_FINAL_VERSION: 400,

  // 400 — voting, ranking, settlement
  ALREADY_VOTED: 400,
  NO_VOTES: 400,
  NOT_ALL_VOTED: 400,
  VOTING_LOCKED: 400,
  DUPLICATE_AUTHOR: 400,
  EMPTY_RANKINGS: 400,
  INVALID_RANK: 400,
  INVALID_RANKS: 400,
  INVALID_RANKING: 400,
  INVALID_RANKING_DATA: 400,
  INVALID_COMMENT: 400,
  INVALID_COMMENT_RANKING: 400,
  INVALID_SUBMISSION_RANKING: 400,
  INVALID_MENTION: 400,
  NESTED_REPLY_NOT_ALLOWED: 400,
  TOO_MANY_COMMENTS: 400,
  PROPOSAL_EXISTS: 400,
  PROPOSAL_PASSED: 400,
  PROPOSAL_NOT_PENDING: 400,
  PROPOSAL_NOT_VOTABLE: 400,
  PROPOSAL_SETTLED: 400,
  PROPOSAL_WITHDRAWN: 400,
  SETTLED_PROPOSAL_EXISTS: 400,
  SETTLEMENT_IN_PROGRESS: 400,
  ALREADY_REVERSED: 400,
  RESET_LIMIT_EXCEEDED: 400,
  RESET_FAILED: 400,
  INVALID_REWARD_POOL: 400,
  DISTRIBUTION_EXCEEDS_POOL: 400,
  COMMENT_DISTRIBUTION_EXCEEDS_POOL: 400,
  INSUFFICIENT_BALANCE: 400,
  TRANSACTION_FAILED: 400,

  // 500 — ours, not theirs
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
  UNKNOWN_ERROR: 500,
  SERVER_ERROR: 500,
  SYSTEM_ERROR: 500,
  DB_ERROR: 500,
  DATABASE_BUSY: 500,
  QUERY_ERROR: 500,
  QUERY_GENERATION_FAILED: 500,
  PATROL_ERROR: 500,
  EMAIL_FAILED: 500,
  EMAIL_QUEUE_FAILED: 500,
  UPDATE_FAILED: 500,
  WITHDRAW_FAILED: 500,
  VOTE_FAILED: 500,
  SUBMIT_VOTE_FAILED: 500,
  SUBMIT_RANKING_FAILED: 500,
  BATCH_CLONE_FAILED: 500,
  BATCH_OPERATION_FAILED: 500,
  CHECK_ELIGIBILITY_FAILED: 500,
  FETCH_VERSIONS_FAILED: 500,
  GET_RANKINGS_FAILED: 500,
  GET_RANKING_HISTORY_FAILED: 500,
  GET_SETTLEMENT_FAILED: 500,
  GET_STAGE_RANKINGS_FAILED: 500,
  GET_STATUS_FAILED: 500,
  STAGE_STATUS_CHECK_FAILED: 500,
  CUSTOM: 500
};

/**
 * Convert error code to HTTP status code.
 * Unknown codes fall back to 500 — see HTTP_STATUS_BY_ERROR_CODE.
 */
export function getHttpStatus(errorCode: string): number {
  return HTTP_STATUS_BY_ERROR_CODE[errorCode] ?? 500;
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
export function jsonResponse<R extends ApiResponse<unknown>>(
  response: R,
  statusOverride?: number
): JsonResponse<R | ApiErrorResponse> {
  // Handle invalid response objects
  let body: ApiResponse<unknown> = response;
  if (!response || typeof response !== 'object') {
    console.error('Invalid response object passed to jsonResponse:', response);
    body = {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Invalid response format'
      }
    };
  }

  const status = statusOverride || (body.success ? 200 : getHttpStatus(body.error?.code || ERROR_CODES.INTERNAL_ERROR));

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  }) as JsonResponse<R | ApiErrorResponse>;
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
 * Did this D1 error come from a UNIQUE constraint?
 *
 * The handlers use it to turn a lost insert race into a meaningful message
 * ("this email is already registered") instead of a 500. Pass `column` to
 * narrow to one constraint — D1 puts the column name in the message.
 *
 * @example
 * if (isUniqueConstraintViolation(error, 'userEmail')) {
 *   return errorResponse('EMAIL_TAKEN', '這個信箱已經註冊過了');
 * }
 */
export function isUniqueConstraintViolation(error: unknown, column?: string): boolean {
  const message = getErrorMessage(error);
  if (!message.includes('UNIQUE constraint failed')) return false;
  return column ? message.includes(column) : true;
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
export function handleError(error: unknown, context?: unknown): Response {
  console.error('Error occurred:', error, context);

  // Handle SudoWriteBlockedError - check by name since it's from a different module
  if (error instanceof Error && error.name === 'SudoWriteBlockedError') {
    return errorResponse(
      ERROR_CODES.SUDO_NO_WRITE,
      'SUDO 模式為唯讀，無法進行寫入操作',
      context
    );
  }

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
  params: Record<string, unknown>,
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
