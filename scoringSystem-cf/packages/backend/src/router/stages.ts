import type { Env } from '../types';
/**
 * Stage Management Router
 * Migrated from GAS scripts/stages_api.js
 *
 * Endpoints:
 * - POST /stages/create - Create new stage
 * - POST /stages/get - Get stage details
 * - POST /stages/update - Update stage
 * - POST /stages/delete - Delete (archive) stage
 * - POST /stages/list - List project stages
 * - POST /stages/clone - Clone existing stage
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import { logProjectOperation } from '@utils/logging';
import {
  createStage,
  getStage,
  updateStage,
  listProjectStages,
  cloneStage
} from '../handlers/stages/manage';
import {
  getStageConfig,
  updateStageConfig,
  resetStageConfig
} from '../handlers/stages/config';
import {
  CreateStageRequestSchema,
  GetStageRequestSchema,
  UpdateStageRequestSchema,
  ListStagesRequestSchema,
  CloneStageRequestSchema,
  CheckVotingLockRequestSchema,
  ForceStageTransitionRequestSchema,
  GetStageConfigRequestSchema,
  UpdateStageConfigRequestSchema,
  ResetStageConfigRequestSchema
} from '@repo/shared/schemas/stages';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Create new stage
 * Body: { projectId, stageData: { stageName, description?, startTime, endTime, ... } }
 */
app.post(
  '/create',
  zValidator('json', CreateStageRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission on project
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to create stages',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await createStage(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageData
    );

    return response;
  }
);

/**
 * Get stage details
 * Body: { projectId, stageId }
 */
app.post(
  '/get',
  zValidator('json', GetStageRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view stages',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStage(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Update stage
 * Body: { projectId, stageId, updates: { stageName?, description?, ... } }
 */
app.post(
  '/update',
  zValidator('json', UpdateStageRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to update stages',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await updateStage(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.updates
    );

    return response;
  }
);

/**
 * List project stages
 * Body: { projectId, includeArchived? }
 */
app.post(
  '/list',
  zValidator('json', ListStagesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view stages',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await listProjectStages(
      c.env,
      user.userEmail,
      body.projectId,
      body.includeArchived
    );

    return response;
  }
);

/**
 * Clone existing stage
 * Body: { projectId, stageId, newStageName, startTime?, endTime? }
 */
app.post(
  '/clone',
  zValidator('json', CloneStageRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to clone stages',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await cloneStage(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.newStageName,
      body.startTime,
      body.endTime
    );

    return response;
  }
);

/**
 * Check if stage has voting records (voting lock check)
 * Body: { projectId, stageId }
 */
app.post(
  '/check-voting-lock',
  zValidator('json', CheckVotingLockRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to check stage status',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Check if stage has ANY votes from VIEW (any votes lock time modifications)
    const voteStatus = await c.env.DB.prepare(`
      SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
    `).bind(body.stageId, body.projectId).first();

    const hasAnyVotes = voteStatus?.hasAnyVotes ? true : false;

    return c.json({
      success: true,
      data: {
        hasVotes: hasAnyVotes,
        canModifyTime: !hasAnyVotes
      }
    });
  }
);

/**
 * Force stage to voting status (manual override)
 * Sets forceVotingTime timestamp to force stage into voting status
 * Body: { projectId, stageId }
 * Note: No longer uses CAS - uses timestamp-based approach for status override
 */
app.post(
  '/force-transition',
  zValidator('json', ForceStageTransitionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to force stage transition',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Get current stage with auto-calculated status
    const stage = await c.env.DB.prepare(`
      SELECT * FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(body.stageId, body.projectId).first();

    if (!stage) {
      return c.json({
        success: false,
        error: 'Stage not found',
        errorCode: 'STAGE_NOT_FOUND'
      }, 404);
    }

    const oldStatus = stage.status as string;

    // VOTING LOCK: Prevent forcing to voting if votes already exist
    // This prevents confusion where votes exist but stage is forced back to voting
    const voteStatus = await c.env.DB.prepare(`
      SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
    `).bind(body.stageId, body.projectId).first();

    if (voteStatus?.hasAnyVotes) {
      return c.json({
        success: false,
        error: '本階段已有投票紀錄，無法強制進入投票狀態',
        errorCode: 'VOTING_LOCKED',
        data: {
          currentStatus: oldStatus,
          reason: 'Cannot force to voting when votes already exist'
        }
      }, 400);
    }

    const updateTime = Date.now();

    // Set forceVotingTime timestamp - no CAS needed, VIEW will calculate status = 'voting'
    await c.env.DB.prepare(`
      UPDATE stages
      SET forceVotingTime = ?,
          updatedAt = ?
      WHERE stageId = ? AND projectId = ?
    `).bind(updateTime, updateTime, body.stageId, body.projectId).run();

    // Send notifications for status change
    try {
      const stageName = (stage as any).stageName || '未命名階段';

      // Get all project viewers (teachers, observers, members)
      const viewers = await c.env.DB.prepare(`
        SELECT userEmail FROM projectviewers
        WHERE projectId = ? AND isActive = 1
      `).bind(body.projectId).all();

      if (viewers.results && viewers.results.length > 0) {
        const { createBatchNotifications } = await import('../utils/notifications.js');
        await createBatchNotifications(c.env, viewers.results.map((v: any) => ({
          targetUserEmail: v.userEmail,
          type: 'stage_voting',
          title: '階段進入投票',
          content: `${stageName} 階段已強制進入投票階段（管理員操作）`,
          projectId: body.projectId,
          stageId: body.stageId
        })));
      }
    } catch (error) {
      console.error('[forceStageTransition] Failed to send status change notifications:', error);
      // Don't fail the transition if notification fails
    }

    // Log the forced transition
    await logProjectOperation(c.env, user.userEmail, body.projectId, 'stage_forced_transition', 'stage', body.stageId, {
      stageName: stage.stageName,
      from: oldStatus,
      to: 'voting',
      forcedBy: user.userEmail,
      forceVotingTime: updateTime
    });

    return c.json({
      success: true,
      message: `Stage forced to voting status`,
      data: {
        stageId: body.stageId,
        oldStatus,
        newStatus: 'voting',
        forceVotingTime: updateTime,
        updatedAt: updateTime
      }
    });
  }
);

/**
 * Get stage configuration
 * Body: { projectId, stageId }
 */
app.post(
  '/config/get',
  zValidator('json', GetStageConfigRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view stage configuration',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageConfig(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Update stage configuration
 * Body: { projectId, stageId, configUpdates: { ... } }
 */
app.post(
  '/config/update',
  zValidator('json', UpdateStageConfigRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to update stage configuration',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await updateStageConfig(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.configUpdates
    );

    return response;
  }
);

/**
 * Reset stage configuration to defaults
 * Body: { projectId, stageId }
 */
app.post(
  '/config/reset',
  zValidator('json', ResetStageConfigRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to reset stage configuration',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await resetStageConfig(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

export default app;
