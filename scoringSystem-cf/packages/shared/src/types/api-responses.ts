/**
 * @fileoverview The API response contract, shared by backend and frontend.
 *
 * There is one shape, and this is it. Until 2026-09-05 there were eight
 * competing declarations of `ApiResponse` across the three packages with
 * three different ideas of what `error` was — a string here, `{ code,
 * message }` there — and the backend itself emitted both. Nothing referenced
 * this file; every consumer had rolled its own. See
 * `backend/tests/error-response-shape.test.ts` for what that cost.
 *
 * `successResponse()` and `errorResponse()` in
 * `backend/src/utils/response.ts` are the only things that build these
 * bodies; the frontend reads them back through `ApiResponse`.
 */

/**
 * A request that worked.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  /** Human-readable note about what happened. Not an error. */
  message?: string;
}

/**
 * A request that did not work.
 *
 * `error` is always an object — never a bare string. `code` drives the HTTP
 * status (see HTTP_STATUS_BY_ERROR_CODE) and is what callers should branch
 * on; `message` is for the user.
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    context?: unknown;
    /** Remaining attempts, for 2FA verification. */
    attemptsLeft?: number;
  };
}

/**
 * Every API response is one or the other.
 *
 * Discriminated on `success`, so reading `.data` without checking it is a
 * type error rather than a runtime `undefined`:
 *
 * ```ts
 * const response = await httpResponse.json() as ApiResponse<Project[]>
 * if (!response.success) throw new Error(response.error.message)
 * return response.data
 * ```
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * A page of results, carried as the `data` of an ApiSuccessResponse.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
