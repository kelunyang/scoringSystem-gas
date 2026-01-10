/**
 * Stage Settlement and Scoring Handlers (FIXED VERSION)
 * ==============================================================================
 * This is the corrected settlement implementation that:
 * 1. Creates settlementhistory records for audit trail
 * 2. Creates stagesettlements records for detailed group results
 * 3. Uses correct transaction schema (userEmail, not userId)
 * 4. Links transactions to settlementId properly
 * 5. Matches GAS version business logic
 *
 * Replaces: settlement.ts
 * ==============================================================================
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { checkProjectPermission } from '@middleware/permissions';
import { logProjectOperation } from '@utils/logging';
import type { WebSocketMessage } from '@/durable-objects/NotificationHub';
import {
  SettlementStepSchema,
  SettlementProgressDataSchema,
  type SettlementStep,
  type SettlementProgressDetails
} from '@repo/shared/schemas/settlement';
import { validatePreSettlement } from './pre-settlement-validation';
import { queueBatchNotifications } from '../../queues/notification-producer';
import { getStageMemberEmails } from '@utils/notifications';
import { getEffectiveScoringConfig, calculateCommentRewardLimit } from '@utils/scoring-config';
import { generateId } from '@utils/id-generator';

/**
 * Settlement step constants
 */
const SETTLEMENT_STEPS = {
  INITIALIZING: 'initializing' as const,
  LOCK_ACQUIRED: 'lock_acquired' as const,
  VOTES_CALCULATED: 'votes_calculated' as const,
  DISTRIBUTING_REPORT_REWARDS: 'distributing_report_rewards' as const,
  DISTRIBUTING_COMMENT_REWARDS: 'distributing_comment_rewards' as const,
  COMPLETED: 'completed' as const
} as const;

/**
 * Settlement progress checkpoints
 */
const SETTLEMENT_PROGRESS_POINTS = {
  [SETTLEMENT_STEPS.INITIALIZING]: 0,
  [SETTLEMENT_STEPS.LOCK_ACQUIRED]: 10,
  [SETTLEMENT_STEPS.VOTES_CALCULATED]: 30,
  [SETTLEMENT_STEPS.DISTRIBUTING_REPORT_REWARDS]: 60,
  [SETTLEMENT_STEPS.DISTRIBUTING_COMMENT_REWARDS]: 80,
  [SETTLEMENT_STEPS.COMPLETED]: 100
} as const;

/**
 * Settlement calculation constants
 */
const FLOAT_TOLERANCE = 0.01;  // 浮點數比較容差，用於分數平手判斷和獎勵池驗證

/**
 * Push settlement progress update via WebSocket to the operator
 * @param env Environment bindings
 * @param userEmail User performing the settlement
 * @param stageId Stage being settled
 * @param step Current step name
 * @param progress Progress percentage (0-100)
 * @param message User-friendly message
 * @param details Optional additional details
 */
async function pushProgress(
  env: Env,
  userEmail: string,
  stageId: string,
  step: SettlementStep,
  progress: number,
  message: string,
  details?: SettlementProgressDetails
): Promise<void> {
  try {
    // Validate step
    const validatedStep = SettlementStepSchema.parse(step);

    // Validate progress data
    const progressData = SettlementProgressDataSchema.parse({
      stageId,
      step: validatedStep,
      progress,
      message,
      details
    });

    // Get user's userId from email
    const user = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      console.warn(`Cannot push progress: user not found for email ${userEmail}`);
      return;
    }

    // Get user's NotificationHub Durable Object
    const id = env.NOTIFICATION_HUB.idFromName(user.userId as string);
    const stub = env.NOTIFICATION_HUB.get(id);

    // Broadcast settlement progress message
    const message_data: WebSocketMessage = {
      type: 'settlement_progress',
      data: progressData
    };

    // Call broadcast method on the Durable Object
    await stub.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message_data)
    }));
  } catch (error) {
    // Don't fail settlement if progress push fails
    console.error('Failed to push settlement progress:', error instanceof Error ? error.message : error, {
      userEmail,
      stageId,
      step
    });
  }
}

/**
 * Preview stage scores (without actually settling)
 */
export async function previewStageScores(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Check if user has manage permission (Level 0-1 only)
    const hasPermission = await checkProjectPermission(env, userEmail, projectId, 'manage');
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Only admins and teachers can preview scores');
    }

    // Get stage with reward pool
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status, reportRewardPool, commentRewardPool
      FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    // CRITICAL: Teacher votes from teachersubmissionrankings, Student votes from SETTLED & AGREED proposals
    // Student proposals must be: status='settled' AND votingResult='agree' (only latest version per group)

    // Teacher votes: From teachersubmissionrankings table
    const teacherRankingsResult = await env.DB.prepare(`
      SELECT
        tsr.teacherEmail,
        tsr.submissionId,
        tsr.groupId,
        tsr.rank,
        tsr.createdTime
      FROM teachersubmissionrankings tsr
      WHERE tsr.projectId = ? AND tsr.stageId = ?
      ORDER BY tsr.teacherEmail ASC, tsr.createdTime DESC
    `).bind(projectId, stageId).all();

    const teacherVotes = aggregateTeacherRankings(
      teacherRankingsResult.results.map(r => ({
        teacherEmail: r.teacherEmail as string,
        submissionId: r.submissionId as string,
        groupId: r.groupId as string,
        rank: r.rank as number,
        createdTime: r.createdTime as number
      }))
    );

    // Student votes: From SETTLED and AGREED ranking proposals (Level 2-4)
    // Only select LATEST version per group (by createdTime DESC)
    const studentProposalsResult = await env.DB.prepare(`
      WITH LatestSettledProposals AS (
        SELECT
          proposalId,
          groupId,
          rankingData,
          createdTime,
          votingResult,
          status,
          ROW_NUMBER() OVER (
            PARTITION BY groupId
            ORDER BY createdTime DESC
          ) as rn
        FROM rankingproposals_with_status
        WHERE projectId = ?
          AND stageId = ?
          AND status = 'pending'
          AND votingResult = 'agree'
      )
      SELECT
        rankingData,
        groupId
      FROM LatestSettledProposals
      WHERE rn = 1
      ORDER BY groupId
    `).bind(projectId, stageId).all();

    const studentVotes = studentProposalsResult.results.map(p => ({
      voterEmail: `group_${p.groupId}`, // Use group ID as identifier
      rankings: convertArrayToObject(parseJSON(p.rankingData as string, []) || [])
    }));

    if (teacherVotes.length === 0 && studentVotes.length === 0) {
      return errorResponse('NO_VOTES', 'No votes submitted yet');
    }

    // Calculate rankings and scores
    const rewardPool = (stage.reportRewardPool as number) || 0;
    const { rankings, scores, weightedScores, studentScores, teacherScores } = calculateWeightedScoresFromVotes(
      teacherVotes,
      studentVotes,
      rewardPool
    );

    // Get group names and participant distribution from submissions
    const groupIds = Object.keys(scores);
    const groupPlaceholders = groupIds.map(() => '?').join(',');
    const submissionsResult = await env.DB.prepare(`
      WITH LatestApprovedSubmissions AS (
        SELECT
          s.groupId,
          s.participationProposal,
          g.groupName,
          ROW_NUMBER() OVER (
            PARTITION BY s.groupId
            ORDER BY s.submitTime DESC
          ) as rn
        FROM submissions_with_status s
        JOIN groups g ON s.groupId = g.groupId
        WHERE s.stageId = ?
          AND s.approvedTime IS NOT NULL
          AND s.groupId IN (${groupPlaceholders})
      )
      SELECT groupId, participationProposal, groupName
      FROM LatestApprovedSubmissions
      WHERE rn = 1
    `).bind(stageId, ...groupIds).all();

    const groupMap: Record<string, { name: string; participants: number; participantList: Array<{ email: string; percentage: number }> }> = {};
    submissionsResult.results.forEach((sub: any) => {
      const proposal = parseJSON(sub.participationProposal as string, {}) || {};
      const participantList = Object.entries(proposal)
        .filter(([_, pct]) => pct && (pct as number) > 0)
        .map(([email, pct]) => ({ email, percentage: pct as number }));

      groupMap[sub.groupId] = {
        name: sub.groupName,
        participants: participantList.length,
        participantList
      };
    });

    const scoringResults = Object.entries(scores).map(([groupId, totalScore]) => {
      const groupInfo = groupMap[groupId] || { name: `Group ${groupId}`, participants: 0, participantList: [] };

      // Calculate participant point distribution
      const participantDistribution = groupInfo.participantList.map(p => ({
        email: p.email,
        percentage: p.percentage,
        points: Math.round((totalScore as number * p.percentage) * 100) / 100
      }));

      return {
        groupId,
        groupName: groupInfo.name,
        rank: rankings[groupId] || 0,
        weightedScore: weightedScores[groupId] || 0,
        totalPoints: totalScore as number,
        participantCount: groupInfo.participants,
        participantDistribution
      };
    });

    scoringResults.sort((a, b) => a.rank - b.rank);

    return successResponse({
      stageId,
      stageName: stage.stageName,
      rewardPool,
      scoringResults,
      totalVotes: teacherVotes.length + studentVotes.length,
      previewOnly: true
    });

  } catch (error) {
    console.error('Preview stage scores error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to preview scores');
  }
}

/**
 * Settle stage and distribute points
 * ATOMIC IMPLEMENTATION with D1 batch() for true transaction safety
 */
export async function settleStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  forceSettle: boolean = false
): Promise<Response> {
  let settlementId: string | undefined; // Declare here for catch block access

  try {
    // Check if user has manage permission (Level 0-1: admins/teachers only)
    const hasPermission = await checkProjectPermission(env, userEmail, projectId, 'manage');
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Only admins and teachers can settle stages');
    }

    // ============================================
    // STEP 0: PRE-SETTLEMENT VALIDATION (BEFORE LOCK)
    // ============================================
    const validation = await validatePreSettlement(env, projectId, stageId);

    // If validation fails and user hasn't confirmed, return validation results
    if (!validation.valid && !forceSettle) {
      return errorResponse('VALIDATION_FAILED', 'Pre-settlement validation failed', {
        validation,
        requiresConfirmation: true
      });
    }

    // If forced settlement with warnings, log to sys_logs
    if (forceSettle && (validation.warnings.length > 0 || validation.errors.length > 0)) {
      await logProjectOperation(
        env,
        userEmail,
        projectId,
        'settlement_warning_bypass',
        'stage',
        stageId,
        {
          warnings: validation.warnings,
          errors: validation.errors,
          validationDetails: validation.checks
        },
        { level: 'warning' }
      );
    }

    // ============================================
    // STEP 0A: FETCH STAGE DATA & PRE-VALIDATE (BEFORE LOCK)
    // ============================================
    // Fetch stage data BEFORE acquiring lock to avoid unnecessary queries
    const stageResult = await env.DB.prepare(`
      SELECT
        stageId, stageName, status, reportRewardPool, commentRewardPool,
        startTime, endTime, stageOrder
      FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stageResult) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const currentStatus = stageResult.status as string;

    // Pre-check: only attempt lock if status is 'voting'
    if (currentStatus !== 'voting') {
      if (currentStatus === 'settling') {
        return errorResponse('SETTLEMENT_IN_PROGRESS',
          'Another admin is currently settling this stage. Please wait for them to complete or retry in a few moments.');
      }
      if (currentStatus === 'completed') {
        return errorResponse('STAGE_ALREADY_SETTLED',
          'This stage has already been settled. Use reversal if you need to undo the settlement.');
      }
      return errorResponse('INVALID_STAGE_STATUS',
        `Stage must be in voting status to settle (current: ${currentStatus})`);
    }

    // PRE-VALIDATE REWARD POOL (before acquiring lock to fail fast)
    const rewardPool = (stageResult.reportRewardPool as number) || 0;
    if (rewardPool <= 0) {
      return errorResponse('INVALID_REWARD_POOL',
        `Stage reward pool must be greater than 0 (current: ${rewardPool}). Please configure the reward pool before settlement.`);
    }

    // PRE-CHECK VOTES EXISTENCE (before acquiring lock)
    // Count teacher votes from teachersubmissionrankings + student votes from approved proposals
    const teacherVoteCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM teachersubmissionrankings
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    const studentProposalCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT rp.groupId) as count
      FROM rankingproposals_with_status rp
      WHERE rp.stageId = ? AND rp.projectId = ?
        AND rp.status = 'pending' AND rp.votingResult = 'agree'
    `).bind(stageId, projectId).first();

    const totalVoteCount = ((teacherVoteCount?.count as number) || 0) + ((studentProposalCount?.count as number) || 0);
    if (totalVoteCount === 0) {
      return errorResponse('NO_VOTES', 'Cannot settle stage with no votes. At least one teacher vote or approved student proposal is required.');
    }

    // ============================================
    // STEP 0B: LOCK STAGE FOR SETTLEMENT (CONCURRENCY PROTECTION)
    // ============================================
    // Use CAS lock: atomically set settlingTime only if currently NULL
    // Trust the VIEW: We already validated status='voting' from stages_with_status VIEW
    const lockTimestamp = Date.now();
    const lockResult = await env.DB.prepare(`
      UPDATE stages
      SET settlingTime = ?
      WHERE stageId = ? AND settlingTime IS NULL
    `).bind(lockTimestamp, stageId).run();

    // Check if lock was acquired successfully
    if (lockResult.meta.changes === 0) {
      // Lock failed - another admin is currently settling (settlingTime IS NOT NULL)
      // No need to recheck VIEW - we know it's 'settling' status
      return errorResponse('SETTLEMENT_IN_PROGRESS',
        'Another admin is currently settling this stage. Please wait for them to complete or retry in a few moments.');
    }

    // ============================================
    // LOCK ACQUIRED! Now fetch full data and prepare atomic batch
    // ============================================
    const stage = stageResult;

    // Push progress: Lock acquired (10%)
    await pushProgress(
      env,
      userEmail,
      stageId,
      SETTLEMENT_STEPS.LOCK_ACQUIRED,
      SETTLEMENT_PROGRESS_POINTS[SETTLEMENT_STEPS.LOCK_ACQUIRED],
      '鎖定階段成功，開始結算...'
    );

    // Load scoring configuration (three-tier fallback: Project DB → System KV → wrangler.toml)
    const scoringConfig = await getEffectiveScoringConfig(env.DB, env.KV, env, projectId);
    console.log(`[Settlement] Using scoring config for project ${projectId}:`, scoringConfig);

    // CRITICAL: Teacher votes from teachersubmissionrankings, Student votes from SETTLED & AGREED proposals
    // Student proposals must be: status='settled' AND votingResult='agree' (only latest version per group)

    // Teacher votes: From teachersubmissionrankings table
    const teacherRankingsResult = await env.DB.prepare(`
      SELECT
        tsr.teacherEmail,
        tsr.submissionId,
        tsr.groupId,
        tsr.rank,
        tsr.createdTime
      FROM teachersubmissionrankings tsr
      WHERE tsr.projectId = ? AND tsr.stageId = ?
      ORDER BY tsr.teacherEmail ASC, tsr.createdTime DESC
    `).bind(projectId, stageId).all();

    const teacherVotes = aggregateTeacherRankings(
      teacherRankingsResult.results.map(r => ({
        teacherEmail: r.teacherEmail as string,
        submissionId: r.submissionId as string,
        groupId: r.groupId as string,
        rank: r.rank as number,
        createdTime: r.createdTime as number
      }))
    );

    // Student votes: From SETTLED and AGREED ranking proposals (Level 2-4)
    // Only select LATEST version per group (by createdTime DESC)
    const studentProposalsResult = await env.DB.prepare(`
      WITH LatestSettledProposals AS (
        SELECT
          proposalId,
          groupId,
          rankingData,
          createdTime,
          votingResult,
          status,
          ROW_NUMBER() OVER (
            PARTITION BY groupId
            ORDER BY createdTime DESC
          ) as rn
        FROM rankingproposals_with_status
        WHERE projectId = ?
          AND stageId = ?
          AND status = 'pending'
          AND votingResult = 'agree'
      )
      SELECT
        rankingData,
        groupId
      FROM LatestSettledProposals
      WHERE rn = 1
      ORDER BY groupId
    `).bind(projectId, stageId).all();

    const studentVotes = studentProposalsResult.results.map(p => ({
      voterEmail: `group_${p.groupId}`, // Use group ID as identifier
      rankings: convertArrayToObject(parseJSON(p.rankingData as string, []) || [])
    }));

    // Calculate final rankings and scores with weighted algorithm (using dynamic config)
    const { rankings, scores, weightedScores, studentScores, teacherScores } = calculateWeightedScoresFromVotes(
      teacherVotes,
      studentVotes,
      rewardPool,
      scoringConfig.studentRankingWeight,
      scoringConfig.teacherRankingWeight
    );

    // Push progress: Votes calculated (30%)
    await pushProgress(
      env,
      userEmail,
      stageId,
      SETTLEMENT_STEPS.VOTES_CALCULATED,
      SETTLEMENT_PROGRESS_POINTS[SETTLEMENT_STEPS.VOTES_CALCULATED],
      '投票計算完成，準備分配報告獎勵...',
      {
        teacherVoteCount: teacherVotes.length,
        studentVoteCount: studentVotes.length,
        groupCount: Object.keys(rankings).length
      }
    );

    const timestamp = Date.now();
    settlementId = generateId('settle_');

    const totalRewardDistributed = Object.values(scores).reduce((sum: number, val: any) => sum + val, 0);
    const participantCount = Object.keys(scores).length;

    // Final validation: distribution doesn't exceed pool
    if (totalRewardDistributed > rewardPool + FLOAT_TOLERANCE) {
      // Rollback lock (release settlingTime)
      await env.DB.prepare(`
        UPDATE stages SET settlingTime = NULL WHERE stageId = ?
      `).bind(stageId).run();
      return errorResponse('DISTRIBUTION_EXCEEDS_POOL',
        `Total reward distribution (${totalRewardDistributed.toFixed(2)}) exceeds reward pool (${rewardPool.toFixed(2)}). This indicates a calculation error.`);
    }

    // ============================================
    // COMMENT SETTLEMENT (if commentRewardPool > 0)
    // ============================================
    const commentRewardPool = (stage.commentRewardPool as number) || 0;
    let commentRankings: Record<string, number> = {};
    let commentScores: Record<string, number> = {};
    let commentWeightedScores: Record<string, number> = {};
    let commentSettlementStmts: any[] = [];

    if (commentRewardPool > 0) {
      // Push progress: Distributing comment rewards (80%)
      await pushProgress(
        env,
        userEmail,
        stageId,
        SETTLEMENT_STEPS.DISTRIBUTING_COMMENT_REWARDS,
        SETTLEMENT_PROGRESS_POINTS[SETTLEMENT_STEPS.DISTRIBUTING_COMMENT_REWARDS],
        '正在分配評論獎勵...',
        {
          commentRewardPool
        }
      );

      // Fetch comment ranking votes (teacher and student)
      const teacherCommentRankingsResult = await env.DB.prepare(`
        SELECT
          tcr.teacherEmail,
          tcr.commentId,
          tcr.rank,
          tcr.createdTime
        FROM teachercommentrankings tcr
        WHERE tcr.projectId = ? AND tcr.stageId = ?
        ORDER BY tcr.teacherEmail ASC, tcr.createdTime DESC
      `).bind(projectId, stageId).all();

      const teacherCommentVotes = aggregateTeacherCommentRankings(
        teacherCommentRankingsResult.results.map(r => ({
          teacherEmail: r.teacherEmail as string,
          commentId: r.commentId as string,
          rank: r.rank as number,
          createdTime: r.createdTime as number
        }))
      );

      const studentCommentVotesResult = await env.DB.prepare(`
        WITH LatestCommentRankings AS (
          SELECT
            crp.proposalId,
            crp.rankingData,
            crp.authorEmail,
            ROW_NUMBER() OVER (PARTITION BY crp.authorEmail ORDER BY crp.createdTime DESC) as rn
          FROM commentrankingproposals crp
          WHERE crp.stageId = ?
        )
        SELECT
          lcr.rankingData,
          lcr.authorEmail,
          ug.groupId
        FROM LatestCommentRankings lcr
        JOIN usergroups ug ON ug.userEmail = lcr.authorEmail AND ug.projectId = ?
        WHERE lcr.rn = 1 AND ug.isActive = 1
      `).bind(stageId, projectId).all();

      const studentCommentVotes = studentCommentVotesResult.results.map(v => ({
        voterEmail: v.authorEmail as string,
        rankings: convertArrayToObject(parseJSON(v.rankingData as string, []) || [])
      }));

      // Get unique comment authors for percentile calculation
      // 修正：應該統計有效評論的作者數（authorEmail 去重），而非 commentId
      // 這與前端 TeacherVoteModal/CommentVoteModal 的 getUniqueCommentAuthorCount() 保持一致
      // canBeVoted 是動態計算的，需要在 SQL 中重現計算邏輯
      const uniqueAuthorsResult = await env.DB.prepare(`
        SELECT COUNT(DISTINCT c.authorEmail) as count
        FROM comments c
        WHERE c.stageId = ? AND c.isReply = 0
        AND (c.mentionedGroups IS NOT NULL OR c.mentionedUsers IS NOT NULL)
        AND EXISTS (
          SELECT 1 FROM usergroups ug
          WHERE ug.userEmail = c.authorEmail
          AND ug.projectId = c.projectId
          AND ug.isActive = 1
        )
        AND EXISTS (
          SELECT 1 FROM (
            SELECT targetId, reactionType,
                   ROW_NUMBER() OVER (PARTITION BY targetId, userEmail ORDER BY createdAt DESC) as rn
            FROM reactions
            WHERE targetType = 'comment'
          ) r
          WHERE r.targetId = c.commentId AND r.reactionType = 'helpful' AND r.rn = 1
        )
      `).bind(stageId).first<{ count: number }>();
      const uniqueAuthors = uniqueAuthorsResult?.count || 0;

      // Calculate dynamic topN using percentile (or fixed 3 if percentile = 0)
      const commentTopN = calculateCommentRewardLimit(
        uniqueAuthors,
        scoringConfig.commentRewardPercentile,
        scoringConfig.maxCommentSelections  // fallback to maxCommentSelections when percentile = 0
      );

      console.log(`[Settlement] Comment reward: ${uniqueAuthors} unique authors, percentile=${scoringConfig.commentRewardPercentile}%, topN=${commentTopN}`);

      // Calculate comment rankings and scores (TOP N configurable)
      const commentResults = calculateCommentScoresFromVotes(
        teacherCommentVotes,
        studentCommentVotes,
        commentRewardPool,
        scoringConfig.studentRankingWeight,
        scoringConfig.teacherRankingWeight,
        commentTopN
      );

      commentRankings = commentResults.rankings;
      commentScores = commentResults.scores;
      commentWeightedScores = commentResults.weightedScores;
      const commentStudentScores = commentResults.studentScores;
      const commentTeacherScores = commentResults.teacherScores;

      const totalCommentRewardDistributed = Object.values(commentScores).reduce((sum: number, val: any) => sum + val, 0);

      // Validate comment reward distribution
      if (totalCommentRewardDistributed > commentRewardPool + FLOAT_TOLERANCE) {
        // Rollback lock (release settlingTime)
        await env.DB.prepare(`
          UPDATE stages SET settlingTime = NULL WHERE stageId = ?
        `).bind(stageId).run();
        return errorResponse('COMMENT_DISTRIBUTION_EXCEEDS_POOL',
          `Total comment reward distribution (${totalCommentRewardDistributed.toFixed(2)}) exceeds comment pool (${commentRewardPool.toFixed(2)}).`);
      }

      // Prepare comment settlement statements
      commentSettlementStmts = await prepareCommentSettlementStatements(
        env,
        projectId,
        stageId,
        settlementId,
        commentRankings,
        commentScores,
        commentWeightedScores,
        commentStudentScores,
        commentTeacherScores,
        timestamp
      );
    }

    // ============================================
    // PREPARE ALL STATEMENTS FOR ATOMIC BATCH EXECUTION
    // ============================================

    // Statement 1: Create settlement history (pending status)
    const settlementHistoryStmt = env.DB.prepare(`
      INSERT INTO settlementhistory (
        settlementId, projectId, stageId, settlementType,
        settlementTime, operatorEmail, totalRewardDistributed,
        participantCount, status, settlementData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      settlementId,
      projectId,
      stageId,
      'stage',
      timestamp,
      userEmail,
      totalRewardDistributed,
      participantCount,
      'pending',
      stringifyJSON({ rankings, scores, weightedScores, voteCount: totalVoteCount })
    );

    // Push progress: Distributing report rewards (60%)
    await pushProgress(
      env,
      userEmail,
      stageId,
      SETTLEMENT_STEPS.DISTRIBUTING_REPORT_REWARDS,
      SETTLEMENT_PROGRESS_POINTS[SETTLEMENT_STEPS.DISTRIBUTING_REPORT_REWARDS],
      '正在分配報告獎勵給各組成員...',
      {
        totalRewardDistributed,
        participantCount
      }
    );

    // Statement 2-N: Settlement details and transactions
    const { statements: detailsAndTransactionsStmts, groupMembers, participantsByGroup } = await prepareSettlementStatements(
      env,
      projectId,
      stageId,
      settlementId,
      rankings,
      scores,
      weightedScores,
      studentScores,
      teacherScores,
      timestamp
    );

    // Statement N+1: Update stage status to completed (release lock + set completion timestamp)
    const updateStageStmt = env.DB.prepare(`
      UPDATE stages
      SET settlingTime = NULL,
          settledTime = ?,
          finalRankings = ?,
          scoringResults = ?
      WHERE stageId = ?
    `).bind(
      timestamp,
      stringifyJSON(rankings),
      stringifyJSON(scores),
      stageId
    );

    // Statement N+2: Mark settlement as active
    const markActiveStmt = env.DB.prepare(`
      UPDATE settlementhistory
      SET status = 'active'
      WHERE settlementId = ? AND status = 'pending'
    `).bind(settlementId);

    // Statement N+3: Mark ranking proposals as settled
    const markProposalsSettledStmt = env.DB.prepare(`
      UPDATE rankingproposals
      SET settleTime = ?
      WHERE projectId = ? AND stageId = ? AND settleTime IS NULL
    `).bind(timestamp, projectId, stageId);

    // ============================================
    // EXECUTE ALL STATEMENTS IN ONE ATOMIC BATCH
    // ============================================
    // If ANY statement fails, D1 will rollback the entire batch
    const allStatements = [
      settlementHistoryStmt,
      ...detailsAndTransactionsStmts,
      ...commentSettlementStmts, // Include comment settlement statements
      updateStageStmt,
      markActiveStmt,
      markProposalsSettledStmt // Mark all proposals used in settlement as settled
    ];

    await env.DB.batch(allStatements);

    // ============================================
    // 發送交易通知
    // ============================================
    try {
      const notifications = [];

      // 1. 報告獎勵通知
      for (const [groupId, totalScore] of Object.entries(scores)) {
        const participants = participantsByGroup.get(groupId) || [];
        for (const participant of participants) {
          const points = Math.ceil(totalScore * participant.percentage);
          notifications.push({
            targetUserEmail: participant.userEmail,
            type: 'transaction_received' as const,
            title: '獲得積分獎勵',
            content: `您獲得了 ${points} 積分獎勵（階段結算 - ${stage.stageName}）`,
            projectId,
            stageId,
            settlementId,
            metadata: {
              amount: points,
              source: 'stage_settlement',
              groupName: participant.groupName,
              participationPercentage: participant.percentage
            }
          });
        }
      }

      // 2. 評論獎勵通知
      if (commentScores && Object.keys(commentScores).length > 0) {
        const commentIds = Object.keys(commentRankings);
        if (commentIds.length > 0) {
          const commentPlaceholders = commentIds.map(() => '?').join(',');
          const commentsResult = await env.DB.prepare(`
            SELECT commentId, authorEmail FROM comments
            WHERE commentId IN (${commentPlaceholders})
          `).bind(...commentIds).all();

          commentsResult.results?.forEach((comment: any) => {
            const commentId = comment.commentId;
            const points = Math.ceil(commentScores[commentId] || 0);
            const rank = commentRankings[commentId];
            if (points > 0) {
              notifications.push({
                targetUserEmail: comment.authorEmail,
                type: 'transaction_received' as const,
                title: '獲得積分獎勵',
                content: `您獲得了 ${points} 積分獎勵（評論獎勵 - 第${rank}名）`,
                projectId,
                stageId,
                settlementId,
                commentId,
                metadata: {
                  amount: points,
                  source: 'comment_settlement',
                  rank
                }
              });
            }
          });
        }
      }

      // 批量發送通知 (via Queue for WebSocket push)
      if (notifications.length > 0) {
        await queueBatchNotifications(env, notifications);
      }
    } catch (error) {
      console.error('[settleStage] Failed to send transaction notifications:', error);
      // 通知失敗不應影響結算流程
    }

    // ============================================
    // BUILD NAME RESOLUTION MAPPINGS for Frontend Display
    // ============================================
    // Fetch group names for all participating groups
    const groupIds = Object.keys(rankings);
    const groupNames: Record<string, string> = {};

    console.log('[Settlement] Fetching group names for groupIds:', groupIds);
    console.log('[Settlement] projectId:', projectId);

    if (groupIds.length > 0) {
      const groupPlaceholders = groupIds.map(() => '?').join(',');
      const groupsResult = await env.DB.prepare(`
        SELECT groupId, groupName
        FROM groups
        WHERE projectId = ? AND groupId IN (${groupPlaceholders})
      `).bind(projectId, ...groupIds).all();

      console.log('[Settlement] SQL query result:', {
        success: groupsResult.success,
        resultsCount: groupsResult.results?.length || 0,
        results: groupsResult.results
      });

      groupsResult.results?.forEach((group: any) => {
        groupNames[group.groupId] = group.groupName || group.groupId || '未命名組';
      });

      // Provide fallback names for groups not found in database
      groupIds.forEach((groupId) => {
        if (!groupNames[groupId]) {
          console.log('[Settlement] Group not found in DB, using fallback:', groupId);
          groupNames[groupId] = groupId;
        }
      });

      console.log('[Settlement] Final groupNames mapping:', groupNames);
    }

    // Warn if groupNames is empty when we expected groups
    if (groupIds.length > 0 && Object.keys(groupNames).length === 0) {
      console.warn('[Settlement] WARNING: groupNames is empty despite having groupIds:', groupIds);
    }

    // Fetch author display names for comment rankings (if any)
    // Note: commentRankings keys are commentId, not authorEmail
    const authorNames: Record<string, string> = {};
    const commentIds = Object.keys(commentRankings);

    if (commentIds.length > 0) {
      // Step 1: Query comments table to get commentId -> authorEmail mapping
      const commentPlaceholders = commentIds.map(() => '?').join(',');
      const commentsResult = await env.DB.prepare(`
        SELECT commentId, authorEmail
        FROM comments
        WHERE commentId IN (${commentPlaceholders})
      `).bind(...commentIds).all();

      console.log('[Settlement] Comments query result:', {
        commentIds,
        resultsCount: commentsResult.results?.length || 0,
        results: commentsResult.results
      });

      // Build commentId -> authorEmail mapping
      const commentToEmail: Record<string, string> = {};
      commentsResult.results?.forEach((comment: any) => {
        commentToEmail[comment.commentId] = comment.authorEmail;
      });

      // Step 2: Get unique author emails and query users table
      const authorEmails = [...new Set(Object.values(commentToEmail))];

      if (authorEmails.length > 0) {
        const userPlaceholders = authorEmails.map(() => '?').join(',');
        const usersResult = await env.DB.prepare(`
          SELECT userEmail, displayName
          FROM users
          WHERE userEmail IN (${userPlaceholders})
        `).bind(...authorEmails).all();

        console.log('[Settlement] Users query result:', {
          authorEmails,
          resultsCount: usersResult.results?.length || 0,
          results: usersResult.results
        });

        // Build email -> displayName mapping
        const emailToDisplayName: Record<string, string> = {};
        usersResult.results?.forEach((user: any) => {
          emailToDisplayName[user.userEmail] = user.displayName || user.userEmail;
        });

        // Step 3: Build final authorNames mapping: commentId -> "displayName(email)"
        commentIds.forEach((commentId) => {
          const email = commentToEmail[commentId];
          if (email) {
            const displayName = emailToDisplayName[email] || email;
            authorNames[commentId] = `${displayName}(${email})`;
          } else {
            // Fallback if comment not found
            authorNames[commentId] = commentId;
          }
        });
      }

      console.log('[Settlement] Final authorNames mapping:', authorNames);
    }

    // ============================================
    // SUCCESS! Log settlement operation
    // ============================================
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'stage_settled',
      'stage',
      stageId,
      {
        totalRewardDistributed,
        participantCount
      },
      {
        relatedEntities: {
          settlement: settlementId
        }
      }
    );

    // 發送結算完成通知給所有參與者
    try {
      const members = await getStageMemberEmails(env, projectId, stageId);
      if (members.length > 0) {
        await queueBatchNotifications(env, members.map(email => ({
          targetUserEmail: email,
          type: 'stage_settled',
          title: '階段結算完成',
          content: `${stage.stageName} 階段的結算已完成，您可以查看排名和積分結果`,
          projectId,
          stageId,
          settlementId
        })));
      }
    } catch (error) {
      console.error('[settleStage] Failed to send settlement notifications:', error);
    }

    // Push progress: Settlement completed (100%)
    await pushProgress(
      env,
      userEmail,
      stageId,
      SETTLEMENT_STEPS.COMPLETED,
      SETTLEMENT_PROGRESS_POINTS[SETTLEMENT_STEPS.COMPLETED],
      '結算完成！',
      {
        settlementId,
        rankings,
        scores,
        weightedScores,
        totalRewardDistributed,
        participantCount,
        commentRankings: Object.keys(commentRankings).length > 0 ? commentRankings : undefined,
        commentScores: Object.keys(commentScores).length > 0 ? commentScores : undefined,
        groupNames,
        authorNames: Object.keys(authorNames).length > 0 ? authorNames : undefined,
        groupMembers: Object.keys(groupMembers).length > 0 ? groupMembers : undefined
      }
    );

    return successResponse({
      stageId,
      stageName: stage.stageName,
      settlementId,
      finalRankings: rankings,
      scoringResults: scores,
      weightedScores,
      totalPointsDistributed: totalRewardDistributed,
      participantCount,
      settledTime: timestamp,
      groupNames,
      authorNames: Object.keys(authorNames).length > 0 ? authorNames : undefined,
      commentRankings: Object.keys(commentRankings).length > 0 ? commentRankings : undefined,
      commentScores: Object.keys(commentScores).length > 0 ? commentScores : undefined
    }, 'Stage settled successfully');

  } catch (error) {
    console.error('Settle stage error:', error);

    // CRITICAL: Rollback the settlement lock on error
    // Since batch() failed, no database records were created (atomic rollback by D1)
    // We only need to release the lock
    try {
      // Revert stage status back to voting
      await env.DB.prepare(`
        UPDATE stages
        SET status = 'voting'
        WHERE stageId = ? AND projectId = ? AND status = 'settling'
      `).bind(stageId, projectId).run();

      console.log(`Rollback: Stage ${stageId} status reverted from 'settling' to 'voting'`);

      // Note: No need to mark settlement as 'failed' because batch() rollback
      // means the settlement record was never created in the first place
    } catch (rollbackError) {
      console.error('CRITICAL: Failed to rollback settlement lock:', rollbackError);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('SYSTEM_ERROR', `Failed to settle stage: ${message}`);
  }
}

/**
 * Get settled stage results
 */
export async function getSettledStageResults(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Get stage data
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status, finalRankings, scoringResults, settledTime
      FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    if (stage.status !== 'completed' || !stage.scoringResults) {
      return errorResponse('STAGE_NOT_SETTLED', 'Stage has not been settled yet');
    }

    // Get settlement history
    const settlement = await env.DB.prepare(`
      SELECT * FROM settlementhistory
      WHERE stageId = ? AND status = 'active'
      ORDER BY settlementTime DESC
      LIMIT 1
    `).bind(stageId).first();

    // Get settlement details
    const details = await env.DB.prepare(`
      SELECT * FROM stagesettlements
      WHERE stageId = ? AND settlementId = ?
      ORDER BY finalRank ASC
    `).bind(stageId, settlement?.settlementId || '').all();

    const finalRankings = parseJSON(stage.finalRankings as string, {}) || {};
    const scoringResults = parseJSON(stage.scoringResults as string, {}) || {};

    return successResponse({
      stageId,
      stageName: stage.stageName,
      settledTime: stage.settledTime,
      finalRankings,
      scoringResults,
      settlement: settlement ? {
        settlementId: settlement.settlementId,
        operatorEmail: settlement.operatorEmail,
        totalRewardDistributed: settlement.totalRewardDistributed,
        participantCount: settlement.participantCount
      } : null,
      details: details.results.map((d: any) => ({
        groupId: d.groupId,
        rank: d.finalRank,
        studentScore: d.studentScore,
        teacherScore: d.teacherScore,
        totalScore: d.totalScore,
        allocatedPoints: d.allocatedPoints,
        memberEmails: parseJSON(d.memberEmails, []) || [],
        memberPointsDistribution: parseJSON(d.memberPointsDistribution, {}) || {}
      }))
    });

  } catch (error) {
    console.error('Get settled stage results error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get stage results');
  }
}

/**
 * PRIVATE CORE: Generic score calculation from teacher and student votes using Average Ranking
 * Implements configurable weighted scoring (default: 70% student + 30% teacher)
 *
 * Average Ranking: Calculate average rank from all votes
 * Final score = student avg rank × studentWeight + teacher avg rank × teacherWeight
 * Lower final score = better ranking (as per spec)
 *
 * @param teacherVotes - Teacher vote data with rankings
 * @param studentVotes - Student vote data with rankings
 * @param totalPoints - Total points to distribute
 * @param studentWeight - Weight for student ranking (0-1, default 0.7)
 * @param teacherWeight - Weight for teacher ranking (0-1, default 0.3)
 * @param options - Optional configuration (e.g., topN for TOP 3 filtering)
 * @returns Object containing rankings, scores, and weighted scores
 */
function _calculateScoresFromVotesCore<T extends string>(
  teacherVotes: Array<{ voterEmail: string; rankings: Record<T, number> }>,
  studentVotes: Array<{ voterEmail: string; rankings: Record<T, number> }>,
  totalPoints: number,
  studentWeight: number = 0.7,
  teacherWeight: number = 0.3,
  options?: { topN?: number }
): {
  rankings: Record<T, number>;
  scores: Record<T, number>;
  weightedScores: Record<T, number>;
  studentScores: Record<T, number>;
  teacherScores: Record<T, number>;
} {
  // Collect all items (groups/comments) from both teacher and student votes
  const itemIds = new Set<T>();
  teacherVotes.forEach(vote => {
    Object.keys(vote.rankings).forEach(itemId => itemIds.add(itemId as T));
  });
  studentVotes.forEach(vote => {
    Object.keys(vote.rankings).forEach(itemId => itemIds.add(itemId as T));
  });

  const items = Array.from(itemIds);

  if (items.length === 0) {
    return {
      rankings: {} as Record<T, number>,
      scores: {} as Record<T, number>,
      weightedScores: {} as Record<T, number>,
      studentScores: {} as Record<T, number>,
      teacherScores: {} as Record<T, number>
    };
  }

  // 計算「真正的最後一名」排名值
  // 如果有組完全沒收到排名，它們應該排在所有正常組之後
  const WORST_RANK = items.length + 1;

  // Calculate student average rankings (optimized: single pass)
  const studentRankSums: Record<string, { sum: number; count: number }> = {};
  items.forEach(itemId => {
    studentRankSums[itemId] = { sum: 0, count: 0 };
  });

  studentVotes.forEach(vote => {
    Object.entries(vote.rankings).forEach(([itemId, rank]) => {
      if (studentRankSums[itemId] && typeof rank === 'number') {
        studentRankSums[itemId].sum += rank;
        studentRankSums[itemId].count += 1;
      }
    });
  });

  const studentAvgRanks: Record<string, number> = {};
  items.forEach(itemId => {
    const { sum, count } = studentRankSums[itemId];
    if (count > 0) {
      studentAvgRanks[itemId] = sum / count;
    } else {
      // 沒有收到學生排名，使用最差排名（所有組數量+1）
      console.warn(`[Settlement] Item ${itemId} received no student rankings, assigning worst rank: ${WORST_RANK}`);
      studentAvgRanks[itemId] = WORST_RANK;
    }
  });

  // Calculate teacher average rankings (optimized: single pass)
  const teacherRankSums: Record<string, { sum: number; count: number }> = {};
  items.forEach(itemId => {
    teacherRankSums[itemId] = { sum: 0, count: 0 };
  });

  teacherVotes.forEach(vote => {
    Object.entries(vote.rankings).forEach(([itemId, rank]) => {
      if (teacherRankSums[itemId] && typeof rank === 'number') {
        teacherRankSums[itemId].sum += rank;
        teacherRankSums[itemId].count += 1;
      }
    });
  });

  const teacherAvgRanks: Record<string, number> = {};
  items.forEach(itemId => {
    const { sum, count } = teacherRankSums[itemId];
    if (count > 0) {
      teacherAvgRanks[itemId] = sum / count;
    } else {
      // 沒有收到教師排名，使用最差排名（所有組數量+1）
      console.warn(`[Settlement] Item ${itemId} received no teacher rankings, assigning worst rank: ${WORST_RANK}`);
      teacherAvgRanks[itemId] = WORST_RANK;
    }
  });

  // Calculate weighted final score (student × studentWeight + teacher × teacherWeight)
  // Lower score = better ranking (as per spec example)
  const finalScores: Record<string, number> = {};
  items.forEach(itemId => {
    const studentAvg = studentAvgRanks[itemId] || WORST_RANK;
    const teacherAvg = teacherAvgRanks[itemId] || WORST_RANK;
    // Lower score = better ranking
    finalScores[itemId] = studentAvg * studentWeight + teacherAvg * teacherWeight;
  });

  // Sort by final weighted score to determine rankings (lower score = better rank)
  const sortedItems = items.sort((a, b) => finalScores[a] - finalScores[b]);

  // Calculate rankings using Standard Ranking (handles ties, auto-skips ranks)
  const rankings: Record<T, number> = {} as Record<T, number>;
  for (let i = 0; i < sortedItems.length; i++) {
    const itemId = sortedItems[i];

    // Floating-point comparison tolerance: check if scores are tied
    // JavaScript floating-point arithmetic has precision issues (e.g., 0.1 + 0.2 !== 0.3)
    // Use FLOAT_TOLERANCE instead of direct === comparison
    if (i > 0 && Math.abs(finalScores[sortedItems[i-1]] - finalScores[itemId]) < FLOAT_TOLERANCE) {
      rankings[itemId] = rankings[sortedItems[i-1]];
    } else {
      // Standard Ranking: use index + 1 (auto-skips for ties)
      rankings[itemId] = i + 1;
    }
  }

  // Store component scores separately for database storage
  const studentScores: Record<T, number> = {} as Record<T, number>;
  const teacherScores: Record<T, number> = {} as Record<T, number>;
  const weightedScores: Record<T, number> = {} as Record<T, number>;

  items.forEach(itemId => {
    const studentAvg = studentAvgRanks[itemId] || WORST_RANK;
    const teacherAvg = teacherAvgRanks[itemId] || WORST_RANK;

    // Store individual components for database transparency
    studentScores[itemId] = studentAvg * studentWeight;  // Student component
    teacherScores[itemId] = teacherAvg * teacherWeight;  // Teacher component
    weightedScores[itemId] = finalScores[itemId];  // Combined score
  });

  // CRITICAL: Filter by topN if specified (for comment settlement TOP 3 limitation)
  const itemsToScore = options?.topN
    ? sortedItems.filter(itemId => rankings[itemId] <= options.topN!)
    : sortedItems;

  // Distribute points using Occupied Rank Method (handles tied rankings fairly)
  const scores: Record<T, number> = {} as Record<T, number>;

  if (itemsToScore.length === 0) {
    return { rankings, scores, weightedScores, studentScores, teacherScores };
  }

  // Group by rank to handle ties
  const rankGroups: Record<number, T[]> = {};
  itemsToScore.forEach(itemId => {
    const rank = rankings[itemId];
    if (!rankGroups[rank]) {
      rankGroups[rank] = [];
    }
    rankGroups[rank].push(itemId);
  });

  // Calculate weight for each item using occupied position method
  const totalItems = itemsToScore.length;
  let assignedPosition = 0;
  let totalWeight = 0;
  const itemWeights: Record<string, number> = {};

  const uniqueRanks = Object.keys(rankGroups).map(Number).sort((a, b) => a - b);
  uniqueRanks.forEach(rank => {
    const tiedItems = rankGroups[rank];
    const tiedCount = tiedItems.length;

    // Calculate total weight for all positions occupied by this rank
    let groupTotalWeight = 0;
    for (let i = 0; i < tiedCount; i++) {
      const occupiedPosition = assignedPosition + i;
      groupTotalWeight += (totalItems - occupiedPosition);
    }

    // Divide equally among tied items
    const weightPerItem = groupTotalWeight / tiedCount;
    tiedItems.forEach(itemId => {
      itemWeights[itemId] = weightPerItem;
    });

    totalWeight += groupTotalWeight;
    assignedPosition += tiedCount;
  });

  // Distribute points proportionally to weights
  if (totalWeight > 0) {
    let distributedTotal = 0;
    itemsToScore.forEach((itemId, index) => {
      if (index < itemsToScore.length - 1) {
        scores[itemId] = Math.round((totalPoints * itemWeights[itemId]) / totalWeight);
        distributedTotal += scores[itemId];
      } else {
        // Last item gets remaining points to ensure exact total
        scores[itemId] = totalPoints - distributedTotal;
      }
    });
  } else {
    // Fallback: equal distribution
    let distributedTotal = 0;
    itemsToScore.forEach((itemId, index) => {
      if (index < itemsToScore.length - 1) {
        scores[itemId] = Math.round(totalPoints / itemsToScore.length);
        distributedTotal += scores[itemId];
      } else {
        scores[itemId] = totalPoints - distributedTotal;
      }
    });
  }

  // Set 0 points for items not in scoring range (e.g., non-TOP 3 comments)
  if (options?.topN) {
    items.forEach(itemId => {
      if (!scores[itemId]) {
        scores[itemId] = 0;
      }
    });
  }

  return { rankings, scores, weightedScores, studentScores, teacherScores };
}

/**
 * PUBLIC WRAPPER: Calculate weighted scores from teacher and student votes (for group reports)
 * Distributes points to ALL groups based on their rankings
 *
 * @param teacherVotes - Teacher vote data with rankings
 * @param studentVotes - Student vote data with rankings
 * @param totalPoints - Total points to distribute
 * @param studentWeight - Weight for student ranking (0-1, default 0.7)
 * @param teacherWeight - Weight for teacher ranking (0-1, default 0.3)
 * @returns Object containing rankings, scores, and weighted scores
 */
function calculateWeightedScoresFromVotes(
  teacherVotes: Array<{ voterEmail: string; rankings: Record<string, number> }>,
  studentVotes: Array<{ voterEmail: string; rankings: Record<string, number> }>,
  totalPoints: number,
  studentWeight: number = 0.7,
  teacherWeight: number = 0.3
): {
  rankings: Record<string, number>;
  scores: Record<string, number>;
  weightedScores: Record<string, number>;
  studentScores: Record<string, number>;
  teacherScores: Record<string, number>;
} {
  return _calculateScoresFromVotesCore(teacherVotes, studentVotes, totalPoints, studentWeight, teacherWeight);
}

/**
 * PUBLIC WRAPPER: Calculate comment scores from votes (for comments)
 * Only distributes points to TOP N ranked comments (topN configurable via percentile)
 *
 * @param teacherVotes - Teacher vote data with rankings
 * @param studentVotes - Student vote data with rankings
 * @param totalPoints - Total points to distribute
 * @param studentWeight - Weight for student ranking (0-1, default 0.7)
 * @param teacherWeight - Weight for teacher ranking (0-1, default 0.3)
 * @param topN - Number of top comments to reward (default 3 for legacy behavior)
 * @returns Object containing rankings, scores, and weighted scores (only TOP N get points)
 */
function calculateCommentScoresFromVotes(
  teacherVotes: Array<{ voterEmail: string; rankings: Record<string, number> }>,
  studentVotes: Array<{ voterEmail: string; rankings: Record<string, number> }>,
  totalPoints: number,
  studentWeight: number = 0.7,
  teacherWeight: number = 0.3,
  topN: number = 3
): {
  rankings: Record<string, number>;
  scores: Record<string, number>;
  weightedScores: Record<string, number>;
  studentScores: Record<string, number>;
  teacherScores: Record<string, number>;
} {
  return _calculateScoresFromVotesCore(teacherVotes, studentVotes, totalPoints, studentWeight, teacherWeight, { topN });
}

/**
 * Helper: Prepare settlement detail and transaction statements
 * Returns prepared statements for atomic batch execution (does NOT execute them)
 *
 * This function prepares both stagesettlements records AND transaction records
 * to be executed atomically with the rest of the settlement operation.
 */
async function prepareSettlementStatements(
  env: Env,
  projectId: string,
  stageId: string,
  settlementId: string,
  rankings: Record<string, number>,
  scores: Record<string, number>,
  weightedScores: Record<string, number>,
  studentScores: Record<string, number>,
  teacherScores: Record<string, number>,
  timestamp: number
): Promise<{ statements: any[], groupMembers: Record<string, string[]>, participantsByGroup: Map<string, Array<{ userEmail: string; percentage: number; groupName: string }>> }> {
  const groupIds = Object.keys(scores);
  if (groupIds.length === 0) return { statements: [], groupMembers: {}, participantsByGroup: new Map() };

  // CRITICAL FIX: Fetch participationProposal from submissions instead of usergroups
  // Only ACTUAL PARTICIPANTS (from participationProposal) should receive points
  const groupPlaceholders = groupIds.map(() => '?').join(',');
  const submissionsResult = await env.DB.prepare(`
    WITH LatestApprovedSubmissions AS (
      SELECT
        s.groupId,
        s.submissionId,
        s.participationProposal,
        g.groupName,
        ROW_NUMBER() OVER (
          PARTITION BY s.groupId
          ORDER BY s.submitTime DESC
        ) as rn
      FROM submissions_with_status s
      JOIN groups g ON s.groupId = g.groupId
      WHERE s.stageId = ?
        AND s.approvedTime IS NOT NULL
        AND s.groupId IN (${groupPlaceholders})
    )
    SELECT groupId, submissionId, participationProposal, groupName
    FROM LatestApprovedSubmissions
    WHERE rn = 1
  `).bind(stageId, ...groupIds).all();

  // Organize participants by group (from participationProposal JSON)
  const participantsByGroup = new Map<string, Array<{ userEmail: string; percentage: number; groupName: string }>>();
  const submissionIdByGroup = new Map<string, string>();

  submissionsResult.results?.forEach((submission: any) => {
    const proposal = parseJSON(submission.participationProposal as string, {}) || {};
    const participants: Array<{ userEmail: string; percentage: number; groupName: string }> = [];

    // Parse participationProposal: { "alice@ex.com": 0.5, "bob@ex.com": 0.3, "charlie@ex.com": 0.2 }
    Object.entries(proposal).forEach(([email, percentage]) => {
      if (percentage && (percentage as number) > 0) {
        participants.push({
          userEmail: email,
          percentage: percentage as number,
          groupName: submission.groupName
        });
      }
    });

    participantsByGroup.set(submission.groupId, participants);
    submissionIdByGroup.set(submission.groupId, submission.submissionId);
  });

  // Prepare all statements (but don't execute)
  const statements = [];

  // Collect group members for frontend display
  const groupMembers: Record<string, string[]> = {};

  for (const [groupId, totalScore] of Object.entries(scores)) {
    const participants = participantsByGroup.get(groupId) || [];
    if (participants.length === 0) {
      console.warn(`Group ${groupId} has no participants in participationProposal, skipping point distribution`);
      continue;
    }

    const groupName = participants[0]?.groupName || `Group ${groupId}`;

    // Calculate points per participant based on their participation percentage
    const memberPointsDistribution: Record<string, number> = {};
    const memberEmails: string[] = [];

    participants.forEach(participant => {
      const points = Math.round((totalScore * participant.percentage) * 100) / 100;
      memberPointsDistribution[participant.userEmail] = points;
      memberEmails.push(participant.userEmail);
    });

    // Store group members for progress details
    groupMembers[groupId] = memberEmails;

    // Prepare stage settlement detail statement
    const settlementDetailId = generateId('std');
    statements.push(
      env.DB.prepare(`
        INSERT INTO stagesettlements (
          settlementDetailId, projectId, settlementId, stageId, groupId,
          finalRank, studentScore, teacherScore, totalScore,
          allocatedPoints, memberEmails, memberPointsDistribution
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        settlementDetailId,
        projectId,
        settlementId,
        stageId,
        groupId,
        rankings[groupId],
        studentScores[groupId] || 0,  // Student component (70%)
        teacherScores[groupId] || 0,  // Teacher component (30%)
        weightedScores[groupId] || 0,  // Combined weighted score
        totalScore,  // Points allocated
        stringifyJSON(memberEmails),
        stringifyJSON(memberPointsDistribution)
      )
    );

    // Prepare transaction statement for each participant (based on their percentage)
    const submissionId = submissionIdByGroup.get(groupId);
    for (const participant of participants) {
      const transactionId = generateId('txn');
      const participantPoints = memberPointsDistribution[participant.userEmail];

      statements.push(
        env.DB.prepare(`
          INSERT INTO transactions (
            transactionId, projectId, userEmail, stageId, settlementId,
            transactionType, amount, source, timestamp, relatedSubmissionId, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          transactionId,
          projectId,
          participant.userEmail,
          stageId,
          settlementId,  // CRITICAL: Link to settlement for reversal
          'stage_settlement',  // transactionType
          Math.ceil(participantPoints),  // Round up to whole number
          `階段結算獎勵 - ${groupName} (參與度 ${Math.round(participant.percentage * 100)}%)`,
          timestamp,
          submissionId,  // Link to submission
          stringifyJSON({
            groupId,
            groupName: groupName,
            rank: rankings[groupId],
            participationPercentage: participant.percentage,
            settlementDetailId,
            originalAmount: participantPoints  // Store pre-rounded decimal value
          })
        )
      );
    }
  }

  return { statements, groupMembers, participantsByGroup };
}

/**
 * Helper: Prepare comment settlement statements
 * Returns prepared statements for atomic batch execution
 *
 * Creates commentsettlements records and transaction records for comment authors
 */
async function prepareCommentSettlementStatements(
  env: Env,
  projectId: string,
  stageId: string,
  settlementId: string,
  rankings: Record<string, number>,
  scores: Record<string, number>,
  weightedScores: Record<string, number>,
  studentScores: Record<string, number>,
  teacherScores: Record<string, number>,
  timestamp: number
): Promise<any[]> {
  const commentIds = Object.keys(scores).filter(commentId => scores[commentId] > 0);
  if (commentIds.length === 0) return [];

  // Fetch comment information (author emails) for awarded comments
  const commentPlaceholders = commentIds.map(() => '?').join(',');
  const commentsResult = await env.DB.prepare(`
    SELECT commentId, authorEmail, content
    FROM comments
    WHERE commentId IN (${commentPlaceholders})
  `).bind(...commentIds).all();

  const commentMap = new Map<string, { authorEmail: string; content: string }>();
  commentsResult.results?.forEach((comment: any) => {
    commentMap.set(comment.commentId, {
      authorEmail: comment.authorEmail as string,
      content: comment.content as string
    });
  });

  const statements = [];

  // Prepare statements for each awarded comment (TOP 3 only)
  for (const [commentId, allocatedPoints] of Object.entries(scores)) {
    if (allocatedPoints <= 0) continue; // Skip comments with no reward

    const commentInfo = commentMap.get(commentId);
    if (!commentInfo) {
      console.warn(`Comment ${commentId} not found, skipping`);
      continue;
    }

    const authorEmail = commentInfo.authorEmail;
    const contentPreview = commentInfo.content.substring(0, 50);

    // Insert commentsettlements record
    const commentSettlementId = generateId('cst');
    statements.push(
      env.DB.prepare(`
        INSERT INTO commentsettlements (
          settlementDetailId, projectId, settlementId, stageId, commentId, authorEmail,
          finalRank, studentScore, teacherScore, totalScore, allocatedPoints
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        commentSettlementId,
        projectId,
        settlementId,
        stageId,
        commentId,
        authorEmail,
        rankings[commentId],
        studentScores[commentId] || 0,  // Student component (70%)
        teacherScores[commentId] || 0,  // Teacher component (30%)
        weightedScores[commentId] || 0,  // Combined weighted score
        allocatedPoints  // Points allocated
      )
    );

    // Update comment isAwarded and awardRank
    statements.push(
      env.DB.prepare(`
        UPDATE comments
        SET isAwarded = 1, awardRank = ?
        WHERE commentId = ?
      `).bind(rankings[commentId], commentId)
    );

    // Create transaction record for comment author
    const transactionId = generateId('txn');
    statements.push(
      env.DB.prepare(`
        INSERT INTO transactions (
          transactionId, projectId, userEmail, stageId, settlementId,
          transactionType, amount, source, timestamp, relatedCommentId, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        transactionId,
        projectId,
        authorEmail,
        stageId,
        settlementId,
        'comment_settlement',
        Math.ceil(allocatedPoints),  // Round up to whole number
        `評論獎勵 - 第${rankings[commentId]}名: "${contentPreview}..."`,
        timestamp,
        commentId,  // Link to comment
        stringifyJSON({
          commentId,
          rank: rankings[commentId],
          contentPreview,
          settlementDetailId: commentSettlementId,
          originalAmount: allocatedPoints  // Store pre-rounded decimal value
        })
      )
    );
  }

  return statements;
}

/**
 * 聚合教师成果排名，每个教师只保留最新版本
 * @param rankings - 数据库查询结果（按 teacherEmail, createdTime DESC 排序）
 * @returns 聚合后的投票数据
 */
function aggregateTeacherRankings(
  rankings: Array<{
    teacherEmail: string;
    submissionId: string;
    groupId: string;
    rank: number;
    createdTime: number;
  }>
): Array<{ voterEmail: string; rankings: Record<string, number> }> {
  const teacherMap = new Map<string, Map<string, number>>();
  const teacherLatestTime = new Map<string, number>();

  // 因为已按 createdTime DESC 排序，每个教师第一次出现的记录就是最新的
  rankings.forEach(row => {
    const { teacherEmail, groupId, rank, createdTime } = row;

    // 如果这个教师还没处理过，初始化
    if (!teacherLatestTime.has(teacherEmail)) {
      teacherLatestTime.set(teacherEmail, createdTime);
      teacherMap.set(teacherEmail, new Map());
    }

    // 只保留相同 createdTime 的记录（同一次提交的所有排名）
    if (teacherLatestTime.get(teacherEmail) === createdTime) {
      teacherMap.get(teacherEmail)!.set(groupId, rank);
    }
  });

  // 转换为结算函数需要的格式
  return Array.from(teacherMap.entries()).map(([email, rankingsMap]) => ({
    voterEmail: email,
    rankings: Object.fromEntries(rankingsMap)
  }));
}

/**
 * 聚合教师评论排名，每个教师只保留最新版本
 * @param rankings - 数据库查询结果（按 teacherEmail, createdTime DESC 排序）
 * @returns 聚合后的投票数据
 */
function aggregateTeacherCommentRankings(
  rankings: Array<{
    teacherEmail: string;
    commentId: string;
    rank: number;
    createdTime: number;
  }>
): Array<{ voterEmail: string; rankings: Record<string, number> }> {
  const teacherMap = new Map<string, Map<string, number>>();
  const teacherLatestTime = new Map<string, number>();

  // 因为已按 createdTime DESC 排序，每个教师第一次出现的记录就是最新的
  rankings.forEach(row => {
    const { teacherEmail, commentId, rank, createdTime } = row;

    // 如果这个教师还没处理过，初始化
    if (!teacherLatestTime.has(teacherEmail)) {
      teacherLatestTime.set(teacherEmail, createdTime);
      teacherMap.set(teacherEmail, new Map());
    }

    // 只保留相同 createdTime 的记录（同一次提交的所有排名）
    if (teacherLatestTime.get(teacherEmail) === createdTime) {
      teacherMap.get(teacherEmail)!.set(commentId, rank);
    }
  });

  // 转换为结算函数需要的格式
  return Array.from(teacherMap.entries()).map(([email, rankingsMap]) => ({
    voterEmail: email,
    rankings: Object.fromEntries(rankingsMap)
  }));
}

/**
 * 将排名数组转换为对象格式
 * IMPORTANT: For report rankings, only groupId is used (not submissionId)
 * @param rankingArray - 数组格式 [{groupId, rank} | {commentId, rank}, ...]
 * @returns 对象格式 {targetId: rank, ...}
 */
function convertArrayToObject(
  rankingArray: any
): Record<string, number> {
  // 如果为空或null，返回空对象
  if (!rankingArray) {
    return {};
  }

  // 如果已经是对象格式，直接返回
  if (!Array.isArray(rankingArray)) {
    return rankingArray;
  }

  // 将数组转换为对象
  const result: Record<string, number> = {};
  rankingArray.forEach((item: any, index: number) => {
    // CRITICAL: For report rankings, ONLY accept groupId (not submissionId)
    // submissionId is just metadata, groupId is the primary key
    const id = item.groupId || item.commentId || item.targetId;

    if (id && typeof item.rank === 'number') {
      // Validate groupId format - should start with group identifier prefix or be a valid UUID
      // Reject if it looks like an email address (contains @)
      if (id.includes('@')) {
        console.error(`[convertArrayToObject] Invalid ID detected at index ${index}: "${id}" (looks like email)`);
        console.error('[convertArrayToObject] Item:', item);
        // Skip this invalid entry
        return;
      }

      result[id] = item.rank;
    } else {
      console.warn(`[convertArrayToObject] Skipping invalid item at index ${index}:`, item);
    }
  });

  return result;
}
