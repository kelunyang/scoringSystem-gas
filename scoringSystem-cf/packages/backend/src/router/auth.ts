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
import { validateRequired, jsonResponse, ERROR_CODES } from '../utils/response';
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
  LogoutRequestSchema,
  ValidateSessionRequestSchema,
  ChangePasswordRequestSchema,
  CheckEmailQuerySchema,
  CurrentUserRequestSchema,
  RefreshTokenRequestSchema,
  Resend2FARequestSchema,
  VerifyEmailForResetRequestSchema,
  PasswordResetVerifyCodeRequestSchema,
  ResetPasswordRequestSchema
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

    // Legacy alias for compatibility
    const ipAddress = requestContext.ipAddress === 'unknown' ? null : requestContext.ipAddress;

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

    // Check if SMTP is configured for sending verification codes (KV-first)
    const smtpConfig = await getSmtpConfig(c.env);
    const smtpConfigured = smtpConfig !== null;

    if (smtpConfigured) {
      // Send verification code via email
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
        console.error('[2FA] Failed to send email:', emailResult.error);
        return c.json({
          success: false,
          error: { code: 'EMAIL_ERROR', message: '系統錯誤，無法寄出兩階段驗證信' }
        }, 500);
      }


      return c.json({
        success: true,
        data: {
          message: '驗證碼已發送到您的信箱',
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
          message: '密碼驗證成功（開發模式：無需驗證碼）',
          emailSent: false,
          devMode: true
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

    // Legacy alias for compatibility
    const ipAddress = requestContext.ipAddress === 'unknown' ? null : requestContext.ipAddress;

    // Check if SMTP is configured (KV-first, fallback to env)
    const smtpConfig = await getSmtpConfig(c.env);
    const smtpConfigured = smtpConfig !== null;

    // Declare verifyResult at outer scope to access user data later
    let verifyResult: any;

    if (smtpConfigured) {
      // Validate verification code from database (also returns user data to avoid duplicate query)
      verifyResult = await verifyTwoFactorCode(c.env, body.userEmail, body.code);

      if (!verifyResult.success) {
        // User data is now included in verifyResult (no duplicate query needed)
        const user = verifyResult.user;

        if (!user) {
          return c.json({
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: '用戶不存在' }
          }, 401);
        }

        // Get IP address for logging
        const ipAddress = c.req.header('CF-Connecting-IP') || null;

        // Map verification error to failure reason
        let failureReason = '2fa_invalid_code';
        if (verifyResult.error === 'CODE_EXPIRED') {
          failureReason = '2fa_code_expired';
        } else if (verifyResult.error === 'MAX_ATTEMPTS_EXCEEDED') {
          failureReason = '2fa_max_attempts';
        }

        // Check for progressive lockout
        const lockResult = await check2FAFailureAndLock(
          c.env,
          body.userEmail,
          user.userId as string,
          failureReason,
          ipAddress
        );

        if (lockResult.shouldLock) {
          // Account has been locked
          if (lockResult.lockType === 'permanent') {
            return c.json({
              success: false,
              error: {
                code: 'USER_DISABLED',
                message: 'Account has been permanently disabled due to multiple 2FA verification failures. Please contact an administrator.'
              }
            }, 403);
          } else {
            // Temporary lock
            const durationMinutes = Math.ceil((lockResult.lockDuration || 0) / 60000);
            const durationHours = Math.floor(durationMinutes / 60);
            const durationMins = durationMinutes % 60;

            let timeMessage = '';
            if (durationHours > 0) {
              timeMessage = `${durationHours} hours ${durationMins} minutes`;
            } else {
              timeMessage = `${durationMins} minutes`;
            }

            return c.json({
              success: false,
              error: {
                code: 'USER_LOCKED',
                message: `Account temporarily locked due to multiple 2FA failures. Please try again in ${timeMessage}.`
              }
            }, 403);
          }
        }

        // Return original error if no lock triggered
        return c.json({
          success: false,
          error: {
            code: verifyResult.error || 'INVALID_CODE',
            message: verifyResult.message || '驗證碼錯誤',
            attemptsLeft: verifyResult.attemptsLeft
          }
        }, 401);
      }

    }

    // Get user data (from verification result in production, or query in dev mode)
    let user;
    if (smtpConfigured) {
      // Production: user already fetched in verifyTwoFactorCode
      user = verifyResult.user;
    } else {
      // Dev mode: need to query user
      user = await c.env.DB
        .prepare('SELECT * FROM users WHERE userEmail = ?')
        .bind(body.userEmail)
        .first();
    }

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

export default authRouter;
