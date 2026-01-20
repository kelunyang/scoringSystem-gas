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
export async function getProjectEventLogs(
  env: Env,
  projectId: string,
  filters: EventLogFilters = {}
): Promise<Response> {
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

    const params: any[] = [projectId];

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

    console.log('🔍 [DEBUG-SQL] Executing getProjectEventLogs query:', {
      projectId,
      filterApplied: {
        userEmails: filters.userEmails || 'none',
        userEmailsCount: filters.userEmails?.length || 0,
        startTime: filters.startTime || 'none',
        endTime: filters.endTime || 'none',
        actions: filters.actions || 'none',
        resourceTypes: filters.resourceTypes || 'none'
      },
      params: params,
      paramsCount: params.length,
      sqlQuery: query
    });

    const result = await env.DB.prepare(query).bind(...params).all();

    const sampleLogs = result.results?.slice(0, 5).map((log: any) => ({
      logId: log.logId,
      eventType: log.eventType,
      userEmail: log.userEmail,
      userId: log.userId,
      timestamp: log.timestamp
    })) || [];

    const uniqueUserEmails = Array.from(new Set(result.results?.map((log: any) => log.userEmail) || []));

    console.log('🔍 [DEBUG-SQL] Query results:', {
      totalRows: result.results?.length || 0,
      success: result.success,
      uniqueUserEmails: uniqueUserEmails,
      uniqueUserCount: uniqueUserEmails.length,
      sampleLogs: sampleLogs,
      expectedUserEmails: filters.userEmails || 'all users'
    });

    // Enrich event logs with parsed details and display names
    const enrichedLogs = result.results?.map((log: any) => {
      // Parse details if it's a JSON string
      let parsedDetails = log.details;
      if (typeof log.details === 'string') {
        parsedDetails = parseJSON(log.details, {});
      }

      const enrichedLog: any = {
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
): Promise<Response> {
  try {
    console.log('🔍 [DEBUG-START] getUserProjectEventLogs called with:', {
      userEmail,
      projectId,
      filters: JSON.stringify(filters),
      timestamp: new Date().toISOString()
    });

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

    console.log('🔍 [DEBUG-LEVEL1] Global permission check:', {
      userId,
      userEmail,
      globalPermissions: globalPermissions,
      hasSystemAdmin,
      hasCreateProject,
      hasGlobalAdmin,
      decision: hasGlobalAdmin ? 'GRANT admin access' : 'Check project-level permissions'
    });

    // Level 1: system_admin or create_project → See ALL logs
    if (hasGlobalAdmin) {
      console.log('⚠️ [DEBUG-LEVEL1] User identified as ADMIN - will see ALL logs!', {
        reason: hasSystemAdmin ? 'system_admin permission' : 'create_project permission',
        userEmail
      });
      const response = await getProjectEventLogs(env, projectId, filters);
      const responseData = await response.json() as any;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = 'admin';

      console.log('🔍 [DEBUG-LEVEL1] Returning admin logs:', {
        totalLogs: data.total,
        userPermissionLevel: 'admin'
      });

      return successResponse(data);
    }

    console.log('✅ [DEBUG-LEVEL1] User is NOT admin, checking project-level roles...');

    // Check project viewer role (Level 2)
    // SECURITY FIX: Check for multiple records to prevent privilege escalation
    console.log('🔍 [DEBUG-LEVEL2] Checking projectviewers table...');

    const viewerRolesResult = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).all();

    const viewerRoles = viewerRolesResult.results || [];

    console.log('🔍 [DEBUG-LEVEL2] projectviewers query result:', {
      userEmail,
      projectId,
      totalRecords: viewerRoles.length,
      roles: viewerRoles.map((r: any) => r.role),
      rawResult: viewerRoles
    });

    // Security check: If user has multiple roles, log warning and use most restrictive (member)
    let viewerRole: string | null = null;
    if (viewerRoles.length > 1) {
      console.warn('⚠️ [SECURITY] User has multiple projectviewers roles!', {
        userEmail,
        projectId,
        roles: viewerRoles.map((r: any) => r.role)
      });
      // Use most restrictive role (member > observer > teacher)
      if (viewerRoles.some((r: any) => r.role === 'member')) {
        viewerRole = 'member';
      } else if (viewerRoles.some((r: any) => r.role === 'observer')) {
        viewerRole = 'observer';
      } else {
        viewerRole = 'teacher';
      }
      console.log('🔍 [DEBUG-LEVEL2] Multiple roles detected, using most restrictive:', viewerRole);
    } else if (viewerRoles.length === 1) {
      viewerRole = (viewerRoles[0] as any).role;
      console.log('🔍 [DEBUG-LEVEL2] Single role found:', viewerRole);
    } else {
      console.log('🔍 [DEBUG-LEVEL2] No projectviewers role found, will check usergroups next');
    }

    // Level 2: teacher or observer → See all project logs
    if (viewerRole === 'teacher' || viewerRole === 'observer') {
      console.log('⚠️ [DEBUG-LEVEL2] User identified as TEACHER/OBSERVER - will see ALL project logs!', {
        viewerRole,
        userEmail
      });
      const response = await getProjectEventLogs(env, projectId, filters);
      const responseData = await response.json() as any;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = viewerRole; // 'teacher' or 'observer'

      console.log('🔍 [DEBUG-LEVEL2] Returning teacher/observer logs:', {
        totalLogs: data.total,
        userPermissionLevel: viewerRole
      });

      return successResponse(data);
    }

    console.log('✅ [DEBUG-LEVEL2] User is NOT teacher/observer, checking usergroups...');

    // Level 3 & 4: member role - check group membership
    if (viewerRole === 'member') {
      console.log('🔍 [DEBUG-LEVEL3/4] User has member role, checking usergroups table...');

      // Check if user is in any group
      const userGroupsResult = await env.DB.prepare(`
        SELECT DISTINCT groupId, role
        FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND isActive = 1
      `).bind(userEmail, projectId).all();

      const userGroups = userGroupsResult.results || [];

      console.log('🔍 [DEBUG-LEVEL3/4] usergroups query result:', {
        userEmail,
        projectId,
        totalGroups: userGroups.length,
        groups: userGroups.map((ug: any) => ({ groupId: ug.groupId, role: ug.role })),
        rawResult: userGroups
      });

      // If no group, deny access (Level 5)
      if (userGroups.length === 0) {
        console.log('⚠️ [DEBUG-LEVEL5] User is member with NO GROUP - denying access');
        return successResponse({
          logs: [],
          total: 0,
          userPermissionLevel: 'member_no_group',
          message: 'Members without group assignment cannot view event logs'
        });
      }

      // Check if user is a group leader
      const leaderGroupIds = userGroups
        .filter((ug: any) => ug.role === 'leader')
        .map((ug: any) => ug.groupId);

      console.log('🔍 [DEBUG-LEVEL3/4] Leader group analysis:', {
        leaderGroupIds,
        isLeader: leaderGroupIds.length > 0,
        allUserGroups: userGroups.map((ug: any) => ({ groupId: ug.groupId, role: ug.role }))
      });

      // Level 3: Group leader → See logs of all group members
      if (leaderGroupIds.length > 0) {
        const placeholders = leaderGroupIds.map(() => '?').join(',');
        const membersResult = await env.DB.prepare(`
          SELECT DISTINCT userEmail
          FROM usergroups
          WHERE projectId = ? AND groupId IN (${placeholders}) AND isActive = 1
        `).bind(projectId, ...leaderGroupIds).all();

        const memberEmails = membersResult.results?.map((m: any) => m.userEmail) || [];
        const allowedUserEmails = Array.from(new Set([userEmail, ...memberEmails]));

        console.log('🔍 [DEBUG-LEVEL3] User is GROUP LEADER - will see group member logs:', {
          leaderEmail: userEmail,
          leaderGroupIds,
          memberCount: memberEmails.length,
          allowedUserEmails
        });

        const userFilters: EventLogFilters = {
          ...filters,
          userEmails: allowedUserEmails
        };

        console.log('🔍 [DEBUG-LEVEL3] Calling getProjectEventLogs with filters:', {
          userFilters,
          userEmailsCount: userFilters.userEmails?.length || 0
        });

        const response = await getProjectEventLogs(env, projectId, userFilters);
        const responseData = await response.json() as any;
        const data = responseData.data || responseData;  // Handle nested structure
        data.userPermissionLevel = 'group_leader';

        console.log('✅ [DEBUG-LEVEL3] Group leader logs fetched:', {
          totalLogs: data.total,
          uniqueUsers: Array.from(new Set((data.logs || []).map((l: any) => l.userEmail))),
          userPermissionLevel: 'group_leader',
          expectedUsers: allowedUserEmails
        });

        return successResponse(data);
      }

      // Level 4: Group member → See only own logs
      console.log('🔍 [DEBUG-LEVEL4] User is GROUP MEMBER - will see ONLY own logs:', {
        memberEmail: userEmail,
        userGroups: userGroups.map((ug: any) => ({ groupId: ug.groupId, role: ug.role }))
      });

      const userFilters: EventLogFilters = {
        ...filters,
        userEmails: [userEmail]
      };

      console.log('🔍 [DEBUG-LEVEL4] Calling getProjectEventLogs with strict filter:', {
        userFilters,
        allowedUsers: [userEmail]
      });

      const response = await getProjectEventLogs(env, projectId, userFilters);
      const responseData = await response.json() as any;
      const data = responseData.data || responseData;  // Handle nested structure
      data.userPermissionLevel = 'member_in_group';

      console.log('✅ [DEBUG-LEVEL4] Group member logs fetched:', {
        totalLogs: data.total,
        userEmail,
        uniqueUsers: Array.from(new Set((data.logs || []).map((l: any) => l.userEmail))),
        userPermissionLevel: 'member_in_group',
        logSample: (data.logs || []).slice(0, 3).map((l: any) => ({
          eventType: l.eventType,
          userEmail: l.userEmail,
          timestamp: l.timestamp
        }))
      });

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
): Promise<Response> {
  try {
    // First, verify the user has permission to view logs for this resource
    // by checking if the resource appears in their allowed event logs

    // Get the resource owner email first
    let resourceOwnerEmail: string | null = null;

    if (resourceType === 'submission') {
      const submissionOwner = await env.DB.prepare(`
        SELECT submitterEmail FROM submissions_with_status
        WHERE submissionId = ? AND projectId = ?
      `).bind(resourceId, projectId).first();
      resourceOwnerEmail = submissionOwner?.submitterEmail as string | null;
    } else if (resourceType === 'comment') {
      const commentOwner = await env.DB.prepare(`
        SELECT u.userEmail
        FROM comments c
        LEFT JOIN users u ON c.authorId = u.userId
        WHERE c.commentId = ? AND c.projectId = ?
      `).bind(resourceId, projectId).first();
      resourceOwnerEmail = commentOwner?.userEmail as string | null;
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
    const permissionData = await permissionCheckResponse.json() as any;
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
        permissionData.logs.map((log: any) => log.userEmail)
      );
      if (!allowedEmails.has(resourceOwnerEmail)) {
        return errorResponse('PERMISSION_DENIED', 'You do not have permission to view this resource');
      }
    }
    // admin, teacher, observer can view all resources (no additional check needed)

    // Now fetch the actual resource details
    let resource: any = null;

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
      `).bind(resourceId, projectId).first();

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
      const comment = await env.DB.prepare(`
        SELECT
          c.commentId,
          c.content,
          c.createdTime,
          c.authorId,
          u.userEmail as authorEmail,
          u.displayName as authorName
        FROM comments c
        LEFT JOIN users u ON c.authorId = u.userId
        WHERE c.commentId = ? AND c.projectId = ?
      `).bind(resourceId, projectId).first();

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
