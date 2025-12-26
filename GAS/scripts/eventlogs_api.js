/**
 * @fileoverview Event logging API endpoints
 * @module EventLogsAPI
 */

/**
 * Helper function to log an event to EventLogs table
 * Uses the logOperation utility function from utils.js
 * @param {string} projectId - Project ID
 * @param {string} userEmail - User email
 * @param {string} action - Action performed
 * @param {string} resourceType - Type of resource (project, stage, group, submission, comment, vote, settlement)
 * @param {string} resourceId - ID of the resource
 * @param {Object} details - Additional details
 */
function logEvent(projectId, userEmail, action, resourceType, resourceId, details = {}) {
  return logOperation(projectId, userEmail, action, resourceType, resourceId, details);
}

/**
 * Get event logs for a project with optional filters
 * @param {string} sessionId - Session ID
 * @param {string} projectId - Project ID
 * @param {Object} filters - Optional filters
 * @param {Array<string>} filters.userEmails - Filter by user emails (for leaders to see their group members)
 * @param {number} filters.startTime - Start timestamp
 * @param {number} filters.endTime - End timestamp
 * @param {Array<string>} filters.actions - Filter by actions
 * @param {Array<string>} filters.resourceTypes - Filter by resource types
 * @returns {Object} Response with event logs
 */
function getProjectEventLogs(sessionId, projectId, filters = {}) {
  try {
    // Validate session and project access
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;

    // Read all event logs
    let eventLogs = projectData.eventlogs || [];

    // Apply user email filter (for group leaders or members viewing their own events)
    if (filters.userEmails && filters.userEmails.length > 0) {
      eventLogs = eventLogs.filter(log => filters.userEmails.includes(log.userEmail));
    }

    // Apply time range filters
    if (filters.startTime) {
      eventLogs = eventLogs.filter(log => log.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      eventLogs = eventLogs.filter(log => log.timestamp <= filters.endTime);
    }

    // Apply action filters
    if (filters.actions && filters.actions.length > 0) {
      eventLogs = eventLogs.filter(log => filters.actions.includes(log.action));
    }

    // Apply resource type filters
    if (filters.resourceTypes && filters.resourceTypes.length > 0) {
      eventLogs = eventLogs.filter(log => filters.resourceTypes.includes(log.resourceType));
    }

    // Get global data for user display names
    const globalData = readGlobalData();

    // Enrich event logs with display names
    const enrichedLogs = eventLogs.map(log => {
      const user = globalData.users.find(u => u.userEmail === log.userEmail);

      // Parse details if it's a string, otherwise use as-is
      let parsedDetails = log.details;
      if (typeof log.details === 'string') {
        try {
          parsedDetails = JSON.parse(log.details);
        } catch (e) {
          parsedDetails = log.details;
        }
      }

      return {
        ...log,
        displayName: user ? (user.displayName || user.username) : log.userEmail,
        details: parsedDetails
      };
    });

    // Sort by timestamp (newest first)
    enrichedLogs.sort((a, b) => b.timestamp - a.timestamp);

    return createSuccessResponseWithSession(sessionId, enrichedLogs);

  } catch (error) {
    logErr('Get project event logs error', error);
    return createErrorResponse('SYSTEM_ERROR', '取得事件日誌失敗');
  }
}

/**
 * Get event logs for current user in a project (Dashboard view)
 * If user is a group leader, shows events for all group members
 * If user is just a member, shows only their own events
 */
function getUserProjectEventLogs(sessionId, projectId, filters = {}) {
  try {
    // Validate session and project access
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;

    // Check user's role in the project
    const userGroups = projectData.usergroups.filter(ug =>
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );

    // Determine which users' events to show
    let allowedUserEmails = [sessionResult.userEmail];

    // If user is a leader in any group, include all members of those groups
    const leaderGroups = userGroups.filter(ug => ug.role === 'leader');
    if (leaderGroups.length > 0) {
      const groupIds = leaderGroups.map(ug => ug.groupId);
      const groupMembers = projectData.usergroups.filter(ug =>
        groupIds.includes(ug.groupId) && ug.isActive
      );
      allowedUserEmails = [...new Set(groupMembers.map(ug => ug.userEmail))];
    }

    // Add user email filter to the provided filters
    const userFilters = {
      ...filters,
      userEmails: allowedUserEmails
    };

    // Call the main event logs function with user-specific filter
    return getProjectEventLogs(sessionId, projectId, userFilters);

  } catch (error) {
    logErr('Get user project event logs error', error);
    return createErrorResponse('SYSTEM_ERROR', '取得使用者事件日誌失敗');
  }
}

/**
 * Get resource details (submission or comment) for event log expansion
 */
function getEventResourceDetails(sessionId, projectId, resourceType, resourceId) {
  try {
    // Validate session and project access
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { projectData } = accessResult;

    let resource = null;

    if (resourceType === 'submission') {
      const submission = projectData.submissions.find(s => s.submissionId === resourceId);
      if (submission) {
        resource = {
          type: 'submission',
          content: submission.contentMarkdown,
          submitTime: submission.submitTime,
          submitterEmail: submission.submitterEmail,
          status: submission.status
        };
      }
    } else if (resourceType === 'comment') {
      const comment = projectData.comments.find(c => c.commentId === resourceId);
      if (comment) {
        resource = {
          type: 'comment',
          content: comment.content,
          createdTime: comment.createdTime,
          authorEmail: comment.authorEmail
        };
      }
    }

    if (!resource) {
      return createErrorResponse('NOT_FOUND', '找不到資源');
    }

    return createSuccessResponseWithSession(sessionId, resource);

  } catch (error) {
    logErr('Get event resource details error', error);
    return createErrorResponse('SYSTEM_ERROR', '取得資源詳情失敗');
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    logEvent,
    getProjectEventLogs,
    getUserProjectEventLogs,
    getEventResourceDetails
  };
}
