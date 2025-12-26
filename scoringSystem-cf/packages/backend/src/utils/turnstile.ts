/**
 * Cloudflare Turnstile Verification Utilities
 * Provides CAPTCHA verification to prevent bot attacks and brute force attempts
 */

import { getConfigValue } from './config';

interface TurnstileVerificationResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

interface VerifyResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    errorCodes?: string[];
  };
  data?: {
    challengeTimestamp: string;
    hostname: string;
  };
}

/**
 * Verify Turnstile token from client
 * @param token - Turnstile token from frontend
 * @param secretKey - Turnstile secret key from env
 * @param remoteIp - User's IP address (optional)
 * @returns Verification result
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<VerifyResult> {
  try {
    // Check if token exists
    if (!token) {
      return {
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: '缺少驗證 token'
        }
      };
    }

    // Check if secret key exists
    if (!secretKey) {
      console.error('TURNSTILE_SECRET_KEY not configured');
      return {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: '系統配置錯誤，請聯繫管理員'
        }
      };
    }

    // Call Cloudflare Turnstile API
    const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    // Build form data
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    // Make verification request
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      console.error('Turnstile API returned error status:', response.status);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: '驗證服務暫時無法使用，請稍後再試'
        }
      };
    }

    // Parse response
    const result: TurnstileVerificationResponse = await response.json();

    if (!result.success) {
      // Verification failed
      const errorCodes = result['error-codes'] || [];
      console.warn('Turnstile verification failed:', errorCodes);

      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: '驗證失敗，請重新嘗試',
          errorCodes
        }
      };
    }

    // Verification succeeded
    return {
      success: true,
      data: {
        challengeTimestamp: result.challenge_ts || '',
        hostname: result.hostname || ''
      }
    };

  } catch (error) {
    console.error('Turnstile verification error:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '驗證過程發生錯誤',
      }
    };
  }
}

/**
 * Get Turnstile configuration (public info only) - KV-first strategy
 * @param env - Environment variables
 * @returns Turnstile config
 */
export async function getTurnstileConfig(env: any): Promise<{
  enabled: boolean;
  siteKey: string | null;
}> {
  const enabled = await getConfigValue(env, 'TURNSTILE_ENABLED');
  const siteKey = await getConfigValue(env, 'TURNSTILE_SITE_KEY');

  return {
    enabled: enabled === 'true',
    siteKey: siteKey || null
  };
}

/**
 * Check if Turnstile is properly configured - KV-first strategy
 * @param env - Environment variables
 * @returns Configuration status
 */
export async function checkTurnstileConfiguration(env: any): Promise<{
  configured: boolean;
  enabled: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  const siteKey = await getConfigValue(env, 'TURNSTILE_SITE_KEY');
  const secretKey = await getConfigValue(env, 'TURNSTILE_SECRET_KEY');
  const enabled = await getConfigValue(env, 'TURNSTILE_ENABLED');

  if (!siteKey) {
    issues.push('TURNSTILE_SITE_KEY not configured');
  }

  if (!secretKey) {
    issues.push('TURNSTILE_SECRET_KEY not configured');
  }

  return {
    configured: issues.length === 0,
    enabled: enabled === 'true',
    issues
  };
}

/**
 * Middleware-style verification function for use in route handlers
 * Returns null if verification passes, or error response if it fails
 *
 * @param env - Environment variables
 * @param turnstileToken - Token from request body
 * @param remoteIp - User's IP address
 * @returns null if passes, error object if fails
 */
export async function verifyTurnstileMiddleware(
  env: any,
  turnstileToken: string | undefined,
  remoteIp?: string
): Promise<null | { success: false; error: string; errorCode: string }> {
  // Check if Turnstile is enabled (KV-first)
  const enabledValue = await getConfigValue(env, 'TURNSTILE_ENABLED');
  const enabled = enabledValue === 'true';

  if (!enabled) {
    // Turnstile disabled, allow request
    return null;
  }

  // Check if token provided
  if (!turnstileToken) {
    return {
      success: false,
      error: 'Missing Turnstile verification token',
      errorCode: 'MISSING_TURNSTILE_TOKEN'
    };
  }

  // Get secret key (KV-first)
  const secretKey = await getConfigValue(env, 'TURNSTILE_SECRET_KEY');

  // Verify token
  const result = await verifyTurnstileToken(
    turnstileToken,
    secretKey,
    remoteIp
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error?.message || 'Turnstile verification failed',
      errorCode: result.error?.code || 'TURNSTILE_VERIFICATION_FAILED'
    };
  }

  // Verification passed
  return null;
}

/**
 * Error codes reference:
 *
 * missing-input-secret: The secret parameter was not passed.
 * invalid-input-secret: The secret parameter was invalid or did not exist.
 * missing-input-response: The response parameter was not passed.
 * invalid-input-response: The response parameter is invalid or has expired.
 * bad-request: The request was rejected because it was malformed.
 * timeout-or-duplicate: The response parameter has already been validated before.
 */
