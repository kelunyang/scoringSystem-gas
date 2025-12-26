/**
 * 成果投票系統 - 共享工具函數
 * 用於教師投票和學生投票共用的驗證邏輯
 */


/**
 * 驗證成果是否符合投票資格
 */
export async function validateSubmissionEligibility(
  db: D1Database,
  projectId: string,
  submissionId: string,
  excludeGroupId?: string
): Promise<{
  valid: boolean;
  error?: string;
  submission?: any;
}> {
  // 1. 獲取成果資料
  const submission = await db.prepare(`
    SELECT
      submissionId,
      groupId,
      status,
      submitTime,
      contentMarkdown
    FROM submissions_with_status
    WHERE submissionId = ? AND projectId = ?
  `).bind(submissionId, projectId).first();

  if (!submission) {
    return { valid: false, error: '成果不存在' };
  }

  // 2. 必須是已批准的成果
  if (submission.status !== 'approved') {
    return {
      valid: false,
      error: '只能對已批准的成果進行排名'
    };
  }

  // 3. 排除指定組別（學生投票時排除自己組）
  if (excludeGroupId && submission.groupId === excludeGroupId) {
    return {
      valid: false,
      error: '不能投票給自己組的成果'
    };
  }

  return { valid: true, submission };
}

/**
 * 獲取可投票的成果列表
 */
export async function getRankableSubmissions(
  db: D1Database,
  projectId: string,
  stageId: string,
  excludeGroupId?: string
): Promise<any[]> {
  // 獲取所有已批准的成果
  const submissions = await db.prepare(`
    SELECT
      s.submissionId,
      s.groupId,
      s.status,
      s.submitTime,
      s.contentMarkdown,
      g.groupName
    FROM submissions_with_status s
    LEFT JOIN groups g ON g.groupId = s.groupId AND g.projectId = s.projectId
    WHERE s.projectId = ?
      AND s.stageId = ?
      AND s.status = 'approved'
    ORDER BY s.submitTime DESC
  `).bind(projectId, stageId).all();

  if (!submissions.results || submissions.results.length === 0) {
    return [];
  }

  // 過濾掉排除的組別
  let validSubmissions = submissions.results;

  if (excludeGroupId) {
    validSubmissions = validSubmissions.filter(
      sub => sub.groupId !== excludeGroupId
    );
  }

  return validSubmissions;
}

/**
 * 驗證成果排名數據的完整性
 */
export function validateSubmissionRankingData(
  rankingData: Array<{ submissionId?: string; targetId?: string; rank: number }>
): { valid: boolean; error?: string } {
  // 1. 檢查是否為空
  if (!rankingData || rankingData.length === 0) {
    return { valid: false, error: '排名數據不能為空' };
  }

  // 2. 檢查 rank 範圍和格式
  for (const item of rankingData) {
    const id = item.submissionId || item.targetId;
    if (!id || !item.rank) {
      return { valid: false, error: '排名數據格式錯誤' };
    }
    if (item.rank < 1) {
      return { valid: false, error: 'rank 必須大於 0' };
    }
  }

  // 3. 檢查重複的 submissionId
  const submissionIds = rankingData.map(r => r.submissionId || r.targetId);
  const uniqueIds = new Set(submissionIds);
  if (submissionIds.length !== uniqueIds.size) {
    return { valid: false, error: '不能對同一成果投票多次' };
  }

  // 4. 檢查重複的 rank
  const ranks = rankingData.map(r => r.rank);
  const uniqueRanks = new Set(ranks);
  if (ranks.length !== uniqueRanks.size) {
    return { valid: false, error: 'rank 不能重複' };
  }

  return { valid: true };
}
