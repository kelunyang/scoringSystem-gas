/**
 * @fileoverview Authentication-related TypeScript type definitions
 * Provides type safety for login, registration, and password reset flows
 */

import type { ApiResponse } from '@repo/shared/types/api-responses';

/**
 * Login credentials for email/password authentication
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Two-factor authentication verification data
 */
export interface TwoFactorData {
  email: string;
  code: string;
  /** Which 2FA channel the code came from (email OTP and TOTP are both 6 digits) */
  method?: 'email' | 'totp';
  turnstileToken?: string;
}

/**
 * User registration data
 */
export interface RegisterData {
  invitationCode: string;
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  avatarSeed: string;
  avatarStyle: string;
  avatarOptions: Record<string, any>;
  turnstileToken?: string;
}

/**
 * Password reset/forgot password data
 */
export interface ForgotPasswordData {
  userEmail: string;
  selectedProjectIds: string[];
  allParticipated: boolean;
}

/**
 * Project information for password reset
 */
export interface Project {
  projectId: string;
  projectName: string;
}

/**
 * Avatar style options
 */
export type AvatarStyle = 'avataaars' | 'bottts' | 'initials' | 'identicon' | 'lorelei' | 'micah' | 'pixel-art' | 'personas';

/**
 * Avatar generator options
 */
export interface AvatarOptions {
  seed: string;
  style: AvatarStyle;
  options: Record<string, any>;
}

/**
 * API response for email verification (forgot password)
 */
export interface EmailVerificationData {
  verified: boolean;
  projects: Project[];
}

export type EmailVerificationResponse = ApiResponse<EmailVerificationData>;

/**
 * API response for invitation code verification
 */
export interface InvitationVerificationData {
  valid: boolean;
  targetEmail?: string;
  availableTags?: string[];
}

export type InvitationVerificationResponse = ApiResponse<InvitationVerificationData>;

/**
 * Turnstile verification callback
 */
export type TurnstileVerifyCallback = (token: string) => void;

/**
 * Turnstile error callback
 */
export type TurnstileErrorCallback = () => void;

/**
 * Turnstile expired callback
 */
export type TurnstileExpiredCallback = () => void;

// ─── TOTP Types ───

/**
 * Two-factor authentication method
 */
export type TwoFactorMethod = 'email' | 'totp' | 'passkey';

/**
 * TOTP setup initialization response
 */
export interface TotpSetupInitResponse {
  secret: string;
  otpauthUri: string;
}

/**
 * TOTP setup verification response (includes recovery codes)
 */
export interface TotpSetupVerifyResponse {
  enabled: boolean;
  recoveryCodes: string[];
}

/**
 * TOTP status response
 */
export interface TotpStatusResponse {
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
}

/**
 * TOTP recovery codes regeneration response
 */
export interface TotpRegenerateCodesResponse {
  recoveryCodes: string[];
}
