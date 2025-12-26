/**
 * @fileoverview Zod schemas for notifications-related API endpoints
 * Provides runtime type validation for notification APIs
 */

import { z } from 'zod';

/**
 * Get user notifications list request schema
 */
export const GetUserNotificationsRequestSchema = z.object({
  options: z.object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    unreadOnly: z.boolean().optional(),
    searchText: z.string().optional(),
    projectId: z.string().optional()
  }).optional()
});

export type GetUserNotificationsRequest = z.infer<typeof GetUserNotificationsRequestSchema>;

/**
 * Mark notification as read request schema
 */
export const MarkNotificationAsReadRequestSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required')
});

export type MarkNotificationAsReadRequest = z.infer<typeof MarkNotificationAsReadRequestSchema>;

/**
 * Delete notification request schema
 */
export const DeleteNotificationRequestSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required')
});

export type DeleteNotificationRequest = z.infer<typeof DeleteNotificationRequestSchema>;

/**
 * Admin: List all notifications request schema
 */
export const AdminListNotificationsRequestSchema = z.object({
  options: z.object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    userEmail: z.string().optional(),
    projectId: z.string().optional(),
    isRead: z.boolean().optional()
  }).optional()
});

export type AdminListNotificationsRequest = z.infer<typeof AdminListNotificationsRequestSchema>;

/**
 * Admin: Send single notification request schema
 */
export const AdminSendNotificationRequestSchema = z.object({
  userEmail: z.string().min(1, 'User email is required'),
  type: z.string().min(1, 'Notification type is required'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  projectId: z.string().optional(),
  relatedId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export type AdminSendNotificationRequest = z.infer<typeof AdminSendNotificationRequestSchema>;

/**
 * Admin: Send batch notifications request schema
 */
export const AdminSendBatchNotificationsRequestSchema = z.object({
  userEmails: z.array(z.string().min(1)).min(1, 'At least one user email is required'),
  type: z.string().min(1, 'Notification type is required'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  projectId: z.string().optional(),
  relatedId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export type AdminSendBatchNotificationsRequest = z.infer<typeof AdminSendBatchNotificationsRequestSchema>;

/**
 * Admin: Delete notification request schema
 */
export const AdminDeleteNotificationRequestSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required')
});

export type AdminDeleteNotificationRequest = z.infer<typeof AdminDeleteNotificationRequestSchema>;
