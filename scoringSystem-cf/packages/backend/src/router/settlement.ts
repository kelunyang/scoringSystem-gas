import type { Env } from '../types';
/**
 * Settlement Management Router
 * Migrated from GAS scripts/settlement_api.js
 *
 * Endpoints:
 * - POST /settlement/reverse - Reverse a settlement
 * - POST /settlement/history - Get settlement history
 * - POST /settlement/details - Get settlement details
 * - POST /settlement/transactions - Get settlement transactions
 * - POST /settlement/stage-rankings - Get stage settlement rankings
 * - POST /settlement/comment-rankings - Get comment settlement rankings
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  reverseSettlement,
  getReversePreview,
  getSettlementHistory,
  getSettlementDetails,
  getSettlementTransactions,
  getStageSettlementRankings,
  getCommentSettlementRankings
} from '../handlers/settlement/manage';
import {
  ReverseSettlementRequestSchema,
  GetReversePreviewRequestSchema,
  GetSettlementHistoryRequestSchema,
  GetSettlementDetailsRequestSchema,
  GetStageSettlementRankingsRequestSchema,
  GetCommentSettlementRankingsRequestSchema
} from '@repo/shared/schemas/settlement';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Reverse a settlement
 * Body: { projectId, settlementId, reason }
 */
app.post(
  '/reverse',
  zValidator('json', ReverseSettlementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await reverseSettlement(
      c.env,
      user.userEmail,
      body.projectId,
      body.settlementId,
      body.reason
    );

    return response;
  }
);

/**
 * Get reverse settlement preview
 * Body: { projectId, settlementId }
 */
app.post(
  '/reverse-preview',
  zValidator('json', GetReversePreviewRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getReversePreview(
      c.env,
      user.userEmail,
      body.projectId,
      body.settlementId
    );

    return response;
  }
);

/**
 * Get settlement history
 * Body: { projectId, filters?: { stageId?, settlementType?, status? } }
 */
app.post(
  '/history',
  zValidator('json', GetSettlementHistoryRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getSettlementHistory(
      c.env,
      user.userEmail,
      body.projectId,
      body.filters || {}
    );

    return response;
  }
);

/**
 * Get settlement details
 * Body: { projectId, settlementId }
 */
app.post(
  '/details',
  zValidator('json', GetSettlementDetailsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getSettlementDetails(
      c.env,
      user.userEmail,
      body.projectId,
      body.settlementId
    );

    return response;
  }
);


/**
 * Get stage settlement rankings
 * Body: { projectId, stageId }
 */
app.post(
  '/stage-rankings',
  zValidator('json', GetStageSettlementRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getStageSettlementRankings(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Get comment settlement rankings
 * Body: { projectId, stageId }
 */
app.post(
  '/comment-rankings',
  zValidator('json', GetCommentSettlementRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getCommentSettlementRankings(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

export default app;
