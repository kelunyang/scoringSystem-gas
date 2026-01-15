/**
 * User Settings Handlers
 * Manages user preferences stored in KV for better performance
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { logGlobalOperation } from '@utils/logging';

/** Default comment page size */
const DEFAULT_COMMENT_PAGE_SIZE = 3;
const MIN_COMMENT_PAGE_SIZE = 3;
const MAX_COMMENT_PAGE_SIZE = 10;

/**
 * Get user's comment page size setting
 * Reads from KV with fallback to default
 */
export async function getCommentPageSize(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Try to get from KV first
    const kvKey = `user_settings:${userEmail}:comment_page_size`;
    const storedValue = await env.KV.get(kvKey);

    const pageSize = storedValue
      ? parseInt(storedValue, 10)
      : DEFAULT_COMMENT_PAGE_SIZE;

    return successResponse({
      commentPageSize: Math.min(Math.max(pageSize, MIN_COMMENT_PAGE_SIZE), MAX_COMMENT_PAGE_SIZE)
    });
  } catch (error) {
    console.error('Get comment page size error:', error);
    // Return default on error
    return successResponse({
      commentPageSize: DEFAULT_COMMENT_PAGE_SIZE
    });
  }
}

/**
 * Update user's comment page size setting
 * Stores in KV for fast access
 */
export async function updateCommentPageSize(
  env: Env,
  userEmail: string,
  pageSize: number
): Promise<Response> {
  try {
    // Validate range
    if (pageSize < MIN_COMMENT_PAGE_SIZE || pageSize > MAX_COMMENT_PAGE_SIZE) {
      return errorResponse(
        'INVALID_INPUT',
        `Comment page size must be between ${MIN_COMMENT_PAGE_SIZE} and ${MAX_COMMENT_PAGE_SIZE}`
      );
    }

    // Store in KV (expires in 1 year, but effectively permanent for active users)
    const kvKey = `user_settings:${userEmail}:comment_page_size`;
    await env.KV.put(kvKey, String(pageSize), {
      expirationTtl: 365 * 24 * 60 * 60 // 1 year
    });

    // Log the operation
    await logGlobalOperation(env, userEmail, 'setting_updated', 'user', userEmail, {
      setting: 'commentPageSize',
      newValue: pageSize
    });

    return successResponse({
      commentPageSize: pageSize
    }, 'Comment page size updated successfully');
  } catch (error) {
    console.error('Update comment page size error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update comment page size');
  }
}

/**
 * Get all user settings (batch endpoint)
 * Returns all user preferences from KV
 */
export async function getAllUserSettings(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Get comment page size
    const commentPageSizeKey = `user_settings:${userEmail}:comment_page_size`;
    const commentPageSizeValue = await env.KV.get(commentPageSizeKey);
    const commentPageSize = commentPageSizeValue
      ? parseInt(commentPageSizeValue, 10)
      : DEFAULT_COMMENT_PAGE_SIZE;

    return successResponse({
      commentPageSize: Math.min(Math.max(commentPageSize, MIN_COMMENT_PAGE_SIZE), MAX_COMMENT_PAGE_SIZE)
    });
  } catch (error) {
    console.error('Get all user settings error:', error);
    // Return defaults on error
    return successResponse({
      commentPageSize: DEFAULT_COMMENT_PAGE_SIZE
    });
  }
}
