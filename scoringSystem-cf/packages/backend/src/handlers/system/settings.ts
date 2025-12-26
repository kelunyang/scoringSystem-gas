/**
 * @fileoverview System settings management
 * Shows configuration status (without exposing secrets)
 */

import type { Env } from '../../types';
import { successResponse, errorResponse, ERROR_CODES } from '../../utils/response';
import { getSystemTitle } from '../../utils/email';
import { getConfigValue } from '../../utils/config';

/**
 * Get system settings (for admin dashboard)
 * Shows configuration status WITHOUT exposing secret values
 *
 * @param env - Cloudflare Workers environment
 * @param db - D1 database instance
 * @returns System configuration status
 *
 * @example
 * const settings = await getSystemSettings(env, db);
 * // Returns: { jwtConfigured: true, sessionTimeout: 86400000, ... }
 */
export async function getSystemSettings(
  env: Env,
  db: D1Database
): Promise<Response> {
  try {
    // Get system title from KV or environment
    const systemTitle = await getSystemTitle(env);

    // Public configuration (now from KV-first)
    const publicConfig = {
      systemTitle,
      sessionTimeout: await getConfigValue(env, 'SESSION_TIMEOUT', { parseAsInt: true }),
      passwordSaltRounds: await getConfigValue(env, 'PASSWORD_SALT_ROUNDS', { parseAsInt: true }),
      inviteCodeTimeout: await getConfigValue(env, 'INVITE_CODE_TIMEOUT', { parseAsInt: true }),
      maxProjectNameLength: await getConfigValue(env, 'MAX_PROJECT_NAME_LENGTH', { parseAsInt: true })
    };

    // Secret configuration status (YES/NO, not the actual values)
    const secretsStatus = {
      jwtSecretConfigured: !!env.JWT_SECRET,
      gmailConfigured: !!(env.GMAIL_API_KEY && env.GMAIL_FROM_EMAIL)
    };

    // Turnstile configuration (site key is public, secret key is private)
    const turnstileEnabled = await getConfigValue(env, 'TURNSTILE_ENABLED');
    const turnstileSiteKey = await getConfigValue(env, 'TURNSTILE_SITE_KEY');
    const turnstileSecretKey = await getConfigValue(env, 'TURNSTILE_SECRET_KEY');
    const turnstileConfig = {
      turnstileEnabled: turnstileEnabled === 'true',
      turnstileSiteKey: turnstileSiteKey || null,  // Public key, can be exposed
      turnstileConfigured: !!(turnstileSiteKey && turnstileSecretKey)
    };

    // Database statistics
    const stats = await getDatabaseStats(db);

    return successResponse({
      ...publicConfig,
      ...secretsStatus,
      ...turnstileConfig,
      ...stats,
      version: '1.0.0',
      environment: env.ENVIRONMENT || 'development'
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get system settings'
    );
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats(db: D1Database): Promise<{
  totalUsers: number;
  totalProjects: number;
  totalInvitationCodes: number;
}> {
  try {
    const [usersResult, projectsResult, invitesResult] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM users').first(),
      db.prepare('SELECT COUNT(*) as count FROM projects').first(),
      db.prepare('SELECT COUNT(*) as count FROM invitation_codes_with_status WHERE status = ?').bind('active').first()
    ]);

    return {
      totalUsers: (usersResult?.count as number) || 0,
      totalProjects: (projectsResult?.count as number) || 0,
      totalInvitationCodes: (invitesResult?.count as number) || 0
    };
  } catch (error) {
    console.error('Get database stats error:', error);
    return {
      totalUsers: 0,
      totalProjects: 0,
      totalInvitationCodes: 0
    };
  }
}

/**
 * Update system settings (admin only)
 * Only allows updating non-sensitive configuration
 *
 * @param env - Cloudflare Workers environment
 * @param db - D1 database instance
 * @param updates - Settings to update
 * @returns Updated settings
 *
 * @example
 * const result = await updateSystemSettings(env, db, {
 *   maxInvitesPerDay: 100
 * });
 */
export async function updateSystemSettings(
  env: Env,
  db: D1Database,
  updates: Record<string, any>
): Promise<Response> {
  try {
    // Note: Environment variables (vars) cannot be updated at runtime
    // They must be changed in wrangler.toml and redeployed

    // For runtime-configurable settings, we can store them in the database
    // Let's create a system_settings table for this purpose

    const allowedSettings = [
      'maxInvitesPerDay',
      'inviteCodeTimeout',
      'maxProjectNameLength'
    ];

    const settingsToUpdate: Record<string, any> = {};
    for (const key of allowedSettings) {
      if (updates[key] !== undefined) {
        settingsToUpdate[key] = updates[key];
      }
    }

    if (Object.keys(settingsToUpdate).length === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'No valid settings to update'
      );
    }

    // Store in database (we'll need a system_settings table)
    // For now, just return a message about how to update
    return successResponse({
      message: 'To update environment settings, modify wrangler.toml and redeploy',
      requestedUpdates: settingsToUpdate,
      instructions: [
        '1. Edit wrangler.toml [vars] section',
        '2. Run: npm run deploy',
        '3. Settings will be updated after deployment'
      ]
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update system settings'
    );
  }
}

/**
 * Get secrets configuration checklist
 * Helps admin verify all required secrets are configured
 *
 * @param env - Cloudflare Workers environment
 * @returns Checklist of required and optional secrets
 *
 * @example
 * const checklist = await getSecretsChecklist(env);
 * // Returns:
 * // {
 * //   required: [
 * //     { name: 'JWT_SECRET', configured: true, status: '✓' }
 * //   ],
 * //   optional: [
 * //     { name: 'GMAIL_API_KEY', configured: false, status: '✗' }
 * //   ]
 * // }
 */
export async function getSecretsChecklist(env: Env): Promise<Response> {
  try {
    const requiredSecrets = [
      {
        name: 'JWT_SECRET',
        description: 'JWT signing secret for authentication',
        configured: !!env.JWT_SECRET,
        status: env.JWT_SECRET ? '✓ Configured' : '✗ Missing',
        setupCommand: 'npm run secret:generate && npm run secret:put JWT_SECRET'
      }
    ];

    // Get Turnstile config using KV-first strategy
    const turnstileSecretKey = await getConfigValue(env, 'TURNSTILE_SECRET_KEY');
    const turnstileSiteKey = await getConfigValue(env, 'TURNSTILE_SITE_KEY');

    const optionalSecrets = [
      {
        name: 'TURNSTILE_SECRET_KEY',
        description: 'Cloudflare Turnstile secret key (CAPTCHA)',
        configured: !!turnstileSecretKey,
        status: turnstileSecretKey ? '✓ Configured' : '○ Not configured',
        setupCommand: 'npm run secret:put TURNSTILE_SECRET_KEY',
        siteKey: turnstileSiteKey || null
      },
      {
        name: 'GMAIL_API_KEY',
        description: 'Gmail API key for sending emails',
        configured: !!env.GMAIL_API_KEY,
        status: env.GMAIL_API_KEY ? '✓ Configured' : '○ Not configured',
        setupCommand: 'npm run secret:put GMAIL_API_KEY'
      },
      {
        name: 'GMAIL_FROM_EMAIL',
        description: 'Email address for sending notifications',
        configured: !!env.GMAIL_FROM_EMAIL,
        status: env.GMAIL_FROM_EMAIL ? '✓ Configured' : '○ Not configured',
        setupCommand: 'npm run secret:put GMAIL_FROM_EMAIL',
        value: env.GMAIL_FROM_EMAIL || null  // Email address can be public
      }
    ];

    const allConfigured = requiredSecrets.every(s => s.configured);

    return successResponse({
      allRequiredConfigured: allConfigured,
      required: requiredSecrets,
      optional: optionalSecrets,
      summary: {
        requiredConfigured: requiredSecrets.filter(s => s.configured).length,
        requiredTotal: requiredSecrets.length,
        optionalConfigured: optionalSecrets.filter(s => s.configured).length,
        optionalTotal: optionalSecrets.length
      }
    });
  } catch (error) {
    console.error('Get secrets checklist error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get secrets checklist'
    );
  }
}

/**
 * System health check
 *
 * @param env - Cloudflare Workers environment
 * @param db - D1 database instance
 * @returns System health status
 */
export async function getSystemHealth(
  env: Env,
  db: D1Database
): Promise<Response> {
  try {
    const checks = {
      database: false,
      jwtSecret: false,
      overall: false
    };

    // Check database
    try {
      await db.prepare('SELECT 1').first();
      checks.database = true;
    } catch {
      checks.database = false;
    }

    // Check JWT secret
    checks.jwtSecret = !!env.JWT_SECRET;

    // Overall health
    checks.overall = checks.database && checks.jwtSecret;

    return successResponse({
      status: checks.overall ? 'healthy' : 'unhealthy',
      checks,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('System health check error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Health check failed'
    );
  }
}
