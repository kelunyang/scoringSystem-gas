/**
 * @fileoverview Centralized security configuration
 * All security-related constants and thresholds
 */

/**
 * Password security configuration
 */
export const PASSWORD_SECURITY = {
  /** Maximum password failures before permanent account lock */
  MAX_PASSWORD_FAILURES: 3,
  /** Time window for tracking password failures (milliseconds) */
  PASSWORD_FAILURE_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  /** How long to keep failed login attempts in database (milliseconds) */
  FAILED_ATTEMPTS_RETENTION_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * 2FA security configuration
 */
export const TWO_FA_SECURITY = {
  /** Maximum 2FA failures before first temporary lock */
  MAX_2FA_FAILURES_TEMP: 3,
  /** Maximum 2FA failures before extended lock */
  MAX_2FA_FAILURES_EXTENDED: 5,
  /** Maximum 2FA failures before permanent lock */
  MAX_2FA_FAILURES_PERMANENT: 7,
  /** Duration of first temporary lock (milliseconds) */
  TEMP_LOCK_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  /** Duration of extended lock (milliseconds) */
  EXTENDED_LOCK_DURATION_MS: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Layer 2 threat detection configuration
 */
export const THREAT_DETECTION = {
  /** Time window for Layer 2 analysis (milliseconds) */
  ANALYSIS_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 hours
  /** Minimum failed IPs to trigger distributed attack alert */
  DISTRIBUTED_ATTACK_THRESHOLD: 3,
} as const;

/**
 * Alert severity levels
 */
export const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
} as const;

/**
 * Lock types
 */
export const LOCK_TYPE = {
  TEMPORARY: 'temporary',
  PERMANENT: 'permanent',
} as const;

/**
 * Security action types for deduplication
 */
export const SECURITY_ACTION = {
  PASSWORD_LOCK: 'password_lock',
  TWO_FA_LOCK: '2fa_lock',
  DISTRIBUTED_ATTACK: 'distributed_attack',
  GEO_ANOMALY: 'geo_anomaly',
  DEVICE_ANOMALY: 'device_anomaly',
} as const;
