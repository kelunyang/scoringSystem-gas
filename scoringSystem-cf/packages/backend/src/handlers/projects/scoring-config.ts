/**
 * Scoring Configuration API Handlers
 *
 * Provides REST API endpoints for managing scoring system configuration:
 * - GET /projects/:projectId/scoring-config - Get effective config for a project
 * - PUT /projects/:projectId/scoring-config - Update project-level config
 * - GET /projects/system/scoring-defaults - Get system KV defaults
 * - PUT /projects/system/scoring-defaults - Update system KV defaults
 *
 * Created: 2025-12-08
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import {
  getEffectiveScoringConfig,
  getSystemScoringDefaults,
  validateScoringConfig,
  SCORING_CONFIG_KEYS,
  type ScoringConfig,
} from '../../utils/scoring-config'

// ============================================================================
// Types
// ============================================================================

interface Env {
  DB: D1Database
  KV: KVNamespace
  DEFAULT_MAX_COMMENT_SELECTIONS: string
  DEFAULT_STUDENT_RANKING_WEIGHT: string
  DEFAULT_TEACHER_RANKING_WEIGHT: string
  DEFAULT_COMMENT_REWARD_PERCENTILE: string
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for updating project-level scoring config
 * All fields are optional (partial update)
 */
const updateProjectConfigSchema = z.object({
  maxCommentSelections: z.number().int().min(1).optional(),
  studentRankingWeight: z.number().min(0).max(1).optional(),
  teacherRankingWeight: z.number().min(0).max(1).optional(),
  commentRewardPercentile: z.number().min(0).max(100).optional(),
})

/**
 * Schema for updating system KV defaults
 * All fields are optional (partial update)
 */
const updateSystemDefaultsSchema = z.object({
  maxCommentSelections: z.number().int().min(1).optional(),
  studentRankingWeight: z.number().min(0).max(1).optional(),
  teacherRankingWeight: z.number().min(0).max(1).optional(),
  commentRewardPercentile: z.number().min(0).max(100).optional(),
})

// ============================================================================
// Router
// ============================================================================

export const scoringConfigRouter = new Hono<{ Bindings: Env }>()

// ============================================================================
// GET /projects/:projectId/scoring-config
// Get effective scoring configuration for a project
// ============================================================================

scoringConfigRouter.get('/:projectId/scoring-config', async (c: Context<{ Bindings: Env }>) => {
  try {
    const { projectId } = c.req.param()

    // Validate projectId format
    if (!projectId || !projectId.startsWith('proj_')) {
      throw new HTTPException(400, { message: 'Invalid project ID format' })
    }

    // Check if project exists
    const project = await c.env.DB.prepare('SELECT projectId FROM projects WHERE projectId = ?')
      .bind(projectId)
      .first()

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' })
    }

    // Get effective configuration
    const config = await getEffectiveScoringConfig(c.env.DB, c.env.KV, c.env, projectId)

    return c.json({
      success: true,
      data: config,
    })
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    console.error('[GET /projects/:projectId/scoring-config] Error:', error)
    throw new HTTPException(500, { message: 'Failed to get scoring configuration' })
  }
})

// ============================================================================
// PUT /projects/:projectId/scoring-config
// Update project-level scoring configuration
// ============================================================================

scoringConfigRouter.put('/:projectId/scoring-config', async (c: Context<{ Bindings: Env }>) => {
  try {
    const { projectId } = c.req.param()

    // Validate projectId format
    if (!projectId || !projectId.startsWith('proj_')) {
      throw new HTTPException(400, { message: 'Invalid project ID format' })
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validated = updateProjectConfigSchema.parse(body)

    // Additional validation for weight sum
    if (validated.studentRankingWeight !== undefined && validated.teacherRankingWeight !== undefined) {
      validateScoringConfig({
        studentRankingWeight: validated.studentRankingWeight,
        teacherRankingWeight: validated.teacherRankingWeight,
      })
    }

    // Check if project exists
    const project = await c.env.DB.prepare('SELECT projectId FROM projects WHERE projectId = ?')
      .bind(projectId)
      .first()

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' })
    }

    // Build dynamic UPDATE query
    const fields: string[] = []
    const values: any[] = []

    if (validated.maxCommentSelections !== undefined) {
      fields.push('maxCommentSelections = ?')
      values.push(validated.maxCommentSelections)
    }
    if (validated.studentRankingWeight !== undefined) {
      fields.push('studentRankingWeight = ?')
      values.push(validated.studentRankingWeight)
    }
    if (validated.teacherRankingWeight !== undefined) {
      fields.push('teacherRankingWeight = ?')
      values.push(validated.teacherRankingWeight)
    }
    if (validated.commentRewardPercentile !== undefined) {
      fields.push('commentRewardPercentile = ?')
      values.push(validated.commentRewardPercentile)
    }

    if (fields.length === 0) {
      return c.json({
        success: true,
        message: 'No changes provided',
      })
    }

    // Add updatedAt timestamp
    fields.push('updatedAt = ?')
    values.push(Date.now())

    // Add projectId for WHERE clause
    values.push(projectId)

    // Execute UPDATE
    await c.env.DB.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE projectId = ?`)
      .bind(...values)
      .run()

    // Get updated configuration
    const updatedConfig = await getEffectiveScoringConfig(c.env.DB, c.env.KV, c.env, projectId)

    return c.json({
      success: true,
      message: 'Scoring configuration updated successfully',
      data: updatedConfig,
    })
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: error.issues,
      })
    }

    console.error('[PUT /projects/:projectId/scoring-config] Error:', error)
    throw new HTTPException(500, { message: 'Failed to update scoring configuration' })
  }
})

// ============================================================================
// GET /projects/system/scoring-defaults
// Get system KV defaults (used for new project creation drawer)
// ============================================================================

scoringConfigRouter.get('/system/scoring-defaults', async (c: Context<{ Bindings: Env }>) => {
  try {
    const defaults = await getSystemScoringDefaults(c.env.KV, c.env)

    return c.json({
      success: true,
      data: defaults,
    })
  } catch (error) {
    console.error('[GET /projects/system/scoring-defaults] Error:', error)
    throw new HTTPException(500, { message: 'Failed to get system scoring defaults' })
  }
})

// ============================================================================
// PUT /projects/system/scoring-defaults
// Update system KV defaults (admin only - should add permission check)
// ============================================================================

scoringConfigRouter.put('/system/scoring-defaults', async (c: Context<{ Bindings: Env }>) => {
  try {
    // Parse and validate request body
    const body = await c.req.json()
    const validated = updateSystemDefaultsSchema.parse(body)

    // Additional validation for weight sum
    if (validated.studentRankingWeight !== undefined && validated.teacherRankingWeight !== undefined) {
      validateScoringConfig({
        studentRankingWeight: validated.studentRankingWeight,
        teacherRankingWeight: validated.teacherRankingWeight,
      })
    }

    // Update KV values
    const promises: Promise<void>[] = []

    if (validated.maxCommentSelections !== undefined) {
      promises.push(c.env.KV.put(SCORING_CONFIG_KEYS.MAX_COMMENT_SELECTIONS, String(validated.maxCommentSelections)))
    }
    if (validated.studentRankingWeight !== undefined) {
      promises.push(c.env.KV.put(SCORING_CONFIG_KEYS.STUDENT_RANKING_WEIGHT, String(validated.studentRankingWeight)))
    }
    if (validated.teacherRankingWeight !== undefined) {
      promises.push(c.env.KV.put(SCORING_CONFIG_KEYS.TEACHER_RANKING_WEIGHT, String(validated.teacherRankingWeight)))
    }
    if (validated.commentRewardPercentile !== undefined) {
      promises.push(c.env.KV.put(SCORING_CONFIG_KEYS.COMMENT_REWARD_PERCENTILE, String(validated.commentRewardPercentile)))
    }

    if (promises.length === 0) {
      return c.json({
        success: true,
        message: 'No changes provided',
      })
    }

    await Promise.all(promises)

    // Get updated defaults
    const updatedDefaults = await getSystemScoringDefaults(c.env.KV, c.env)

    return c.json({
      success: true,
      message: `System scoring defaults updated (${promises.length} fields)`,
      data: updatedDefaults,
    })
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: error.issues,
      })
    }

    console.error('[PUT /projects/system/scoring-defaults] Error:', error)
    throw new HTTPException(500, { message: 'Failed to update system scoring defaults' })
  }
})
