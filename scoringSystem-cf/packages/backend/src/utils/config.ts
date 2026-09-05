/**
 * Configuration Management Utilities
 * Provides KV-first configuration reading with environment variable fallback
 */

import { Env } from '../types';

/**
 * Configuration key mapping for KV storage
 * Maps parameter names to their KV keys
 */
const CONFIG_KEY_MAP: Record<string, string> = {
  SYSTEM_TITLE: 'config:system_title',
  BRANDING_ICON: 'config:branding_icon',
  SESSION_TIMEOUT: 'config:session_timeout',
  PASSWORD_SALT_ROUNDS: 'config:password_salt_rounds',
  INVITE_CODE_TIMEOUT: 'config:invite_code_timeout',
  MAX_PROJECT_NAME_LENGTH: 'config:max_project_name_length',
  WEB_APP_URL: 'config:web_app_url',
  TURNSTILE_SITE_KEY: 'config:turnstile_site_key',
  TURNSTILE_SECRET_KEY: 'config:turnstile_secret_key',
  TURNSTILE_ENABLED: 'config:turnstile_enabled',
  MAX_2FA_FAILED_ATTEMPTS: 'config:max_2fa_failed_attempts',
  MAX_CONCURRENT_PROJECTS: 'config:max_concurrent_projects',
  MAX_GROUP_NAME_LENGTH: 'config:max_group_name_length',
  MAX_GROUPS_PER_PROJECT: 'config:max_groups_per_project',
  MAX_MEMBERS_PER_GROUP: 'config:max_members_per_group',
  MAX_STAGE_DURATION_DAYS: 'config:max_stage_duration_days',
  LOG_LEVEL: 'config:log_level',
  LOG_CONSOLE: 'config:log_console',
  // Notification/Email Configuration
  MAX_BATCH_EMAIL_SIZE: 'config:max_batch_email_size',
  EMAIL_BATCH_DELAY_MS: 'config:email_batch_delay_ms',
  MAX_EMAILS_PER_HOUR: 'config:max_emails_per_hour',
  // Email Rate Limiting (see utils/email-budget.ts)
  EMAIL_COOLDOWN_SECONDS: 'config:email_cooldown_seconds',
  EMAIL_MAX_PER_RECIPIENT_HOUR: 'config:email_max_per_recipient_hour',
  EMAIL_MAX_PER_RECIPIENT_DAY: 'config:email_max_per_recipient_day',
  EMAIL_MAX_PER_IP_HOUR: 'config:email_max_per_ip_hour',
  EMAIL_DAILY_BUDGET: 'config:email_daily_budget',
  EMAIL_BUDGET_BULK_PCT: 'config:email_budget_bulk_pct',
  EMAIL_BUDGET_NORMAL_PCT: 'config:email_budget_normal_pct',
  // Email Sending Configuration (Cloudflare Email Service + SMTP fallback)
  EMAIL_FROM_EMAIL: 'config:email_from_email',
  EMAIL_FROM_NAME: 'config:email_from_name',
  EMAIL_REPLY_TO: 'config:email_reply_to',
  // SMTP Fallback Configuration
  SMTP_HOST: 'config:smtp_host',
  SMTP_PORT: 'config:smtp_port',
  SMTP_USERNAME: 'config:smtp_username',
  SMTP_PASSWORD: 'config:smtp_password',
  SMTP_FROM_NAME: 'config:smtp_from_name',
  SMTP_FROM_EMAIL: 'config:smtp_from_email',
  // AI Configuration
  AI_RATE_LIMIT_PER_MINUTE: 'config:ai_rate_limit_per_minute',
  AI_RATE_LIMIT_PER_HOUR: 'config:ai_rate_limit_per_hour',
  // Scoring System Configuration
  DEFAULT_STUDENT_RANKING_WEIGHT: 'config:default_student_ranking_weight',
  DEFAULT_TEACHER_RANKING_WEIGHT: 'config:default_teacher_ranking_weight',
  DEFAULT_MAX_COMMENT_SELECTIONS: 'config:default_max_comment_selections',
  DEFAULT_COMMENT_REWARD_PERCENTILE: 'config:default_comment_reward_percentile',
};

/**
 * Integer-valued email rate limiting keys.
 * Shared by both intKeys sets below so they cannot drift apart — a key missing
 * from one of them silently returns a string, and `limit * pct / 100` on a
 * string is a bug that only shows up in production.
 */
const EMAIL_RATE_LIMIT_INT_KEYS = [
  'EMAIL_COOLDOWN_SECONDS',
  'EMAIL_MAX_PER_RECIPIENT_HOUR',
  'EMAIL_MAX_PER_RECIPIENT_DAY',
  'EMAIL_MAX_PER_IP_HOUR',
  'EMAIL_DAILY_BUDGET',
  'EMAIL_BUDGET_BULK_PCT',
  'EMAIL_BUDGET_NORMAL_PCT'
] as const;

/**
 * Default values for configuration parameters
 */
/** 設定值在 KV 裡一律是字串，讀出來依 parseAs* 旗標轉型。 */
export type ConfigValue = string | number | boolean;

const DEFAULT_VALUES: Record<string, ConfigValue> = {
  SYSTEM_TITLE: '評分系統',
  BRANDING_ICON: 'fa-star',
  SESSION_TIMEOUT: '86400000', // 24 hours in milliseconds
  PASSWORD_SALT_ROUNDS: 10,
  INVITE_CODE_TIMEOUT: '604800000', // 7 days in milliseconds
  MAX_PROJECT_NAME_LENGTH: 100,
  WEB_APP_URL: '',
  TURNSTILE_SITE_KEY: '',
  TURNSTILE_SECRET_KEY: '',
  TURNSTILE_ENABLED: 'false',
  MAX_2FA_FAILED_ATTEMPTS: 5,
  MAX_CONCURRENT_PROJECTS: 5,
  MAX_GROUP_NAME_LENGTH: 50,
  MAX_GROUPS_PER_PROJECT: 20,
  MAX_MEMBERS_PER_GROUP: 10,
  MAX_STAGE_DURATION_DAYS: 30,
  LOG_LEVEL: 'INFO',
  LOG_CONSOLE: 'true',
  // Notification/Email Configuration
  MAX_BATCH_EMAIL_SIZE: 100, // Maximum emails per batch operation
  EMAIL_BATCH_DELAY_MS: 100, // Delay between emails in milliseconds
  MAX_EMAILS_PER_HOUR: 500, // Per authenticated actor, per hour
  // Email Rate Limiting.
  // Sized for ~400 users on a Google Workspace sender (2000 recipients/day):
  // logins alone are up to 400/day, the digest robot up to 400 per run, and a
  // cohort's invitations are another 400 in one burst — so the budget has to
  // arbitrate between them rather than run first-come-first-served.
  EMAIL_COOLDOWN_SECONDS: 60, // Matches the frontend resend countdown
  EMAIL_MAX_PER_RECIPIENT_HOUR: 5,
  EMAIL_MAX_PER_RECIPIENT_DAY: 20,
  EMAIL_MAX_PER_IP_HOUR: 60, // Only on endpoints that send without a password
  EMAIL_DAILY_BUDGET: 1500, // 75% of the Workspace 2000/day ceiling
  EMAIL_BUDGET_BULK_PCT: 50, // Digests stop here, leaving 750 for the rest
  EMAIL_BUDGET_NORMAL_PCT: 65, // Invitations stop here, leaving 525 for logins
  // Email Sending Configuration (Cloudflare Email Service + SMTP fallback)
  EMAIL_FROM_EMAIL: '',
  EMAIL_FROM_NAME: '評分系統',
  EMAIL_REPLY_TO: '',
  // SMTP Fallback Configuration
  SMTP_HOST: '',
  SMTP_PORT: 587,
  SMTP_USERNAME: '',
  SMTP_PASSWORD: '',
  SMTP_FROM_NAME: '評分系統',
  SMTP_FROM_EMAIL: '',
  // AI Configuration
  AI_RATE_LIMIT_PER_MINUTE: 10,
  AI_RATE_LIMIT_PER_HOUR: 60,
  // Scoring System Configuration
  DEFAULT_STUDENT_RANKING_WEIGHT: 0.7,
  DEFAULT_TEACHER_RANKING_WEIGHT: 0.3,
  DEFAULT_MAX_COMMENT_SELECTIONS: 3,
  DEFAULT_COMMENT_REWARD_PERCENTILE: 0,
};

/**
 * Get a configuration value with KV-first strategy
 * Priority: KV > Environment Variable > Default Value
 *
 * @param env - Environment bindings
 * @param key - Configuration parameter name (e.g., 'SESSION_TIMEOUT')
 * @param options - Optional parameters
 * @returns Configuration value
 */
export async function getConfigValue(
  env: Env,
  key: string,
  options: { parseAsInt: true; parseAsBool?: false }
): Promise<number>;
export async function getConfigValue(
  env: Env,
  key: string,
  options: { parseAsBool: true; parseAsInt?: false }
): Promise<boolean>;
export async function getConfigValue(
  env: Env,
  key: string,
  options?: { parseAsInt?: boolean; parseAsBool?: boolean }
): Promise<ConfigValue>;
export async function getConfigValue(
  env: Env,
  key: string,
  options?: {
    parseAsInt?: boolean;
    parseAsBool?: boolean;
  }
): Promise<ConfigValue> {
  try {
    // Try to get from KV first
    if (env.CONFIG && CONFIG_KEY_MAP[key]) {
      const kvValue = await env.CONFIG.get(CONFIG_KEY_MAP[key]);
      if (kvValue !== null) {
        // Parse the value if needed
        if (options?.parseAsInt) {
          return parseInt(kvValue, 10);
        }
        if (options?.parseAsBool) {
          return kvValue === 'true';
        }
        return kvValue;
      }
    }

    // Fallback to environment variable
    // Env 是 binding 的介面，設定名不在它的 key 集合裡，
    // 但 wrangler 會把同名的環境變數放上來，所以以字串索引查一次。
    const envValue = (env as unknown as Record<string, ConfigValue | undefined>)[key];
    if (envValue !== undefined && envValue !== null) {
      if (options?.parseAsInt) {
        return parseInt(String(envValue), 10);
      }
      if (options?.parseAsBool) {
        return envValue === 'true' || envValue === true;
      }
      return envValue;
    }

    // Finally use default value
    const defaultValue = DEFAULT_VALUES[key];
    if (options?.parseAsInt && typeof defaultValue === 'string') {
      return parseInt(defaultValue, 10);
    }
    if (options?.parseAsBool && typeof defaultValue === 'string') {
      return defaultValue === 'true';
    }
    return defaultValue;

  } catch (error) {
    console.error(`Error getting config value for ${key}:`, error);
    // Return default value on error
    return DEFAULT_VALUES[key];
  }
}

/**
 * Get all configuration values
 * Useful for admin endpoints that need to display all settings
 *
 * @param env - Environment bindings
 * @returns Object containing all configuration values
 */
export async function getAllConfigValues(env: Env): Promise<Record<string, ConfigValue>> {
  const config: Record<string, ConfigValue> = {};

  // Get all defined configuration keys
  const keys = Object.keys(CONFIG_KEY_MAP);

  // Keys that should be parsed as integers
  const intKeys = new Set([
    'PASSWORD_SALT_ROUNDS',
    'MAX_PROJECT_NAME_LENGTH', 'MAX_2FA_FAILED_ATTEMPTS',
    'MAX_CONCURRENT_PROJECTS', 'MAX_GROUP_NAME_LENGTH',
    'MAX_GROUPS_PER_PROJECT', 'MAX_MEMBERS_PER_GROUP',
    'MAX_STAGE_DURATION_DAYS',
    'MAX_BATCH_EMAIL_SIZE', 'EMAIL_BATCH_DELAY_MS',
    'MAX_EMAILS_PER_HOUR',
    ...EMAIL_RATE_LIMIT_INT_KEYS,
    'SMTP_PORT',
    'AI_RATE_LIMIT_PER_MINUTE', 'AI_RATE_LIMIT_PER_HOUR',
    'DEFAULT_MAX_COMMENT_SELECTIONS', 'DEFAULT_COMMENT_REWARD_PERCENTILE'
  ]);

  // Keys that should be parsed as floats
  const floatKeys = new Set([
    'DEFAULT_STUDENT_RANKING_WEIGHT', 'DEFAULT_TEACHER_RANKING_WEIGHT'
  ]);

  for (const key of keys) {
    if (intKeys.has(key)) {
      config[key] = await getConfigValue(env, key, { parseAsInt: true });
    } else if (floatKeys.has(key)) {
      const value = await getConfigValue(env, key);
      config[key] = parseFloat(String(value)) || DEFAULT_VALUES[key];
    } else if (key === 'TURNSTILE_ENABLED' || key === 'LOG_CONSOLE') {
      // Keep as string for compatibility
      config[key] = await getConfigValue(env, key);
    } else {
      config[key] = await getConfigValue(env, key);
    }
  }

  return config;
}

/**
 * Set a configuration value in KV
 *
 * @param env - Environment bindings
 * @param key - Configuration parameter name
 * @param value - Value to set
 * @returns True if successful
 */
export async function setConfigValue(
  env: Env,
  key: string,
  value: ConfigValue
): Promise<boolean> {
  try {
    if (!env.CONFIG) {
      console.error('KV CONFIG binding not available');
      return false;
    }

    if (!CONFIG_KEY_MAP[key]) {
      console.error(`Unknown configuration key: ${key}`);
      return false;
    }

    // Convert value to string for KV storage
    const stringValue = String(value);
    await env.CONFIG.put(CONFIG_KEY_MAP[key], stringValue);

    return true;
  } catch (error) {
    console.error(`Error setting config value for ${key}:`, error);
    return false;
  }
}

/**
 * Delete a configuration value from KV (reset to default)
 *
 * @param env - Environment bindings
 * @param key - Configuration parameter name
 * @returns True if successful
 */
export async function deleteConfigValue(
  env: Env,
  key: string
): Promise<boolean> {
  try {
    if (!env.CONFIG) {
      console.error('KV CONFIG binding not available');
      return false;
    }

    if (!CONFIG_KEY_MAP[key]) {
      console.error(`Unknown configuration key: ${key}`);
      return false;
    }

    await env.CONFIG.delete(CONFIG_KEY_MAP[key]);
    return true;
  } catch (error) {
    console.error(`Error deleting config value for ${key}:`, error);
    return false;
  }
}

/**
 * List of all updatable configuration keys
 */
export const UPDATABLE_CONFIG_KEYS = Object.keys(CONFIG_KEY_MAP);

/**
 * Type-safe configuration key type
 */
export type ConfigKey = keyof typeof CONFIG_KEY_MAP;


/**
 * Get a typed configuration value with automatic type inference
 *
 * @example
 * const maxBatchSize = await getTypedConfig(env, 'MAX_BATCH_EMAIL_SIZE'); // number
 * const systemTitle = await getTypedConfig(env, 'SYSTEM_TITLE'); // string
 */
export async function getTypedConfig<K extends ConfigKey>(
  env: Env,
  key: K
): Promise<ConfigValue> {
  // Determine if the key should be parsed as int
  const intKeys = new Set([
    'PASSWORD_SALT_ROUNDS',
    'MAX_PROJECT_NAME_LENGTH',
    'MAX_2FA_FAILED_ATTEMPTS',
    'MAX_CONCURRENT_PROJECTS',
    'MAX_GROUP_NAME_LENGTH',
    'MAX_GROUPS_PER_PROJECT',
    'MAX_MEMBERS_PER_GROUP',
    'MAX_STAGE_DURATION_DAYS',
    'MAX_BATCH_EMAIL_SIZE',
    'EMAIL_BATCH_DELAY_MS',
    'MAX_EMAILS_PER_HOUR',
    ...EMAIL_RATE_LIMIT_INT_KEYS,
    'SESSION_TIMEOUT',
    'INVITE_CODE_TIMEOUT',
    'SMTP_PORT',
    'AI_RATE_LIMIT_PER_MINUTE',
    'AI_RATE_LIMIT_PER_HOUR',
    'DEFAULT_MAX_COMMENT_SELECTIONS',
    'DEFAULT_COMMENT_REWARD_PERCENTILE'
  ]);

  // Keys that should be parsed as floats
  const floatKeys = new Set([
    'DEFAULT_STUDENT_RANKING_WEIGHT',
    'DEFAULT_TEACHER_RANKING_WEIGHT'
  ]);

  if (floatKeys.has(key)) {
    const value = await getConfigValue(env, key);
    return parseFloat(String(value)) || Number(DEFAULT_VALUES[key]);
  }

  if (intKeys.has(key)) {
    return getConfigValue(env, key, { parseAsInt: true });
  }

  return getConfigValue(env, key);
}
