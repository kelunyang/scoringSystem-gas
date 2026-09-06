/**
 * User Display Names Handler
 * Batch query user displayNames for mention functionality
 */

import type { Env } from '../../types'
// 這個檔案原本自己重寫了一份 successResponse／errorResponse，
// 回傳裸 Response 且 data 標成 unknown——RPC 型別因此拿不到形狀。
// 改用共用的（順帶取得正確的 HTTP 狀態碼對照）。
import { successResponse, errorResponse } from '@utils/response'

/**
 * Batch query user displayNames
 * Used for mention functionality to get display names of mentioned users
 *
 * @param env - Cloudflare Workers environment bindings
 * @param userEmail - Current user's email (for permission check)
 * @param projectId - Project ID (for permission check)
 * @param userEmails - Array of user emails to query
 * @returns Response with userEmail → displayName mapping
 */
export async function getUserDisplayNames(
  env: Env,
  userEmail: string,
  projectId: string,
  userEmails: string[]
) {
  try {
    // Handle empty input
    if (!userEmails || userEmails.length === 0) {
      return successResponse({ userEmailToDisplayName: {}, userCount: 0 })
    }

    console.log(`[getUserDisplayNames] Querying ${userEmails.length} users`)

    // Build SQL query with placeholders
    const placeholders = userEmails.map(() => '?').join(',')
    const query = `
      SELECT userEmail, displayName
      FROM users
      WHERE userEmail IN (${placeholders})
    `

    // Execute query
    const result = await env.DB.prepare(query)
      .bind(...userEmails)
      .all()

    // Build mapping
    const userEmailToDisplayName: Record<string, string> = {}
    if (result.results) {
      for (const row of result.results) {
        userEmailToDisplayName[row.userEmail as string] = row.displayName as string
      }
    }

    console.log(`[getUserDisplayNames] Found ${Object.keys(userEmailToDisplayName).length} users`)

    return successResponse({
      userEmailToDisplayName,
      userCount: Object.keys(userEmailToDisplayName).length
    })
  } catch (error) {
    console.error('[getUserDisplayNames] Error:', error)
    return errorResponse('SYSTEM_ERROR', 'Failed to get user display names')
  }
}
