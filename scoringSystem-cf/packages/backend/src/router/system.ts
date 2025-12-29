/**
 * @fileoverview System management routes (admin only)
 * Shows system configuration status without exposing secrets
 *
 * Migrated to Hono RPC format with Zod validation
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { requireSystemAdmin } from '../middleware/permissions';
import { getSecretsChecklist } from '../handlers/system/settings';
import { getSystemLogs, getLogStatistics } from '../handlers/admin/system';
import { getConfigValue } from '../utils/config';
import { hasGlobalPermission, GLOBAL_PERMISSIONS } from '../utils/permissions';
import { getSystemTitle } from '../utils/email';
import {
  TurnstileConfigSchema,
  SystemInfoSchema,
  SystemLogsQuerySchema,
  CreateAIProviderRequestSchema,
  UpdateAIProviderRequestSchema,
  DeleteAIProviderRequestSchema,
  TestAIProviderRequestSchema,
  UpdateAIPromptConfigRequestSchema
} from '@repo/shared/schemas/system';
import {
  listAIProviders,
  createAIProvider,
  updateAIProviderHandler,
  deleteAIProviderHandler,
  testAIProviderHandler,
  getAIPromptConfig,
  updateAIPromptConfig
} from '../handlers/system/aiProviders';

const systemRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /system/turnstile-config
 * Get Turnstile configuration (public endpoint, no auth required)
 *
 * This endpoint doesn't require authentication since it only returns public configuration
 * (site key and enabled status, NOT the secret key)
 */
systemRouter.post('/turnstile-config', async (c) => {
  // Use KV-first configuration strategy
  const enabled = await getConfigValue(c.env, 'TURNSTILE_ENABLED');
  const siteKey = await getConfigValue(c.env, 'TURNSTILE_SITE_KEY');

  const data: z.infer<typeof TurnstileConfigSchema> = {
    enabled: enabled === 'true',
    siteKey: siteKey || null
  };

  return c.json({
    success: true,
    data
  });
});

/**
 * GET /system/info
 * Get basic system information (public endpoint, no auth required)
 */
systemRouter.get('/info', async (c) => {
  const systemTitle = await getSystemTitle(c.env);
  const brandingIcon = await getConfigValue(c.env, 'BRANDING_ICON') || 'fa-star';

  const data: z.infer<typeof SystemInfoSchema> = {
    name: 'Scoring System API',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT || 'development',
    systemTitle,
    brandingIcon,
    timestamp: Date.now()
  };

  return c.json({
    success: true,
    data
  });
});

/**
 * POST /system/info
 * Get basic system information (public endpoint, no auth required)
 * Backward compatibility for frontend using POST
 */
systemRouter.post('/info', async (c) => {
  const systemTitle = await getSystemTitle(c.env);
  const brandingIcon = await getConfigValue(c.env, 'BRANDING_ICON') || 'fa-star';

  const data: z.infer<typeof SystemInfoSchema> = {
    name: 'Scoring System API',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT || 'development',
    systemTitle,
    brandingIcon,
    timestamp: Date.now()
  };

  return c.json({
    success: true,
    data
  });
});

/**
 * All remaining system routes require authentication and system admin permission
 */
systemRouter.use('*', authMiddleware);

/**
 * Permission middleware for log endpoints
 * Allows either system_admin OR view_system_logs permission
 */
const requireViewSystemLogs = async (c: any, next: any) => {
  const user = c.get('user');

  if (!user) {
    return c.json({
      success: false,
      error: 'Authentication required',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }

  // Check if user has view_system_logs or system_admin permission
  const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.VIEW_SYSTEM_LOGS) ||
                        await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);

  if (!hasPermission) {
    return c.json({
      success: false,
      error: 'Insufficient permissions - requires view_system_logs or system_admin',
      errorCode: 'ACCESS_DENIED'
    }, 403);
  }

  return next();
};

/**
 * POST /system/logs
 * Get system logs with filters
 * Body: { options: { level?, action?, startTime?, endTime?, limit?, offset? } }
 *
 * Permission: view_system_logs OR system_admin
 */
systemRouter.post(
  '/logs',
  zValidator('json', SystemLogsQuerySchema),
  requireViewSystemLogs,
  async (c) => {
    const body = c.req.valid('json');
    const { options = {}, limit, level, search } = body;

    // Merge options from both body formats
    const mergedOptions = {
      ...options,
      ...(limit !== undefined && { limit }),
      ...(level !== undefined && { level }),
      ...(search !== undefined && { search })
    };

    return await getSystemLogs(c.env, mergedOptions);
  }
);

/**
 * POST /system/logs/stats
 * Get log statistics
 *
 * Permission: view_system_logs OR system_admin
 */
systemRouter.post('/logs/stats', requireViewSystemLogs, async (c) => {
  return await getLogStatistics(c.env);
});

/**
 * POST /system/logs-stats
 * Get log statistics (alias for backward compatibility)
 *
 * Permission: view_system_logs OR system_admin
 */
systemRouter.post('/logs-stats', requireViewSystemLogs, async (c) => {
  return await getLogStatistics(c.env);
});

/**
 * GET /system/secrets-checklist
 * Get checklist of required and optional secrets
 *
 * Shows which secrets are configured (YES/NO) without showing the values
 *
 * Permission: system_admin ONLY
 *
 * Example response:
 * {
 *   required: [
 *     { name: 'JWT_SECRET', configured: true, status: '✓ Configured' }
 *   ],
 *   optional: [
 *     { name: 'GMAIL_API_KEY', configured: false, status: '✗ Not configured',
 *       setupCommand: 'npm run secret:put GMAIL_API_KEY' }
 *   ]
 * }
 */

// ============================================
// AI Provider Management Routes
// ============================================

/**
 * Permission middleware for AI provider management
 * Requires system_admin permission
 */
const requireAIProviderAdmin = async (c: any, next: any) => {
  const user = c.get('user');

  if (!user) {
    return c.json({
      success: false,
      error: 'Authentication required',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }

  // Check if user has system_admin permission
  const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);

  if (!hasPermission) {
    return c.json({
      success: false,
      error: 'Insufficient permissions - requires system_admin',
      errorCode: 'ACCESS_DENIED'
    }, 403);
  }

  return next();
};

/**
 * POST /system/ai-providers/list
 * List all AI providers (without apiKey)
 *
 * Permission: system_admin
 */
systemRouter.post('/ai-providers/list', requireAIProviderAdmin, async (c) => {
  return await listAIProviders(c.env);
});

/**
 * POST /system/ai-providers/create
 * Create a new AI provider
 *
 * Permission: system_admin
 */
systemRouter.post(
  '/ai-providers/create',
  zValidator('json', CreateAIProviderRequestSchema),
  requireAIProviderAdmin,
  async (c) => {
    const body = c.req.valid('json');
    return await createAIProvider(c.env, body);
  }
);

/**
 * POST /system/ai-providers/update
 * Update an existing AI provider
 *
 * Permission: system_admin
 */
systemRouter.post(
  '/ai-providers/update',
  zValidator('json', UpdateAIProviderRequestSchema),
  requireAIProviderAdmin,
  async (c) => {
    const body = c.req.valid('json');
    const { providerId, ...updates } = body;
    return await updateAIProviderHandler(c.env, providerId, updates);
  }
);

/**
 * POST /system/ai-providers/delete
 * Delete an AI provider
 *
 * Permission: system_admin
 */
systemRouter.post(
  '/ai-providers/delete',
  zValidator('json', DeleteAIProviderRequestSchema),
  requireAIProviderAdmin,
  async (c) => {
    const body = c.req.valid('json');
    return await deleteAIProviderHandler(c.env, body.providerId);
  }
);

/**
 * POST /system/ai-providers/test
 * Test an AI provider connection
 *
 * Permission: system_admin
 */
systemRouter.post(
  '/ai-providers/test',
  zValidator('json', TestAIProviderRequestSchema),
  requireAIProviderAdmin,
  async (c) => {
    const body = c.req.valid('json');
    return await testAIProviderHandler(c.env, body.providerId);
  }
);

/**
 * POST /system/ai-prompts/get
 * Get AI prompt configuration
 *
 * Permission: system_admin
 */
systemRouter.post('/ai-prompts/get', requireAIProviderAdmin, async (c) => {
  return await getAIPromptConfig(c.env);
});

/**
 * POST /system/ai-prompts/update
 * Update AI prompt configuration
 *
 * Permission: system_admin
 */
systemRouter.post(
  '/ai-prompts/update',
  zValidator('json', UpdateAIPromptConfigRequestSchema),
  requireAIProviderAdmin,
  async (c) => {
    const body = c.req.valid('json');
    return await updateAIPromptConfig(c.env, body);
  }
);

export default systemRouter;
