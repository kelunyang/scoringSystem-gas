/**
 * Invitation Email Sending Utilities
 * Migrated from GAS scripts/invitation.js
 * Now uses Email Queue for asynchronous email delivery
 */

import { Env } from '../../types';
import { queueInvitationEmail } from '../../queues/email-producer';

/**
 * Send invitation email via Email Queue
 * This queues the email for asynchronous processing by the email consumer
 */
export async function sendInvitationEmail(
  env: Env,
  targetEmail: string,
  invitationCode: string,
  validDays: number,
  createdBy: string
): Promise<boolean> {
  try {
    console.log('[Invitation Email] Queueing email to:', targetEmail);
    console.log('[Invitation Email] - Code:', invitationCode);
    console.log('[Invitation Email] - Valid Days:', validDays);

    // Queue the email for asynchronous processing
    await queueInvitationEmail(env, targetEmail, invitationCode, validDays, createdBy);

    console.log('[Invitation Email] ✅ Email queued successfully for:', targetEmail);
    return true;
  } catch (error) {
    console.error('[Invitation Email] ❌ Queue error:', error);
    console.error('[Invitation Email] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Send multiple invitation emails via Email Queue
 * More efficient for batch operations - emails are queued for asynchronous processing
 */
export async function sendBatchInvitationEmails(
  env: Env,
  invitations: Array<{
    targetEmail: string;
    invitationCode: string;
    validDays: number;
    createdBy: string;
  }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  try {
    console.log(`[Batch Email] Starting batch queue for ${invitations.length} emails`);

    // Queue all emails for asynchronous processing
    await Promise.all(
      invitations.map(async (invitation) => {
        try {
          await queueInvitationEmail(
            env,
            invitation.targetEmail,
            invitation.invitationCode,
            invitation.validDays,
            invitation.createdBy
          );
          results.set(invitation.targetEmail, true);
          console.log(`[Batch Email] ✅ Queued: ${invitation.targetEmail}`);
        } catch (error) {
          results.set(invitation.targetEmail, false);
          console.error(`[Batch Email] ❌ Queue failed: ${invitation.targetEmail}`, error);
        }
      })
    );

    const successCount = Array.from(results.values()).filter(v => v).length;
    const failedCount = results.size - successCount;
    console.log(`[Batch Email] Batch queue complete: ${successCount} queued, ${failedCount} failed`);

    return results;
  } catch (error) {
    console.error('[Batch Email] Fatal error in batch queue:', error);
    // Mark all as failed if not already processed
    invitations.forEach(inv => {
      if (!results.has(inv.targetEmail)) {
        results.set(inv.targetEmail, false);
      }
    });
    return results;
  }
}
