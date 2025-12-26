/**
 * @fileoverview Zod schemas for event logs API endpoints
 * Provides runtime type validation for event logs APIs
 */

import { z } from 'zod';

/**
 * Event log filters schema
 */
const EventLogFiltersSchema = z.object({
  action: z.string().optional(),
  targetUserEmail: z.string().email().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional()
}).optional();

/**
 * Get project event logs request schema
 */
export const GetProjectEventLogsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  filters: EventLogFiltersSchema
});

export type GetProjectEventLogsRequest = z.infer<typeof GetProjectEventLogsRequestSchema>;

/**
 * Get user project event logs request schema
 */
export const GetUserProjectEventLogsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  filters: EventLogFiltersSchema
});

export type GetUserProjectEventLogsRequest = z.infer<typeof GetUserProjectEventLogsRequestSchema>;

/**
 * Get event resource details request schema
 */
export const GetEventResourceDetailsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  resourceType: z.string().min(1, 'Resource type is required'),
  resourceId: z.string().min(1, 'Resource ID is required')
});

export type GetEventResourceDetailsRequest = z.infer<typeof GetEventResourceDetailsRequestSchema>;
