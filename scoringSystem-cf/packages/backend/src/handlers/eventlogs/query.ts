/**
 * Event Logs Query Handlers
 * Migrated from GAS scripts/eventlogs_api.js
 *
 * Provides functions to query and filter event logs for projects.
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { getUserGlobalPermissions } from '../../utils/permissions';
import type { SqlBindValue } from '../../types';

/**
 * Filters for event logs query
 */
export interface EventLogFilters {
  userEmails?: string[];      // Filter by user emails
  startTime?: number;          // Start timestamp
  endTime?: number;            // End timestamp
  actions?: string[];          // Filter by actions
  resourceTypes?: string[];    // Filter by resource types
  resourceId?: string;         // Filter by specific resource ID
  limit?: number;              // Limit number of results
  offset?: number;             // Offset for pagination
}

/**
 * Get event logs for a project with optional filters
 * @param env - Cloudflare environment bindings
 * @param projectId - Project ID
 * @param filters - Optional filters
 */
/** eventlogs 查詢回來的一列（含 JOIN 進來的顯示欄位）。 */
interface EventLogRow {
  logId: string;
  projectId: string;
  userId: string | null;
  userEmail: string;
  displayName: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  /** JSON 字串或已經是物件——舊資料兩種都有，讀的時候要判斷。 */
  details: string | Record<string, unknown> | null;
  timestamp: number;
  /** entityType 為 stage 時由 JOIN 帶進來。 */
  stageName?: string | null;
  stageOrder?: number | null;
}

/**
 * 回給前端的事件記錄。
 * 多數欄位是 EventLogRow 的別名（action/resourceType/resourceId），
 * 為了相容舊版前端而保留。
 */
export interface EnrichedEventLog {
  logId: string;
  projectId: string;
  userId: string | null;
  userEmail: string;
  displayName: string;
  eventType: string;
  /** eventType 的別名，向後相容。 */
  action: string;
  entityType: string | null;
  /** entityType 的別名，向後相容。 */
  resourceType: string | null;
  entityId: string | null;
  /** entityId 的別名，向後相容。 */
  resourceId: string | null;
  details: Record<string, unknown> | null;
  timestamp: number;
  stageId?: string | null;
  stageName?: string | null;
  stageOrder?: number | null;
}

/** getEventResourceDetails 回傳的資源內容，依 resourceType 而異。 */
type EventResource =
  | {
      type: 'submission';
      content: string | null;
      submitTime: number;
      submitterEmail: string;
      submitterName: string | null;
      status: string;
    }
  | {
      type: 'comment';
      content: string;
      createdTime: number;
      authorEmail: string;
      authorName: string | null;
    };

/** getUserProjectEventLogs 的內容：權限層級與該使用者看得到的記錄。 */
export interface EventLogPermissionPayload {
  userPermissionLevel?: string;
  logs?: Array<{ userEmail: string }>;
}

/** 上面那份內容包在 successResponse 的 body 裡。 */
interface EventLogPermissionData extends EventLogPermissionPayload {
  data?: EventLogPermissionPayload;
}

export async function getProjectEventLogs(
  env: Env,
  projectId: string,
  filters: EventLogFilters = {}
) {
  try {
    // Build SQL query with filters
    // SECURITY FIX: Use INNER JOIN for users to ensure only valid user logs are returned
    let query = `
      SELECT
        el.*,
        u.displayName,
        u.userEmail,
        s.stageName,
        s.stageOrder
      FROM eventlogs el
      INNER JOIN users u ON el.userId = u.userId
      LEFT JOIN stages s ON el.entityId = s.stageId
                          AND el.entityType = 'stage'
                          AND el.projectId = s.projectId
      WHERE el.projectId = ?
        AND el.userId IS NOT NULL
        AND u.userEmail IS NOT NULL
    `;

    const params: SqlBindValue[] = [projectId];

    // Apply user email filter
    if (filters.userEmails && filters.userEmails.length > 0) {
      const placeholders = filters.userEmails.map(() => '?').join(',');
      query += ` AND u.userEmail IN (${placeholders})`;
      params.push(...filters.userEmails);
    }

    // Apply time range filters
    if (filters.startTime) {
      query += ` AND el.timestamp >= ?`;
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      query += ` AND el.timestamp <= ?`;
      params.push(filters.endTime);
    }

    // Apply action filters (eventType in schema)
    if (filters.actions && filters.actions.length > 0) {
      const placeholders = filters.actions.map(() => '?').join(',');
      query += ` AND el.eventType IN (${placeholders})`;
      params.push(...filters.actions);
    }

    // Apply resource type filters (entityType in schema)
    if (filters.resourceTypes && filters.resourceTypes.length > 0) {
      const placeholders = filters.resourceTypes.map(() => '?').join(',');
      query += ` AND el.entityType IN (${placeholders})`;
      params.push(...filters.resourceTypes);
    }

    // Apply resource ID filter (entityId in schema)
    if (filters.resourceId) {
      query += ` AND el.entityId = ?`;
      params.push(filters.resourceId);
    }

    // Order by timestamp (newest first)
    query += ` ORDER BY el.timestamp DESC`;

    // Apply pagination
    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }


    const result = await env.DB.prepare(query).bind(...params).all<EventLogRow>();


    // Enrich event logs with parsed details and display names
    const enrichedLogs = result.results?.map(log => {
      // Parse details if it's a JSON string
      const parsedDetails: Record<string, unknown> | null =
        typeof log.details === 'string' ? parseJSON(log.details, {}) : log.details;

      const enrichedLog: EnrichedEventLog = {
        logId: log.logId,
        projectId: log.projectId,
        userId: log.userId,
        userEmail: log.userEmail,
        displayName: log.displayName || log.userEmail,
        eventType: log.eventType,
        action: log.eventType, // Alias for backward compatibility
        entityType: log.entityType,
        resourceType: log.entityType, // Alias for backward compatibility
        entityId: log.entityId,
        resourceId: log.entityId, // Alias for backward compatibility
        details: parsedDetails,
        timestamp: log.timestamp
      };

      // Include stage details if available (when entityType is 'stage')
      if (log.stageName !== null && log.stageName !== undefined) {
        enrichedLog.stageId = log.entityId;
        enrichedLog.stageName = log.stageName;
        enrichedLog.stageOrder = log.stageOrder;
      }

      return enrichedLog;
    }) || [];

    return successResponse({
      logs: enrichedLogs,
      total: enrichedLogs.length,
      userPermissionLevel: undefined // Will be set by getUserProjectEventLogs
    });

  } catch (error) {
    console.error('Get project event logs error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to retrieve event logs');
  }
}

/**
 * Get event logs for current user in a project with 4-tier permission levels:
 *
 * Level 1: system_admin / create_project → See ALL logs across all projects
 * Level 2: teacher / observer → See all logs in this project
 * Level 3: member + group leader → See logs of their group members only
 * Level 4: member + group member → See only their own logs
 * Level 5: member (no group) → No access (should not call this API)
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - Current user's email
 * @param projectId - Project ID
 * @param filters - Optional filters
 */
export async function getUserProjectEventLogs(
  env: Env,
  userEmail: string,
  projectId: string,
  filters: EventLogFilters = {}
) {
  try {

    // Get userId from userEmail
    const userResult = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!userResult) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    const userId = userResult.userId as string;

    // Check global permissions (Level 1) using getUserGlobalPermissions
    const globalPermissions = await getUserGlobalPermissions(env.DB, userId);
    const hasSystemAdmin = globalPermissions.includes('system_admin');
    const hasCreateProject = globalPermissions.includes('create_project');
    const hasGlobalAdmin = hasSystemAdmin || hasCreateProject;


    // Level 1: system_admin or create_project → See ALL logs
    if (hasGlobalAdmin) {
      const response = await getProjectEventLogs(env, projectId, filters);
      const responseData = await response.json() as EventLogPermissionData;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = 'admin';


      return successResponse(data);
    }


    // Check project viewer role (Level 2)
    // SECURITY FIX: Check for multiple records to prevent privilege escalation

    const viewerRolesResult = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).all();

    const viewerRoles = viewerRolesResult.results || [];


    // Security check: If user has multiple roles, log warning and use most restrictive (member)
    let viewerRole: string | null = null;
    if (viewerRoles.length > 1) {
      console.warn('⚠️ [SECURITY] User has multiple projectviewers roles!', {
        userEmail,
        projectId,
        roles: viewerRoles.map(r => r.role)
      });
      // Use most restrictive role (member > observer > teacher)
      if (viewerRoles.some(r => r.role === 'member')) {
        viewerRole = 'member';
      } else if (viewerRoles.some(r => r.role === 'observer')) {
        viewerRole = 'observer';
      } else {
        viewerRole = 'teacher';
      }
    } else if (viewerRoles.length === 1) {
      viewerRole = (viewerRoles[0] as { role: string }).role;
    }
    // No viewer row: viewerRole stays null and the checks below fall through to
    // the group-membership path.

    // Level 2: teacher or observer → See all project logs
    if (viewerRole === 'teacher' || viewerRole === 'observer') {
      const response = await getProjectEventLogs(env, projectId, filters);
      const responseData = await response.json() as EventLogPermissionData;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = viewerRole; // 'teacher' or 'observer'


      return successResponse(data);
    }


    // Level 3 & 4: member role - check group membership
    if (viewerRole === 'member') {

      // Check if user is in any group
      const userGroupsResult = await env.DB.prepare(`
        SELECT DISTINCT groupId, role
        FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND isActive = 1
      `).bind(userEmail, projectId).all();

      const userGroups = userGroupsResult.results || [];


      // If no group, deny access (Level 5)
      if (userGroups.length === 0) {
        return successResponse({
          logs: [],
          total: 0,
          userPermissionLevel: 'member_no_group',
          message: 'Members without group assignment cannot view event logs'
        });
      }

      // Check if user is a group leader
      const leaderGroupIds = userGroups
        .filter(ug => ug.role === 'leader')
        .map(ug => ug.groupId);


      // Level 3: Group leader → See logs of all group members
      if (leaderGroupIds.length > 0) {
        const placeholders = leaderGroupIds.map(() => '?').join(',');
        const membersResult = await env.DB.prepare(`
          SELECT DISTINCT userEmail
          FROM usergroups
          WHERE projectId = ? AND groupId IN (${placeholders}) AND isActive = 1
        `).bind(projectId, ...leaderGroupIds).all<{ userEmail: string }>();

        const memberEmails = membersResult.results?.map(m => m.userEmail) || [];
        const allowedUserEmails = Array.from(new Set([userEmail, ...memberEmails]));


        const userFilters: EventLogFilters = {
          ...filters,
          userEmails: allowedUserEmails
        };


        const response = await getProjectEventLogs(env, projectId, userFilters);
        const responseData = await response.json() as EventLogPermissionData;
        const data = responseData.data || responseData;  // Handle nested structure
        data.userPermissionLevel = 'group_leader';


        return successResponse(data);
      }

      // Level 4: Group member → See only own logs

      const userFilters: EventLogFilters = {
        ...filters,
        userEmails: [userEmail]
      };


      const response = await getProjectEventLogs(env, projectId, userFilters);
      const responseData = await response.json() as EventLogPermissionData;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = 'member_in_group';


      return successResponse(data);
    }

    // If no viewer role, deny access
    console.log('📊 [getUserProjectEventLogs] No viewer role - access denied');
    return errorResponse('PERMISSION_DENIED', 'You do not have permission to view event logs');

  } catch (error) {
    console.error('❌ [getUserProjectEventLogs] Error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to retrieve user event logs');
  }
}

/**
 * Get resource details (submission or comment) for event log expansion
 * This function validates that the user has permission to view this resource
 * based on their event log access level.
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - Current user's email (for permission check)
 * @param projectId - Project ID
 * @param resourceType - Type of resource ('submission' or 'comment')
 * @param resourceId - ID of the resource
 */
export async function getEventResourceDetails(
  env: Env,
  userEmail: string,
  projectId: string,
  resourceType: string,
  resourceId: string
) {
  try {
    // First, verify the user has permission to view logs for this resource
    // by checking if the resource appears in their allowed event logs

    // Get the resource owner email first
    let resourceOwnerEmail: string | null = null;

    if (resourceType === 'submission') {
      const submissionOwner = await env.DB.prepare(`
        SELECT submitterEmail FROM submissions_with_status
        WHERE submissionId = ? AND projectId = ?
      `).bind(resourceId, projectId).first<{ submitterEmail: string }>();
      resourceOwnerEmail = submissionOwner?.submitterEmail ?? null;
    } else if (resourceType === 'comment') {
      // comments 存的是 authorEmail；沒有 authorId 這個欄位。
      // 舊版 JOIN 在 c.authorId 上，SQLite 直接報 no such column，
      // 於是 resourceType='comment' 這條路徑必定回 SYSTEM_ERROR。
      const commentOwner = await env.DB.prepare(`
        SELECT authorEmail
        FROM comments
        WHERE commentId = ? AND projectId = ?
      `).bind(resourceId, projectId).first<{ authorEmail: string }>();
      resourceOwnerEmail = commentOwner?.authorEmail ?? null;
    }

    if (!resourceOwnerEmail) {
      return errorResponse('NOT_FOUND', 'Resource not found');
    }

    // Now verify the user has access to logs from this resource owner
    // We do this by checking if any event log for this resource is visible to the user
    const eventLogCheck = await env.DB.prepare(`
      SELECT el.logId
      FROM eventlogs el
      LEFT JOIN users u ON el.userId = u.userId
      WHERE el.projectId = ?
        AND el.entityType = ?
        AND el.entityId = ?
      LIMIT 1
    `).bind(projectId, resourceType, resourceId).first();

    if (!eventLogCheck) {
      return errorResponse('NOT_FOUND', 'No event log found for this resource');
    }

    // Get user's permission level by calling getUserProjectEventLogs with empty filters
    const permissionCheckResponse = await getUserProjectEventLogs(env, userEmail, projectId, {});
    // getUserProjectEventLogs 回的是 successResponse(data)，所以權限層級
    // 在 body.data 底下。舊版讀最外層，永遠是 undefined，下面兩個收窄分支
    // 因此從來沒有執行過——路由層只擋專案層級的 view，等於沒有收窄。
    const permissionBody = await permissionCheckResponse.json() as EventLogPermissionData;
    const permissionData = permissionBody.data ?? permissionBody;
    const userPermissionLevel = permissionData.userPermissionLevel;

    // Validate access based on permission level
    if (userPermissionLevel === 'member_in_group') {
      // Members can only view resources they created
      if (resourceOwnerEmail !== userEmail) {
        return errorResponse('PERMISSION_DENIED', 'You do not have permission to view this resource');
      }
    } else if (userPermissionLevel === 'group_leader') {
      // Group leaders can view resources from their group members
      // Get allowed emails from the permission check
      const allowedEmails = new Set(
        (permissionData.logs ?? []).map(log => log.userEmail)
      );
      if (!allowedEmails.has(resourceOwnerEmail)) {
        return errorResponse('PERMISSION_DENIED', 'You do not have permission to view this resource');
      }
    }
    // admin, teacher, observer can view all resources (no additional check needed)

    // Now fetch the actual resource details
    let resource: EventResource | null = null;

    if (resourceType === 'submission') {
      const submission = await env.DB.prepare(`
        SELECT
          s.submissionId,
          s.contentMarkdown,
          s.submitTime,
          s.submitterEmail,
          s.status,
          u.displayName as submitterName
        FROM submissions_with_status s
        LEFT JOIN users u ON s.submitterEmail = u.userEmail
        WHERE s.submissionId = ? AND s.projectId = ?
      `).bind(resourceId, projectId).first<{
        submissionId: string;
        contentMarkdown: string | null;
        submitTime: number;
        submitterEmail: string;
        status: string;
        submitterName: string | null;
      }>();

      if (submission) {
        resource = {
          type: 'submission',
          content: submission.contentMarkdown,
          submitTime: submission.submitTime,
          submitterEmail: submission.submitterEmail,
          submitterName: submission.submitterName,
          status: submission.status
        };
      }

    } else if (resourceType === 'comment') {
      // 同上：comments 以 authorEmail 關聯 users，沒有 authorId。
      const comment = await env.DB.prepare(`
        SELECT
          c.commentId,
          c.content,
          c.createdTime,
          c.authorEmail,
          u.displayName as authorName
        FROM comments c
        LEFT JOIN users u ON c.authorEmail = u.userEmail
        WHERE c.commentId = ? AND c.projectId = ?
      `).bind(resourceId, projectId).first<{
        commentId: string;
        content: string;
        createdTime: number;
        authorEmail: string;
        authorName: string | null;
      }>();

      if (comment) {
        resource = {
          type: 'comment',
          content: comment.content,
          createdTime: comment.createdTime,
          authorEmail: comment.authorEmail,
          authorName: comment.authorName
        };
      }
    }

    if (!resource) {
      return errorResponse('NOT_FOUND', 'Resource not found');
    }

    return successResponse(resource);

  } catch (error) {
    console.error('Get event resource details error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to retrieve resource details');
  }
}
