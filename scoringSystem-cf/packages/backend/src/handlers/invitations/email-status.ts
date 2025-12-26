/**
 * Invitation Email Status Handler
 * Provides batch query API for checking email send status from globalemaillogs
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON } from '@utils/json';

/**
 * Email status for a single invitation
 */
export interface InvitationEmailStatus {
  emailSent: boolean;
  lastSentTime: number | null;
  status: 'sent' | 'failed' | 'pending' | 'not_sent';
  attempts: number;
  lastError: string | null;
}

/**
 * Get email send status for multiple invitation codes
 *
 * Permissions: Requires system_admin OR generate_invites global permission
 *
 * POST /invitations/email-status
 * Body: { invitationCodes: string[] }
 *
 * Returns: {
 *   success: true,
 *   data: {
 *     [invitationCode]: InvitationEmailStatus
 *   }
 * }
 */
export async function getInvitationEmailStatus(
  env: Env,
  userEmail: string,
  invitationCodes: string[]
): Promise<Response> {
  try {
    // Validate input
    if (!Array.isArray(invitationCodes) || invitationCodes.length === 0) {
      return errorResponse('INVALID_INPUT', 'invitationCodes must be a non-empty array');
    }

    if (invitationCodes.length > 100) {
      return errorResponse('TOO_MANY_CODES', 'Maximum 100 invitation codes per request');
    }

    // Check permissions: system_admin OR generate_invites
    const globalGroupsResult = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      WHERE gug.userEmail = ? AND gug.isActive = 1 AND gg.isActive = 1
    `).bind(userEmail).all();

    let hasPermission = false;
    for (const row of globalGroupsResult.results) {
      const permissions = parseJSON(row.globalPermissions as string, []) || [];
      if (permissions.includes('system_admin') || permissions.includes('generate_invites')) {
        hasPermission = true;
        break;
      }
    }

    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires system_admin or generate_invites permission');
    }

    // Query invitation_codes_with_status to get invitationId and targetEmail
    const placeholders = invitationCodes.map(() => '?').join(',');
    const invitationsResult = await env.DB.prepare(`
      SELECT invitationId, invitationCode, targetEmail
      FROM invitation_codes_with_status
      WHERE invitationCode IN (${placeholders})
    `).bind(...invitationCodes).all();

    if (!invitationsResult.results || invitationsResult.results.length === 0) {
      return successResponse({ emailStatuses: {} });
    }

    // Build invitationCode -> invitationId/targetEmail map
    const invitationMap = new Map<string, { invitationId: string; targetEmail: string }>();
    invitationsResult.results.forEach((row: any) => {
      invitationMap.set(row.invitationCode, {
        invitationId: row.invitationId,
        targetEmail: row.targetEmail
      });
    });

    // Query globalemaillogs for all invitations in ONE batch query (fix N+1 problem)
    // Strategy: Query all targetEmails at once, then filter in memory by invitationCode
    const emailStatuses: Record<string, InvitationEmailStatus> = {};

    // Collect all targetEmails for batch query
    const targetEmails = Array.from(new Set(
      Array.from(invitationMap.values()).map(info => info.targetEmail)
    ));

    // Batch query: Get all email logs for these recipients
    const targetEmailPlaceholders = targetEmails.map(() => '?').join(',');
    const allLogsResult = await env.DB.prepare(`
      SELECT status, timestamp, error, retryCount, emailContext, recipient
      FROM globalemaillogs
      WHERE trigger = 'invitation'
        AND recipient IN (${targetEmailPlaceholders})
      ORDER BY timestamp DESC
    `).bind(...targetEmails).all();

    // Build email logs map: invitationCode -> logs[]
    const logsMap = new Map<string, any[]>();

    for (const log of allLogsResult.results || []) {
      const context = parseJSON(log.emailContext as string, {});
      const invitationCode = context.invitationCode;

      if (invitationCode && invitationCodes.includes(invitationCode)) {
        if (!logsMap.has(invitationCode)) {
          logsMap.set(invitationCode, []);
        }
        logsMap.get(invitationCode)!.push(log);
      }
    }

    // Process each invitation code
    for (const invitationCode of invitationCodes) {
      const invitationInfo = invitationMap.get(invitationCode);

      if (!invitationInfo) {
        // Invitation code not found
        emailStatuses[invitationCode] = {
          emailSent: false,
          lastSentTime: null,
          status: 'not_sent',
          attempts: 0,
          lastError: 'Invitation code not found'
        };
        continue;
      }

      const relevantLogs = logsMap.get(invitationCode) || [];

      if (relevantLogs.length === 0) {
        // No email logs found
        emailStatuses[invitationCode] = {
          emailSent: false,
          lastSentTime: null,
          status: 'not_sent',
          attempts: 0,
          lastError: null
        };
        continue;
      }

      // Aggregate email status
      const latestLog = relevantLogs[0];
      const totalAttempts = relevantLogs.length;
      const sentLogs = relevantLogs.filter((log: any) => log.status === 'sent');
      const failedLogs = relevantLogs.filter((log: any) => log.status === 'failed');

      let status: 'sent' | 'failed' | 'pending' | 'not_sent';
      if (sentLogs.length > 0) {
        status = 'sent';
      } else if (failedLogs.length > 0) {
        status = 'failed';
      } else if (latestLog.status === 'pending') {
        status = 'pending';
      } else {
        status = 'not_sent';
      }

      emailStatuses[invitationCode] = {
        emailSent: sentLogs.length > 0,
        lastSentTime: sentLogs.length > 0 ? (sentLogs[0].timestamp as number) : null,
        status,
        attempts: totalAttempts,
        lastError: failedLogs.length > 0 ? (failedLogs[0].error as string) : null
      };
    }

    return successResponse({ emailStatuses });

  } catch (error) {
    console.error('Get invitation email status error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get email status');
  }
}
