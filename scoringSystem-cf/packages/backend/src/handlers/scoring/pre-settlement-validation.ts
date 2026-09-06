/**
 * Pre-Settlement Validation Handler
 * Validates all required conditions before allowing stage settlement
 */

import type { Env } from '@/types';

export interface ValidationCheckDetail<D = Record<string, unknown>> {
  passed: boolean;
  /**
   * 這一項檢查的診斷資料，形狀依檢查而異。多數只是序列化回前端顯示，
   * 需要在後端讀欄位的（例如 checkAllGroupsRanked 要組警告訊息）
   * 就用泛型參數指明形狀。
   */
  details: D;
}

/** checkAllGroupsRanked 的 details：組警告訊息時會讀這幾個欄位。 */
export interface AllGroupsRankedDetail {
  totalGroups: number;
  allGroupsRankedByStudents: boolean;
  allGroupsRankedByTeachers: boolean;
  /** 沒有收到任何學生排名的組別名稱。沒有已批准成果時提早返回，此時為空陣列。 */
  unrankedByStudents: string[];
  unrankedByTeachers: string[];
  studentRankedCount: number;
  teacherRankedCount: number;
}

/** checkAllGroupsVoted 的 details */
export interface AllGroupsVotedDetail {
  totalGroups: number;
  groupsWithSettledProposals: number;
  groupsWithAllMembersVoted: number;
  /** 只在有未完成的組時才帶 */
  missingGroups?: Array<{
    groupId: string;
    groupName?: string;
    passed: boolean;
    reason: string;
    totalMembers: number;
    votedMembers: number;
  }>;
}

/** checkAllProposalsApproved 的 details */
export interface AllProposalsApprovedDetail {
  totalProposals: number;
  settledProposals: number;
  agreedProposals: number;
  disagreedProposals: number;
  tieProposals: number;
  tieProposalsCanReset: number;
  tieProposalsUsedReset: number;
  pendingProposals: number;
  withdrawnProposals: number;
  resetProposals: number;
  /** 只在有未結算提案時才帶 */
  unsettledProposals?: Array<{
    groupId: string;
    groupName: string | null;
    status: string;
    votingResult: string | null;
    proposalId: string;
    resetCount: number;
  }>;
}

/** checkCommentRankings 的 details */
export interface CommentRankingsDetail {
  studentCommentRankings: number;
  teacherCommentRankings: number;
  totalCommentRankings: number;
}

/** 教師排名兩項檢查共用的 details */
export interface TeacherRankingsDetail {
  teachersWhoRanked: number;
  totalTeachers: number;
  totalRankings: number;
}

export interface ValidationResult {
  valid: boolean;
  checks: {
    allGroupsVoted: ValidationCheckDetail<AllGroupsVotedDetail>;
    allProposalsApproved: ValidationCheckDetail<AllProposalsApprovedDetail>;
    hasCommentRankings: ValidationCheckDetail<CommentRankingsDetail>;
    hasTeacherSubmissionRankings: ValidationCheckDetail<TeacherRankingsDetail>;
    hasTeacherCommentRankings: ValidationCheckDetail<TeacherRankingsDetail>;
    allGroupsRanked: ValidationCheckDetail<AllGroupsRankedDetail>;  // 新增：檢查所有組是否都收到排名
  };
  warnings: string[];
  errors: string[];
}

/**
 * Validates all pre-settlement conditions for a stage
 * @param env - Cloudflare environment bindings
 * @param projectId - Project ID
 * @param stageId - Stage ID
 * @returns Validation result with detailed check information
 */
export async function validatePreSettlement(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    checks: {
      // 下面每一項都會被實際的檢查結果覆蓋，這裡只是初值
      allGroupsVoted: {
        passed: true,
        details: { totalGroups: 0, groupsWithSettledProposals: 0, groupsWithAllMembersVoted: 0 },
      },
      allProposalsApproved: {
        passed: true,
        details: {
          totalProposals: 0,
          settledProposals: 0,
          agreedProposals: 0,
          disagreedProposals: 0,
          tieProposals: 0,
          tieProposalsCanReset: 0,
          tieProposalsUsedReset: 0,
          pendingProposals: 0,
          withdrawnProposals: 0,
          resetProposals: 0,
        },
      },
      hasCommentRankings: {
        passed: true,
        details: { studentCommentRankings: 0, teacherCommentRankings: 0, totalCommentRankings: 0 },
      },
      hasTeacherSubmissionRankings: {
        passed: true,
        details: { teachersWhoRanked: 0, totalTeachers: 0, totalRankings: 0 },
      },
      hasTeacherCommentRankings: {
        passed: true,
        details: { teachersWhoRanked: 0, totalTeachers: 0, totalRankings: 0 },
      },
      allGroupsRanked: {
        passed: true,
        details: {
          totalGroups: 0,
          allGroupsRankedByStudents: true,
          allGroupsRankedByTeachers: true,
          unrankedByStudents: [],
          unrankedByTeachers: [],
          studentRankedCount: 0,
          teacherRankedCount: 0
        }
      },
    },
    warnings: [],
    errors: [],
  };

  try {
    // ========================================
    // CHECK 1: All Groups Completed Voting
    // ========================================
    const groupVotingCheck = await checkAllGroupsVoted(env, projectId, stageId);
    result.checks.allGroupsVoted = groupVotingCheck;

    if (!groupVotingCheck.passed) {
      result.valid = false;
      result.errors.push('部分組別尚未完成組內投票');
    }

    // ========================================
    // CHECK 2: All Proposals Approved
    // ========================================
    const proposalStatusCheck = await checkAllProposalsApproved(env, projectId, stageId);
    result.checks.allProposalsApproved = proposalStatusCheck;

    if (!proposalStatusCheck.passed) {
      result.valid = false;
      result.errors.push('存在未通過的排名提案');
    }

    // ========================================
    // CHECK 3: Comment Rankings Exist
    // ========================================
    const commentRankingsCheck = await checkCommentRankings(env, projectId, stageId);
    result.checks.hasCommentRankings = commentRankingsCheck;

    if (!commentRankingsCheck.passed) {
      result.warnings.push('無評論排名資料，評論獎金池將不會分配');
    }

    // ========================================
    // CHECK 4: Teacher Submission Rankings
    // ========================================
    const teacherSubmissionCheck = await checkTeacherSubmissionRankings(env, projectId, stageId);
    result.checks.hasTeacherSubmissionRankings = teacherSubmissionCheck;

    if (!teacherSubmissionCheck.passed) {
      result.warnings.push('無教師報告排名，報告獎金將僅依學生排名分配');
    }

    // ========================================
    // CHECK 5: Teacher Comment Rankings
    // ========================================
    const teacherCommentCheck = await checkTeacherCommentRankings(env, projectId, stageId);
    result.checks.hasTeacherCommentRankings = teacherCommentCheck;

    if (!teacherCommentCheck.passed) {
      result.warnings.push('無教師評論排名，評論獎金將僅依學生排名分配');
    }

    // ========================================
    // CHECK 6: All Groups Received Rankings
    // ========================================
    const allGroupsRankedCheck = await checkAllGroupsRanked(env, projectId, stageId);
    result.checks.allGroupsRanked = allGroupsRankedCheck;

    if (!allGroupsRankedCheck.passed) {
      // 將詳細的警告信息添加到結果中
      if (allGroupsRankedCheck.details.unrankedByStudents.length > 0) {
        result.warnings.push(
          `以下組別沒有收到任何學生排名：${allGroupsRankedCheck.details.unrankedByStudents.join(', ')}。` +
          `這些組別在結算時將被視為最後一名（排名 ${allGroupsRankedCheck.details.totalGroups + 1}）。`
        );
      }
      if (allGroupsRankedCheck.details.unrankedByTeachers.length > 0) {
        result.warnings.push(
          `以下組別沒有收到任何教師排名：${allGroupsRankedCheck.details.unrankedByTeachers.join(', ')}。` +
          `這些組別的教師排名將使用最差值（排名 ${allGroupsRankedCheck.details.totalGroups + 1}）。`
        );
      }
    }

  } catch (error) {
    console.error('Pre-settlement validation error:', error);
    result.valid = false;
    result.errors.push(`驗證過程發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
  }

  return result;
}

/**
 * Check if all groups have completed intra-group voting
 */
async function checkAllGroupsVoted(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<AllGroupsVotedDetail>> {
  // Get all active groups for this project
  const allGroupsResult = await env.DB.prepare(`
    SELECT DISTINCT g.groupId, g.groupName
    FROM groups g
    WHERE g.projectId = ? AND g.status = 'active'
  `).bind(projectId).all<{ groupId: string; groupName: string }>();

  const totalGroups = allGroupsResult.results?.length || 0;

  // Get groups with approved proposals (pending + agree = ready for settlement)
  const settledGroupsResult = await env.DB.prepare(`
    SELECT DISTINCT rp.groupId
    FROM rankingproposals_with_status rp
    WHERE rp.projectId = ? AND rp.stageId = ?
      AND rp.status = 'pending' AND rp.votingResult = 'agree'
  `).bind(projectId, stageId).all<{ groupId: string }>();

  const settledGroupIds = new Set(
    (settledGroupsResult.results || []).map(r => r.groupId)
  );

  // For each group with settled proposal, check if all members voted
  const groupVotingStatus = await Promise.all(
    Array.from(settledGroupIds).map(async (groupId) => {
      // Get total active members in group
      const membersResult = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM usergroups
        WHERE groupId = ? AND isActive = 1
      `).bind(groupId).first<{ count: number }>();

      const totalMembers = membersResult?.count || 0;

      // Get the approved proposal for this group (pending + agree)
      const proposalResult = await env.DB.prepare(`
        SELECT proposalId
        FROM rankingproposals_with_status
        WHERE groupId = ? AND stageId = ?
          AND status = 'pending' AND votingResult = 'agree'
        LIMIT 1
      `).bind(groupId, stageId).first<{ proposalId: string }>();

      if (!proposalResult) {
        return {
          groupId,
          groupName: allGroupsResult.results?.find(g => g.groupId === groupId)?.groupName,
          passed: false,
          reason: 'no_settled_proposal',
          totalMembers,
          votedMembers: 0,
        };
      }

      // Count unique voters for this proposal
      const votersResult = await env.DB.prepare(`
        SELECT COUNT(DISTINCT voterEmail) as count
        FROM proposalvotes
        WHERE proposalId = ?
      `).bind(proposalResult.proposalId).first<{ count: number }>();

      const votedMembers = votersResult?.count || 0;

      return {
        groupId,
        groupName: allGroupsResult.results?.find(g => g.groupId === groupId)?.groupName,
        passed: votedMembers >= totalMembers,
        reason: votedMembers < totalMembers ? 'incomplete_votes' : 'complete',
        totalMembers,
        votedMembers,
      };
    })
  );

  const groupsWithAllMembersVoted = groupVotingStatus.filter(g => g.passed).length;
  const groupsWithSettledProposals = settledGroupIds.size;
  const missingGroups = groupVotingStatus.filter(g => !g.passed);

  const allPassed = groupsWithSettledProposals > 0 && groupsWithAllMembersVoted === groupsWithSettledProposals;

  return {
    passed: allPassed,
    details: {
      totalGroups,
      groupsWithSettledProposals,
      groupsWithAllMembersVoted,
      missingGroups: missingGroups.length > 0 ? missingGroups : undefined,
    },
  };
}

/**
 * Check if all proposals have been settled
 * Only checks the LATEST proposal for each group (by createdTime)
 * Uses rankingproposals_with_status VIEW for status calculation
 */
async function checkAllProposalsApproved(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<AllProposalsApprovedDetail>> {
  // Get only the latest proposal for each group using window function
  // Use VIEW for correct status and votingResult calculation
  const latestProposalsResult = await env.DB.prepare(`
    WITH LatestProposals AS (
      SELECT
        proposalId,
        groupId,
        status,
        votingResult,
        settleTime,
        withdrawnTime,
        resetTime,
        createdTime,
        ROW_NUMBER() OVER (PARTITION BY groupId ORDER BY createdTime DESC) as rn
      FROM rankingproposals_with_status
      WHERE projectId = ? AND stageId = ?
    )
    SELECT lp.proposalId, lp.groupId, lp.status, lp.votingResult, lp.settleTime, g.groupName
    FROM LatestProposals lp
    LEFT JOIN groups g ON g.groupId = lp.groupId
    WHERE lp.rn = 1
  `).bind(projectId, stageId).all<{
    proposalId: string;
    groupId: string;
    status: string;
    votingResult: string | null;
    settleTime: number | null;
    groupName: string | null;
  }>();

  const proposals = latestProposalsResult.results || [];

  const totalProposals = proposals.length;
  const settledProposals = proposals.filter(p => p.status === 'settled').length;
  // Count approved proposals (pending + agree = ready for settlement)
  const agreedProposals = proposals.filter(p => p.status === 'pending' && p.votingResult === 'agree').length;
  const disagreedProposals = proposals.filter(p => p.votingResult === 'disagree').length;
  const tieProposals = proposals.filter(p => p.votingResult === 'tie').length;
  const pendingProposals = proposals.filter(p => p.status === 'pending').length;
  const withdrawnProposals = proposals.filter(p => p.status === 'withdrawn').length;
  const resetProposals = proposals.filter(p => p.status === 'reset').length;

  // Query reset count for each group to distinguish tie proposals
  const resetCountsResult = await env.DB.prepare(`
    SELECT groupId, COUNT(*) as resetCount
    FROM rankingproposals_with_status
    WHERE projectId = ? AND stageId = ? AND status = 'reset'
    GROUP BY groupId
  `).bind(projectId, stageId).all<{ groupId: string; resetCount: number }>();

  const resetCounts = new Map<string, number>();
  resetCountsResult.results?.forEach(r => {
    resetCounts.set(r.groupId, r.resetCount);
  });

  // Distinguish tie proposals by reset status
  const tieProposalsCanReset = proposals.filter(p =>
    p.votingResult === 'tie' && (resetCounts.get(p.groupId) || 0) === 0
  ).length;
  const tieProposalsUsedReset = proposals.filter(p =>
    p.votingResult === 'tie' && (resetCounts.get(p.groupId) || 0) > 0
  ).length;

  // Get detailed list of unapproved proposals (not pending + agree)
  const unsettledProposals = proposals
    .filter(p => !(p.status === 'pending' && p.votingResult === 'agree'))
    .map(p => ({
      groupId: p.groupId,
      groupName: p.groupName,
      status: p.status,
      votingResult: p.votingResult,
      proposalId: p.proposalId,
      resetCount: resetCounts.get(p.groupId) || 0,
    }));

  return {
    passed: totalProposals > 0 && agreedProposals === totalProposals,
    details: {
      totalProposals,
      settledProposals,
      agreedProposals,
      disagreedProposals,
      tieProposals,
      tieProposalsCanReset,
      tieProposalsUsedReset,
      pendingProposals,
      withdrawnProposals,
      resetProposals,
      unsettledProposals: unsettledProposals.length > 0 ? unsettledProposals : undefined,
    },
  };
}

/**
 * Check if comment rankings exist (student or teacher)
 */
async function checkCommentRankings(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<CommentRankingsDetail>> {
  // Check student comment rankings (from commentrankingproposals)
  const studentCommentResult = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM commentrankingproposals crp
    JOIN usergroups ug ON ug.userEmail = crp.authorEmail AND ug.projectId = ?
    WHERE crp.stageId = ? AND ug.isActive = 1
  `).bind(projectId, stageId).first<{ count: number }>();

  const studentCommentRankings = studentCommentResult?.count || 0;

  // Check teacher comment rankings (from teachercommentrankings)
  const teacherCommentResult = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM teachercommentrankings
    WHERE projectId = ? AND stageId = ?
  `).bind(projectId, stageId).first<{ count: number }>();

  const teacherCommentRankings = teacherCommentResult?.count || 0;

  const totalCommentRankings = studentCommentRankings + teacherCommentRankings;

  return {
    passed: totalCommentRankings > 0,
    details: {
      studentCommentRankings,
      teacherCommentRankings,
      totalCommentRankings,
    },
  };
}

/**
 * Check if teacher submission rankings exist
 */
async function checkTeacherSubmissionRankings(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<TeacherRankingsDetail>> {
  // Get total teachers for this project
  const totalTeachersResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT userEmail) as count
    FROM projectviewers
    WHERE projectId = ? AND role = 'teacher' AND isActive = 1
  `).bind(projectId).first<{ count: number }>();

  const totalTeachers = totalTeachersResult?.count || 0;

  // Get teacher submission rankings (from teachersubmissionrankings table)
  const rankingsResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT teacherEmail) as teachersWhoRanked, COUNT(*) as totalRankings
    FROM teachersubmissionrankings
    WHERE projectId = ? AND stageId = ?
  `).bind(projectId, stageId).first<{ teachersWhoRanked: number; totalRankings: number }>();

  const teachersWhoRanked = rankingsResult?.teachersWhoRanked || 0;
  const totalRankings = rankingsResult?.totalRankings || 0;

  return {
    passed: teachersWhoRanked > 0,
    details: {
      teachersWhoRanked,
      totalTeachers,
      totalRankings,
    },
  };
}

/**
 * Check if teacher comment rankings exist
 */
async function checkTeacherCommentRankings(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<TeacherRankingsDetail>> {
  // Get total teachers for this project
  const totalTeachersResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT userEmail) as count
    FROM projectviewers
    WHERE projectId = ? AND role = 'teacher' AND isActive = 1
  `).bind(projectId).first<{ count: number }>();

  const totalTeachers = totalTeachersResult?.count || 0;

  // Get teacher comment rankings from teachercommentrankings table
  const rankingsResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT teacherEmail) as teachersWhoRanked, COUNT(*) as totalRankings
    FROM teachercommentrankings
    WHERE projectId = ? AND stageId = ?
  `).bind(projectId, stageId).first<{ teachersWhoRanked: number; totalRankings: number }>();

  const teachersWhoRanked = rankingsResult?.teachersWhoRanked || 0;
  const totalRankings = rankingsResult?.totalRankings || 0;

  return {
    passed: teachersWhoRanked > 0,
    details: {
      teachersWhoRanked,
      totalTeachers,
      totalRankings,
    },
  };
}

/**
 * Check if all groups received rankings (both student and teacher)
 * This prevents settlement from using default worst rank for unranked groups
 */
async function checkAllGroupsRanked(
  env: Env,
  projectId: string,
  stageId: string
): Promise<ValidationCheckDetail<AllGroupsRankedDetail>> {
  // 1. 獲取所有已批准的成果（即所有應該被排名的組）
  const submissions = await env.DB.prepare(`
    SELECT DISTINCT s.groupId, g.groupName
    FROM submissions_with_status s
    LEFT JOIN groups g ON g.groupId = s.groupId AND g.projectId = s.projectId
    WHERE s.projectId = ? AND s.stageId = ? AND s.approvedTime IS NOT NULL
  `).bind(projectId, stageId).all<{ groupId: string; groupName: string | null }>();

  if (!submissions.results || submissions.results.length === 0) {
    return {
      passed: true,
      details: {
        totalGroups: 0,
        allGroupsRankedByStudents: true,
        allGroupsRankedByTeachers: true,
        unrankedByStudents: [],
        unrankedByTeachers: [],
        studentRankedCount: 0,
        teacherRankedCount: 0
      }
    };
  }

  const allGroupIds = new Set(submissions.results.map(s => s.groupId));
  const totalGroups = allGroupIds.size;

  // 2. 檢查學生排名 - 從 JSON 中提取 submissionId 並統計每個 groupId 被排名的次數
  // Use VIEW for correct status calculation (pending + agree = approved proposals)
  const studentRankings = await env.DB.prepare(`
    SELECT
      json_extract(rankings.value, '$.submissionId') as submissionId,
      s.groupId,
      COUNT(DISTINCT rp.proposalId) as rankCount
    FROM rankingproposals_with_status rp,
         json_each(rp.rankingData) as rankings
    INNER JOIN submissions s
      ON s.submissionId = json_extract(rankings.value, '$.submissionId')
    WHERE rp.projectId = ?
      AND rp.stageId = ?
      AND rp.status = 'pending'
      AND rp.votingResult = 'agree'
    GROUP BY json_extract(rankings.value, '$.submissionId'), s.groupId
  `).bind(projectId, stageId).all<{ submissionId: string; groupId: string; rankCount: number }>();

  const studentRankedGroups = new Set(
    studentRankings.results?.map(r => r.groupId) || []
  );

  // 3. 檢查教師排名
  const teacherRankings = await env.DB.prepare(`
    SELECT tsr.submissionId, s.groupId, COUNT(*) as rankCount
    FROM teachersubmissionrankings tsr
    INNER JOIN submissions s ON s.submissionId = tsr.submissionId
    WHERE tsr.projectId = ? AND tsr.stageId = ?
    GROUP BY tsr.submissionId, s.groupId
  `).bind(projectId, stageId).all<{ submissionId: string; groupId: string; rankCount: number }>();

  const teacherRankedGroups = new Set(
    teacherRankings.results?.map(r => r.groupId) || []
  );

  // 4. 找出沒有被排名的組
  const unrankedByStudents: string[] = [];
  const unrankedByTeachers: string[] = [];

  for (const submission of submissions.results) {
    const groupId = submission.groupId;
    const groupName = submission.groupName || groupId;

    if (!studentRankedGroups.has(groupId)) {
      unrankedByStudents.push(groupName);
    }
    if (!teacherRankedGroups.has(groupId)) {
      unrankedByTeachers.push(groupName);
    }
  }

  // 5. 判斷檢查是否通過
  const allGroupsRankedByStudents = unrankedByStudents.length === 0;
  const allGroupsRankedByTeachers = unrankedByTeachers.length === 0;
  const passed = allGroupsRankedByStudents && allGroupsRankedByTeachers;

  return {
    passed,
    details: {
      totalGroups,
      allGroupsRankedByStudents,
      allGroupsRankedByTeachers,
      unrankedByStudents,
      unrankedByTeachers,
      studentRankedCount: studentRankedGroups.size,
      teacherRankedCount: teacherRankedGroups.size
    }
  };
}
