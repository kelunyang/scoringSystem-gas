/**
 * @fileoverview UUID generation utilities
 * Maintains consistent ID prefixes as in GAS system
 */

/**
 * UUID prefixes for different entity types
 * Must match GAS conventions
 */
export const ID_PREFIXES = {
  // Global entities
  PROJECT: 'proj_',
  USER: 'usr_',
  GLOBAL_GROUP: 'gg_',
  INVITATION: 'inv_',
  INVITATION_CODE: 'ic_',

  // Project entities
  GROUP: 'grp_',
  STAGE: 'stg_',
  SUBMISSION: 'sub_',
  RANKING: 'rnk_',
  FILE: 'file_',
  COMMENT: 'cmt_',
  REACTION: 'rct_',
  TAG: 'tag_',

  // Scoring entities
  CRITERIA_CATEGORY: 'cc_',
  CRITERIA: 'cri_',
  SCORE: 'scr_',

  // Wallet entities
  WALLET: 'wlt_',
  TRANSACTION: 'txn_',

  // Log entities
  LOG: 'log_',
  EVENT_LOG: 'evl_',
  AUDIT_LOG: 'adl_',
  ACTIVITY_LOG: 'acl_',
  EMAIL_LOG: 'eml_',

  // Session
  SESSION: 'session_'
} as const;

/**
 * Generate a UUID with the specified prefix
 * Uses crypto.randomUUID() for secure random generation
 *
 * @param prefix - The entity type prefix (e.g., 'proj_', 'usr_')
 * @returns A unique ID like 'proj_123e4567-e89b-12d3-a456-426614174000'
 *
 * @example
 * const projectId = generateId(ID_PREFIXES.PROJECT);
 * // Returns: 'proj_123e4567-e89b-12d3-a456-426614174000'
 */
export function generateId(prefix: string): string {
  return prefix + crypto.randomUUID();
}

/**
 * Generate a user ID
 * @returns ID like 'usr_xxx'
 */
export function generateUserId(): string {
  return generateId(ID_PREFIXES.USER);
}

/**
 * Generate a stage ID
 * @returns ID like 'stg_xxx'
 */
export function generateStageId(): string {
  return generateId(ID_PREFIXES.STAGE);
}
