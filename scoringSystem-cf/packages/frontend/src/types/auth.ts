/**
 * @fileoverview Authentication-related TypeScript type definitions
 * Provides type safety for login, registration, and password reset flows
 */

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
export interface EmailVerificationResponse {
  success: boolean;
  data?: {
    verified: boolean;
    projects: Project[];
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * API response for invitation code verification
 */
export interface InvitationVerificationResponse {
  success: boolean;
  data?: {
    valid: boolean;
    targetEmail?: string;
    availableTags?: string[];
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    context?: any;
  };
}

/**
 * Combined API response type
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

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
