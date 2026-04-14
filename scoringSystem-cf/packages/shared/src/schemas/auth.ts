/**
 * @fileoverview Zod schemas for authentication-related API endpoints
 * Provides runtime type validation for auth APIs
 */

import { z } from 'zod';
import {
  EmailSchema,
  PasswordSchema,
  DisplayNameSchema,
  SessionIdSchema,
  TurnstileTokenSchema,
  AvatarConfigSchema
} from './common';

/**
 * Registration request schema
 */
export const RegisterRequestSchema = z.object({
  password: PasswordSchema,
  userEmail: EmailSchema,
  displayName: DisplayNameSchema,
  invitationCode: z.string().min(1, 'Invitation code is required'),
  avatarSeed: z.string().optional(),
  avatarStyle: z.string().optional(),
  avatarOptions: z.record(z.string(), z.string()).optional(),
  turnstileToken: TurnstileTokenSchema
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Registration response schema
 */
export const RegisterResponseSchema = z.object({
  userId: z.string(),
  userEmail: z.string(),
  displayName: z.string(),
  sessionId: z.string(),
  message: z.string().optional()
});

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

/**
 * Login verify password request schema
 */
export const LoginVerifyPasswordRequestSchema = z.object({
  userEmail: EmailSchema,
  password: PasswordSchema,
  turnstileToken: TurnstileTokenSchema
});

export type LoginVerifyPasswordRequest = z.infer<typeof LoginVerifyPasswordRequestSchema>;

/**
 * Email verification code schema (12-char OTP)
 * - Strips hyphens before validation (separators only)
 * - Converts to uppercase
 * - Validates character set and length
 */
const EmailVerificationCodeSchema = z.string()
  .transform(val => {
    // Remove whitespace, hyphens, and convert to uppercase
    // This ensures consistent 12-character format throughout the pipeline
    return val.trim().replace(/-/g, '').toUpperCase();
  })
  .refine(
    (cleanCode) => {
      // Validate length and character set (A-Z excluding I,O + @#!)
      // At this point, cleanCode is already 12 characters without hyphens
      return cleanCode.length === 12 && /^[A-Z@#!]+$/.test(cleanCode);
    },
    { message: 'Invalid verification code format' }
  );

/**
 * Flexible verification code schema for login 2FA
 * Accepts:
 * - 12-char email OTP codes (A-Z@#!, with optional hyphens)
 * - 6-digit TOTP codes (numeric)
 * - 8-char recovery codes (alphanumeric)
 * Backend determines which verification path based on user's totpEnabled flag
 */
const FlexibleVerificationCodeSchema = z.string()
  .transform(val => val.trim().replace(/-/g, '').toUpperCase())
  .refine(
    (cleanCode) => {
      // 6-digit TOTP code
      if (/^\d{6}$/.test(cleanCode)) return true;
      // 8-char recovery code (A-Z, 2-9, excluding I,O,0,1)
      if (cleanCode.length === 8 && /^[A-HJ-NP-Z2-9]+$/.test(cleanCode)) return true;
      // 12-char email OTP code
      if (cleanCode.length === 12 && /^[A-Z@#!]+$/.test(cleanCode)) return true;
      return false;
    },
    { message: 'Invalid verification code format' }
  );

/**
 * Login verify 2FA request schema
 */
export const LoginVerify2FARequestSchema = z.object({
  userEmail: EmailSchema,
  code: FlexibleVerificationCodeSchema,
  turnstileToken: TurnstileTokenSchema
});

export type LoginVerify2FARequest = z.infer<typeof LoginVerify2FARequestSchema>;

/**
 * Login response schema
 */
export const LoginResponseSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  displayName: z.string(),
  message: z.string().optional()
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * Logout request schema
 */
export const LogoutRequestSchema = z.object({
  sessionId: SessionIdSchema
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/**
 * Validate session request schema
 */
export const ValidateSessionRequestSchema = z.object({
  sessionId: SessionIdSchema
});

export type ValidateSessionRequest = z.infer<typeof ValidateSessionRequestSchema>;

/**
 * Change password request schema
 */
export const ChangePasswordRequestSchema = z.object({
  sessionId: SessionIdSchema,
  oldPassword: PasswordSchema,
  newPassword: PasswordSchema
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/**
 * Check email availability query schema
 */
export const CheckEmailQuerySchema = z.object({
  email: EmailSchema
});

export type CheckEmailQuery = z.infer<typeof CheckEmailQuerySchema>;

/**
 * Current user request schema
 */
export const CurrentUserRequestSchema = z.object({
  sessionId: SessionIdSchema.optional()
});

export type CurrentUserRequest = z.infer<typeof CurrentUserRequestSchema>;

/**
 * User info schema
 */
export const UserInfoSchema = z.object({
  userId: z.string(),
  userEmail: z.string(),
  displayName: z.string(),
  status: z.enum(['active', 'disabled']),
  registrationTime: z.number(),
  lastActivityTime: z.number().nullable(),
  avatarSeed: z.string().optional(),
  avatarStyle: z.string().optional(),
  avatarOptions: z.record(z.string(), z.string()).optional(),
  globalPermissions: z.array(z.string()).optional()
});

export type UserInfo = z.infer<typeof UserInfoSchema>;

/**
 * Refresh token request schema
 */
export const RefreshTokenRequestSchema = z.object({
  sessionId: SessionIdSchema
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

/**
 * Resend 2FA request schema
 */
export const Resend2FARequestSchema = z.object({
  userEmail: EmailSchema,
  turnstileToken: TurnstileTokenSchema
});

export type Resend2FARequest = z.infer<typeof Resend2FARequestSchema>;

/**
 * Password reset - verify email request schema
 */
export const VerifyEmailForResetRequestSchema = z.object({
  userEmail: EmailSchema,
  selectedProjectIds: z.array(z.string()).optional(),
  allParticipated: z.boolean().optional(),
  turnstileToken: TurnstileTokenSchema
});

export type VerifyEmailForResetRequest = z.infer<typeof VerifyEmailForResetRequestSchema>;

/**
 * Password reset - verify code request schema
 */
export const PasswordResetVerifyCodeRequestSchema = z.object({
  userEmail: EmailSchema,
  code: EmailVerificationCodeSchema,
  turnstileToken: TurnstileTokenSchema
});

export type PasswordResetVerifyCodeRequest = z.infer<typeof PasswordResetVerifyCodeRequestSchema>;

/**
 * Password reset - reset password request schema
 */
export const ResetPasswordRequestSchema = z.object({
  userEmail: EmailSchema,
  selectedProjectIds: z.array(z.string()).optional(),
  allParticipated: z.boolean().optional(),
  turnstileToken: TurnstileTokenSchema.optional()
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

/**
 * 2FA verification response schema
 */
export const TwoFactorVerificationResponseSchema = z.object({
  message: z.string(),
  emailSent: z.boolean().optional(),
  devMode: z.boolean().optional(),
  expiresAt: z.number().optional(),
  twoFactorMethod: z.enum(['email', 'totp']).optional()
});

export type TwoFactorVerificationResponse = z.infer<typeof TwoFactorVerificationResponseSchema>;

// ─── TOTP Setup Schemas ───

/**
 * TOTP setup verification request (6-digit code from authenticator app)
 */
export const TotpSetupVerifyRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits')
});

export type TotpSetupVerifyRequest = z.infer<typeof TotpSetupVerifyRequestSchema>;

/**
 * TOTP disable request (requires password confirmation)
 */
export const TotpDisableRequestSchema = z.object({
  password: PasswordSchema
});

export type TotpDisableRequest = z.infer<typeof TotpDisableRequestSchema>;

/**
 * TOTP recovery codes regeneration request
 */
export const TotpRegenerateCodesRequestSchema = z.object({
  password: PasswordSchema
});

export type TotpRegenerateCodesRequest = z.infer<typeof TotpRegenerateCodesRequestSchema>;
