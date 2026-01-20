/**
 * @fileoverview Zod schemas for event logs API endpoints
 * Provides runtime type validation for event logs APIs
 */

import { z } from 'zod';

/**
 * Event log filters schema
 * Field names match the backend EventLogFilters interface in handlers/eventlogs/query.ts
 */
const EventLogFiltersSchema = z.object({
  actions: z.array(z.string()).optional(),              // Filter by event types (plural array)
  userEmails: z.array(z.string().email()).optional(),   // Filter by user emails (plural array)
  resourceTypes: z.array(z.string()).optional(),        // Filter by entity types (plural array)
  resourceId: z.string().optional(),                    // Filter by specific resource ID
  startTime: z.number().optional(),                     // Start timestamp (ms)
  endTime: z.number().optional(),                       // End timestamp (ms)
  limit: z.number().int().positive().optional(),        // Pagination limit
  offset: z.number().int().nonnegative().optional()     // Pagination offset
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
