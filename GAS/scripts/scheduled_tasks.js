/**
 * @fileoverview Scheduled maintenance tasks for system cleanup and optimization
 * @module ScheduledTasks
 */

/**
 * Main scheduled task function that should be run daily
 * Call this function name in GAS triggers: scheduledTask
 */
function scheduledTask() {
  try {
    log('Starting daily cleanup tasks');

    const startTime = new Date();
    const results = {
      invitations: 0,
      cacheEntries: 0
    };

    // Clean expired invitation codes
    results.invitations = cleanupExpiredInvitations();

    // Clean cache entries
    results.cacheEntries = cleanupCacheEntries();

    // Run notification patrol and archival
    results.notifications = runNotificationMaintenance();

    // Archive old logs if needed
    results.logArchival = archiveOldLogs();

    // Check for suspicious login attempts
    results.securityCheck = checkSuspiciousLogins();

    const endTime = new Date();
    const duration = endTime - startTime;
    
    log('Daily cleanup completed', {
      duration: `${duration}ms`,
      results: results,
      timestamp: endTime.toISOString()
    });

    // Record last execution time for monitoring
    PropertiesService.getScriptProperties().setProperty(
      'LAST_CLEANUP',
      endTime.toISOString()
    );

    return createSuccessResponse(results, 'Daily cleanup completed successfully');
    
  } catch (error) {
    logErr('Daily cleanup failed', error);
    return createErrorResponse('CLEANUP_ERROR', error.message);
  }
}

/**
 * Weekly maintenance function for deeper cleanup
 * Call this function name in GAS triggers: runWeeklyMaintenance
 */
function runWeeklyMaintenance() {
  try {
    log('Starting weekly maintenance tasks');
    
    const startTime = new Date();
    const results = {
      projects: 0,
      users: 0,
      database: 0,
      properties: 0
    };
    
    // Clean up inactive projects (older than 6 months)
    results.projects = cleanupInactiveProjects();
    
    // Clean up inactive users (never logged in for 3 months)
    results.users = cleanupInactiveUsers();
    
    // Optimize database (compact deleted records)
    results.database = optimizeDatabase();
    
    // Clean old properties
    results.properties = cleanupOldProperties();
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    log('Weekly maintenance completed', {
      duration: `${duration}ms`,
      results: results,
      timestamp: endTime.toISOString()
    });

    return createSuccessResponse(results, 'Weekly maintenance completed successfully');
    
  } catch (error) {
    logErr('Weekly maintenance failed', error);
    return createErrorResponse('MAINTENANCE_ERROR', error.message);
  }
}

/**
 * Clean up expired user sessions
 * Note: Sessions are stored in CacheService which auto-expires.
 * This function is kept for backward compatibility but does nothing.
 * Real session cleanup happens in auth.js (memory Map cleanup only).
 */
function cleanupExpiredSessions() {
  // CacheService automatically handles session expiration
  // No manual cleanup needed
  log('Session cleanup skipped (CacheService handles expiration automatically)');
  return 0;
}

/**
 * Clean up expired invitation codes from Google Sheets
 */
function cleanupExpiredInvitations() {
  let cleanedCount = 0;
  const now = Date.now();

  try {
    // Read invitation codes from InvitationCodes sheet
    const globalData = readGlobalData();
    if (!globalData || !globalData.invitations) {
      log('No invitation data found');
      return 0;
    }

    const expiredInvitations = globalData.invitations.filter(inv => {
      // Check if invitation is expired and still active
      return inv.status === 'active' && inv.expiryTime && inv.expiryTime < now;
    });

    // Mark expired invitations as 'expired'
    expiredInvitations.forEach(inv => {
      try {
        updateRowInSheet(null, 'InvitationCodes', inv.invitationId, {
          status: 'expired'
        });
        cleanedCount++;
      } catch (error) {
        logErr('Failed to mark invitation as expired', {
          invitationId: inv.invitationId,
          error: error.message
        });
      }
    });

  } catch (error) {
    logErr('Invitation cleanup error', error);
  }

  log('Invitation cleanup completed', { cleanedCount });
  return cleanedCount;
}



/**
 * Clean up cache entries that may be stale
 */
function cleanupCacheEntries() {
  let cleanedCount = 0;
  
  try {
    // We can't enumerate cache keys in GAS, so we clean known patterns
    const cache = CacheService.getScriptCache();
    const properties = PropertiesService.getScriptProperties();
    
    // Clean up any cache entries that have corresponding expired properties
    const allProperties = properties.getProperties();
    const cacheableKeys = Object.keys(allProperties).filter(key => 
      key.startsWith('cache_') || 
      key.startsWith('temp_') ||
      key.startsWith('lock_')
    );
    
    cacheableKeys.forEach(key => {
      try {
        const data = JSON.parse(allProperties[key]);
        if (data && data.expiresAt && Date.now() > data.expiresAt) {
          properties.deleteProperty(key);
          cache.remove(key);
          cleanedCount++;
        }
      } catch (error) {
        // Remove corrupted cache data
        properties.deleteProperty(key);
        cleanedCount++;
      }
    });
    
  } catch (error) {
    logErr('Cache cleanup error', error);
  }
  
  log('Cache cleanup completed', { cleanedCount });
  return cleanedCount;
}

/**
 * Clean up inactive projects (for weekly maintenance)
 */
function cleanupInactiveProjects() {
  let cleanedCount = 0;
  
  try {
    // This is a placeholder for project cleanup logic
    // In a real implementation, you might:
    // 1. Find projects with no activity for 6+ months
    // 2. Mark them as archived instead of deleting
    // 3. Notify project owners before archiving
    
    log('Project cleanup: checking for inactive projects');
    
    // Implementation would go here based on your business rules
    // For now, just log that this step was performed
    
  } catch (error) {
    logErr('Project cleanup error', error);
  }
  
  log('Project cleanup completed', { cleanedCount });
  return cleanedCount;
}

/**
 * Clean up inactive users (for weekly maintenance)
 */
function cleanupInactiveUsers() {
  let cleanedCount = 0;
  
  try {
    // This is a placeholder for user cleanup logic
    // In a real implementation, you might:
    // 1. Find users who never logged in after 3 months
    // 2. Send reminder emails before cleanup
    // 3. Remove only truly inactive accounts
    
    log('User cleanup: checking for inactive users');
    
    // Implementation would go here based on your business rules
    
  } catch (error) {
    logErr('User cleanup error', error);
  }
  
  log('User cleanup completed', { cleanedCount });
  return cleanedCount;
}

/**
 * Optimize database by compacting data
 */
function optimizeDatabase() {
  let optimizedCount = 0;
  
  try {
    // This could include operations like:
    // 1. Defragmenting Google Sheets
    // 2. Rebuilding indexes
    // 3. Compacting transaction logs
    
    log('Database optimization: starting');
    
    // Placeholder for database optimization logic
    
  } catch (error) {
    logErr('Database optimization error', error);
  }
  
  log('Database optimization completed', { optimizedCount });
  return optimizedCount;
}

/**
 * Clean up old properties that are no longer needed
 */
function cleanupOldProperties() {
  let cleanedCount = 0;
  const properties = PropertiesService.getScriptProperties();
  const now = Date.now();
  const OLD_PROPERTY_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
  
  try {
    const allProperties = properties.getProperties();
    
    // Clean up old error logs and temporary data
    Object.keys(allProperties).forEach(key => {
      if (key.startsWith('ERROR_') || 
          key.startsWith('TEMP_') || 
          key.startsWith('OLD_')) {
        try {
          const data = JSON.parse(allProperties[key]);
          if (data && data.timestamp) {
            const age = now - new Date(data.timestamp).getTime();
            if (age > OLD_PROPERTY_AGE) {
              properties.deleteProperty(key);
              cleanedCount++;
            }
          }
        } catch (error) {
          // If we can't parse it, it's probably old - remove it
          properties.deleteProperty(key);
          cleanedCount++;
        }
      }
    });
    
  } catch (error) {
    logErr('Property cleanup error', error);
  }
  
  log('Property cleanup completed', { cleanedCount });
  return cleanedCount;
}

/**
 * Run notification maintenance tasks
 */
function runNotificationMaintenance() {
  let maintenanceResults = {
    emailsSent: 0,
    archivalPerformed: false,
    errors: 0
  };
  
  try {
    // Run daily notification patrol (send emails)
    const patrolResult = runDailyNotificationPatrol();
    if (patrolResult.success) {
      maintenanceResults.emailsSent = patrolResult.data.emailsSent || 0;
    } else {
      maintenanceResults.errors++;
      logErr('Notification patrol failed', { error: patrolResult.error });
    }
    
    // Check if notification spreadsheet needs archival
    const archiveResult = checkAndArchiveNotifications();
    if (archiveResult.archived) {
      maintenanceResults.archivalPerformed = true;
      log('Notification spreadsheet archived', { archiveName: archiveResult.archiveName });
    }
    
  } catch (error) {
    logErr('Notification maintenance error', error);
    maintenanceResults.errors++;
  }
  
  log('Notification maintenance completed', maintenanceResults);
  return maintenanceResults;
}

/**
 * Get cleanup status for monitoring
 */
function getCleanupStatus() {
  const properties = PropertiesService.getScriptProperties();
  
  try {
    const lastCleanup = properties.getProperty('LAST_CLEANUP');

    return createSuccessResponse({
      lastCleanup: lastCleanup || null,
      currentTime: new Date().toISOString()
    });
    
  } catch (error) {
    return createErrorResponse('STATUS_ERROR', error.message);
  }
}

/**
 * Manual trigger for immediate cleanup (for testing)
 */
function runImmediateCleanup() {
  log('Running immediate cleanup (manual trigger)');
  return runDailyCleanup();
}

/**
 * Test function to verify scheduled tasks are working
 */
function testScheduledTasks() {
  log('Testing scheduled tasks');
  
  const testResults = {
    dailyCleanup: null,
    weeklyMaintenance: null,
    status: null
  };
  
  try {
    // Test daily cleanup
    testResults.dailyCleanup = runDailyCleanup();
    
    // Test weekly maintenance
    testResults.weeklyMaintenance = runWeeklyMaintenance();
    
    // Test status retrieval
    testResults.status = getCleanupStatus();
    
    log('Scheduled tasks test completed successfully');
    return createSuccessResponse(testResults, 'All scheduled tasks tested successfully');
    
  } catch (error) {
    logErr('Scheduled tasks test failed', error);
    return createErrorResponse('TEST_FAILED', error.message);
  }
}

/**
 * Get all system administrators from global groups
 * @returns {Array} Array of admin user emails
 */
function getSystemAdministrators() {
  try {
    const globalData = readGlobalData();
    const adminEmails = [];

    // Find all groups with system_admin permission
    const adminGroups = globalData.globalGroups.filter(group => {
      try {
        const permissions = JSON.parse(group.globalPermissions || '[]');
        return permissions.includes('system_admin');
      } catch (e) {
        return false;
      }
    });

    // Get all users in those groups
    adminGroups.forEach(group => {
      const groupUsers = globalData.globalUserGroups.filter(ug => ug.globalGroupId === group.globalGroupId);
      groupUsers.forEach(ug => {
        const user = globalData.users.find(u => u.userId === ug.userId);
        if (user && user.status === 'active') {
          adminEmails.push(user.userEmail);
        }
      });
    });

    // Remove duplicates
    return Array.from(new Set(adminEmails));

  } catch (error) {
    logErr('Get system administrators error', error);
    return [];
  }
}

/**
 * Check for suspicious login attempts and notify admins
 * @returns {Object} Check result
 */
function checkSuspiciousLogins() {
  try {
    log('Starting suspicious login check');

    // Analyze login attempts
    const suspiciousAttempts = analyzeSuspiciousLogins();

    if (suspiciousAttempts.length === 0) {
      log('No suspicious login attempts detected');
      return {
        checked: true,
        suspicious: 0,
        notified: false
      };
    }

    // Get system administrators
    const adminEmails = getSystemAdministrators();

    if (adminEmails.length === 0) {
      logWrn('No system administrators found to notify');
      return {
        checked: true,
        suspicious: suspiciousAttempts.length,
        notified: false,
        error: 'No administrators found'
      };
    }

    // Send email notification to admins
    const subject = `[Security Alert] ${suspiciousAttempts.length} Suspicious Login Attempt(s) Detected`;
    const body = `
Security Alert - Suspicious Login Attempts Detected

The system has detected ${suspiciousAttempts.length} suspicious login attempt(s) in the last 24 hours:

${suspiciousAttempts.map((attempt, index) => `
${index + 1}. Username: ${attempt.username}
   Client IP: ${attempt.clientIP}
   Timestamp: ${attempt.timestamp}
   Reason: ${attempt.reason}
   Failed Attempts: ${attempt.failedCount}
`).join('\n')}

Please review these attempts and take appropriate action if necessary.

This is an automated security notification from the Scoring System.
    `.trim();

    // Send to all admins
    adminEmails.forEach(email => {
      try {
        MailApp.sendEmail({
          to: email,
          subject: subject,
          body: body
        });
      } catch (error) {
        logErr('Failed to send security alert email', {
          recipient: email,
          error: error.message
        });
      }
    });

    logInfo('Security alert sent to administrators', {
      suspiciousCount: suspiciousAttempts.length,
      adminCount: adminEmails.length
    });

    return {
      checked: true,
      suspicious: suspiciousAttempts.length,
      notified: true,
      adminCount: adminEmails.length
    };

  } catch (error) {
    logErr('Check suspicious logins error', error);
    return {
      checked: false,
      error: error.message
    };
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scheduledTask,
    runWeeklyMaintenance,
    runImmediateCleanup,
    getCleanupStatus,
    testScheduledTasks,
    cleanupExpiredInvitations,
    checkSuspiciousLogins,
    getSystemAdministrators
  };
}