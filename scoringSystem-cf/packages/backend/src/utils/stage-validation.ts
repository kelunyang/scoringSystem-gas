/**
 * Stage Validation Utilities
 * Shared validation functions for stage-related operations
 */

/**
 * Check if a stage accepts ranking submissions
 * Prevents submissions during settlement (status='settling') or after settlement (status='completed')
 *
 * @param db - D1 Database instance
 * @param projectId - Project ID
 * @param stageId - Stage ID
 * @returns Validation result with error details if invalid
 */
export async function checkStageAcceptsRankings(
  db: D1Database,
  projectId: string,
  stageId: string
): Promise<{ valid: boolean; error?: string; errorCode?: string }> {
  const stage = await db.prepare(`
    SELECT stageId, status, stageName FROM stages_with_status
    WHERE stageId = ? AND projectId = ?
  `).bind(stageId, projectId).first();

  if (!stage) {
    return { valid: false, error: 'Stage not found', errorCode: 'STAGE_NOT_FOUND' };
  }

  const status = stage.status as string;

  if (status === 'settling') {
    return {
      valid: false,
      error: 'Stage is currently being settled. Please wait for settlement to complete before submitting rankings.',
      errorCode: 'STAGE_SETTLING'
    };
  }

  if (status === 'completed') {
    return {
      valid: false,
      error: 'Stage has already been settled. Rankings can no longer be submitted.',
      errorCode: 'STAGE_SETTLED'
    };
  }

  // Only 'active' and 'voting' statuses allow rankings
  if (status !== 'active' && status !== 'voting') {
    return {
      valid: false,
      error: `Stage is not accepting rankings (current status: ${status})`,
      errorCode: 'INVALID_STAGE_STATUS'
    };
  }

  return { valid: true };
}
