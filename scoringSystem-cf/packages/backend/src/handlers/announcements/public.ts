/**
 * Public Announcements Handler
 * Provides public API for fetching active announcements (no auth required)
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import type { AnnouncementType } from '@repo/shared/schemas/announcements';

/**
 * Public announcement data (limited fields for security)
 */
interface PublicAnnouncement {
  announcementId: string;
  title: string;
  content: string;
  startTime: number;
  endTime: number;
  type: AnnouncementType;
}

/**
 * Database announcement row type
 */
interface AnnouncementRow {
  announcementId: string;
  title: string;
  content: string;
  startTime: number;
  endTime: number;
  type: string;
}

/**
 * Get active announcements for public display (login page)
 * Returns announcements where:
 * - isActive = 1
 * - current time is between startTime and endTime
 *
 * Results are sorted by priority (error > warning > info > success)
 * then by endTime (closest to expiring first)
 */
export async function getActiveAnnouncements(
  env: Env
): Promise<Response> {
  try {
    const now = Date.now();

    // Query active announcements within valid time range
    const result = await env.DB.prepare(`
      SELECT
        announcementId,
        title,
        content,
        startTime,
        endTime,
        type
      FROM announcements
      WHERE isActive = 1
        AND startTime <= ?
        AND endTime >= ?
      ORDER BY
        CASE type
          WHEN 'error' THEN 0
          WHEN 'warning' THEN 1
          WHEN 'info' THEN 2
          WHEN 'success' THEN 3
          ELSE 4
        END ASC,
        endTime ASC
      LIMIT 10
    `).bind(now, now).all();

    const announcements = (result.results as unknown as AnnouncementRow[]).map(row => ({
      announcementId: row.announcementId,
      title: row.title,
      content: row.content,
      startTime: row.startTime,
      endTime: row.endTime,
      type: row.type as AnnouncementType
    }));

    return successResponse(announcements);

  } catch (error) {
    console.error('[getActiveAnnouncements] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch announcements'
    );
  }
}
