/**
 * User Display Names Handler
 * Batch query user displayNames for mention functionality
 */

import type { Env } from '../../types'

/**
 * Success response helper
 */
function successResponse(data: any): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * Error response helper
 */
function errorResponse(errorCode: string, message: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: errorCode, message }
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

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
): Promise<Response> {
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
