/**
 * @fileoverview Zod schemas for user-related API endpoints
 * Provides runtime type validation for user management APIs
 */

import { z } from 'zod';

/**
 * Get user profile request schema
 */
export const GetUserProfileRequestSchema = z.object({
  targetUserId: z.string().optional()
});

export type GetUserProfileRequest = z.infer<typeof GetUserProfileRequestSchema>;

/**
 * Update user profile request schema
 */
export const UpdateUserProfileRequestSchema = z.object({
  updates: z.object({
    displayName: z.string().optional(),
    preferences: z.record(z.string(), z.any()).optional()
  })
});

export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileRequestSchema>;

/**
 * Update user avatar request schema
 */
export const UpdateUserAvatarRequestSchema = z.object({
  avatarData: z.object({
    avatarSeed: z.string().optional(),
    avatarStyle: z.string().optional(),
    avatarOptions: z.record(z.string(), z.any()).optional()
  })
});

export type UpdateUserAvatarRequest = z.infer<typeof UpdateUserAvatarRequestSchema>;

/**
 * Search users request schema
 */
export const SearchUsersRequestSchema = z.object({
  query: z.string().default(''),
  limit: z.number().int().positive().optional().default(10)
});

export type SearchUsersRequest = z.infer<typeof SearchUsersRequestSchema>;

/**
 * Get user display names request schema
 */
export const GetUserDisplayNamesRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmails: z.array(z.string().email()).min(1, 'At least one email is required')
});

export type GetUserDisplayNamesRequest = z.infer<typeof GetUserDisplayNamesRequestSchema>;
