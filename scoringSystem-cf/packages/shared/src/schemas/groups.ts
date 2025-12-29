/**
 * @fileoverview Zod schemas for group-related API endpoints
 * Provides runtime type validation for group management APIs
 */

import { z } from 'zod';

/**
 * Group data schema for creation
 */
export const GroupDataSchema = z.object({
  groupName: z.string().min(1, 'Group name is required').max(200, 'Group name too long'),
  description: z.string().optional(),
  allowChange: z.boolean().optional()
});

export type GroupData = z.infer<typeof GroupDataSchema>;

/**
 * Create group request schema
 */
export const CreateGroupRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupData: GroupDataSchema
});

export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

/**
 * Batch create groups request schema
 */
export const BatchCreateGroupsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupCount: z.number().int().min(1, 'Group count must be at least 1').max(20, 'Group count cannot exceed 20'),
  allowChange: z.boolean().optional(),
  namePrefix: z.string().optional()
});

export type BatchCreateGroupsRequest = z.infer<typeof BatchCreateGroupsSchema>;

/**
 * Get group details request schema
 */
export const GetGroupDetailsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required')
});

export type GetGroupDetailsRequest = z.infer<typeof GetGroupDetailsRequestSchema>;

/**
 * Group updates schema
 */
export const GroupUpdatesSchema = z.object({
  groupName: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  allowChange: z.boolean().optional()
});

export type GroupUpdates = z.infer<typeof GroupUpdatesSchema>;

/**
 * Update group request schema
 */
export const UpdateGroupRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  updates: GroupUpdatesSchema
});

export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;

/**
 * Delete group request schema
 */
export const DeleteGroupRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required')
});

export type DeleteGroupRequest = z.infer<typeof DeleteGroupRequestSchema>;

/**
 * Add member to group request schema
 */
export const AddMemberRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  userEmail: z.string().email('Invalid email format'),
  role: z.string().optional().default('member')
});

export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

/**
 * Remove member from group request schema
 */
export const RemoveMemberRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  userEmail: z.string().email('Invalid email format')
});

export type RemoveMemberRequest = z.infer<typeof RemoveMemberRequestSchema>;

/**
 * List project groups request schema
 */
export const ListGroupsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  includeInactive: z.boolean().optional().default(false)
});

export type ListGroupsRequest = z.infer<typeof ListGroupsRequestSchema>;

/**
 * Get group mention data request schema
 */
export const GetGroupMentionDataRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required')
});

export type GetGroupMentionDataRequest = z.infer<typeof GetGroupMentionDataRequestSchema>;

/**
 * Batch update group status request schema
 */
export const BatchUpdateGroupStatusSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required').max(50, 'Cannot update more than 50 groups at once'),
  status: z.enum(['active', 'inactive'])
});

export type BatchUpdateGroupStatusRequest = z.infer<typeof BatchUpdateGroupStatusSchema>;

/**
 * Batch update group allowChange request schema
 */
export const BatchUpdateGroupAllowChangeSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required').max(50, 'Cannot update more than 50 groups at once'),
  allowChange: z.boolean()
});

export type BatchUpdateGroupAllowChangeRequest = z.infer<typeof BatchUpdateGroupAllowChangeSchema>;

/**
 * Batch global group action request schema
 */
export const BatchGlobalGroupActionSchema = z.object({
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required').max(50, 'Cannot process more than 50 groups at once')
});

export type BatchGlobalGroupActionRequest = z.infer<typeof BatchGlobalGroupActionSchema>;

/**
 * Member data schema for batch add
 */
export const MemberDataSchema = z.object({
  userEmail: z.string().email('Invalid email format'),
  role: z.enum(['member', 'leader']).default('member')
});

export type MemberData = z.infer<typeof MemberDataSchema>;

/**
 * Batch add members request schema
 */
export const BatchAddMembersRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  members: z.array(MemberDataSchema).min(1, 'At least one member is required').max(100, 'Cannot add more than 100 members at once')
});

export type BatchAddMembersRequest = z.infer<typeof BatchAddMembersRequestSchema>;

/**
 * Batch remove members request schema
 */
export const BatchRemoveMembersRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  userEmails: z.array(z.string().email('Invalid email format')).min(1, 'At least one user email is required').max(100, 'Cannot remove more than 100 members at once')
});

export type BatchRemoveMembersRequest = z.infer<typeof BatchRemoveMembersRequestSchema>;

/**
 * Update member role request schema
 */
export const UpdateMemberRoleRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  userEmail: z.string().email('Invalid email format'),
  newRole: z.enum(['member', 'leader'], { message: 'Role must be either "member" or "leader"' })
});

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

/**
 * Role update data schema for batch update
 */
export const RoleUpdateDataSchema = z.object({
  userEmail: z.string().email('Invalid email format'),
  newRole: z.enum(['member', 'leader'], { message: 'Role must be either "member" or "leader"' })
});

export type RoleUpdateData = z.infer<typeof RoleUpdateDataSchema>;

/**
 * Batch update member roles request schema
 */
export const BatchUpdateRolesRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  updates: z.array(RoleUpdateDataSchema).min(1, 'At least one role update is required').max(100, 'Cannot update more than 100 members at once')
});

export type BatchUpdateRolesRequest = z.infer<typeof BatchUpdateRolesRequestSchema>;
