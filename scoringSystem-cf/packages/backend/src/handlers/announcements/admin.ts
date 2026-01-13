/**
 * Admin Announcements Handler
 * Provides admin CRUD functionality for announcements
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { GLOBAL_PERMISSIONS } from '../../utils/permissions';
import type { AnnouncementType } from '@repo/shared/schemas/announcements';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Full announcement data from database
 */
interface AnnouncementRow {
  announcementId: string;
  title: string;
  content: string;
  startTime: number;
  endTime: number;
  type: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number | null;
  isActive: number;
}

/**
 * Announcement with computed status
 */
interface AnnouncementWithStatus extends Omit<AnnouncementRow, 'type'> {
  type: AnnouncementType;
  status: 'pending' | 'active' | 'expired';
}

/**
 * List filters
 */
interface ListFilters {
  limit: number;
  offset: number;
  type?: AnnouncementType;
  status?: 'pending' | 'active' | 'expired' | 'all';
  searchText?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user has announcement management permission
 */
async function checkAnnouncementPermission(
  env: Env,
  userEmail: string
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(`
      SELECT 1 as hasPermission
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ?
        AND g.isActive = 1
        AND EXISTS (
          SELECT 1
          FROM json_each(g.globalPermissions)
          WHERE json_each.value IN (?, ?)
        )
      LIMIT 1
    `).bind(
      userEmail,
      GLOBAL_PERMISSIONS.MANAGE_ANNOUNCEMENTS,
      GLOBAL_PERMISSIONS.SYSTEM_ADMIN
    ).first<{ hasPermission: number }>();

    return result !== null;
  } catch (error) {
    console.error('[checkAnnouncementPermission] Error:', error);
    return false;
  }
}

/**
 * Compute announcement status based on current time
 */
function computeStatus(startTime: number, endTime: number): 'pending' | 'active' | 'expired' {
  const now = Date.now();
  if (now < startTime) return 'pending';
  if (now > endTime) return 'expired';
  return 'active';
}

/**
 * Generate unique announcement ID
 */
function generateAnnouncementId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Main Handlers
// ============================================================================

/**
 * List all announcements with filters (admin)
 */
export async function listAnnouncements(
  env: Env,
  userEmail: string,
  options: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
    searchText?: string;
  } = {}
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAnnouncementPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '需要 manage_announcements 或 system_admin 權限');
    }

    // Normalize filters
    const filters: ListFilters = {
      limit: Math.min(Math.max(1, options.limit || 50), 100),
      offset: Math.max(0, options.offset || 0),
      type: options.type as AnnouncementType | undefined,
      status: options.status as ListFilters['status'],
      searchText: options.searchText
    };

    // Build query
    const conditions: string[] = ['isActive = 1'];
    const params: (string | number)[] = [];

    if (filters.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters.searchText) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      const searchPattern = `%${filters.searchText}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Query with window function for total count
    const query = `
      SELECT
        *,
        COUNT(*) OVER() as totalCount
      FROM announcements
      ${whereClause}
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `;

    params.push(filters.limit, filters.offset);

    const result = await env.DB.prepare(query).bind(...params).all();
    const rows = result.results as unknown as (AnnouncementRow & { totalCount: number })[];
    const totalCount = rows.length > 0 ? rows[0].totalCount : 0;

    // Process results
    const now = Date.now();
    const announcements: AnnouncementWithStatus[] = rows.map(row => ({
      announcementId: row.announcementId,
      title: row.title,
      content: row.content,
      startTime: row.startTime,
      endTime: row.endTime,
      type: row.type as AnnouncementType,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isActive: row.isActive,
      status: computeStatus(row.startTime, row.endTime)
    }));

    // Filter by status if specified (done in memory for simplicity)
    const filteredAnnouncements = filters.status && filters.status !== 'all'
      ? announcements.filter(a => a.status === filters.status)
      : announcements;

    return successResponse({
      announcements: filteredAnnouncements,
      totalCount: filters.status && filters.status !== 'all'
        ? filteredAnnouncements.length
        : totalCount,
      filters
    });

  } catch (error) {
    console.error('[listAnnouncements] Error:', error);
    return errorResponse('INTERNAL_ERROR', '無法取得公告列表');
  }
}

/**
 * Get single announcement by ID (admin)
 */
export async function getAnnouncement(
  env: Env,
  userEmail: string,
  announcementId: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAnnouncementPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '需要 manage_announcements 或 system_admin 權限');
    }

    const result = await env.DB.prepare(`
      SELECT * FROM announcements
      WHERE announcementId = ? AND isActive = 1
    `).bind(announcementId).first<AnnouncementRow>();

    if (!result) {
      return errorResponse('NOT_FOUND', '公告不存在');
    }

    return successResponse({
      ...result,
      type: result.type as AnnouncementType,
      status: computeStatus(result.startTime, result.endTime)
    });

  } catch (error) {
    console.error('[getAnnouncement] Error:', error);
    return errorResponse('INTERNAL_ERROR', '無法取得公告');
  }
}

/**
 * Create new announcement (admin)
 */
export async function createAnnouncement(
  env: Env,
  userEmail: string,
  data: {
    title: string;
    content: string;
    startTime: number;
    endTime: number;
    type?: string;
  }
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAnnouncementPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '需要 manage_announcements 或 system_admin 權限');
    }

    // Validate time range
    if (data.endTime <= data.startTime) {
      return errorResponse('VALIDATION_ERROR', '結束時間必須晚於開始時間');
    }

    const announcementId = generateAnnouncementId();
    const now = Date.now();
    const type = data.type || 'info';

    await env.DB.prepare(`
      INSERT INTO announcements (
        announcementId, title, content, startTime, endTime,
        type, createdBy, createdAt, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      announcementId,
      data.title,
      data.content,
      data.startTime,
      data.endTime,
      type,
      userEmail,
      now
    ).run();

    return successResponse({
      announcementId,
      title: data.title,
      content: data.content,
      startTime: data.startTime,
      endTime: data.endTime,
      type: type as AnnouncementType,
      createdBy: userEmail,
      createdAt: now,
      updatedAt: null,
      isActive: 1,
      status: computeStatus(data.startTime, data.endTime)
    }, '公告建立成功');

  } catch (error) {
    console.error('[createAnnouncement] Error:', error);
    return errorResponse('INTERNAL_ERROR', '無法建立公告');
  }
}

/**
 * Update announcement (admin)
 */
export async function updateAnnouncement(
  env: Env,
  userEmail: string,
  data: {
    announcementId: string;
    title?: string;
    content?: string;
    startTime?: number;
    endTime?: number;
    type?: string;
  }
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAnnouncementPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '需要 manage_announcements 或 system_admin 權限');
    }

    // Check if announcement exists
    const existing = await env.DB.prepare(`
      SELECT * FROM announcements
      WHERE announcementId = ? AND isActive = 1
    `).bind(data.announcementId).first<AnnouncementRow>();

    if (!existing) {
      return errorResponse('NOT_FOUND', '公告不存在');
    }

    // Build update fields
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title);
    }

    if (data.content !== undefined) {
      updates.push('content = ?');
      params.push(data.content);
    }

    if (data.startTime !== undefined) {
      updates.push('startTime = ?');
      params.push(data.startTime);
    }

    if (data.endTime !== undefined) {
      updates.push('endTime = ?');
      params.push(data.endTime);
    }

    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(data.type);
    }

    if (updates.length === 0) {
      return errorResponse('VALIDATION_ERROR', '沒有提供要更新的欄位');
    }

    // Validate time range if either time is being updated
    const newStartTime = data.startTime ?? existing.startTime;
    const newEndTime = data.endTime ?? existing.endTime;
    if (newEndTime <= newStartTime) {
      return errorResponse('VALIDATION_ERROR', '結束時間必須晚於開始時間');
    }

    // Add updatedAt
    updates.push('updatedAt = ?');
    const now = Date.now();
    params.push(now);

    // Add announcementId for WHERE clause
    params.push(data.announcementId);

    await env.DB.prepare(`
      UPDATE announcements
      SET ${updates.join(', ')}
      WHERE announcementId = ?
    `).bind(...params).run();

    // Return updated announcement
    const updated = await env.DB.prepare(`
      SELECT * FROM announcements WHERE announcementId = ?
    `).bind(data.announcementId).first<AnnouncementRow>();

    return successResponse({
      ...updated,
      type: updated!.type as AnnouncementType,
      status: computeStatus(updated!.startTime, updated!.endTime)
    }, '公告更新成功');

  } catch (error) {
    console.error('[updateAnnouncement] Error:', error);
    return errorResponse('INTERNAL_ERROR', '無法更新公告');
  }
}

/**
 * Delete announcement (soft delete, admin)
 */
export async function deleteAnnouncement(
  env: Env,
  userEmail: string,
  announcementId: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAnnouncementPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', '需要 manage_announcements 或 system_admin 權限');
    }

    // Check if announcement exists
    const existing = await env.DB.prepare(`
      SELECT announcementId FROM announcements
      WHERE announcementId = ? AND isActive = 1
    `).bind(announcementId).first();

    if (!existing) {
      return errorResponse('NOT_FOUND', '公告不存在');
    }

    // Soft delete
    await env.DB.prepare(`
      UPDATE announcements
      SET isActive = 0, updatedAt = ?
      WHERE announcementId = ?
    `).bind(Date.now(), announcementId).run();

    return successResponse({ announcementId }, '公告已刪除');

  } catch (error) {
    console.error('[deleteAnnouncement] Error:', error);
    return errorResponse('INTERNAL_ERROR', '無法刪除公告');
  }
}
