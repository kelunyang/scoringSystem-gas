/**
 * Two-Factor Authentication Email Handler
 * Sends verification codes via email for 2FA login
 * Now uses centralized email-service for all email operations
 */

import { Env } from '../../types';
import { logGlobalOperation } from '../../utils/logging';
import { queueTwoFactorCodeEmail } from '../../queues/email-producer';
import { generateVerificationCode as generateCode } from '@repo/shared/utils/code-generator';
import { constantTimeCompare } from '@repo/shared/utils/secure-compare';

/**
 * Generate 6-digit verification code (identical in shape to a TOTP code)
 * Uses the shared code generator (crypto-secure digits, no letters or symbols)
 */
export function generateVerificationCode(): string {
  return generateCode();
}

// getSmtpConfig has been moved to email utils - SMTP configuration is now managed centrally

/**
 * Store a verification code in D1.
 *
 * `context` used to exist only as a prefix on the generated `codeId` string and
 * in the audit log — it was never a column, and `verifyTwoFactorCode` did not
 * filter on it. A password-reset code therefore satisfied the login 2FA check
 * and vice versa. It is now persisted and enforced.
 *
 * @param context - What the code is for. Codes are not interchangeable across contexts.
 * @param passwordVerified - Whether the caller checked the account password before
 *   issuing this code. `/auth/login-verify-2fa` refuses codes issued without it,
 *   which is what stops `/auth/resend-2fa` from being a password-free login path.
 */
export async function storeVerificationCode(
  env: Env,
  userEmail: string,
  verificationCode: string,
  context: 'login' | 'password_reset' = 'login',
  passwordVerified: boolean = false
): Promise<{ success: boolean; expiresAt: number; codeId: string }> {
  const db = env.DB;
  try {
    const now = Date.now();
    const expiresAt = now + (10 * 60 * 1000); // 10 minutes from now
    const codeId = `2fa_${context}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // DEBUG: Log original code from generator

    // Normalize before storing: codes are 6 digits, but strip any separators
    // a caller or a user's paste may have introduced
    const cleanCode = verificationCode.replace(/[\s-]/g, '').toUpperCase();

    // DEBUG: Log cleaned code

    // Insert new verification code
    await db
      .prepare(`
        INSERT INTO two_factor_codes (
          codeId, userEmail, verificationCode, createdTime, expiresAt, isUsed, attempts,
          context, passwordVerified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(codeId, userEmail, cleanCode, now, expiresAt, 0, 0, context, passwordVerified ? 1 : 0)
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
          passwordVerified,
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
 * Verify a two-factor authentication code.
 *
 * The lookup is scoped to `context`: a code minted for a password reset can no
 * longer satisfy a login check, and vice versa. Callers must say which kind of
 * code they expect rather than taking whichever row is newest.
 *
 * @param context - Which flow is verifying. Defaults to 'login'.
 * @returns `passwordVerified` reports whether a password was checked before this
 *   code was issued, so the login flow can refuse codes minted by `/auth/resend-2fa`.
 */
export async function verifyTwoFactorCode(
  env: Env,
  userEmail: string,
  inputCode: string,
  context: 'login' | 'password_reset' = 'login'
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  attemptsLeft?: number;
  /** 驗證成功時回傳的使用者資料列；查不到時是 null。 */
  user?: Record<string, unknown> | null;
  passwordVerified?: boolean;
}> {
  const db = env.DB;
  try {
    // Trim whitespace and remove separators from inputs
    userEmail = userEmail.trim();
    // Normalize user input to match the stored format (clean 6-digit code)
    inputCode = inputCode.trim().replace(/[\s-]/g, '').toUpperCase();

    const now = Date.now();

    // Always fetch user data to avoid duplicate queries in caller
    const user = await db
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(userEmail)
      .first();

    // Find the most recent unused code issued for *this* context
    const result = await db
      .prepare(`
        SELECT * FROM two_factor_codes
        WHERE userEmail = ? AND context = ? AND isUsed = 0 AND expiresAt > ?
        ORDER BY createdTime DESC
        LIMIT 1
      `)
      .bind(userEmail, context, now)
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
            context,
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
        user,
        passwordVerified: result.passwordVerified === 1
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
  _context: 'login' | 'password_reset' = 'login'
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
