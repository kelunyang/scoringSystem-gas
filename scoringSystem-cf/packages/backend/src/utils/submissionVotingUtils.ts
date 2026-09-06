/**
 * 成果投票系統 - 共享工具函數
 * 用於教師投票和學生投票共用的驗證邏輯
 */

import { validateWeakOrder } from '@repo/shared';

/**
 * 驗證成果是否符合投票資格
 */
/**
 * 驗證結果。用 valid 判別，所以通過時 submission 必定存在。
 */
type SubmissionEligibility =
  | { valid: true; submission: VotableSubmissionRow; error?: undefined }
  | { valid: false; error: string; submission?: undefined };

/** 檢查「這份成果可不可以被投票」時讀到的欄位。 */
interface VotableSubmissionRow {
  submissionId: string;
  groupId: string;
  status: string;
  submitTime: number;
  contentMarkdown: string | null;
}

export async function validateSubmissionEligibility(
  db: D1Database,
  projectId: string,
  submissionId: string,
  excludeGroupId?: string
): Promise<SubmissionEligibility> {
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
  `).bind(submissionId, projectId).first<VotableSubmissionRow>();

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

  // 4. 檢查 rank 形成合法弱序（允許同名：相同 rank 可重複，層級需連續不跳號）
  const ranks = rankingData.map(r => r.rank);
  if (!validateWeakOrder(ranks)) {
    return { valid: false, error: '排名必須形成合法弱序（可同名，但名次層級需從 1 連續不跳號）' };
  }

  return { valid: true };
}
