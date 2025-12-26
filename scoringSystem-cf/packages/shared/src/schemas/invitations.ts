/**
 * @fileoverview Zod schemas for invitation-related API endpoints
 * Provides runtime type validation for invitation management APIs
 */

import { z } from 'zod';
import { EmailSchema, TurnstileTokenSchema, SessionIdSchema } from './common';

/**
 * Generate invitation code request schema
 */
export const GenerateInvitationRequestSchema = z.object({
  targetEmail: EmailSchema,
  validDays: z.number().int().positive().optional(),
  defaultTags: z.array(z.string()).optional(),
  defaultGlobalGroups: z.array(z.string()).optional()
});

export type GenerateInvitationRequest = z.infer<typeof GenerateInvitationRequestSchema>;

/**
 * Generate batch invitation codes request schema
 */
export const GenerateBatchInvitationsRequestSchema = z.object({
  targetEmails: z.array(EmailSchema).min(1, 'At least one email is required'),
  validDays: z.number().int().positive().optional(),
  defaultTags: z.array(z.string()).optional(),
  defaultGlobalGroups: z.array(z.string()).optional()
});

export type GenerateBatchInvitationsRequest = z.infer<typeof GenerateBatchInvitationsRequestSchema>;

/**
 * List invitations request schema
 */
export const ListInvitationsRequestSchema = z.object({
  includeUsed: z.boolean().optional(),
  includeExpired: z.boolean().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional()
});

export type ListInvitationsRequest = z.infer<typeof ListInvitationsRequestSchema>;

/**
 * Deactivate invitation request schema
 */
export const DeactivateInvitationRequestSchema = z.object({
  invitationId: z.string().min(1, 'Invitation ID is required')
});

export type DeactivateInvitationRequest = z.infer<typeof DeactivateInvitationRequestSchema>;

/**
 * Resend invitation email request schema
 */
export const ResendInvitationEmailRequestSchema = z.object({
  invitationId: z.string().min(1, 'Invitation ID is required')
});

export type ResendInvitationEmailRequest = z.infer<typeof ResendInvitationEmailRequestSchema>;

/**
 * Verify invitation request schema (public endpoint)
 */
export const VerifyInvitationRequestSchema = z.object({
  invitationCode: z.string().min(1, 'Invitation code is required'),
  userEmail: EmailSchema,
  turnstileToken: TurnstileTokenSchema
});

export type VerifyInvitationRequest = z.infer<typeof VerifyInvitationRequestSchema>;

/**
 * Invitation info schema
 */
export const InvitationInfoSchema = z.object({
  invitationId: z.string(),
  invitationCode: z.string(),
  creatorEmail: z.string(),
  targetEmail: z.string().nullable(),
  createdAt: z.number(),
  expiresAt: z.number(),
  usedAt: z.number().nullable(),
  usedByEmail: z.string().nullable(),
  isActive: z.boolean(),
  isExpired: z.boolean(),
  isUsed: z.boolean(),
  defaultTags: z.array(z.string()).optional(),
  defaultGlobalGroups: z.array(z.string()).optional()
});

export type InvitationInfo = z.infer<typeof InvitationInfoSchema>;

/**
 * Verify invitation response schema
 */
export const VerifyInvitationResponseSchema = z.object({
  verified: z.boolean(),
  targetEmail: z.string().nullable().optional(),
  availableTags: z.array(z.string()).optional(),
  message: z.string().optional()
});

export type VerifyInvitationResponse = z.infer<typeof VerifyInvitationResponseSchema>;
