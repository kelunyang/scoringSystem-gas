/**
 * Admin System Management Handlers
 * Migrated from GAS scripts/system_admin_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';

/**
 * Get system statistics
 */
export async function getSystemStats(env: Env, userEmail?: string): Promise<Response> {
  try {
    // Get user statistics
    const userStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as totalUsers,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactiveUsers
      FROM users
    `).first();

    // Get project statistics
    const projectStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as totalProjects,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeProjects,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedProjects
      FROM projects
    `).first();

    // Get global group statistics
    const groupStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as totalGroups,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeGroups
      FROM globalgroups
    `).first();

    // Get invitation code statistics (using VIEW for auto-calculated status)
    const inviteStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as totalInvitations,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeInvitations
      FROM invitation_codes_with_status
    `).first();

    const stats = {
      totalUsers: userStats?.totalUsers || 0,
      activeUsers: userStats?.activeUsers || 0,
      inactiveUsers: userStats?.inactiveUsers || 0,
      totalProjects: projectStats?.totalProjects || 0,
      activeProjects: projectStats?.activeProjects || 0,
      completedProjects: projectStats?.completedProjects || 0,
      totalGroups: groupStats?.totalGroups || 0,
      activeGroups: groupStats?.activeGroups || 0,
      totalInvitations: inviteStats?.totalInvitations || 0,
      activeInvitations: inviteStats?.activeInvitations || 0
    };

    // Log admin access to system statistics
    if (userEmail) {
      await logGlobalOperation(
        env,
        userEmail,
        'system_stats_viewed',
        'system_dashboard',
        'SYSTEM_STATS',
        {
          totalUsers: stats.totalUsers,
          totalProjects: stats.totalProjects,
          totalGroups: stats.totalGroups,
          totalInvitations: stats.totalInvitations
        },
        { level: 'info' }
      );
    }

    return successResponse(stats);

  } catch (error) {
    console.error('Get system stats error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get system statistics');
  }
}

/**
 * Get system event logs (recent activities)
 */
export async function getSystemEventLogs(
  env: Env,
  limit: number = 100
): Promise<Response> {
  try {
    // Get recent logs
    const result = await env.DB.prepare(`
      SELECT
        el.*,
        u.displayName,
        u.userEmail
      FROM eventlogs el
      LEFT JOIN users u ON el.userId = u.userId
      ORDER BY el.timestamp DESC
      LIMIT ?
    `).bind(limit).all();

    const logs = result.results?.map((log: any) => {
      // Parse details if it's a JSON string
      let parsedDetails = log.details;
      if (typeof log.details === 'string') {
        parsedDetails = parseJSON(log.details, {});
      }

      return {
        logId: log.logId,
        projectId: log.projectId,
        userEmail: log.userEmail,
        displayName: log.displayName || log.userEmail,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        details: parsedDetails,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress
      };
    }) || [];

    return successResponse(logs);

  } catch (error) {
    console.error('Get system logs error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get system logs');
  }
}

/**
 * Get system logs with filtering
 */
export async function getSystemLogs(
  env: Env,
  options: {
    level?: string;
    action?: string | string[]; // Support string or string[]
    userId?: string | string[];
    userEmail?: string; // 🆕 Search for context.userEmail (Login Logs)
    entityType?: string | string[];
    projectId?: string | string[];
    functionName?: string;
    message?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Response> {
  try {
    const {
      level,
      action,
      userId,
      userEmail, // 🆕 Extract userEmail from options
      entityType,
      projectId,
      functionName,
      message,
      startTime,
      endTime,
      limit = 100,
      offset = 0
    } = options;

    // Build query
    let query = `
      SELECT
        sl.*,
        COALESCE(u.displayName, sl.entityId) as displayName,
        p.projectName
      FROM sys_logs sl
      LEFT JOIN users u ON sl.userId = u.userId
      LEFT JOIN projects p ON sl.projectId = p.projectId
      WHERE 1=1
    `;

    const params: any[] = [];

    // Apply filters
    if (level) {
      query += ` AND sl.level = ?`;
      params.push(level);
    }

    // Action filter (supports array)
    if (action) {
      if (Array.isArray(action) && action.length > 0) {
        const placeholders = action.map(() => '?').join(',');
        query += ` AND sl.action IN (${placeholders})`;
        params.push(...action);
      } else if (typeof action === 'string') {
        query += ` AND sl.action = ?`;
        params.push(action);
      }
    }

    // User ID filter (supports array)
    if (userId) {
      if (Array.isArray(userId) && userId.length > 0) {
        const placeholders = userId.map(() => '?').join(',');
        query += ` AND sl.userId IN (${placeholders})`;
        params.push(...userId);
      } else if (typeof userId === 'string') {
        query += ` AND sl.userId = ?`;
        params.push(userId);
      }
    }

    // 🆕 User Email filter (search in context.userEmail JSON field for Login Logs)
    if (userEmail) {
      query += ` AND (
        sl.entityId LIKE ?
        OR JSON_EXTRACT(sl.context, '$.userEmail') LIKE ?
      )`;
      const emailPattern = `%${userEmail}%`;
      params.push(emailPattern, emailPattern);
    }

    // Entity type filter (supports array)
    if (entityType) {
      if (Array.isArray(entityType) && entityType.length > 0) {
        const placeholders = entityType.map(() => '?').join(',');
        query += ` AND sl.entityType IN (${placeholders})`;
        params.push(...entityType);
      } else if (typeof entityType === 'string') {
        query += ` AND sl.entityType = ?`;
        params.push(entityType);
      }
    }

    // Project ID filter (supports array)
    if (projectId) {
      if (Array.isArray(projectId) && projectId.length > 0) {
        const placeholders = projectId.map(() => '?').join(',');
        query += ` AND sl.projectId IN (${placeholders})`;
        params.push(...projectId);
      } else if (typeof projectId === 'string') {
        query += ` AND sl.projectId = ?`;
        params.push(projectId);
      }
    }

    // Function name keyword search
    if (functionName) {
      query += ` AND sl.functionName LIKE ?`;
      params.push(`%${functionName}%`);
    }

    // Message keyword search
    if (message) {
      query += ` AND sl.message LIKE ?`;
      params.push(`%${message}%`);
    }

    if (startTime) {
      query += ` AND sl.createdAt >= ?`;
      params.push(startTime);
    }

    if (endTime) {
      query += ` AND sl.createdAt <= ?`;
      params.push(endTime);
    }

    // Get total count with filters (before pagination)
    const countQuery = query.replace(
      'SELECT sl.*, u.displayName, p.projectName',
      'SELECT COUNT(*) as total'
    );
    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const totalCount = countResult?.total || 0;

    // Order by creation time (newest first)
    query += ` ORDER BY sl.createdAt DESC`;

    // Apply pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    const logs = result.results?.map((log: any) => {
      // Parse context if it's a JSON string
      let parsedContext = log.context;
      if (typeof log.context === 'string') {
        parsedContext = parseJSON(log.context, {});
      }

      // Parse relatedEntities if it's a JSON string
      let parsedRelatedEntities = log.relatedEntities;
      if (typeof log.relatedEntities === 'string') {
        parsedRelatedEntities = parseJSON(log.relatedEntities, {});
      }

      return {
        logId: log.logId,
        level: log.level,
        functionName: log.functionName,
        userId: log.userId,
        displayName: log.displayName,
        action: log.action,
        message: log.message,
        details: log.message || '', // Frontend expects 'details' field
        context: log.context, // Keep as string for dialog
        createdAt: log.createdAt,
        timestamp: log.createdAt, // Frontend expects 'timestamp' field
        projectId: log.projectId,
        projectName: log.projectName,
        entityType: log.entityType,
        entityId: log.entityId,
        relatedEntities: log.relatedEntities, // Keep as string for dialog
        executionTime: null // Not tracked in D1
      };
    }) || [];

    return successResponse({
      logs,
      total: totalCount,
      limit,
      offset
    });

  } catch (error) {
    console.error('Get system logs error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get system logs');
  }
}

/**
 * Get log statistics
 */
export async function getLogStatistics(env: Env): Promise<Response> {
  try {
    // Get log counts by level
    const levelStats = await env.DB.prepare(`
      SELECT
        level,
        COUNT(*) as count
      FROM sys_logs
      GROUP BY level
    `).all();

    // Get total log count
    const totalCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM sys_logs
    `).first();

    // Get newest log timestamp
    const newestLog = await env.DB.prepare(`
      SELECT MAX(createdAt) as timestamp FROM sys_logs
    `).first();

    // Convert level stats to object format expected by frontend
    const levelCounts: Record<string, number> = {};
    levelStats.results?.forEach((stat: any) => {
      levelCounts[stat.level] = stat.count;
    });

    return successResponse({
      totalLogs: totalCount?.count || 0,
      newestLog: newestLog?.timestamp || null,
      spreadsheetName: 'D1 Database', // CF Workers uses D1, not spreadsheets
      levelCounts: levelCounts
    });

  } catch (error) {
    console.error('Get log statistics error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get log statistics');
  }
}

/**
 * Get entity details by type and ID
 */
export async function getEntityDetails(
  env: Env,
  params: {
    entityType: string;
    entityId: string;
  },
  userEmail?: string
): Promise<Response> {
  try {
    const { entityType, entityId } = params;

    if (!entityType || !entityId) {
      return errorResponse('INVALID_PARAMS', 'entityType and entityId are required');
    }

    let query = '';
    const validTypes = [
      'user', 'project', 'stage', 'group', 'submission', 'comment',
      'settlement', 'notification', 'transaction', 'invitation',
      'ranking_proposal',
      // System entity types (for audit logs)
      'system_settings', 'system_dashboard', 'system_robots', 'system_audit', 'security_audit'
    ];

    if (!validTypes.includes(entityType)) {
      return errorResponse('INVALID_ENTITY_TYPE', `Unknown entity type: ${entityType}`);
    }

    // Handle system entity types (these don't have database tables)
    if (['system_settings', 'system_dashboard', 'system_robots', 'system_audit', 'security_audit'].includes(entityType)) {
      // For system entities, return metadata instead of querying database
      const systemEntityInfo: Record<string, any> = {
        system_settings: {
          entityId: entityId,
          entityType: 'system_settings',
          name: 'System Properties Configuration',
          description: 'Global system configuration and properties',
          category: 'System Administration'
        },
        system_dashboard: {
          entityId: entityId,
          entityType: 'system_dashboard',
          name: 'System Statistics Dashboard',
          description: 'System-wide statistics and metrics',
          category: 'System Monitoring'
        },
        system_robots: {
          entityId: entityId,
          entityType: 'system_robots',
          name: 'Automated Robots & Jobs',
          description: 'Scheduled tasks and automated operations',
          category: 'System Automation'
        },
        system_audit: {
          entityId: entityId,
          entityType: 'system_audit',
          name: 'System Audit Log',
          description: 'Entity details access and system auditing',
          category: 'System Security'
        },
        security_audit: {
          entityId: entityId,
          entityType: 'security_audit',
          name: 'Security Audit',
          description: 'Security checks and suspicious activity monitoring',
          category: 'System Security'
        }
      };

      const result = systemEntityInfo[entityType];

      // Log entity details access
      if (userEmail) {
        await logGlobalOperation(
          env,
          userEmail,
          'entity_details_viewed',
          'system_audit',
          entityId,
          {
            entityType,
            entityId,
            foundEntity: true,
            isSystemEntity: true
          },
          { level: 'info' }
        );
      }

      return successResponse({
        details: result,
        entityType: entityType,
        isSystemEntity: true
      });
    }

    switch(entityType) {
      case 'user':
        // Check if entityId is a userId (starts with 'usr_') or an email
        if (entityId.startsWith('usr_')) {
          query = `
            SELECT userId, displayName, userEmail, status, registrationTime, lastActivityTime
            FROM users WHERE userId = ?
          `;
        } else {
          query = `
            SELECT userId, displayName, userEmail, status, registrationTime, lastActivityTime
            FROM users WHERE userEmail = ?
          `;
        }
        break;
      case 'project':
        query = `
          SELECT projectId, projectName, description, status, createdBy, createdTime, totalStages, currentStage
          FROM projects WHERE projectId = ?
        `;
        break;
      case 'stage':
        query = `
          SELECT stageId, projectId, stageName, stageOrder, status, startTime, endTime, stageType
          FROM stages WHERE stageId = ?
        `;
        break;
      case 'group':
        query = `
          SELECT groupId, projectId, groupName, description, status, createdBy, createdTime
          FROM groups WHERE groupId = ?
        `;
        break;
      case 'submission':
        query = `
          SELECT submissionId, projectId, stageId, groupId, submitterEmail, submitTime, status
          FROM submissions_with_status WHERE submissionId = ?
        `;
        break;
      case 'comment':
        query = `
          SELECT commentId, projectId, stageId, authorEmail, createdTime, isReply, replyLevel, isAwarded
          FROM comments WHERE commentId = ?
        `;
        break;
      case 'settlement':
        query = `
          SELECT settlementId, projectId, stageId, settlementType, settlementTime, operatorEmail, totalRewardDistributed, participantCount, status
          FROM settlementhistory WHERE settlementId = ?
        `;
        break;
      case 'notification':
        query = `
          SELECT notificationId, targetUserEmail, type, title, projectId, stageId, createdTime, isRead, isDeleted
          FROM notifications WHERE notificationId = ?
        `;
        break;
      case 'transaction':
        query = `
          SELECT transactionId, projectId, userEmail, stageId, settlementId, transactionType, amount, timestamp
          FROM transactions WHERE transactionId = ?
        `;
        break;
      case 'invitation':
        query = `
          SELECT invitationId, invitationCode, targetEmail, createdBy, createdTime, expiryTime, status, usedTime
          FROM invitation_codes_with_status WHERE invitationId = ?
        `;
        break;
      case 'ranking_proposal':
        query = `
          SELECT proposalId, projectId, stageId, groupId, proposerEmail,
                 rankingData, createdTime, status, votingResult,
                 agreeVotes, opposeCount, totalVotes, voteScore
          FROM rankingproposals_with_status WHERE proposalId = ?
        `;
        break;

      // System entities - these don't have detailed database records
      case 'system_settings':
      case 'system_dashboard':
      case 'system_robots':
      case 'system_audit':
      case 'security_audit':
        // Return basic information for system entities
        return successResponse({
          details: {
            entityType,
            entityId,
            note: 'System entity - no detailed database record available',
            description: `This is a system-level entity of type "${entityType}"`
          }
        });

      default:
        // Handle unknown entity types that passed validation
        return errorResponse('UNSUPPORTED_ENTITY_TYPE',
          `Entity type "${entityType}" is recognized but cannot be queried for details. This may be a system entity or a type that doesn't support detailed views.`);
    }

    // Safety check: ensure query was generated
    if (!query || query.trim() === '') {
      return errorResponse('QUERY_GENERATION_FAILED',
        `Failed to generate database query for entity type: ${entityType}`);
    }

    const result = await env.DB.prepare(query).bind(entityId).first();

    if (!result) {
      return errorResponse('ENTITY_NOT_FOUND', `Entity not found: ${entityType} ${entityId}`);
    }

    // Log entity details access
    if (userEmail) {
      await logGlobalOperation(
        env,
        userEmail,
        'entity_details_viewed',
        'system_audit',
        entityId,
        {
          entityType,
          entityId,
          foundEntity: !!result
        },
        { level: 'info' }
      );
    }

    return successResponse({
      details: result,
      entityType: entityType
    });

  } catch (error) {
    console.error('Get entity details error:', error);

    // Log error if userEmail available (try-catch to prevent logging from causing additional errors)
    if (userEmail) {
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'entity_details_view_failed',
          'system_audit',
          params.entityId,
          {
            entityType: params.entityType,
            entityId: params.entityId,
            error: error instanceof Error ? error.message : String(error)
          },
          { level: 'error' }
        );
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
    }

    return errorResponse('SYSTEM_ERROR', 'Failed to get entity details');
  }
}
