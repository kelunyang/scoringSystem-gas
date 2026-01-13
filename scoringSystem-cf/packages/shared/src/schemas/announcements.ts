/**
 * @fileoverview Zod schemas for announcements-related API endpoints
 * Provides runtime type validation for announcement APIs
 */

import { z } from 'zod';

/**
 * Announcement type enum
 * Determines display priority and styling
 * Priority order: error > warning > info > success
 */
export const AnnouncementTypeSchema = z.enum(['info', 'warning', 'success', 'error']);
export type AnnouncementType = z.infer<typeof AnnouncementTypeSchema>;

/**
 * Base announcement data schema
 */
export const AnnouncementDataSchema = z.object({
  announcementId: z.string(),
  title: z.string(),
  content: z.string(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  type: AnnouncementTypeSchema,
  createdBy: z.string(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive().nullable(),
  isActive: z.number().int().min(0).max(1)
});

export type AnnouncementData = z.infer<typeof AnnouncementDataSchema>;

/**
 * Public: Get active announcements request schema
 * No parameters needed - returns all currently active announcements
 */
export const GetActiveAnnouncementsRequestSchema = z.object({});

export type GetActiveAnnouncementsRequest = z.infer<typeof GetActiveAnnouncementsRequestSchema>;

/**
 * Public: Get active announcements response schema
 */
export const GetActiveAnnouncementsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.object({
    announcementId: z.string(),
    title: z.string(),
    content: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    type: AnnouncementTypeSchema
  }))
});

export type GetActiveAnnouncementsResponse = z.infer<typeof GetActiveAnnouncementsResponseSchema>;

/**
 * Admin: List all announcements request schema
 */
export const AdminListAnnouncementsRequestSchema = z.object({
  options: z.object({
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().min(0).optional(),
    type: AnnouncementTypeSchema.optional(),
    status: z.enum(['pending', 'active', 'expired', 'all']).optional(),
    searchText: z.string().optional()
  }).optional()
});

export type AdminListAnnouncementsRequest = z.infer<typeof AdminListAnnouncementsRequestSchema>;

/**
 * Admin: Create announcement request schema
 */
export const AdminCreateAnnouncementRequestSchema = z.object({
  title: z.string().min(1, '標題不能為空').max(200, '標題不能超過 200 字'),
  content: z.string().min(1, '內容不能為空').max(10000, '內容不能超過 10000 字'),
  startTime: z.number().int().positive('開始時間必須為正整數'),
  endTime: z.number().int().positive('結束時間必須為正整數'),
  type: AnnouncementTypeSchema.optional().default('info')
}).refine(
  (data) => data.endTime > data.startTime,
  { message: '結束時間必須晚於開始時間', path: ['endTime'] }
);

export type AdminCreateAnnouncementRequest = z.infer<typeof AdminCreateAnnouncementRequestSchema>;

/**
 * Admin: Update announcement request schema
 */
export const AdminUpdateAnnouncementRequestSchema = z.object({
  announcementId: z.string().min(1, '公告 ID 不能為空'),
  title: z.string().min(1, '標題不能為空').max(200, '標題不能超過 200 字').optional(),
  content: z.string().min(1, '內容不能為空').max(10000, '內容不能超過 10000 字').optional(),
  startTime: z.number().int().positive('開始時間必須為正整數').optional(),
  endTime: z.number().int().positive('結束時間必須為正整數').optional(),
  type: AnnouncementTypeSchema.optional()
});

export type AdminUpdateAnnouncementRequest = z.infer<typeof AdminUpdateAnnouncementRequestSchema>;

/**
 * Admin: Delete announcement request schema
 */
export const AdminDeleteAnnouncementRequestSchema = z.object({
  announcementId: z.string().min(1, '公告 ID 不能為空')
});

export type AdminDeleteAnnouncementRequest = z.infer<typeof AdminDeleteAnnouncementRequestSchema>;

/**
 * Admin: Get single announcement request schema
 */
export const AdminGetAnnouncementRequestSchema = z.object({
  announcementId: z.string().min(1, '公告 ID 不能為空')
});

export type AdminGetAnnouncementRequest = z.infer<typeof AdminGetAnnouncementRequestSchema>;
