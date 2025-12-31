/**
 * @fileoverview Zod schemas for admin-related API endpoints
 * Provides runtime type validation for admin management APIs
 */

import { z } from 'zod';

/**
 * ========================================
 * USER MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Get all users request schema (with optional filters)
 */
export const GetAllUsersRequestSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  groupIds: z.array(z.string()).max(50).optional(),
  sortBy: z.enum(['registrationTime', 'email', 'displayName', 'lastActivityTime']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional()
});

export type GetAllUsersRequest = z.infer<typeof GetAllUsersRequestSchema>;

/**
 * Update user status request schema
 */
export const UpdateUserStatusRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format'),
  status: z.string().min(1)
});

export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequestSchema>;

/**
 * Update user profile request schema (admin version)
 */
export const UpdateUserProfileAdminRequestSchema = z.object({
  userData: z.object({
    userEmail: z.string().email('Invalid email format'),
    displayName: z.string().optional(),
    status: z.string().optional(),
    avatarSeed: z.string().optional(),
    avatarStyle: z.string().optional(),
    avatarOptions: z.record(z.string(), z.any()).optional()
  }).optional(),
  // Support alternative flat format
  userEmail: z.string().email().optional(),
  displayName: z.string().optional(),
  status: z.string().optional(),
  avatarSeed: z.string().optional(),
  avatarStyle: z.string().optional(),
  avatarOptions: z.record(z.string(), z.any()).optional(),
  // Support cached frontend format
  avatarData: z.object({
    avatarSeed: z.string().optional(),
    avatarStyle: z.string().optional(),
    avatarOptions: z.record(z.string(), z.any()).optional()
  }).optional()
});

export type UpdateUserProfileAdminRequest = z.infer<typeof UpdateUserProfileAdminRequestSchema>;

/**
 * Reset user password request schema
 * Backend auto-generates a random password and emails it to user
 */
export const ResetUserPasswordRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format')
});

export type ResetUserPasswordRequest = z.infer<typeof ResetUserPasswordRequestSchema>;

/**
 * Batch update user status request schema
 */
export const BatchUpdateUserStatusRequestSchema = z.object({
  userEmails: z.array(z.string().email()).min(1, 'At least one email is required'),
  status: z.enum(['active', 'inactive'], {
    message: 'Status must be either "active" or "inactive"'
  })
});

export type BatchUpdateUserStatusRequest = z.infer<typeof BatchUpdateUserStatusRequestSchema>;

/**
 * Batch reset password request schema
 * OWASP 2023: Minimum 8 characters for passwords
 */
export const BatchResetPasswordRequestSchema = z.object({
  userEmails: z.array(z.string().email()).min(1, 'At least one email is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});

export type BatchResetPasswordRequest = z.infer<typeof BatchResetPasswordRequestSchema>;

/**
 * Batch operation result item schema
 */
export const BatchOperationResultItemSchema = z.object({
  userEmail: z.string().email(),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional()
});

export type BatchOperationResultItem = z.infer<typeof BatchOperationResultItemSchema>;

/**
 * Batch operation response schema
 */
export const BatchOperationResponseSchema = z.object({
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  results: z.array(BatchOperationResultItemSchema)
});

export type BatchOperationResponse = z.infer<typeof BatchOperationResponseSchema>;

/**
 * Get user global groups request schema
 */
export const GetUserGlobalGroupsRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format')
});

export type GetUserGlobalGroupsRequest = z.infer<typeof GetUserGlobalGroupsRequestSchema>;

/**
 * Get user project groups request schema
 */
export const GetUserProjectGroupsRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format')
});

export type GetUserProjectGroupsRequest = z.infer<typeof GetUserProjectGroupsRequestSchema>;

/**
 * User activity request schema
 */
export const UserActivityRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format'),
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string().optional()
});

export type UserActivityRequest = z.infer<typeof UserActivityRequestSchema>;

/**
 * Unlock user request schema
 */
export const UnlockUserRequestSchema = z.object({
  userEmail: z.string().email('Invalid email format'),
  unlockReason: z.string().min(10, 'Unlock reason must be at least 10 characters'),
  resetLockCount: z.boolean().optional()
});

export type UnlockUserRequest = z.infer<typeof UnlockUserRequestSchema>;

/**
 * ========================================
 * GLOBAL GROUP MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Create global group request schema
 */
export const CreateGlobalGroupRequestSchema = z.object({
  groupData: z.object({
    groupName: z.string().min(1, 'Group name is required'),
    description: z.string().optional(),
    globalPermissions: z.array(z.string()).optional()
  }).optional(),
  // Support flat format
  groupName: z.string().optional(),
  description: z.string().optional(),
  globalPermissions: z.array(z.string()).optional()
});

export type CreateGlobalGroupRequest = z.infer<typeof CreateGlobalGroupRequestSchema>;

/**
 * Update global group request schema
 */
export const UpdateGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  groupData: z.object({
    groupName: z.string().optional(),
    description: z.string().optional(),
    globalPermissions: z.array(z.string()).optional()
  }).optional(),
  // Support flat format
  groupName: z.string().optional(),
  description: z.string().optional(),
  globalPermissions: z.array(z.string()).optional()
});

export type UpdateGlobalGroupRequest = z.infer<typeof UpdateGlobalGroupRequestSchema>;

/**
 * Deactivate global group request schema
 */
export const DeactivateGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required')
});

export type DeactivateGlobalGroupRequest = z.infer<typeof DeactivateGlobalGroupRequestSchema>;

/**
 * Activate global group request schema
 */
export const ActivateGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required')
});

export type ActivateGlobalGroupRequest = z.infer<typeof ActivateGlobalGroupRequestSchema>;

/**
 * Get global group members request schema
 */
export const GetGlobalGroupMembersRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required')
});

export type GetGlobalGroupMembersRequest = z.infer<typeof GetGlobalGroupMembersRequestSchema>;

/**
 * Add user to global group request schema
 */
export const AddUserToGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  userEmail: z.string().email('Invalid email format')
});

export type AddUserToGlobalGroupRequest = z.infer<typeof AddUserToGlobalGroupRequestSchema>;

/**
 * Remove user from global group request schema
 */
export const RemoveUserFromGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  userEmail: z.string().email('Invalid email format')
});

export type RemoveUserFromGlobalGroupRequest = z.infer<typeof RemoveUserFromGlobalGroupRequestSchema>;

/**
 * Batch add users to global group request schema
 */
export const BatchAddUsersToGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  userEmails: z.array(z.string().email()).min(1, 'At least one email is required')
});

export type BatchAddUsersToGlobalGroupRequest = z.infer<typeof BatchAddUsersToGlobalGroupRequestSchema>;

/**
 * Batch remove users from global group request schema
 */
export const BatchRemoveUsersFromGlobalGroupRequestSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  userEmails: z.array(z.string().email()).min(1, 'At least one email is required')
});

export type BatchRemoveUsersFromGlobalGroupRequest = z.infer<typeof BatchRemoveUsersFromGlobalGroupRequestSchema>;

/**
 * Batch deactivate global groups request schema
 */
export const BatchDeactivateGlobalGroupsRequestSchema = z.object({
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required').max(50, 'Cannot deactivate more than 50 groups at once')
});

export type BatchDeactivateGlobalGroupsRequest = z.infer<typeof BatchDeactivateGlobalGroupsRequestSchema>;

/**
 * Batch activate global groups request schema
 */
export const BatchActivateGlobalGroupsRequestSchema = z.object({
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required').max(50, 'Cannot activate more than 50 groups at once')
});

export type BatchActivateGlobalGroupsRequest = z.infer<typeof BatchActivateGlobalGroupsRequestSchema>;

/**
 * ========================================
 * SYSTEM MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Get system logs request schema
 */
export const GetSystemLogsRequestSchema = z.object({
  options: z.object({
    level: z.string().optional(),
    action: z.union([z.string(), z.array(z.string())]).optional(), // Support string or string[]
    userId: z.union([z.string(), z.array(z.string())]).optional(), // Support string or string[]
    userEmail: z.string().optional(), // 🆕 Search for context.userEmail (Login Logs)
    entityType: z.union([z.string(), z.array(z.string())]).optional(), // Support string or string[]
    projectId: z.union([z.string(), z.array(z.string())]).optional(), // Support string or string[]
    functionName: z.string().optional(),
    message: z.string().optional(), // Keyword search for message field
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  }).optional()
});

export type GetSystemLogsRequest = z.infer<typeof GetSystemLogsRequestSchema>;

/**
 * Get entity details request schema
 */
export const GetEntityDetailsRequestSchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity ID is required')
});

export type GetEntityDetailsRequest = z.infer<typeof GetEntityDetailsRequestSchema>;

/**
 * ========================================
 * PROPERTIES MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Update properties request schema
 */
export const UpdatePropertiesRequestSchema = z.object({
  properties: z.record(z.string(), z.any()).refine(
    (props) => Object.keys(props).length > 0,
    { message: 'Properties object cannot be empty' }
  )
});

export type UpdatePropertiesRequest = z.infer<typeof UpdatePropertiesRequestSchema>;

/**
 * ========================================
 * NOTIFICATION MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * List all notifications request schema
 */
export const ListAllNotificationsRequestSchema = z.object({
  targetUserEmail: z.string().email().optional(),
  type: z.string().optional(),
  isRead: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional()
});

export type ListAllNotificationsRequest = z.infer<typeof ListAllNotificationsRequestSchema>;

/**
 * Send single notification request schema
 */
export const SendSingleNotificationRequestSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required')
});

export type SendSingleNotificationRequest = z.infer<typeof SendSingleNotificationRequestSchema>;

/**
 * Send batch notifications request schema
 */
export const SendBatchNotificationsRequestSchema = z.object({
  targetUserEmail: z.string().email().optional(),
  type: z.string().optional(),
  isRead: z.boolean().optional(),
  limit: z.number().int().positive().optional()
});

export type SendBatchNotificationsRequest = z.infer<typeof SendBatchNotificationsRequestSchema>;

/**
 * Delete notification request schema
 */
export const DeleteNotificationAdminRequestSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required')
});

export type DeleteNotificationAdminRequest = z.infer<typeof DeleteNotificationAdminRequestSchema>;

/**
 * ========================================
 * EMAIL LOGS MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Email log filters request schema
 * Enforces maximum limits and valid date ranges
 */
export const EmailLogsQueryRequestSchema = z.object({
  filters: z.object({
    trigger: z.string().optional(),
    recipient: z.string().email('Invalid recipient email').optional(),
    status: z.enum(['sent', 'failed'], {
      message: 'Status must be either "sent" or "failed"'
    }).optional(),
    startDate: z.number().int().positive('Start date must be a positive timestamp').optional(),
    endDate: z.number().int().positive('End date must be a positive timestamp').optional(),
    limit: z.number().int().min(1).max(1000, 'Maximum limit is 1000').default(50),
    offset: z.number().int().nonnegative('Offset cannot be negative').default(0)
  }).refine(
    (data) => {
      // Validate startDate <= endDate if both provided
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'Start date must be before or equal to end date'
    }
  ).optional()
});

export type EmailLogsQueryRequest = z.infer<typeof EmailLogsQueryRequestSchema>;

/**
 * Resend single email request schema
 */
export const ResendEmailRequestSchema = z.object({
  logId: z.string().min(1, 'Log ID is required')
});

export type ResendEmailRequest = z.infer<typeof ResendEmailRequestSchema>;

/**
 * Resend batch emails request schema
 */
export const ResendBatchEmailsRequestSchema = z.object({
  logIds: z.array(z.string()).min(1, 'At least one log ID is required').max(100, 'Cannot resend more than 100 emails at once')
});

export type ResendBatchEmailsRequest = z.infer<typeof ResendBatchEmailsRequestSchema>;

/**
 * ========================================
 * ROBOTS MANAGEMENT SCHEMAS
 * ========================================
 */

/**
 * Notification patrol request schema
 */
export const NotificationPatrolRequestSchema = z.object({
  timeWindowHours: z.number().positive().optional(),
  dryRun: z.boolean().optional()
});

export type NotificationPatrolRequest = z.infer<typeof NotificationPatrolRequestSchema>;

/**
 * ========================================
 * AI SERVICE LOGS MANAGEMENT SCHEMAS
 * ========================================
 */

// Import schemas from rankings.ts to avoid duplication
import { AIServiceTypeSchema, AIServiceCallStatusSchema } from './rankings';

// Re-export for convenience
export { AIServiceTypeSchema };
export { AIServiceCallStatusSchema as AIServiceStatusSchema };

/**
 * AI ranking type enum
 */
export const AIRankingTypeSchema = z.enum([
  'submission',
  'comment'
]);

/**
 * AI service logs query request schema
 */
export const AIServiceLogsQueryRequestSchema = z.object({
  filters: z.object({
    search: z.string().optional(),
    serviceType: AIServiceTypeSchema.optional(),
    rankingType: AIRankingTypeSchema.optional(),
    status: AIServiceCallStatusSchema.optional(),
    providerId: z.string().optional(),
    startDate: z.number().int().positive('Start date must be a positive timestamp').optional(),
    endDate: z.number().int().positive('End date must be a positive timestamp').optional(),
    minTokens: z.number().int().nonnegative().optional(),
    maxTokens: z.number().int().positive().optional(),
    minResponseTime: z.number().int().nonnegative().optional(),
    maxResponseTime: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(1000, 'Maximum limit is 1000').default(50),
    offset: z.number().int().nonnegative('Offset cannot be negative').default(0)
  }).refine(
    (data) => {
      // Validate startDate <= endDate if both provided
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'Start date must be before or equal to end date'
    }
  ).optional()
});

export type AIServiceLogsQueryRequest = z.infer<typeof AIServiceLogsQueryRequestSchema>;
