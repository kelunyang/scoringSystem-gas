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
 * Generate a project ID
 * @returns ID like 'proj_xxx'
 */
export function generateProjectId(): string {
  return generateId(ID_PREFIXES.PROJECT);
}

/**
 * Generate a user ID
 * @returns ID like 'usr_xxx'
 */
export function generateUserId(): string {
  return generateId(ID_PREFIXES.USER);
}

/**
 * Generate a global group ID
 * @returns ID like 'gg_xxx'
 */
export function generateGlobalGroupId(): string {
  return generateId(ID_PREFIXES.GLOBAL_GROUP);
}

/**
 * Generate a group ID (project-level)
 * @returns ID like 'grp_xxx'
 */
export function generateGroupId(): string {
  return generateId(ID_PREFIXES.GROUP);
}

/**
 * Generate a stage ID
 * @returns ID like 'stg_xxx'
 */
export function generateStageId(): string {
  return generateId(ID_PREFIXES.STAGE);
}

/**
 * Generate a submission ID
 * @returns ID like 'sub_xxx'
 */
export function generateSubmissionId(): string {
  return generateId(ID_PREFIXES.SUBMISSION);
}

/**
 * Generate a comment ID
 * @returns ID like 'cmt_xxx'
 */
export function generateCommentId(): string {
  return generateId(ID_PREFIXES.COMMENT);
}

/**
 * Generate a transaction ID
 * @returns ID like 'txn_xxx'
 */
export function generateTransactionId(): string {
  return generateId(ID_PREFIXES.TRANSACTION);
}

/**
 * Generate a session ID
 * @returns ID like 'session_xxx'
 */
export function generateSessionId(): string {
  return generateId(ID_PREFIXES.SESSION);
}

/**
 * Generate an invitation code ID
 * @returns ID like 'ic_xxx'
 */
export function generateInvitationCodeId(): string {
  return generateId(ID_PREFIXES.INVITATION_CODE);
}

/**
 * Generate an invitation ID
 * @returns ID like 'inv_xxx'
 */
export function generateInvitationId(): string {
  return generateId(ID_PREFIXES.INVITATION);
}

/**
 * Generate a criteria category ID
 * @returns ID like 'cc_xxx'
 */
export function generateCriteriaCategoryId(): string {
  return generateId(ID_PREFIXES.CRITERIA_CATEGORY);
}

/**
 * Generate a criteria ID
 * @returns ID like 'cri_xxx'
 */
export function generateCriteriaId(): string {
  return generateId(ID_PREFIXES.CRITERIA);
}

/**
 * Generate a score ID
 * @returns ID like 'scr_xxx'
 */
export function generateScoreId(): string {
  return generateId(ID_PREFIXES.SCORE);
}

/**
 * Validate if an ID has the correct prefix
 *
 * @param id - The ID to validate
 * @param expectedPrefix - The expected prefix
 * @returns true if ID has the correct prefix
 *
 * @example
 * validateIdPrefix('proj_123', ID_PREFIXES.PROJECT); // true
 * validateIdPrefix('usr_123', ID_PREFIXES.PROJECT);  // false
 */
export function validateIdPrefix(id: string, expectedPrefix: string): boolean {
  return id.startsWith(expectedPrefix);
}

/**
 * Extract the prefix from an ID
 *
 * @param id - The ID to extract from
 * @returns The prefix part, or null if invalid format
 *
 * @example
 * extractIdPrefix('proj_123'); // 'proj_'
 * extractIdPrefix('invalid');  // null
 */
export function extractIdPrefix(id: string): string | null {
  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex === -1) {
    return null;
  }
  return id.substring(0, underscoreIndex + 1);
}
