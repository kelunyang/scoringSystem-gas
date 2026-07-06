/**
 * @fileoverview Force-clear stage votes handler
 *
 * Rolls a stage back to its pre-voting state so the whole stage can re-vote.
 * This is needed when a group was wrongly excluded from voting (e.g. their
 * submission never reached intra-group consensus) and the stage already voted /
 * settled without them.
 *
 * Behaviour:
 *  1. (If already settled) reverse every active stage settlement — reuses
 *     {@link reverseSettlement} so the reward ledger is reversed with negative
 *     transactions and a settlement-history audit record.
 *  2. Invalidate (作廢) every student ranking proposal in the stage via the
 *     existing withdrawal pipeline (set withdrawnTime/withdrawnBy/withdrawnReason,
 *     clear settleTime). Proposals are NOT deleted, so each group keeps seeing
 *     its "force-withdrawn" old version together with the reason.
 *  3. Roll the stage timestamps back to the chosen target state:
 *     - 'voting': clear settlement timestamps, keep/force voting status.
 *     - 'active': clear settlement timestamps and forceVotingTime, and extend
 *       endTime by `extendHours` hours so members can finish consensus first.
 *  4. Record a single `stage_votes_force_cleared` event (level 'critical') to
 *     both sys_logs and the project event log via logProjectOperation.
 *
 * Teacher rankings are intentionally left untouched — they are append-by-createdTime
 * versions and do not affect the timestamp-driven stage status.
 *
 * Permission: Global PM or Project Teacher (canManageSettlements).
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { logProjectOperation } from '@utils/logging';
import { reverseSettlement } from '../settlement/manage';

export interface ClearStageVotesParams {
  reason: string;
  targetState: 'voting' | 'active';
  extendHours?: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Force-clear all votes in a stage and roll it back to the pre-voting state.
 */
export async function clearStageVotes(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  params: ClearStageVotesParams
): Promise<Response> {
  const { reason, targetState } = params;
  const extendHours = params.extendHours;

  try {
    // --- Permission: Global PM or Project Teacher ---
    const { canManageSettlements } = await import('@utils/permissions');
    const hasPermission = await canManageSettlements(env.DB, userEmail, projectId);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '權限不足，無法強制清空投票');
    }

    // --- Validate ---
    if (!reason || !reason.trim()) {
      return errorResponse('MISSING_REASON', '必須填寫撤回理由');
    }
    if (targetState !== 'voting' && targetState !== 'active') {
      return errorResponse('INVALID_TARGET', 'targetState 必須是 voting 或 active');
    }
    if (targetState === 'active' && (!extendHours || extendHours <= 0)) {
      return errorResponse('INVALID_HOURS', '回到 active 時必須指定延長時數');
    }

    // --- Verify stage exists ---
    const stage = await env.DB.prepare(
      `SELECT stageId, stageName FROM stages WHERE stageId = ? AND projectId = ?`
    ).bind(stageId, projectId).first();
    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', '找不到該階段');
    }

    // --- 1. Reverse any active stage settlement (reward ledger) ---
    const activeSettlements = await env.DB.prepare(`
      SELECT settlementId FROM settlementhistory
      WHERE projectId = ? AND stageId = ? AND settlementType = 'stage' AND status = 'active'
    `).bind(projectId, stageId).all();

    const reversedSettlementIds: string[] = [];
    for (const row of activeSettlements.results || []) {
      const settlementId = row.settlementId as string;
      const resp = await reverseSettlement(
        env,
        userEmail,
        projectId,
        settlementId,
        `強制清空投票: ${reason}`
      );
      const body = (await resp.clone().json()) as { success?: boolean };
      if (body?.success) {
        reversedSettlementIds.push(settlementId);
      } else {
        // NO_TRANSACTIONS / ALREADY_REVERSED etc. are non-fatal — keep going.
        console.warn(`[clearStageVotes] reverseSettlement skipped for ${settlementId}`);
      }
    }

    // --- 2 + 3. Invalidate proposals + roll back stage timestamps (atomic batch) ---
    const now = Date.now();

    // (a) Un-settle EVERY proposal in the stage — including ones already withdrawn
    //     by students, whose settleTime was stamped by the original settlement.
    //     Without this they keep status 'settled' (settleTime > withdrawnTime) and
    //     would not be treated as invalidated.
    const unsettleAllStmt = env.DB.prepare(`
      UPDATE rankingproposals
      SET settleTime = NULL
      WHERE projectId = ? AND stageId = ? AND settleTime IS NOT NULL
    `).bind(projectId, stageId);

    // (b) Stamp the force-withdrawal only on proposals not already withdrawn
    //     (preserve the original withdrawnBy/withdrawnTime for student withdrawals).
    const withdrawProposalsStmt = env.DB.prepare(`
      UPDATE rankingproposals
      SET withdrawnTime = ?, withdrawnBy = ?, withdrawnReason = ?
      WHERE projectId = ? AND stageId = ? AND withdrawnTime IS NULL
    `).bind(now, userEmail, reason, projectId, stageId);

    let stageUpdateStmt;
    if (targetState === 'voting') {
      // Clear settlement markers; force voting so the stage stays open for re-vote.
      stageUpdateStmt = env.DB.prepare(`
        UPDATE stages
        SET settlingTime = NULL,
            settledTime = NULL,
            finalRankings = NULL,
            scoringResults = NULL,
            forceVotingTime = COALESCE(forceVotingTime, ?),
            updatedAt = ?
        WHERE stageId = ? AND projectId = ?
      `).bind(now, now, stageId, projectId);
    } else {
      // Back to active: clear forceVotingTime, extend the active window.
      const newEndTime = now + (extendHours as number) * HOUR_MS;
      stageUpdateStmt = env.DB.prepare(`
        UPDATE stages
        SET settlingTime = NULL,
            settledTime = NULL,
            finalRankings = NULL,
            scoringResults = NULL,
            forceVotingTime = NULL,
            endTime = ?,
            updatedAt = ?
        WHERE stageId = ? AND projectId = ?
      `).bind(newEndTime, now, stageId, projectId);
    }

    const results = await env.DB.batch([unsettleAllStmt, withdrawProposalsStmt, stageUpdateStmt]);
    const withdrawnProposals = results[1]?.meta?.changes ?? 0;

    // --- 4. Audit log (sys_logs + eventlogs) ---
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'stage_votes_force_cleared',
      'stage',
      stageId,
      {
        reason,
        targetState,
        extendHours: targetState === 'active' ? extendHours : null,
        withdrawnProposals,
        reversedSettlementIds,
        reversedSettlements: reversedSettlementIds.length,
        stageName: stage.stageName
      },
      {
        level: 'critical',
        relatedEntities: { stage: stageId }
      }
    );

    return successResponse({
      stageId,
      targetState,
      extendHours: targetState === 'active' ? extendHours : null,
      withdrawnProposals,
      reversedSettlements: reversedSettlementIds.length
    });
  } catch (error: any) {
    console.error('[clearStageVotes] error:', error);
    if (error?.name === 'SudoWriteBlockedError' || error?.message?.includes('SUDO_NO_WRITE')) {
      return errorResponse('SUDO_NO_WRITE', 'SUDO 模式為唯讀，無法進行寫入操作');
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', `強制清空投票失敗: ${message}`);
  }
}
