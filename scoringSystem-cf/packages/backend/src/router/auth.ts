/**
 * @fileoverview Authentication routes
 * Handles login, register, logout, password change, etc.
 *
 * Migrated to Hono RPC format with Zod validation
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { logoutUser, validateSession, changePassword, check2FAFailureAndLock } from '../handlers/auth/login';
import { registerUser, checkEmailAvailability } from '../handlers/auth/register';
import { authMiddleware } from '../middleware/auth';
import { jsonResponse, ERROR_CODES } from '../utils/response';
import { verifyTurnstileMiddleware } from '../utils/turnstile';
import { getConfigValue } from '../utils/config';
import { generateToken } from '../handlers/auth/jwt';
import { logGlobalOperation } from '../utils/logging';
import { getUserGlobalPermissions } from '../utils/permissions';
import { verifyTwoFactorCode } from '../handlers/auth/two-factor';
import { getSmtpConfig } from '../utils/email';
import {
  RegisterRequestSchema,
  LoginVerifyPasswordRequestSchema,
  LoginVerify2FARequestSchema,
  ChangePasswordRequestSchema,
  CheckEmailQuerySchema,
  Resend2FARequestSchema,
  VerifyEmailForResetRequestSchema,
  PasswordResetVerifyCodeRequestSchema,
  ResetPasswordRequestSchema,
  TotpSetupVerifyRequestSchema,
  TotpDisableRequestSchema,
  TotpRegenerateCodesRequestSchema,
  PasskeyRegisterVerifyRequestSchema,
  PasskeyAuthInitRequestSchema,
  PasskeyAuthVerifyRequestSchema,
  PasskeyCredentialUpdateRequestSchema,
  PasskeyCredentialDeleteRequestSchema
} from '@repo/shared/schemas/auth';

const authRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /auth/register
 * Register new user with invitation code
 *
 * Body: {
 *   password: string,
 *   userEmail: string,
 *   displayName: string,
 *   invitationCode: string,
 *   avatarSeed?: string,
 *   avatarStyle?: string,
 *   avatarOptions?: object,
 *   turnstileToken?: string
 * }
 * Returns: { sessionId: string, user: {...} }
 */
authRouter.post(
  '/register',
  zValidator('json', RegisterRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Verify Turnstile if enabled
    const turnstileError = await verifyTurnstileMiddleware(
      c.env,
      body.turnstileToken,
      c.req.header('CF-Connecting-IP')
    );
    if (turnstileError) {
      return c.json(turnstileError, 403);
    }

    const sessionTimeout = parseInt(await getConfigValue(c.env, 'SESSION_TIMEOUT'));

    const result = await registerUser(
      c.env,
      {
        password: body.password,
        userEmail: body.userEmail,
        displayName: body.displayName,
        invitationCode: body.invitationCode,
        avatarSeed: body.avatarSeed,
        avatarStyle: body.avatarStyle,
        avatarOptions: body.avatarOptions
      },
      c.env.JWT_SECRET,
      sessionTimeout
    );


    // Check if result is an error response
    if (!result.success) {
      console.error('[Register] Registration failed:', result.error);
      return jsonResponse(result, 400);
    }

    return c.json(result, result.success ? 200 : 400);
  }
);

/**
 * POST /auth/logout
 * Logout user (mainly for logging purposes in JWT system)
 *
 * Body: { sessionId: string } or Header: Authorization: Bearer <token>
 * Returns: { message: string }
 */
authRouter.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('CF-Connecting-IP') || null;
  const result = await logoutUser(c.env, user.userId, ipAddress);
  return jsonResponse(result);
});

/**
 * POST /auth/validate
 * Validate session token and return user info
 *
 * Body: { sessionId: string } or Header: Authorization: Bearer <token>
 * Returns: { user: {...} }
 */
authRouter.post('/validate', authMiddleware, async (c) => {
  // If we got here, authMiddleware has validated the token
  const user = c.get('user');
  return c.json({
    success: true,
    data: { user }
  });
});

/**
 * POST /auth/change-password
 * Change user password
 *
 * Body: {
 *   sessionId: string,
 *   oldPassword: string,
 *   newPassword: string
 * }
 * Returns: { message: string }
 */
authRouter.post(
  '/change-password',
  authMiddleware,
  zValidator('json', ChangePasswordRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');
    const ipAddress = c.req.header('CF-Connecting-IP') || null;

    const result = await changePassword(
      c.env,
      user.userId,
      body.oldPassword,
      body.newPassword,
      ipAddress
    );

    return c.json(result, result.success ? 200 : 400);
  }
);

/**
 * GET /auth/check-email
 * Check if email is available
 *
 * Query: ?email=john@example.com
 * Returns: { userEmail: string, available: boolean }
 */
authRouter.get(
  '/check-email',
  zValidator('query', CheckEmailQuerySchema),
  async (c) => {
    const { email } = c.req.valid('query');
    const result = await checkEmailAvailability(c.env.DB, email);
    return c.json(result, result.success ? 200 : 400);
  }
);

/**
 * POST /auth/current-user
 * Get current user information with permissions
 * (Used by frontend to check authentication and get user data)
 *
 * Body: { sessionId: string } or Header: Authorization: Bearer <token>
 * Returns: { user: {...} }
 *
 * ✅ Includes sliding expiration: Auto-refreshes token if >50% through lifetime
 */
authRouter.post('/current-user', async (c) => {
  // Extract session ID from body or header
  let sessionId = null;
  try {
    const body = await c.req.json();
    sessionId = body.sessionId;
  } catch {
    // No body or invalid JSON
  }

  if (!sessionId) {
    const authHeader = c.req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7);
    }
  }

  if (!sessionId) {
    return c.json({
      success: false,
      error: { code: ERROR_CODES.NO_SESSION, message: 'Session ID is required' }
    }, 401);
  }

  // Validate session and get user with permissions
  const validationResponse = await validateSession(c.env.DB, sessionId, c.env.JWT_SECRET);

  // ✅ Token Renewal Logic (Sliding Expiration)
  // Check if token needs refresh (if >50% through its lifetime)
  try {
    const { verifyToken } = await import('../handlers/auth/jwt');
    const payload = await verifyToken(sessionId, c.env.JWT_SECRET);

    const now = Date.now();
    const tokenAge = now - (payload.iat * 1000);
    const tokenLifetime = (payload.exp * 1000) - (payload.iat * 1000);
    const shouldRefresh = tokenAge > (tokenLifetime / 2);

    if (shouldRefresh) {
      const { getConfigValue } = await import('../utils/config');
      const { generateToken } = await import('../handlers/auth/jwt');
      const sessionTimeout = await getConfigValue(c.env, 'SESSION_TIMEOUT');

      const newToken = await generateToken(
        payload.userId,
        payload.userEmail,
        c.env.JWT_SECRET,
        parseInt(sessionTimeout)
      );

      // Parse the validation response to add newToken field
      const responseData = await validationResponse.json() as Record<string, unknown>;

      // Return response with new token in both body and header
      return c.json({
        ...responseData,
        newToken  // ✅ New token in response body
      }, {
        headers: {
          'X-New-Token': newToken  // ✅ New token in header (for compatibility)
        }
      });
    }
  } catch (error) {
    // If token renewal fails, still return the validation response
    console.error('Token renewal failed in /current-user:', error);
  }

  return validationResponse;
});

/**
 * POST /auth/refresh-token
 * Refresh JWT token to extend session
 *
 * Body: { sessionId: string } or Header: Authorization: Bearer <token>
 * Returns: { token: string }
 */
authRouter.post('/refresh-token', authMiddleware, async (c) => {
  const user = c.get('user');

  // Generate new token with same payload
  const sessionTimeout = parseInt(await getConfigValue(c.env, 'SESSION_TIMEOUT'));
  const { generateToken } = await import('../handlers/auth/jwt');

  const newToken = await generateToken(
    user.userId,
    user.userEmail,
    c.env.JWT_SECRET,
    sessionTimeout
  );

  return c.json({
    success: true,
    data: {
      token: newToken,
      message: 'Token refreshed successfully'
    }
  });
});

/**
 * POST /auth/login-verify-password
 * Two-factor authentication step 1: Verify email and password
 *
 * Body: { userEmail: string, password: string, turnstileToken?: string }
 * Returns: { success: true, message: string, emailSent: boolean, devMode: boolean }
 */
authRouter.post(
  '/login-verify-password',
  zValidator('json', LoginVerifyPasswordRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Get user by email
    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(body.userEmail)
      .first();

    // Extract Cloudflare request context
    const cf = c.req.raw.cf as any;
    const requestContext = {
      ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
      country: cf?.country || c.req.header('CF-IPCountry') || 'unknown',
      city: cf?.city || c.req.header('CF-IPCity') || null,
      timezone: cf?.timezone || c.req.header('CF-Timezone') || 'unknown',
      userAgent: c.req.header('User-Agent') || 'unknown',
      requestPath: c.req.path
    };

    if (!user) {
      // Log failed login attempt - user not found
      const now = Date.now();
      const { logGlobalOperation } = await import('../utils/logging');
      await logGlobalOperation(
        c.env,
        body.userEmail,
        'login_failed',
        'user',
        body.userEmail,
        {
          userEmail: body.userEmail,
          reason: 'user_not_found',
          ipAddress: requestContext.ipAddress,
          country: requestContext.country,
          city: requestContext.city,
          timezone: requestContext.timezone,
          userAgent: requestContext.userAgent,
          requestPath: requestContext.requestPath,
          timestamp: now
        },
        { level: 'warning' }
      );

      // Queue login event for security analysis (Layer 2)
      try {
        const { queueLoginEvent } = await import('../queues/login-events-producer');
        await queueLoginEvent(c.env, {
          eventType: 'login_failed',
          userEmail: body.userEmail,
          ipAddress: requestContext.ipAddress,
          country: requestContext.country,
          city: requestContext.city,
          timezone: requestContext.timezone,
          userAgent: requestContext.userAgent,
          requestPath: requestContext.requestPath,
          timestamp: now,
          reason: 'user_not_found'
        });
      } catch (queueError) {
        // **FIX: Queue failure monitoring** - Alert on Layer 2 bypass
        console.error('[login-verify-password] CRITICAL: Failed to queue login event:', queueError);
        const { logGlobalOperation } = await import('../utils/logging');
        await logGlobalOperation(
          c.env,
          'SYSTEM',
          'QUEUE_FAILURE',
          'system',
          'queue',
          { error: String(queueError), userEmail: body.userEmail, reason: 'user_not_found' },
          { level: 'error' }
        );
        // Don't block login flow even if queue fails
      }

      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' }
      }, 401);
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return c.json({
        success: false,
        error: { code: 'USER_DISABLED', message: '此帳號已被停用，請聯繫管理員' }
      }, 403);
    }

    // Verify password
    const { verifyPassword } = await import('../handlers/auth/password');
    const isValidPassword = await verifyPassword(body.password, user.password as string);

    if (!isValidPassword) {
      // Log failed login attempt - invalid password
      const now = Date.now();
      const { logGlobalOperation } = await import('../utils/logging');
      await logGlobalOperation(
        c.env,
        body.userEmail,
        'login_failed',
        'user',
        body.userEmail,
        {
          userEmail: body.userEmail,
          reason: 'invalid_password',
          ipAddress: requestContext.ipAddress,
          country: requestContext.country,
          city: requestContext.city,
          timezone: requestContext.timezone,
          userAgent: requestContext.userAgent,
          requestPath: requestContext.requestPath,
          timestamp: now
        },
        { level: 'warning' }
      );

      // Queue login event for security analysis (Layer 2)
      try {
        const { queueLoginEvent } = await import('../queues/login-events-producer');
        await queueLoginEvent(c.env, {
          eventType: 'login_failed',
          userEmail: body.userEmail,
          userId: user.userId as string,
          ipAddress: requestContext.ipAddress,
          country: requestContext.country,
          city: requestContext.city,
          timezone: requestContext.timezone,
          userAgent: requestContext.userAgent,
          requestPath: requestContext.requestPath,
          timestamp: now,
          reason: 'invalid_password'
        });
      } catch (queueError) {
        // **FIX: Queue failure monitoring**
        console.error('[login-verify-password] CRITICAL: Failed to queue login event:', queueError);
        const { logGlobalOperation } = await import('../utils/logging');
        await logGlobalOperation(
          c.env,
          'SYSTEM',
          'QUEUE_FAILURE',
          'system',
          'queue',
          { error: String(queueError), userEmail: body.userEmail, userId: user.userId as string, reason: 'invalid_password' },
          { level: 'error' }
        );
      }

      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' }
      }, 401);
    }

    // Check if user has TOTP enabled — if so, skip email entirely
    const totpEnabled = user.totpEnabled === 1;

    // Check if user has Passkey enabled
    const passkeyEnabled = user.passkeyEnabled === 1;
    let passkeyCredentialCount = 0;
    if (passkeyEnabled) {
      const passkeyCount = await c.env.DB
        .prepare('SELECT COUNT(*) as count FROM passkey_credentials WHERE userId = ?')
        .bind(user.userId)
        .first<{ count: number }>();
      passkeyCredentialCount = passkeyCount?.count || 0;
    }
    const passkeyAvailable = passkeyEnabled && passkeyCredentialCount > 0;

    // Build available methods list
    const availableMethods: ('passkey' | 'totp' | 'email')[] = [];
    if (passkeyAvailable) availableMethods.push('passkey');
    if (totpEnabled) availableMethods.push('totp');
    availableMethods.push('email'); // Email is always available

    // Determine preferred method: passkey > totp > email
    const preferredMethod = passkeyAvailable ? 'passkey' : (totpEnabled ? 'totp' : 'email');

    if (passkeyAvailable || totpEnabled) {
      // User has passkey or TOTP enabled - skip email code
      const message = passkeyAvailable
        ? '請使用 Passkey 或其他驗證方式'
        : '請使用驗證器 App 輸入驗證碼';

      return c.json({
        success: true,
        data: {
          message,
          emailSent: false,
          devMode: false,
          twoFactorMethod: preferredMethod,
          passkeyAvailable,
          availableMethods
        }
      });
    }

    // Check if SMTP is configured for sending verification codes (KV-first)
    const smtpConfig = await getSmtpConfig(c.env);
    const smtpConfigured = smtpConfig !== null;

    if (smtpConfigured) {
      // Do NOT auto-send the first verification email here. The first email is
      // triggered manually by the user (purple "send code" button in the 2FA
      // step), which calls the resend-2fa endpoint. This keeps email consistent
      // with passkey/TOTP (a deliberate user action) and prevents the resend
      // countdown from running before any email has actually been sent.
      return c.json({
        success: true,
        data: {
          message: '請寄送驗證碼到您的信箱以繼續',
          emailSent: false,
          devMode: false,
          twoFactorMethod: 'email' as const,
          passkeyAvailable: false,
          availableMethods: ['email'] as const
        }
      });
    } else {
      // Dev mode: No SMTP configured

      return c.json({
        success: true,
        data: {
          message: '密碼驗證成功（開發模式：無需驗證碼）',
          emailSent: false,
          devMode: true,
          twoFactorMethod: 'email' as const,
          passkeyAvailable: false,
          availableMethods: ['email'] as const
        }
      });
    }
  }
);

/**
 * POST /auth/login-verify-2fa
 * Two-factor authentication step 2: Verify code and issue session
 *
 * Body: { userEmail: string, code: string }
 * Returns: { sessionId: string, user: {...} }
 */
authRouter.post(
  '/login-verify-2fa',
  zValidator('json', LoginVerify2FARequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Extract Cloudflare request context
    const cf = c.req.raw.cf as any;
    const requestContext = {
      ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
      country: cf?.country || c.req.header('CF-IPCountry') || 'unknown',
      city: cf?.city || c.req.header('CF-IPCity') || null,
      timezone: cf?.timezone || c.req.header('CF-Timezone') || 'unknown',
      userAgent: c.req.header('User-Agent') || 'unknown',
      requestPath: c.req.path
    };

    // ─── 2FA Verification with verified flag pattern ───
    // SECURITY: Every path must explicitly set verified=true before JWT is issued.
    // This prevents fallthrough bypass bugs.
    let verified: boolean;

    // Fetch user first to check TOTP status
    const user: any = await c.env.DB
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(body.userEmail)
      .first();

    if (!user) {
      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '用戶不存在' }
      }, 401);
    }

    const totpEnabled = user.totpEnabled === 1;

    // Email is a universal 2FA fallback: TOTP/Passkey users may choose to receive
    // an email code instead. Route by submitted code format —
    // TOTP = 6 digits, recovery = 8 chars; anything else (12-char) is an email code.
    const isTotpFormatCode = /^\d{6}$/.test(body.code) || body.code.length === 8;
    const useTotp = totpEnabled && isTotpFormatCode;

    if (useTotp) {
      // ─── TOTP Verification Path ───
      // TOTP is independent of SMTP — always required when enabled
      const { verifyTotpCode, verifyRecoveryCode } = await import('../utils/totp');

      const totpSecret = user.totpSecret as string;
      if (!totpSecret) {
        // Corrupted state: totpEnabled but no secret
        return c.json({
          success: false,
          error: { code: 'SYSTEM_ERROR', message: 'TOTP 設定異常，請聯繫管理員' }
        }, 500);
      }

      // Try TOTP code first (6 digits)
      let totpValid = false;
      if (/^\d{6}$/.test(body.code)) {
        totpValid = await verifyTotpCode(totpSecret, body.code);
      }

      // If TOTP didn't match, try recovery code (8 chars)
      if (!totpValid) {
        const recoveryCodes = await c.env.DB
          .prepare('SELECT codeId, codeHash FROM totp_recovery_codes WHERE userId = ? AND isUsed = 0')
          .bind(user.userId)
          .all();

        for (const row of recoveryCodes.results) {
          if (await verifyRecoveryCode(body.code, row.codeHash as string)) {
            // Mark recovery code as used
            await c.env.DB
              .prepare('UPDATE totp_recovery_codes SET isUsed = 1, usedAt = ? WHERE codeId = ?')
              .bind(Date.now(), row.codeId)
              .run();

            // Log recovery code usage
            await logGlobalOperation(
              c.env,
              body.userEmail,
              'totp_recovery_code_used',
              'user',
              user.userId as string,
              { codeId: row.codeId, remainingCodes: recoveryCodes.results.length - 1 },
              { level: 'warning' }
            );

            totpValid = true;
            break;
          }
        }
      }

      if (!totpValid) {
        // TOTP verification failed — trigger progressive lockout
        const lockIpAddress = c.req.header('CF-Connecting-IP') || null;
        const lockResult = await check2FAFailureAndLock(
          c.env,
          body.userEmail,
          user.userId as string,
          '2fa_totp_invalid',
          lockIpAddress
        );

        if (lockResult.shouldLock) {
          if (lockResult.lockType === 'permanent') {
            return c.json({
              success: false,
              error: {
                code: 'USER_DISABLED',
                message: 'Account has been permanently disabled due to multiple 2FA verification failures. Please contact an administrator.'
              }
            }, 403);
          } else {
            const durationMinutes = Math.ceil((lockResult.lockDuration || 0) / 60000);
            const durationHours = Math.floor(durationMinutes / 60);
            const durationMins = durationMinutes % 60;
            const timeMessage = durationHours > 0
              ? `${durationHours} hours ${durationMins} minutes`
              : `${durationMins} minutes`;

            return c.json({
              success: false,
              error: {
                code: 'USER_LOCKED',
                message: `Account temporarily locked due to multiple 2FA failures. Please try again in ${timeMessage}.`
              }
            }, 403);
          }
        }

        return c.json({
          success: false,
          error: {
            code: 'INVALID_CODE',
            message: '驗證碼錯誤'
          }
        }, 401);
      }

      verified = true;

    } else {
      // ─── Email OTP Verification Path (existing behavior) ───
      const smtpConfig = await getSmtpConfig(c.env);
      const smtpConfigured = smtpConfig !== null;

      if (smtpConfigured) {
        const verifyResult = await verifyTwoFactorCode(c.env, body.userEmail, body.code);

        if (!verifyResult.success) {
          const lockIpAddress = c.req.header('CF-Connecting-IP') || null;

          let failureReason = '2fa_invalid_code';
          if (verifyResult.error === 'CODE_EXPIRED') {
            failureReason = '2fa_code_expired';
          } else if (verifyResult.error === 'MAX_ATTEMPTS_EXCEEDED') {
            failureReason = '2fa_max_attempts';
          }

          const lockResult = await check2FAFailureAndLock(
            c.env,
            body.userEmail,
            user.userId as string,
            failureReason,
            lockIpAddress
          );

          if (lockResult.shouldLock) {
            if (lockResult.lockType === 'permanent') {
              return c.json({
                success: false,
                error: {
                  code: 'USER_DISABLED',
                  message: 'Account has been permanently disabled due to multiple 2FA verification failures. Please contact an administrator.'
                }
              }, 403);
            } else {
              const durationMinutes = Math.ceil((lockResult.lockDuration || 0) / 60000);
              const durationHours = Math.floor(durationMinutes / 60);
              const durationMins = durationMinutes % 60;
              const timeMessage = durationHours > 0
                ? `${durationHours} hours ${durationMins} minutes`
                : `${durationMins} minutes`;

              return c.json({
                success: false,
                error: {
                  code: 'USER_LOCKED',
                  message: `Account temporarily locked due to multiple 2FA failures. Please try again in ${timeMessage}.`
                }
              }, 403);
            }
          }

          return c.json({
            success: false,
            error: {
              code: verifyResult.error || 'INVALID_CODE',
              message: verifyResult.message || '驗證碼錯誤',
              attemptsLeft: verifyResult.attemptsLeft
            }
          }, 401);
        }

        verified = true;
      } else {
        // Dev mode: SMTP not configured, skip verification
        verified = true;
      }
    }

    // ─── Final safety check: NEVER issue JWT without verification ───
    if (!verified) {
      console.error('[login-verify-2fa] CRITICAL: Reached JWT issuance without verified=true');
      return c.json({
        success: false,
        error: { code: 'SYSTEM_ERROR', message: '驗證系統錯誤' }
      }, 500);
    }

    // Check if user is disabled (re-check in case status changed during verification)
    if (user.status === 'disabled') {
      return c.json({
        success: false,
        error: { code: 'USER_DISABLED', message: '此帳號已被停用' }
      }, 403);
    }

    // Determine devMode for response
    const smtpConfig = await getSmtpConfig(c.env);
    const smtpConfigured = smtpConfig !== null;

    // Generate JWT token
    const sessionTimeout = parseInt(await getConfigValue(c.env, 'SESSION_TIMEOUT'));
    const token = await generateToken(
      user.userId as string,
      user.userEmail as string,
      c.env.JWT_SECRET,
      sessionTimeout
    );

    // Update last activity time
    const now = Date.now();
    await c.env.DB
      .prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
      .bind(now, user.userId)
      .run();

    // Hash token for secure logging
    const tokenBytes = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

    // Log successful login to sys_logs with full Cloudflare context
    await logGlobalOperation(
      c.env,
      user.userEmail as string,
      'login_success',
      'user',
      user.userId as string,
      {
        userEmail: user.userEmail,
        userId: user.userId,
        twoFactorMethod: useTotp ? 'totp' : 'email',
        ipAddress: requestContext.ipAddress,
        country: requestContext.country,
        city: requestContext.city,
        timezone: requestContext.timezone,
        userAgent: requestContext.userAgent,
        requestPath: requestContext.requestPath,
        timestamp: now,
        sessionIdHash: tokenHash // SHA-256 hash (first 16 chars) for security
      },
      { level: 'info' }
    );

    // **FIX: Clear failed attempts AFTER successful 2FA** (not after password)
    const { clearFailedAttempts } = await import('../handlers/auth/login');
    await clearFailedAttempts(c.env.DB, user.userEmail as string);

    // Queue login event for security analysis (Layer 2 defense)
    try {
      const { queueLoginEvent } = await import('../queues/login-events-producer');
      await queueLoginEvent(c.env, {
        eventType: 'login_success',
        userEmail: user.userEmail as string,
        userId: user.userId as string,
        twoFactorMethod: useTotp ? 'totp' : 'email',
        ipAddress: requestContext.ipAddress,
        country: requestContext.country,
        city: requestContext.city,
        timezone: requestContext.timezone,
        userAgent: requestContext.userAgent,
        requestPath: requestContext.requestPath,
        timestamp: now
      });
    } catch (queueError) {
      // **FIX: Queue failure monitoring**
      console.error('[login-verify-2fa] CRITICAL: Failed to queue login event:', queueError);
      await logGlobalOperation(
        c.env,
        'SYSTEM',
        'QUEUE_FAILURE',
        'system',
        'queue',
        { error: String(queueError), userEmail: user.userEmail as string, userId: user.userId as string },
        { level: 'error' }
      );
      // Don't block login if queue fails
    }

    // Get user's global permissions
    const permissions = await getUserGlobalPermissions(c.env.DB, user.userId as string);

    // Return success with token and user info
    return c.json({
      success: true,
      data: {
        sessionId: token,
        devMode: !smtpConfigured,
        user: {
          userId: user.userId,
          userEmail: user.userEmail,
          displayName: user.displayName,
          avatarSeed: user.avatarSeed,
          avatarStyle: user.avatarStyle,
          avatarOptions: user.avatarOptions,
          permissions: permissions
        }
      }
    });
  }
);

/**
 * POST /auth/resend-2fa
 * Resend two-factor authentication verification code
 *
 * Body: { userEmail: string, turnstileToken: string }
 * Returns: { success: true, message: string, emailSent: boolean, devMode: boolean }
 */
authRouter.post(
  '/resend-2fa',
  zValidator('json', Resend2FARequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Get user by email
    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(body.userEmail)
      .first();

    if (!user) {
      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '用戶不存在' }
      }, 401);
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return c.json({
        success: false,
        error: { code: 'USER_DISABLED', message: '此帳號已被停用' }
      }, 403);
    }

    // Email is a universal 2FA fallback — TOTP/Passkey users may also request an
    // email code (verified via the email path in login-verify-2fa by code format).

    // Check if SMTP is configured for sending verification codes (KV-first)
    const smtpConfig = await getSmtpConfig(c.env);
    const smtpConfigured = smtpConfig !== null;

    if (smtpConfigured) {
      // Generate and send new verification code
      const { generateVerificationCode, storeVerificationCode, sendVerificationCodeEmail } =
        await import('../handlers/auth/two-factor');

      const verificationCode = generateVerificationCode();

      // Store verification code in database
      const storeResult = await storeVerificationCode(c.env, body.userEmail, verificationCode);
      if (!storeResult.success) {
        return c.json({
          success: false,
          error: { code: 'SYSTEM_ERROR', message: '系統錯誤，無法生成兩階段驗證碼' }
        }, 500);
      }

      // Send email
      const emailResult = await sendVerificationCodeEmail(c.env, body.userEmail, verificationCode);
      if (!emailResult.success) {
        console.error('[2FA Resend] Failed to send email:', emailResult.error);
        return c.json({
          success: false,
          error: { code: 'EMAIL_ERROR', message: '系統錯誤，無法寄出兩階段驗證信' }
        }, 500);
      }


      return c.json({
        success: true,
        data: {
          message: '驗證碼已重新發送到您的信箱',
          emailSent: true,
          devMode: false,
          expiresAt: storeResult.expiresAt
        }
      });
    } else {
      // Dev mode: No SMTP configured

      return c.json({
        success: true,
        data: {
          message: '開發模式：無需驗證碼',
          emailSent: false,
          devMode: true
        }
      });
    }
  }
);

/**
 * POST /auth/verify-email-for-reset
 * Password reset step 1: Verify email and send 2FA code with IP/country info
 *
 * Body: { userEmail: string, selectedProjectIds?: string[], allParticipated?: boolean, turnstileToken: string }
 * Returns: { verified: true, message: string }
 */
authRouter.post(
  '/verify-email-for-reset',
  zValidator('json', VerifyEmailForResetRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Get IP and country from Cloudflare request
    const ipAddress = c.req.header('CF-Connecting-IP') || 'unknown';
    const cf = c.req.raw.cf as any;
    const country = cf?.country || 'unknown';

    const { verifyEmailForReset } = await import('../handlers/auth/password-reset');
    const result = await verifyEmailForReset(c.env, body.userEmail, ipAddress, country);

    return c.json(result, result.success ? 200 : 400);
  }
);

/**
 * POST /auth/password-reset-verify-code
 * Password reset step 2: Verify 2FA code and return projects
 *
 * Body: { userEmail: string, code: string, turnstileToken: string }
 * Returns: { verified: true, projects: [...] }
 */
authRouter.post(
  '/password-reset-verify-code',
  zValidator('json', PasswordResetVerifyCodeRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    const { verifyCodeAndGetProjects } = await import('../handlers/auth/password-reset');
    const result = await verifyCodeAndGetProjects(
      c.env,
      body.userEmail,
      body.code
    );

    return c.json(result, result.success ? 200 : 400);
  }
);

/**
 * POST /auth/reset-password
 * Password reset step 3: Reset password with new password
 *
 * Body: { userEmail: string, code: string, newPassword: string, turnstileToken: string }
 * Returns: { success: true, message: string }
 */
authRouter.post(
  '/reset-password',
  zValidator('json', ResetPasswordRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Verify Turnstile token (automatically skipped if TURNSTILE_ENABLED=false)
    const { verifyTurnstileMiddleware } = await import('../utils/turnstile');
    const turnstileError = await verifyTurnstileMiddleware(
      c.env,
      body.turnstileToken,
      c.req.header('CF-Connecting-IP')
    );
    if (turnstileError) {
      return c.json(turnstileError, 403);
    }

    const { handlePasswordReset } = await import('../handlers/auth/password-reset');
    const result = await handlePasswordReset(
      c.env,
      body.userEmail,
      body.selectedProjectIds || [],
      body.allParticipated || false,
      body.turnstileToken
    );

    return c.json(result, result.success ? 200 : 400);
  }
);

// ═══════════════════════════════════════════════════════════════
// TOTP (Google Authenticator) Management Endpoints
// All require authentication via authMiddleware
// ═══════════════════════════════════════════════════════════════

/**
 * GET /auth/totp/status
 * Get current TOTP status for the authenticated user
 */
authRouter.get(
  '/totp/status',
  authMiddleware,
  async (c) => {
    const authUser = c.get('user') as any;

    const user = await c.env.DB
      .prepare('SELECT totpEnabled FROM users WHERE userId = ?')
      .bind(authUser.userId)
      .first();

    if (!user) {
      return c.json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: '用戶不存在' }
      }, 404);
    }

    const remainingCodes = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM totp_recovery_codes WHERE userId = ? AND isUsed = 0')
      .bind(authUser.userId)
      .first<{ count: number }>();

    return c.json({
      success: true,
      data: {
        totpEnabled: user.totpEnabled === 1,
        recoveryCodesRemaining: remainingCodes?.count || 0
      }
    });
  }
);

/**
 * POST /auth/totp/setup-init
 * Initialize TOTP setup: generate secret, store in KV temporarily
 */
authRouter.post(
  '/totp/setup-init',
  authMiddleware,
  async (c) => {
    const authUser = c.get('user') as any;

    // Check if TOTP is already enabled
    const user = await c.env.DB
      .prepare('SELECT totpEnabled FROM users WHERE userId = ?')
      .bind(authUser.userId)
      .first();

    if (user?.totpEnabled === 1) {
      return c.json({
        success: false,
        error: { code: 'TOTP_ALREADY_ENABLED', message: 'TOTP 已經啟用' }
      }, 400);
    }

    const { generateTotpSecret, buildOtpauthUri } = await import('../utils/totp');
    const { getSystemTitle } = await import('../utils/email');

    const secret = generateTotpSecret();
    const systemTitle = await getSystemTitle(c.env);
    const otpauthUri = buildOtpauthUri(authUser.userEmail, secret, systemTitle);

    // Store pending secret in KV with 10-minute TTL
    await c.env.KV.put(
      `totp_pending:${authUser.userId}`,
      secret,
      { expirationTtl: 600 }
    );

    await logGlobalOperation(
      c.env,
      authUser.userEmail,
      'totp_setup_initiated',
      'user',
      authUser.userId,
      { userEmail: authUser.userEmail },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: {
        secret,
        otpauthUri
      }
    });
  }
);

/**
 * POST /auth/totp/setup-verify
 * Verify TOTP code and finalize setup (enable TOTP + generate recovery codes)
 */
authRouter.post(
  '/totp/setup-verify',
  authMiddleware,
  zValidator('json', TotpSetupVerifyRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const body = c.req.valid('json');

    // Retrieve pending secret from KV
    const pendingSecret = await c.env.KV.get(`totp_pending:${authUser.userId}`);
    if (!pendingSecret) {
      return c.json({
        success: false,
        error: { code: 'SETUP_EXPIRED', message: 'TOTP 設定已過期，請重新開始' }
      }, 400);
    }

    // Verify the code against the pending secret
    const { verifyTotpCode, generateRecoveryCodes } = await import('../utils/totp');
    const isValid = await verifyTotpCode(pendingSecret, body.code);

    if (!isValid) {
      return c.json({
        success: false,
        error: { code: 'INVALID_CODE', message: '驗證碼錯誤，請確認您的驗證器 App 時間同步' }
      }, 401);
    }

    // Enable TOTP in database
    const now = Date.now();
    await c.env.DB
      .prepare('UPDATE users SET totpSecret = ?, totpEnabled = 1, totpEnabledAt = ? WHERE userId = ?')
      .bind(pendingSecret, now, authUser.userId)
      .run();

    // Generate recovery codes
    const { codes, hashes } = await generateRecoveryCodes(10);

    // Store recovery code hashes
    const stmts = hashes.map((hash, i) => {
      const codeId = `rc_${authUser.userId}_${now}_${i}`;
      return c.env.DB
        .prepare('INSERT INTO totp_recovery_codes (codeId, userId, codeHash, isUsed, createdAt) VALUES (?, ?, ?, 0, ?)')
        .bind(codeId, authUser.userId, hash, now);
    });
    await c.env.DB.batch(stmts);

    // Clean up pending secret
    await c.env.KV.delete(`totp_pending:${authUser.userId}`);

    await logGlobalOperation(
      c.env,
      authUser.userEmail,
      'totp_enabled',
      'user',
      authUser.userId,
      { userEmail: authUser.userEmail, enabledAt: now, recoveryCodesGenerated: codes.length },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: {
        enabled: true,
        recoveryCodes: codes
      }
    });
  }
);

/**
 * POST /auth/totp/disable
 * Disable TOTP (requires password confirmation)
 */
authRouter.post(
  '/totp/disable',
  authMiddleware,
  zValidator('json', TotpDisableRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const body = c.req.valid('json');

    // Fetch user with password for verification
    const user = await c.env.DB
      .prepare('SELECT userId, userEmail, password, totpEnabled FROM users WHERE userId = ?')
      .bind(authUser.userId)
      .first();

    if (!user || user.totpEnabled !== 1) {
      return c.json({
        success: false,
        error: { code: 'TOTP_NOT_ENABLED', message: 'TOTP 尚未啟用' }
      }, 400);
    }

    // Verify password
    const { verifyPassword } = await import('../handlers/auth/password');
    const isValidPassword = await verifyPassword(body.password, user.password as string);
    if (!isValidPassword) {
      return c.json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: '密碼錯誤' }
      }, 401);
    }

    // Disable TOTP
    await c.env.DB
      .prepare('UPDATE users SET totpSecret = NULL, totpEnabled = 0, totpEnabledAt = NULL WHERE userId = ?')
      .bind(authUser.userId)
      .run();

    // Delete all recovery codes
    await c.env.DB
      .prepare('DELETE FROM totp_recovery_codes WHERE userId = ?')
      .bind(authUser.userId)
      .run();

    await logGlobalOperation(
      c.env,
      authUser.userEmail,
      'totp_disabled',
      'user',
      authUser.userId,
      { userEmail: authUser.userEmail },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: { disabled: true }
    });
  }
);

/**
 * POST /auth/totp/recovery-codes/regenerate
 * Regenerate recovery codes (requires password confirmation)
 */
authRouter.post(
  '/totp/recovery-codes/regenerate',
  authMiddleware,
  zValidator('json', TotpRegenerateCodesRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const body = c.req.valid('json');

    // Fetch user with password
    const user = await c.env.DB
      .prepare('SELECT userId, userEmail, password, totpEnabled FROM users WHERE userId = ?')
      .bind(authUser.userId)
      .first();

    if (!user || user.totpEnabled !== 1) {
      return c.json({
        success: false,
        error: { code: 'TOTP_NOT_ENABLED', message: 'TOTP 尚未啟用' }
      }, 400);
    }

    // Verify password
    const { verifyPassword } = await import('../handlers/auth/password');
    const isValidPassword = await verifyPassword(body.password, user.password as string);
    if (!isValidPassword) {
      return c.json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: '密碼錯誤' }
      }, 401);
    }

    // Delete old recovery codes
    await c.env.DB
      .prepare('DELETE FROM totp_recovery_codes WHERE userId = ?')
      .bind(authUser.userId)
      .run();

    // Generate new recovery codes
    const { generateRecoveryCodes } = await import('../utils/totp');
    const { codes, hashes } = await generateRecoveryCodes(10);

    const now = Date.now();
    const stmts = hashes.map((hash, i) => {
      const codeId = `rc_${authUser.userId}_${now}_${i}`;
      return c.env.DB
        .prepare('INSERT INTO totp_recovery_codes (codeId, userId, codeHash, isUsed, createdAt) VALUES (?, ?, ?, 0, ?)')
        .bind(codeId, authUser.userId, hash, now);
    });
    await c.env.DB.batch(stmts);

    await logGlobalOperation(
      c.env,
      authUser.userEmail,
      'totp_recovery_codes_regenerated',
      'user',
      authUser.userId,
      { userEmail: authUser.userEmail, codesGenerated: codes.length },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: {
        recoveryCodes: codes
      }
    });
  }
);

// ─── Passkey (WebAuthn) Routes ───

/**
 * GET /auth/passkey/status
 * Get passkey status and registered credentials for authenticated user
 */
authRouter.get(
  '/passkey/status',
  authMiddleware,
  async (c) => {
    const authUser = c.get('user') as any;

    const { getPasskeyStatus } = await import('../handlers/auth/passkey');
    const status = await getPasskeyStatus(c.env, authUser.userId);

    return c.json({
      success: true,
      data: status
    });
  }
);

/**
 * POST /auth/passkey/register-init
 * Initialize passkey registration ceremony
 */
authRouter.post(
  '/passkey/register-init',
  authMiddleware,
  async (c) => {
    const authUser = c.get('user') as any;

    // 可選 attachment：'platform'（綁這台電腦）/ 'cross-platform'（綁手機，跳 QR）
    const body = await c.req.json().catch(() => ({} as any));
    const attachment =
      body?.attachment === 'platform' || body?.attachment === 'cross-platform'
        ? body.attachment
        : undefined;

    const { initPasskeyRegistration } = await import('../handlers/auth/passkey');
    const options = await initPasskeyRegistration(c.env, authUser.userId, authUser.userEmail, attachment);

    await logGlobalOperation(
      c.env,
      authUser.userEmail,
      'passkey_registration_initiated',
      'user',
      authUser.userId,
      { userEmail: authUser.userEmail },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: options
    });
  }
);

/**
 * POST /auth/passkey/register-verify
 * Complete passkey registration with authenticator response
 */
authRouter.post(
  '/passkey/register-verify',
  authMiddleware,
  zValidator('json', PasskeyRegisterVerifyRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const body = c.req.valid('json');

    try {
      const { verifyPasskeyRegistration } = await import('../handlers/auth/passkey');
      const result = await verifyPasskeyRegistration(
        c.env,
        authUser.userId,
        authUser.userEmail,
        body
      );

      return c.json({
        success: true,
        data: result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return c.json({
        success: false,
        error: { code: 'PASSKEY_REGISTRATION_FAILED', message }
      }, 400);
    }
  }
);

/**
 * GET /auth/passkey/credentials
 * List all registered passkeys for authenticated user
 */
authRouter.get(
  '/passkey/credentials',
  authMiddleware,
  async (c) => {
    const authUser = c.get('user') as any;

    const { getPasskeyStatus } = await import('../handlers/auth/passkey');
    const status = await getPasskeyStatus(c.env, authUser.userId);

    return c.json({
      success: true,
      data: { credentials: status.credentials }
    });
  }
);

/**
 * PATCH /auth/passkey/credentials/:credentialId
 * Update passkey device name
 */
authRouter.patch(
  '/passkey/credentials/:credentialId',
  authMiddleware,
  zValidator('json', PasskeyCredentialUpdateRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const credentialId = c.req.param('credentialId');
    const body = c.req.valid('json');

    const { updatePasskeyName } = await import('../handlers/auth/passkey');
    const updated = await updatePasskeyName(c.env, authUser.userId, credentialId, body.deviceName);

    if (!updated) {
      return c.json({
        success: false,
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Passkey not found' }
      }, 404);
    }

    return c.json({
      success: true,
      data: { message: 'Passkey renamed' }
    });
  }
);

/**
 * DELETE /auth/passkey/credentials/:credentialId
 * Delete a passkey (requires password confirmation)
 */
authRouter.delete(
  '/passkey/credentials/:credentialId',
  authMiddleware,
  zValidator('json', PasskeyCredentialDeleteRequestSchema),
  async (c) => {
    const authUser = c.get('user') as any;
    const credentialId = c.req.param('credentialId');
    const body = c.req.valid('json');

    // Verify password
    const { verifyPassword } = await import('@repo/shared/utils/password');
    const user = await c.env.DB
      .prepare('SELECT password FROM users WHERE userId = ?')
      .bind(authUser.userId)
      .first<{ password: string }>();

    if (!user) {
      return c.json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      }, 404);
    }

    const passwordValid = await verifyPassword(body.password, user.password);
    if (!passwordValid) {
      return c.json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: '密碼錯誤' }
      }, 401);
    }

    const { deletePasskey } = await import('../handlers/auth/passkey');
    const deleted = await deletePasskey(c.env, authUser.userId, authUser.userEmail, credentialId);

    if (!deleted) {
      return c.json({
        success: false,
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Passkey not found' }
      }, 404);
    }

    return c.json({
      success: true,
      data: { message: 'Passkey deleted' }
    });
  }
);

/**
 * POST /auth/passkey/auth-init
 * Initialize passkey authentication ceremony (called after password verification)
 */
authRouter.post(
  '/passkey/auth-init',
  zValidator('json', PasskeyAuthInitRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    const { initPasskeyAuthentication } = await import('../handlers/auth/passkey');
    const options = await initPasskeyAuthentication(c.env, body.userEmail, body.crossDevice === true);

    if (!options) {
      return c.json({
        success: false,
        error: { code: 'NO_PASSKEYS', message: 'User has no passkeys registered' }
      }, 400);
    }

    return c.json({
      success: true,
      data: options
    });
  }
);

/**
 * POST /auth/passkey/auth-verify
 * Complete passkey authentication and issue JWT
 */
authRouter.post(
  '/passkey/auth-verify',
  zValidator('json', PasskeyAuthVerifyRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Verify Turnstile
    const turnstileError = await verifyTurnstileMiddleware(
      c.env,
      body.turnstileToken,
      c.req.header('CF-Connecting-IP')
    );
    if (turnstileError) {
      return c.json(turnstileError, 403);
    }

    try {
      const { verifyPasskeyAuthentication } = await import('../handlers/auth/passkey');
      const result = await verifyPasskeyAuthentication(c.env, body.userEmail, body);

      // Get user info for token
      const user = await c.env.DB
        .prepare(`
          SELECT userId, userEmail, displayName, status, registrationTime, lastActivityTime,
                 avatarSeed, avatarStyle, avatarOptions
          FROM users WHERE userId = ?
        `)
        .bind(result.userId)
        .first();

      if (!user) {
        return c.json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        }, 404);
      }

      // Generate JWT token
      const sessionTimeout = parseInt(await getConfigValue(c.env, 'SESSION_TIMEOUT'));
      const sessionId = await generateToken(
        result.userId,
        body.userEmail,
        c.env.JWT_SECRET,
        sessionTimeout
      );

      // Update last activity time
      await c.env.DB
        .prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
        .bind(Date.now(), result.userId)
        .run();

      // Get global permissions
      const globalPermissions = await getUserGlobalPermissions(c.env.DB, result.userId);

      // Clear any login failure tracking
      const { clearFailedAttempts } = await import('../handlers/auth/login');
      await clearFailedAttempts(c.env.DB, body.userEmail);

      return c.json({
        success: true,
        data: {
          sessionId,
          user: {
            userId: user.userId,
            userEmail: user.userEmail,
            displayName: user.displayName,
            status: user.status,
            registrationTime: user.registrationTime,
            lastActivityTime: user.lastActivityTime,
            avatarSeed: user.avatarSeed,
            avatarStyle: user.avatarStyle,
            avatarOptions: user.avatarOptions ? JSON.parse(user.avatarOptions as string) : undefined,
            globalPermissions
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      return c.json({
        success: false,
        error: { code: 'PASSKEY_AUTH_FAILED', message }
      }, 401);
    }
  }
);

export default authRouter;
