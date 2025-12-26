import { z } from 'zod';

/**
 * SMTP Configuration Schema
 * Used for email sending functionality
 */
export const SmtpConfigSchema = z.object({
  host: z.string().min(1, 'SMTP host is required'),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1, 'SMTP username is required'),
  password: z.string().min(1, 'SMTP password is required'),
  fromName: z.string().optional().default('Scoring System'),
  fromEmail: z.string().email('Invalid from email address')
});

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

/**
 * Update SMTP Configuration Request Schema
 */
export const UpdateSmtpConfigRequestSchema = z.object({
  config: SmtpConfigSchema
});

export type UpdateSmtpConfigRequest = z.infer<typeof UpdateSmtpConfigRequestSchema>;

/**
 * Test SMTP Connection Request Schema
 */
export const TestSmtpConnectionRequestSchema = z.object({
  config: SmtpConfigSchema.optional(), // If not provided, test current stored config
  testEmail: z.string().email().optional() // Optional test email recipient
});

export type TestSmtpConnectionRequest = z.infer<typeof TestSmtpConnectionRequestSchema>;

/**
 * Get SMTP Config Response Schema (with masked password)
 */
export const GetSmtpConfigResponseSchema = z.object({
  success: z.boolean(),
  data: SmtpConfigSchema.extend({
    password: z.string() // Will be masked as '***HIDDEN***'
  }).nullable()
});

export type GetSmtpConfigResponse = z.infer<typeof GetSmtpConfigResponseSchema>;
