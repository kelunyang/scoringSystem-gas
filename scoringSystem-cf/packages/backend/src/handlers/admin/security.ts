/**
 * Admin Security Handlers
 * Security monitoring and suspicious activity detection
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { logGlobalOperation } from '../../utils/logging';

interface SuspiciousLogin {
  userEmail: string;
  reason: string;
  failedCount?: number;
  ipCount?: number;
  clientIP: string;
  timestamp: number;
  details?: string;
}

/**
 * Check for suspicious login attempts
 * Detects:
 * 1. Brute force attacks (multiple failed logins from same IP)
 * 2. Distributed attacks (failed logins from many different IPs for same user)
 */
export async function checkSuspiciousLogins(
  env: Env,
  userEmail: string,
  timeWindowHours: number = 24
): Promise<Response> {
  try {
    const suspicious: SuspiciousLogin[] = [];
    const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - timeWindowMs;

    // Query 1: Detect brute force attacks (same IP, multiple failed logins)
    const bruteForceQuery = await env.DB.prepare(`
      SELECT
        sl.userEmail,
        sl.clientIP,
        COUNT(*) as failedCount,
        MAX(sl.timestamp) as lastAttempt
      FROM sys_logs sl
      WHERE
        sl.action = 'login_failed'
        AND sl.timestamp >= ?
      GROUP BY sl.userEmail, sl.clientIP
      HAVING failedCount >= 5
      ORDER BY failedCount DESC
      LIMIT 50
    `).bind(cutoffTime).all();

    for (const row of bruteForceQuery.results || []) {
      suspicious.push({
        userEmail: row.userEmail as string,
        reason: 'brute_force',
        failedCount: row.failedCount as number,
        clientIP: row.clientIP as string,
        timestamp: row.lastAttempt as number,
        details: `${row.failedCount} failed login attempts from same IP`
      });
    }

    // Query 2: Detect distributed attacks (same user, many different IPs)
    const distributedQuery = await env.DB.prepare(`
      SELECT
        sl.userEmail,
        COUNT(DISTINCT sl.clientIP) as ipCount,
        COUNT(*) as failedCount,
        MAX(sl.timestamp) as lastAttempt,
        MAX(sl.clientIP) as lastIP
      FROM sys_logs sl
      WHERE
        sl.action = 'login_failed'
        AND sl.timestamp >= ?
      GROUP BY sl.userEmail
      HAVING ipCount >= 3
      ORDER BY ipCount DESC
      LIMIT 50
    `).bind(cutoffTime).all();

    for (const row of distributedQuery.results || []) {
      // Check if not already in list (brute force might have caught it)
      const exists = suspicious.some(
        s => s.userEmail === row.userEmail && s.clientIP === row.lastIP
      );

      if (!exists) {
        suspicious.push({
          userEmail: row.userEmail as string,
          reason: 'distributed_attack',
          ipCount: row.ipCount as number,
          failedCount: row.failedCount as number,
          clientIP: row.lastIP as string,
          timestamp: row.lastAttempt as number,
          details: `${row.failedCount} failed attempts from ${row.ipCount} different IPs`
        });
      }
    }

    // Log the security check
    await logGlobalOperation(
      env,
      userEmail,
      'suspicious_logins_checked',
      'security_audit',
      'SECURITY_CHECK',
      {
        timeWindowHours,
        suspiciousCount: suspicious.length,
        bruteForceDetected: bruteForceQuery.results?.length || 0,
        distributedAttacksDetected: distributedQuery.results?.length || 0
      },
      { level: suspicious.length > 0 ? 'warning' : 'info' }
    );

    return successResponse(suspicious);

  } catch (error) {
    console.error('Check suspicious logins error:', error);

    // Log error
    await logGlobalOperation(
      env,
      userEmail,
      'suspicious_logins_check_failed',
      'security_audit',
      'SECURITY_CHECK',
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { level: 'error' }
    );

    return errorResponse('SYSTEM_ERROR', 'Failed to check suspicious logins');
  }
}
