/**
 * Voting Analysis Handlers
 * Provides APIs for analyzing voting data without triggering settlement
 * Used by VotingAnalysisModal and CommentVotingAnalysisModal components
 */

import { Context } from 'hono'
import type { Env } from '../../types'
import { errorResponse, successResponse } from '../../utils/response'
import { logProjectOperation } from '../../utils/logging'
import { checkProjectPermission } from '../../middleware/permissions'

/**
 * Get submission voting data for analysis
 * Aggregates approved ranking proposals and teacher rankings
 *
 * @route POST /scoring/submission-voting-data
 */
export async function getSubmissionVotingData(c: Context<any>) {
  try {
    const { stageId } = await c.req.json()

    if (!stageId) {
      return errorResponse('MISSING_PARAMETER', 'stageId is required')
    }

    // Get stage information to validate access
    const stage = await c.env.DB.prepare(`
      SELECT projectId, stageName
      FROM stages
      WHERE stageId = ?
    `).bind(stageId).first()

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found')
    }

    // Validate user has view permission
    const user = c.get('user')
    const hasAccess = await checkProjectPermission(
      c.env,
      user.userEmail,
      stage.projectId as string,
      'view'
    )

    if (!hasAccess) {
      return errorResponse('PERMISSION_DENIED', 'No permission to view this project')
    }

    await logProjectOperation(
      c.env,
      user.userEmail,
      stage.projectId as string,
      'voting_data_viewed',
      'stage',
      stageId,
      { type: 'submission' },
      'info'
    )

    // 1. Get approved ranking proposals (student votes) with proposer info
    const approvedProposals = await c.env.DB.prepare(`
      SELECT
        rp.groupId,
        rp.proposerEmail,
        rp.rankingData,
        g.groupName,
        u.displayName as proposerDisplayName
      FROM rankingproposals_with_status rp
      LEFT JOIN groups g ON rp.groupId = g.groupId
      LEFT JOIN users u ON rp.proposerEmail = u.userEmail
      WHERE rp.stageId = ?
        AND rp.status = 'settled'
      ORDER BY rp.groupId
    `).bind(stageId).all()

    // 2. Get teacher submission rankings with teacher info
    const teacherRankings = await c.env.DB.prepare(`
      SELECT
        tsr.teacherEmail,
        tsr.groupId,
        tsr.rank,
        tsr.submissionId,
        u.displayName as teacherDisplayName
      FROM teachersubmissionrankings tsr
      LEFT JOIN users u ON tsr.teacherEmail = u.userEmail
      WHERE tsr.stageId = ?
      ORDER BY tsr.teacherEmail, tsr.rank
    `).bind(stageId).all()

    // 3. Get all groups for this stage's project
    const groups = await c.env.DB.prepare(`
      SELECT
        groupId,
        groupName
      FROM groups
      WHERE projectId = ?
        AND status = 'active'
      ORDER BY groupName
    `).bind(stage.projectId).all()

    // 4. Get settlement scores from stagesettlements (if stage has been settled)
    const settlementScores = await c.env.DB.prepare(`
      SELECT
        ss.groupId,
        ss.finalRank,
        ss.studentScore,
        ss.teacherScore,
        ss.totalScore,
        ss.allocatedPoints
      FROM stagesettlements ss
      WHERE ss.stageId = ?
        AND ss.settlementId = (
          SELECT MAX(settlementId)
          FROM stagesettlements
          WHERE stageId = ?
        )
    `).bind(stageId, stageId).all()

    // Create a map for quick lookup of settlement scores
    const settlementScoresMap = new Map()
    for (const score of settlementScores.results) {
      settlementScoresMap.set(score.groupId as string, {
        finalRank: score.finalRank as number,
        studentScore: score.studentScore as number,
        teacherScore: score.teacherScore as number,
        totalScore: score.totalScore as number,
        allocatedPoints: score.allocatedPoints as number
      })
    }

    // Format student votes (approved proposals) with proposer info
    const studentVotes = approvedProposals.results.map((proposal: any) => {
      let rankingData: Array<{ groupId: string; rank: number }> = []

      try {
        const parsed = JSON.parse(proposal.rankingData as string)
        // Handle both array format and object format
        if (Array.isArray(parsed)) {
          rankingData = parsed
        } else if (typeof parsed === 'object') {
          // Convert object format to array
          rankingData = Object.entries(parsed).map(([groupId, rank]) => ({
            groupId,
            rank: typeof rank === 'number' ? rank : parseInt(rank as string)
          }))
        }
      } catch (err) {
        console.error('Failed to parse rankingData for group:', proposal.groupId, err)
        rankingData = []
      }

      return {
        groupId: proposal.groupId,
        proposerEmail: proposal.proposerEmail as string,
        proposerDisplayName: proposal.proposerDisplayName as string,
        rankingData
      }
    })

    // Format teacher votes with teacher info
    // Group by teacher email
    const teacherVotesMap = new Map<string, { displayName: string; rankingData: Array<{ groupId: string; rank: number; submissionId?: string }> }>()

    for (const ranking of teacherRankings.results) {
      const email = ranking.teacherEmail as string
      if (!teacherVotesMap.has(email)) {
        teacherVotesMap.set(email, {
          displayName: ranking.teacherDisplayName as string,
          rankingData: []
        })
      }

      teacherVotesMap.get(email)!.rankingData.push({
        groupId: ranking.groupId as string,
        rank: ranking.rank as number,
        submissionId: ranking.submissionId as string
      })
    }

    const teacherVotes = Array.from(teacherVotesMap.entries()).map(([teacherEmail, data]) => ({
      teacherEmail,
      teacherDisplayName: data.displayName,
      rankingData: data.rankingData
    }))

    // Format group info with settlement scores
    const groupInfo = groups.results.map((group: any) => {
      const groupId = group.groupId as string
      const settlementData = settlementScoresMap.get(groupId)

      return {
        groupId,
        groupName: group.groupName as string,
        finalRank: settlementData?.finalRank || null,
        studentScore: settlementData?.studentScore || 0,
        teacherScore: settlementData?.teacherScore || 0,
        totalScore: settlementData?.totalScore || 0,
        allocatedPoints: settlementData?.allocatedPoints || 0
      }
    })

    return successResponse({
      stageId,
      stageName: stage.stageName,
      studentVotes,
      teacherVotes,
      groupInfo
    })
  } catch (error) {
    console.error('getSubmissionVotingData error:', error)
    return errorResponse('SERVER_ERROR', 'Failed to load voting data')
  }
}

/**
 * Get comment voting data for analysis
 * Aggregates comment ranking proposals and teacher comment rankings
 *
 * @route POST /scoring/comment-voting-data
 */
export async function getCommentVotingData(c: Context<any>) {
  try {
    const { stageId } = await c.req.json()

    if (!stageId) {
      return errorResponse('MISSING_PARAMETER', 'stageId is required')
    }

    // Get stage information to validate access
    const stage = await c.env.DB.prepare(`
      SELECT projectId, stageName
      FROM stages
      WHERE stageId = ?
    `).bind(stageId).first()

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found')
    }

    // Validate user has view permission
    const user = c.get('user')
    const hasAccess = await checkProjectPermission(
      c.env,
      user.userEmail,
      stage.projectId as string,
      'view'
    )

    if (!hasAccess) {
      return errorResponse('PERMISSION_DENIED', 'No permission to view this project')
    }

    await logProjectOperation(
      c.env,
      user.userEmail,
      stage.projectId as string,
      'voting_data_viewed',
      'stage',
      stageId,
      { type: 'comment' },
      'info'
    )

    // 1. Get comment ranking proposals (student votes) with proposer info
    // Only get proposals from actual students (active group members)
    const commentProposals = await c.env.DB.prepare(`
      SELECT
        crp.authorEmail,
        crp.rankingData,
        crp.createdTime,
        u.displayName as proposerDisplayName,
        ug.groupId
      FROM commentrankingproposals crp
      JOIN usergroups ug ON ug.userEmail = crp.authorEmail AND ug.projectId = ?
      LEFT JOIN users u ON crp.authorEmail = u.userEmail
      WHERE crp.stageId = ? AND ug.isActive = 1
      ORDER BY crp.createdTime DESC
    `).bind(stage.projectId, stageId).all()

    // 2. Get teacher comment rankings with teacher info
    const teacherCommentRankings = await c.env.DB.prepare(`
      SELECT
        tcr.teacherEmail,
        tcr.commentId,
        tcr.authorEmail,
        tcr.rank,
        u.displayName as teacherDisplayName
      FROM teachercommentrankings tcr
      LEFT JOIN users u ON tcr.teacherEmail = u.userEmail
      WHERE tcr.stageId = ?
      ORDER BY tcr.teacherEmail, tcr.rank
    `).bind(stageId).all()

    // 3. Get all top-level comments with candidate eligibility for this stage
    // Only comments that mention users or groups are eligible for comment rewards
    const comments = await c.env.DB.prepare(`
      SELECT
        c.commentId,
        c.authorEmail,
        c.content,
        c.createdTime,
        c.mentionedUsers,
        c.mentionedGroups,
        u.displayName as authorDisplayName
      FROM comments c
      LEFT JOIN users u ON c.authorEmail = u.userEmail
      WHERE c.stageId = ?
        AND c.isReply = 0
        AND c.parentCommentId IS NULL
        AND (
          (c.mentionedUsers IS NOT NULL AND c.mentionedUsers != '[]')
          OR (c.mentionedGroups IS NOT NULL AND c.mentionedGroups != '[]')
        )
      ORDER BY c.createdTime DESC
    `).bind(stageId).all()

    // 4. Get settlement scores from commentsettlements (if stage has been settled)
    const commentSettlementScores = await c.env.DB.prepare(`
      SELECT
        cs.commentId,
        cs.finalRank,
        cs.studentScore,
        cs.teacherScore,
        cs.totalScore,
        cs.allocatedPoints,
        cs.rewardPercentage
      FROM commentsettlements cs
      WHERE cs.stageId = ?
        AND cs.settlementId = (
          SELECT MAX(settlementId)
          FROM commentsettlements
          WHERE stageId = ?
        )
    `).bind(stageId, stageId).all()

    // Create a map for quick lookup of comment settlement scores
    const commentScoresMap = new Map()
    for (const score of commentSettlementScores.results) {
      commentScoresMap.set(score.commentId as string, {
        finalRank: score.finalRank as number,
        studentScore: score.studentScore as number,
        teacherScore: score.teacherScore as number,
        totalScore: score.totalScore as number,
        allocatedPoints: score.allocatedPoints as number,
        rewardPercentage: score.rewardPercentage as number
      })
    }

    // Format student votes (comment proposals) with proposer info
    const studentVotes = commentProposals.results.map((proposal: any) => {
      let rankingData: Array<{ commentId: string; rank: number }> = []

      try {
        const parsed = JSON.parse(proposal.rankingData as string)
        // Handle both array format and object format
        if (Array.isArray(parsed)) {
          rankingData = parsed
        } else if (typeof parsed === 'object') {
          // Convert object format to array
          rankingData = Object.entries(parsed).map(([commentId, rank]) => ({
            commentId,
            rank: typeof rank === 'number' ? rank : parseInt(rank as string)
          }))
        }
      } catch (err) {
        console.error('Failed to parse rankingData for author:', proposal.authorEmail, err)
        rankingData = []
      }

      return {
        authorEmail: proposal.authorEmail,
        proposerDisplayName: proposal.proposerDisplayName as string,
        rankingData
      }
    })

    // Format teacher votes with teacher info
    // Group by teacher email
    const teacherVotesMap = new Map<string, { displayName: string; rankingData: Array<{ commentId: string; rank: number; authorEmail?: string }> }>()

    for (const ranking of teacherCommentRankings.results) {
      const email = ranking.teacherEmail as string
      if (!teacherVotesMap.has(email)) {
        teacherVotesMap.set(email, {
          displayName: ranking.teacherDisplayName as string,
          rankingData: []
        })
      }

      teacherVotesMap.get(email)!.rankingData.push({
        commentId: ranking.commentId as string,
        rank: ranking.rank as number,
        authorEmail: ranking.authorEmail as string
      })
    }

    const teacherVotes = Array.from(teacherVotesMap.entries()).map(([teacherEmail, data]) => ({
      teacherEmail,
      teacherDisplayName: data.displayName,
      rankingData: data.rankingData
    }))

    // Format comment info with settlement scores and author info
    const commentInfo = comments.results.map((comment: any) => {
      const commentId = comment.commentId as string
      const settlementData = commentScoresMap.get(commentId)

      return {
        commentId,
        authorEmail: comment.authorEmail as string,
        authorDisplayName: comment.authorDisplayName as string,
        content: comment.content as string,
        finalRank: settlementData?.finalRank || null,
        studentScore: settlementData?.studentScore || 0,
        teacherScore: settlementData?.teacherScore || 0,
        totalScore: settlementData?.totalScore || 0,
        allocatedPoints: settlementData?.allocatedPoints || 0,
        rewardPercentage: settlementData?.rewardPercentage || 0
      }
    })

    return successResponse({
      stageId,
      stageName: stage.stageName,
      studentVotes,
      teacherVotes,
      commentInfo
    })
  } catch (error) {
    console.error('getCommentVotingData error:', error)
    return errorResponse('SERVER_ERROR', 'Failed to load comment voting data')
  }
}
