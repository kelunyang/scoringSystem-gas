/**
 * Scoring System Configuration Utilities
 *
 * Provides three-tier configuration fallback system for scoring parameters:
 * 1. Project-level database config (highest priority)
 * 2. System-level KV config (middle priority)
 * 3. Wrangler.toml environment variables (lowest priority/hardcoded defaults)
 *
 * Created: 2025-12-08
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

// ============================================================================
// Types
// ============================================================================

export interface ScoringConfig {
  maxCommentSelections: number
  studentRankingWeight: number
  teacherRankingWeight: number
  commentRewardPercentile: number
}

// Note: Env type is imported from main types.ts in consuming files
export interface ScoringConfigEnv {
  DB: D1Database
  KV: KVNamespace
  DEFAULT_MAX_COMMENT_SELECTIONS: string
  DEFAULT_STUDENT_RANKING_WEIGHT: string
  DEFAULT_TEACHER_RANKING_WEIGHT: string
  DEFAULT_COMMENT_REWARD_PERCENTILE: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * KV Configuration Keys
 * Used for system-level configuration storage
 */
export const SCORING_CONFIG_KEYS = {
  MAX_COMMENT_SELECTIONS: 'config:max_comment_selections',
  STUDENT_RANKING_WEIGHT: 'config:student_ranking_weight',
  TEACHER_RANKING_WEIGHT: 'config:teacher_ranking_weight',
  COMMENT_REWARD_PERCENTILE: 'config:comment_reward_percentile',
} as const

/**
 * Hardcoded Fallback Defaults
 * Used only if wrangler.toml env vars are not set (should never happen)
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  maxCommentSelections: 3,
  studentRankingWeight: 0.7,
  teacherRankingWeight: 0.3,
  commentRewardPercentile: 0, // 0 means use fixed topN: 3 (legacy behavior)
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get effective scoring configuration for a project
 *
 * Three-tier fallback:
 * 1. Project DB (if set) → 2. System KV (if set) → 3. Wrangler.toml env vars → 4. Hardcoded defaults
 *
 * @param db - D1 database instance
 * @param kv - KV namespace instance
 * @param env - Environment variables from wrangler.toml
 * @param projectId - Project UUID
 * @returns Effective scoring configuration
 */
export async function getEffectiveScoringConfig(
  db: D1Database,
  kv: KVNamespace,
  env: ScoringConfigEnv,
  projectId: string
): Promise<ScoringConfig> {
  // Tier 1: Check project-level database config
  const project = await db
    .prepare('SELECT maxCommentSelections, studentRankingWeight, teacherRankingWeight, commentRewardPercentile FROM projects WHERE projectId = ?')
    .bind(projectId)
    .first<{
      maxCommentSelections: number | null
      studentRankingWeight: number | null
      teacherRankingWeight: number | null
      commentRewardPercentile: number | null
    }>()

  // Tier 2: Get system-level KV defaults
  const kvMaxSelections = await kv.get(SCORING_CONFIG_KEYS.MAX_COMMENT_SELECTIONS)
  const kvStudentWeight = await kv.get(SCORING_CONFIG_KEYS.STUDENT_RANKING_WEIGHT)
  const kvTeacherWeight = await kv.get(SCORING_CONFIG_KEYS.TEACHER_RANKING_WEIGHT)
  const kvPercentile = await kv.get(SCORING_CONFIG_KEYS.COMMENT_REWARD_PERCENTILE)

  // Tier 3: Fallback to wrangler.toml env vars → Tier 4: Hardcoded defaults
  const result = {
    maxCommentSelections:
      project?.maxCommentSelections ??
      (kvMaxSelections ? parseInt(kvMaxSelections, 10) : parseInt(env.DEFAULT_MAX_COMMENT_SELECTIONS || String(DEFAULT_SCORING_CONFIG.maxCommentSelections), 10)),

    studentRankingWeight:
      project?.studentRankingWeight ??
      (kvStudentWeight ? parseFloat(kvStudentWeight) : parseFloat(env.DEFAULT_STUDENT_RANKING_WEIGHT || String(DEFAULT_SCORING_CONFIG.studentRankingWeight))),

    teacherRankingWeight:
      project?.teacherRankingWeight ??
      (kvTeacherWeight ? parseFloat(kvTeacherWeight) : parseFloat(env.DEFAULT_TEACHER_RANKING_WEIGHT || String(DEFAULT_SCORING_CONFIG.teacherRankingWeight))),

    commentRewardPercentile:
      project?.commentRewardPercentile ??
      (kvPercentile ? parseFloat(kvPercentile) : parseFloat(env.DEFAULT_COMMENT_REWARD_PERCENTILE || String(DEFAULT_SCORING_CONFIG.commentRewardPercentile))),
  }

  return result
}

/**
 * Get system KV defaults (for new project creation drawer)
 *
 * Two-tier fallback:
 * 1. System KV (if set) → 2. Wrangler.toml env vars → 3. Hardcoded defaults
 *
 * @param kv - KV namespace instance
 * @param env - Environment variables from wrangler.toml
 * @returns System default scoring configuration
 */
export async function getSystemScoringDefaults(
  kv: KVNamespace,
  env: ScoringConfigEnv
): Promise<ScoringConfig> {
  const kvMaxSelections = await kv.get(SCORING_CONFIG_KEYS.MAX_COMMENT_SELECTIONS)
  const kvStudentWeight = await kv.get(SCORING_CONFIG_KEYS.STUDENT_RANKING_WEIGHT)
  const kvTeacherWeight = await kv.get(SCORING_CONFIG_KEYS.TEACHER_RANKING_WEIGHT)
  const kvPercentile = await kv.get(SCORING_CONFIG_KEYS.COMMENT_REWARD_PERCENTILE)

  return {
    maxCommentSelections: kvMaxSelections
      ? parseInt(kvMaxSelections, 10)
      : parseInt(env.DEFAULT_MAX_COMMENT_SELECTIONS || String(DEFAULT_SCORING_CONFIG.maxCommentSelections), 10),
    studentRankingWeight: kvStudentWeight
      ? parseFloat(kvStudentWeight)
      : parseFloat(env.DEFAULT_STUDENT_RANKING_WEIGHT || String(DEFAULT_SCORING_CONFIG.studentRankingWeight)),
    teacherRankingWeight: kvTeacherWeight
      ? parseFloat(kvTeacherWeight)
      : parseFloat(env.DEFAULT_TEACHER_RANKING_WEIGHT || String(DEFAULT_SCORING_CONFIG.teacherRankingWeight)),
    commentRewardPercentile: kvPercentile
      ? parseFloat(kvPercentile)
      : parseFloat(env.DEFAULT_COMMENT_REWARD_PERCENTILE || String(DEFAULT_SCORING_CONFIG.commentRewardPercentile)),
  }
}

/**
 * Calculate actual comment reward limit using percentile
 *
 * Uses Math.ceil to round UP when converting percentile to actual count.
 * This ensures that even small percentages result in at least 1 person being eligible.
 *
 * @param uniqueAuthors - Number of unique comment authors
 * @param percentile - Percentile threshold (0-100). 0 means use fixed topN.
 * @param fallbackTopN - Fallback fixed number if percentile is 0 (legacy behavior)
 * @returns Actual number of comment authors eligible for rewards
 *
 * @example
 * // 10 unique authors, top 20% → Math.ceil(10 * 0.20) = 2 authors
 * calculateCommentRewardLimit(10, 20, 3) // returns 2
 *
 * // 15 unique authors, top 30% → Math.ceil(15 * 0.30) = 5 authors
 * calculateCommentRewardLimit(15, 30, 3) // returns 5
 *
 * // Percentile = 0 → use fallback fixed top N
 * calculateCommentRewardLimit(10, 0, 3) // returns 3
 */
export function calculateCommentRewardLimit(
  uniqueAuthors: number,
  percentile: number,
  fallbackTopN: number
): number {
  if (percentile > 0) {
    // Use Math.ceil to round UP (無條件進位)
    return Math.max(1, Math.ceil((percentile / 100) * uniqueAuthors))
  }
  // Legacy behavior: use fixed topN (usually 3)
  return fallbackTopN
}

/**
 * Validate scoring configuration weights
 *
 * Ensures student + teacher weights sum to 1.0 with 0.001 tolerance
 *
 * @param studentWeight - Student ranking weight (0-1)
 * @param teacherWeight - Teacher ranking weight (0-1)
 * @returns true if valid, false otherwise
 */
export function validateWeights(studentWeight: number, teacherWeight: number): boolean {
  const sum = studentWeight + teacherWeight
  return Math.abs(sum - 1.0) <= 0.001
}

/**
 * Validate scoring configuration
 *
 * @param config - Scoring configuration to validate
 * @throws Error if validation fails
 */
export function validateScoringConfig(config: Partial<ScoringConfig>): void {
  if (config.maxCommentSelections !== undefined && config.maxCommentSelections < 1) {
    throw new Error('maxCommentSelections must be >= 1')
  }

  if (config.studentRankingWeight !== undefined && (config.studentRankingWeight < 0 || config.studentRankingWeight > 1)) {
    throw new Error('studentRankingWeight must be between 0 and 1')
  }

  if (config.teacherRankingWeight !== undefined && (config.teacherRankingWeight < 0 || config.teacherRankingWeight > 1)) {
    throw new Error('teacherRankingWeight must be between 0 and 1')
  }

  if (
    config.studentRankingWeight !== undefined &&
    config.teacherRankingWeight !== undefined &&
    !validateWeights(config.studentRankingWeight, config.teacherRankingWeight)
  ) {
    throw new Error('Student and teacher weights must sum to 1.0')
  }

  if (config.commentRewardPercentile !== undefined && (config.commentRewardPercentile < 0 || config.commentRewardPercentile > 100)) {
    throw new Error('commentRewardPercentile must be between 0 and 100')
  }
}
