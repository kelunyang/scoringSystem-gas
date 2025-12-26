/**
 * Two-Factor Authentication Email Handler
 * Sends verification codes via email for 2FA login
 * Now uses centralized email-service for all email operations
 */

import { Env } from '../../types';
import { getSystemTitle } from '../../utils/email';
import { logGlobalOperation } from '../../utils/logging';
import { queueTwoFactorCodeEmail } from '../../queues/email-producer';
import { generateVerificationCode as generateCode } from '@repo/shared/utils/code-generator';
import { constantTimeCompare } from '@repo/shared/utils/secure-compare';

/**
 * Generate 12-character verification code (XXXX-XXXX-XXXX)
 * Now uses shared code generator with 27-character set (A-Z excluding I,O + @#!)
 */
export function generateVerificationCode(): string {
  return generateCode();
}

// getSmtpConfig has been moved to email utils - SMTP configuration is now managed centrally

/**
 * Store verification code in D1 database
 * @param context - 'login' or 'password_reset' to distinguish usage context
 */
export async function storeVerificationCode(
  env: Env,
  userEmail: string,
  verificationCode: string,
  context: 'login' | 'password_reset' = 'login'
): Promise<{ success: boolean; expiresAt: number; codeId: string }> {
  const db = env.DB;
  try {
    const now = Date.now();
    const expiresAt = now + (10 * 60 * 1000); // 10 minutes from now
    const codeId = `2fa_${context}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // DEBUG: Log original code from generator

    // CRITICAL: Remove hyphens before storing to ensure consistent 12-character format
    // The code generator returns formatted codes (XXXX-XXXX-XXXX), but we store clean version
    const cleanCode = verificationCode.replace(/-/g, '').toUpperCase();

    // DEBUG: Log cleaned code

    // Insert new verification code
    await db
      .prepare(`
        INSERT INTO two_factor_codes (
          codeId, userEmail, verificationCode, createdTime, expiresAt, isUsed, attempts
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(codeId, userEmail, cleanCode, now, expiresAt, 0, 0)
      .run();


    // Log 2FA code generation (DO NOT log the actual code for security)
    try {
      await logGlobalOperation(
        env,
        userEmail,
        `two_factor_code_generated_${context}`,
        'user',
        codeId,
        {
          userEmail,
          context,
          expiresAt,
          codeGeneratedAt: now,
          // DO NOT include: verificationCode (sensitive)
        },
        { level: 'info' }
      );
    } catch (logError) {
      console.error('[storeVerificationCode] Failed to log 2FA code generation:', logError);
      // Don't block code storage if logging fails
    }

    return { success: true, expiresAt, codeId };
  } catch (error) {
    console.error('[2FA] Store verification code error:', error);
    return { success: false, expiresAt: 0, codeId: '' };
  }
}

/**
 * Verify two-factor authentication code
 */
export async function verifyTwoFactorCode(
  env: Env,
  userEmail: string,
  inputCode: string
): Promise<{ success: boolean; error?: string; message?: string; attemptsLeft?: number; user?: any }> {
  const db = env.DB;
  try {
    // Trim whitespace and remove hyphens from inputs
    userEmail = userEmail.trim();
    // Remove hyphens from user input to match stored format (clean 12-character code)
    inputCode = inputCode.trim().replace(/-/g, '').toUpperCase();

    const now = Date.now();

    // Always fetch user data to avoid duplicate queries in caller
    const user = await db
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(userEmail)
      .first();

    // Find the most recent unused code for this user
    const result = await db
      .prepare(`
        SELECT * FROM two_factor_codes
        WHERE userEmail = ? AND isUsed = 0 AND expiresAt > ?
        ORDER BY createdTime DESC
        LIMIT 1
      `)
      .bind(userEmail, now)
      .first();

    if (!result) {
      // Log failed verification (expired/not found)
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'two_factor_verification_failed',
          'user',
          userEmail,
          {
            userEmail,
            reason: 'code_not_found_or_expired',
            attemptTime: now
          },
          { level: 'warning' }
        );
      } catch (logError) {
        console.error('[verifyTwoFactorCode] Failed to log verification failure:', logError);
      }

      return {
        success: false,
        error: 'CODE_NOT_FOUND',
        message: '驗證碼已過期或不存在',
        user
      };
    }

    // Check attempts limit (max 3 attempts)
    const attempts = (result.attempts as number) || 0;
    if (attempts >= 3) {
      // Log too many attempts (critical security event)
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'two_factor_verification_failed',
          'user',
          result.codeId as string,
          {
            userEmail,
            reason: 'too_many_attempts',
            attempts: attempts,
            attemptTime: now
          },
          { level: 'critical' }
        );
      } catch (logError) {
        console.error('[verifyTwoFactorCode] Failed to log too many attempts:', logError);
      }

      return {
        success: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: '驗證次數過多，請重新獲取驗證碼',
        user
      };
    }

    // Increment attempts
    await db
      .prepare('UPDATE two_factor_codes SET attempts = ? WHERE codeId = ?')
      .bind(attempts + 1, result.codeId)
      .run();

    // Verify code
    const storedCode = String(result.verificationCode).toUpperCase();
    const userInputCode = String(inputCode).toUpperCase();

    // Use constant-time comparison to prevent timing attacks
    const isMatch = constantTimeCompare(storedCode, userInputCode);

    if (isMatch) {
      // Mark as used
      await db
        .prepare('UPDATE two_factor_codes SET isUsed = 1 WHERE codeId = ?')
        .bind(result.codeId)
        .run();

      // Log successful 2FA verification
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'two_factor_verified',
          'user',
          result.codeId as string,
          {
            userEmail,
            verifiedAt: now,
            attemptNumber: attempts + 1
          },
          { level: 'info' }
        );
      } catch (logError) {
        console.error('[verifyTwoFactorCode] Failed to log successful verification:', logError);
      }

      return {
        success: true,
        user
      };
    } else {
      // Log invalid code attempt
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'two_factor_verification_failed',
          'user',
          result.codeId as string,
          {
            userEmail,
            reason: 'invalid_code',
            attemptNumber: attempts + 1,
            attemptsLeft: 3 - (attempts + 1),
            attemptTime: now
          },
          { level: 'warning' }
        );
      } catch (logError) {
        console.error('[verifyTwoFactorCode] Failed to log invalid code attempt:', logError);
      }

      return {
        success: false,
        error: 'INVALID_CODE',
        message: '驗證碼錯誤',
        attemptsLeft: 3 - (attempts + 1),
        user
      };
    }
  } catch (error) {
    console.error('[2FA] Verify two-factor code error:', error);
    return {
      success: false,
      error: 'SYSTEM_ERROR',
      message: '驗證系統錯誤',
      user: undefined
    };
  }
}

/**
 * Send verification code via email using centralized email service
 */
export async function sendVerificationCodeEmail(
  env: Env,
  userEmail: string,
  verificationCode: string,
  context: 'login' | 'password_reset' = 'login'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate email address
    if (!userEmail || !userEmail.includes('@')) {
      console.error('[2FA Email] Invalid email address:', userEmail);
      return {
        success: false,
        error: 'Invalid email address'
      };
    }

    // Queue the 2FA code email
    // Note: This function now only supports 'login' context
    // For password_reset, use queuePasswordReset2FAEmail directly
    await queueTwoFactorCodeEmail(env, userEmail, verificationCode);

    console.log(`[2FA Email] ✅ Verification code email queued for: ${userEmail}`);
    return { success: true };
  } catch (error) {
    console.error('[2FA Email] Error queueing email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
