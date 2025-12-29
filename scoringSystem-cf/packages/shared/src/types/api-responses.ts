/**
 * @fileoverview Shared API response type definitions
 * Used for type-safe Response.json() handling across backend
 */

/**
 * Generic API response wrapper
 * Standard format for all API responses
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Settlement API response data
 */
export interface SettlementResponseData {
  settlementId?: string;
  stageId?: string;
  projectId?: string;
  totalGroups?: number;
  totalPoints?: number;
}

/**
 * Session validation response data
 */
export interface ValidationSessionData {
  user?: {
    userId: string;
    userEmail: string;
    displayName: string;
    status: string;
    avatarSeed?: string;
    avatarStyle?: string;
    avatarOptions?: string;
  };
  permissions?: string[];
  projects?: Array<{
    projectId: string;
    projectName: string;
    role: string;
  }>;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
