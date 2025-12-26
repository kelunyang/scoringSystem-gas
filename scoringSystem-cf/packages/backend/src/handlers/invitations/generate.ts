/**
 * Invitation Code Generation Handlers
 * Migrated from GAS scripts/invitation.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { parseJSON, stringifyJSON } from '../../utils/json';
import { sendInvitationEmail, sendBatchInvitationEmails } from './email';
import { logGlobalOperation } from '../../utils/logging';
import { getConfigValue } from '../../utils/config';
import { generateInvitationCode as generateCode } from '@repo/shared/utils/code-generator';

/**
 * Generate a new invitation code for a specific email
 */
export async function generateInvitationCode(
  env: Env,
  createdByEmail: string,
  targetEmail: string,
  validDays: number = 7,
  defaultTags: string[] = [],
  defaultGlobalGroups: string[] = []
): Promise<Response> {
  try {
    console.log(`[Generate] Starting invitation generation for: ${targetEmail}`);

    // Validate inputs
    if (!targetEmail || !isValidEmail(targetEmail)) {
      return errorResponse('INVALID_INPUT', 'Valid target email is required');
    }

    // Normalize email to lowercase for consistency
    const normalizedEmail = targetEmail.trim().toLowerCase();
    const currentTime = Date.now();

    // Check if target email is already registered (must check first)
    const existingUser = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(normalizedEmail).first();

    if (existingUser) {
      return errorResponse('USER_EXISTS', 'User with this email already exists');
    }

    // Check for deactivated but not expired invitation - reactivate instead of creating new
    const deactivatedInvitation = await env.DB.prepare(`
      SELECT invitationId, invitationCode, targetEmail, expiryTime, defaultGlobalGroups
      FROM invitation_codes_with_status
      WHERE LOWER(targetEmail) = ?
        AND status = 'deactivated'
        AND expiryTime > ?
    `).bind(normalizedEmail, currentTime).first<{
      invitationId: string;
      invitationCode: string;
      targetEmail: string;
      expiryTime: number;
      defaultGlobalGroups: string;
    }>();

    if (deactivatedInvitation) {
      console.log(`[Generate] Found deactivated invitation for ${normalizedEmail}, reactivating...`);

      // Reactivate the invitation (keep original expiryTime)
      await env.DB.prepare(`
        UPDATE invitation_codes SET deactivatedTime = NULL WHERE invitationId = ?
      `).bind(deactivatedInvitation.invitationId).run();

      // Calculate remaining valid days for email
      const remainingDays = Math.ceil((deactivatedInvitation.expiryTime - currentTime) / (24 * 60 * 60 * 1000));

      // Resend invitation email
      try {
        await sendInvitationEmail(
          env,
          normalizedEmail,
          deactivatedInvitation.invitationCode,
          remainingDays,
          createdByEmail
        );
        console.log(`[Generate] Reactivation email queued for: ${normalizedEmail}`);
      } catch (emailError) {
        console.error('[Generate] Failed to queue reactivation email:', emailError);
      }

      // Log reactivation
      await logGlobalOperation(
        env,
        createdByEmail,
        'invitation_reactivated',
        'invitation',
        deactivatedInvitation.invitationId,
        {
          invitationCode: deactivatedInvitation.invitationCode,
          targetEmail: normalizedEmail,
          remainingDays,
          expiresAt: deactivatedInvitation.expiryTime
        },
        { level: 'info' }
      );

      return successResponse({
        invitationId: deactivatedInvitation.invitationId,
        invitationCode: deactivatedInvitation.invitationCode,
        targetEmail: normalizedEmail,
        expiryTime: deactivatedInvitation.expiryTime,
        validDays: remainingDays,
        defaultGlobalGroups: parseJSON(deactivatedInvitation.defaultGlobalGroups, []),
        reactivated: true
      });
    }

    // Check if target email already has an active invitation
    const existingInvitation = await getActiveInvitationByEmail(env, normalizedEmail);
    if (existingInvitation) {
      return errorResponse('INVITATION_EXISTS', 'Active invitation already exists for this email');
    }

    // Generate invitation code
    const invitationCode = generateReadableCode();
    const timestamp = Date.now();
    const expiryTime = timestamp + (validDays * 24 * 60 * 60 * 1000);

    // Create masked display code (keep last 4 chars visible)
    const displayCode = invitationCode.substring(0, invitationCode.length - 4)
      .replace(/[A-Z]/g, '*') + invitationCode.substring(invitationCode.length - 4);

    const invitationId = generateId('invitation');

    // Store invitation in database (store plain invitation code, not hashed)
    try {
      await env.DB.prepare(`
        INSERT INTO invitation_codes (
          invitationId, invitationCode, displayCode, targetEmail,
          createdBy, createdTime, expiryTime, status,
          defaultTags, defaultGlobalGroups, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        invitationId,
        invitationCode, // Store plain code instead of hashed
        displayCode,
        normalizedEmail,
        (await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(createdByEmail).first())?.userId || null,
        timestamp,
        expiryTime,
        'active', // Initial status (will be overridden by VIEW)
        stringifyJSON(defaultTags),
        stringifyJSON(defaultGlobalGroups),
        stringifyJSON({
          validDays,
          defaultTagCount: defaultTags.length,
          defaultGlobalGroupCount: defaultGlobalGroups.length
        })
      ).run();
    } catch (insertError: any) {
      // Handle UNIQUE constraint violations (race condition)
      if (insertError.message && insertError.message.includes('UNIQUE constraint failed')) {
        console.log(`[Generate] Race condition detected: invitation was created concurrently for ${targetEmail}`);
        return errorResponse('INVITATION_EXISTS', 'Active invitation already exists for this email (concurrent creation detected)');
      }
      throw insertError; // Re-throw other errors
    }

    // Log invitation generation
    await logGlobalOperation(
      env,
      createdByEmail,
      'invitation_generated',
      'invitation',
      invitationId,
      {
        invitationCode,
        targetEmail: normalizedEmail,
        validDays,
        expiresAt: expiryTime,
        defaultTags,
        defaultGlobalGroups
      },
      { level: 'info' }
    );

    // Send invitation email (async via Queue - no blocking)
    try {
      console.log(`[Generate] Queuing invitation email for: ${normalizedEmail} with code: ${invitationCode}`);
      await sendInvitationEmail(
        env,
        normalizedEmail,
        invitationCode,
        validDays,
        createdByEmail
      );
      console.log(`[Generate] Invitation email queued for: ${normalizedEmail}`);
    } catch (emailError) {
      console.error('[Invitation] Failed to queue invitation email:', emailError);
      // Don't fail the invitation generation if email queuing fails
    }

    return successResponse({
      invitationId,
      invitationCode,
      targetEmail: normalizedEmail,
      expiryTime,
      validDays,
      defaultTags,
      defaultGlobalGroups
    });
  } catch (error) {
    console.error('Generate invitation code error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to generate invitation code');
  }
}

/**
 * Generate batch invitation codes - BULK optimized
 * Phase 1: Batch validation (2 queries instead of 2*N)
 * Phase 2: Categorize emails
 * Phase 3: Batch operations (1 batch instead of N individual operations)
 * Phase 4: Queue emails
 */
export async function generateBatchInvitationCodes(
  env: Env,
  createdByEmail: string,
  targetEmails: string[],
  validDays: number = 7,
  defaultTags: string[] = [],
  defaultGlobalGroups: string[] = []
): Promise<Response> {
  try {
    if (!targetEmails || !Array.isArray(targetEmails) || targetEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'Target emails array is required');
    }

    if (targetEmails.length > 50) {
      return errorResponse('INVALID_INPUT', 'Maximum 50 emails allowed per batch');
    }

    console.log(`[Batch Generate] Starting BULK batch generation for ${targetEmails.length} emails`);

    const currentTime = Date.now();
    const timestamp = currentTime;
    const expiryTime = timestamp + (validDays * 24 * 60 * 60 * 1000);

    // Validate and normalize emails first
    const validEmails: string[] = [];
    const errors: string[] = [];

    for (const email of targetEmails) {
      if (!isValidEmail(email)) {
        errors.push(`${email}: Invalid email format`);
      } else {
        validEmails.push(email.trim().toLowerCase());
      }
    }

    if (validEmails.length === 0) {
      return successResponse({
        results: [],
        errors,
        totalRequested: targetEmails.length,
        totalGenerated: 0,
        totalReactivated: 0,
        totalErrors: errors.length,
        emailsQueued: 0
      });
    }

    // Get createdBy userId once
    const creatorUser = await env.DB.prepare(
      'SELECT userId FROM users WHERE userEmail = ?'
    ).bind(createdByEmail).first<{ userId: string }>();
    const createdByUserId = creatorUser?.userId || null;

    // ============================================
    // Phase 1: Batch Validation (2 queries total)
    // ============================================
    console.log(`[Batch Generate] Phase 1: Batch validation for ${validEmails.length} emails`);

    // Build placeholders for IN clause
    const placeholders = validEmails.map(() => '?').join(',');

    // Query 1: Get all existing invitations for these emails
    const allInvitations = await env.DB.prepare(`
      SELECT LOWER(targetEmail) as targetEmail, status, expiryTime, invitationId, invitationCode, defaultGlobalGroups
      FROM invitation_codes_with_status
      WHERE LOWER(targetEmail) IN (${placeholders})
    `).bind(...validEmails).all<{
      targetEmail: string;
      status: string;
      expiryTime: number;
      invitationId: string;
      invitationCode: string;
      defaultGlobalGroups: string;
    }>();

    // Query 2: Get all existing users for these emails
    const existingUsers = await env.DB.prepare(`
      SELECT LOWER(userEmail) as userEmail FROM users WHERE LOWER(userEmail) IN (${placeholders})
    `).bind(...validEmails).all<{ userEmail: string }>();

    // Build lookup sets for O(1) access
    const existingUserEmails = new Set(existingUsers.results?.map(u => u.userEmail) || []);
    const invitationsByEmail = new Map<string, typeof allInvitations.results[0]>();
    for (const inv of allInvitations.results || []) {
      // Keep the most relevant invitation (prefer active/deactivated over expired)
      const existing = invitationsByEmail.get(inv.targetEmail);
      if (!existing ||
          (inv.status === 'active' && inv.expiryTime > currentTime) ||
          (inv.status === 'deactivated' && inv.expiryTime > currentTime && existing.status !== 'active')) {
        invitationsByEmail.set(inv.targetEmail, inv);
      }
    }

    // ============================================
    // Phase 2: Categorize Emails
    // ============================================
    console.log(`[Batch Generate] Phase 2: Categorizing emails`);

    interface ReactivateItem {
      email: string;
      invitationId: string;
      invitationCode: string;
      expiryTime: number;
      defaultGlobalGroups: string;
    }

    interface CreateItem {
      email: string;
      invitationId: string;
      invitationCode: string;
      displayCode: string;
    }

    const emailsToReactivate: ReactivateItem[] = [];
    const emailsToCreate: CreateItem[] = [];

    for (const email of validEmails) {
      // Check if user already exists
      if (existingUserEmails.has(email)) {
        errors.push(`${email}: User already exists`);
        continue;
      }

      // Check invitation status
      const invitation = invitationsByEmail.get(email);

      if (invitation) {
        if (invitation.status === 'active' && invitation.expiryTime > currentTime) {
          // Active and not expired - block
          errors.push(`${email}: Active invitation already exists`);
        } else if (invitation.status === 'deactivated' && invitation.expiryTime > currentTime) {
          // Deactivated but not expired - reactivate
          emailsToReactivate.push({
            email,
            invitationId: invitation.invitationId,
            invitationCode: invitation.invitationCode,
            expiryTime: invitation.expiryTime,
            defaultGlobalGroups: invitation.defaultGlobalGroups
          });
        } else {
          // Expired or used - can create new
          const invitationCode = generateReadableCode();
          const invitationId = generateId('invitation');
          const displayCode = invitationCode.substring(0, invitationCode.length - 4)
            .replace(/[A-Z]/g, '*') + invitationCode.substring(invitationCode.length - 4);
          emailsToCreate.push({ email, invitationId, invitationCode, displayCode });
        }
      } else {
        // No previous invitation - create new
        const invitationCode = generateReadableCode();
        const invitationId = generateId('invitation');
        const displayCode = invitationCode.substring(0, invitationCode.length - 4)
          .replace(/[A-Z]/g, '*') + invitationCode.substring(invitationCode.length - 4);
        emailsToCreate.push({ email, invitationId, invitationCode, displayCode });
      }
    }

    console.log(`[Batch Generate] Categorized: ${emailsToReactivate.length} to reactivate, ${emailsToCreate.length} to create, ${errors.length} errors`);

    // ============================================
    // Phase 3: Batch Operations
    // ============================================
    console.log(`[Batch Generate] Phase 3: Executing batch operations`);

    const batchStatements: ReturnType<typeof env.DB.prepare>[] = [];
    const results: Array<{ email: string; invitationCode: string; expiryTime: number; reactivated?: boolean }> = [];

    // Batch UPDATE: Reactivate deactivated invitations
    for (const item of emailsToReactivate) {
      batchStatements.push(
        env.DB.prepare(`UPDATE invitation_codes SET deactivatedTime = NULL WHERE invitationId = ?`)
          .bind(item.invitationId)
      );
      results.push({
        email: item.email,
        invitationCode: item.invitationCode,
        expiryTime: item.expiryTime,
        reactivated: true
      });
    }

    // Batch INSERT: Create new invitations
    const tagsJson = stringifyJSON(defaultTags);
    const groupsJson = stringifyJSON(defaultGlobalGroups);
    const metadataJson = stringifyJSON({
      validDays,
      defaultTagCount: defaultTags.length,
      defaultGlobalGroupCount: defaultGlobalGroups.length
    });

    for (const item of emailsToCreate) {
      batchStatements.push(
        env.DB.prepare(`
          INSERT INTO invitation_codes (
            invitationId, invitationCode, displayCode, targetEmail,
            createdBy, createdTime, expiryTime, status,
            defaultTags, defaultGlobalGroups, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          item.invitationId,
          item.invitationCode,
          item.displayCode,
          item.email,
          createdByUserId,
          timestamp,
          expiryTime,
          'active',
          tagsJson,
          groupsJson,
          metadataJson
        )
      );
      results.push({
        email: item.email,
        invitationCode: item.invitationCode,
        expiryTime
      });
    }

    // Execute all batch operations
    if (batchStatements.length > 0) {
      try {
        await env.DB.batch(batchStatements);
        console.log(`[Batch Generate] ✅ Batch executed: ${batchStatements.length} operations`);
      } catch (batchError: any) {
        console.error('[Batch Generate] Batch execution failed:', batchError);
        // If batch fails, we need to report all as errors
        for (const item of emailsToCreate) {
          errors.push(`${item.email}: Database operation failed`);
        }
        for (const item of emailsToReactivate) {
          errors.push(`${item.email}: Reactivation failed`);
        }
        results.length = 0; // Clear results
      }
    }

    // ============================================
    // Phase 4: Queue Emails
    // ============================================
    console.log(`[Batch Generate] Phase 4: Queuing ${results.length} emails`);

    const emailsToSend: Array<{
      targetEmail: string;
      invitationCode: string;
      validDays: number;
      createdBy: string;
    }> = [];

    for (const result of results) {
      const daysRemaining = result.reactivated
        ? Math.ceil((result.expiryTime - currentTime) / (24 * 60 * 60 * 1000))
        : validDays;

      emailsToSend.push({
        targetEmail: result.email,
        invitationCode: result.invitationCode,
        validDays: daysRemaining,
        createdBy: createdByEmail
      });
    }

    if (emailsToSend.length > 0) {
      try {
        await sendBatchInvitationEmails(env, emailsToSend);
        console.log(`[Batch Generate] All ${emailsToSend.length} emails queued successfully`);
      } catch (emailError) {
        console.error('[Batch Generate] Failed to queue batch emails:', emailError);
        // Don't fail batch generation if email queuing fails
      }
    }

    const totalReactivated = emailsToReactivate.length;
    const totalCreated = emailsToCreate.length;

    console.log(`[Batch Generate] Summary: ${totalCreated} created, ${totalReactivated} reactivated, ${emailsToSend.length} emails queued, ${errors.length} errors`);

    // Log batch invitation generation
    await logGlobalOperation(
      env,
      createdByEmail,
      'invitations_batch_generated',
      'invitation',
      'batch',
      {
        totalRequested: targetEmails.length,
        totalGenerated: results.length,
        totalCreated,
        totalReactivated,
        totalErrors: errors.length,
        emailsQueued: emailsToSend.length,
        validDays,
        invitations: results.map(r => ({
          email: r.email,
          code: r.invitationCode,
          reactivated: r.reactivated || false
        })),
        errors: errors.length > 0 ? errors : undefined
      },
      { level: 'info' }
    );

    return successResponse({
      results,
      errors,
      totalRequested: targetEmails.length,
      totalGenerated: results.length,
      totalCreated,
      totalReactivated,
      totalErrors: errors.length,
      emailsQueued: emailsToSend.length
    });
  } catch (error) {
    console.error('Generate batch invitation codes error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to generate batch invitation codes');
  }
}

/**
 * Generate a readable invitation code (XXXX-XXXX-XXXX)
 * Now uses shared code generator with 27-character set (A-Z excluding I,O + @#!)
 */
function generateReadableCode(): string {
  return generateCode();
}

/**
 * Check if an email already has an active invitation
 * Uses case-insensitive comparison to handle legacy data
 */
async function getActiveInvitationByEmail(
  env: Env,
  targetEmail: string
): Promise<any | null> {
  try {
    const currentTime = Date.now();
    const normalizedEmail = targetEmail.trim().toLowerCase();

    const invitation = await env.DB.prepare(`
      SELECT *
      FROM invitation_codes_with_status
      WHERE LOWER(targetEmail) = ?
        AND status = 'active'
        AND expiryTime > ?
    `).bind(normalizedEmail, currentTime).first();

    return invitation || null;
  } catch (error) {
    console.warn('Get active invitation by email error:', error);
    return null;
  }
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
