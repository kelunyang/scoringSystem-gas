-- ============================================
-- Scoring System Database Schema for Cloudflare D1
-- Auto-synced from init-system.ts (source of truth)
--
-- IMPORTANT: This is the single source of truth for database schema
-- After editing this file, sync to migration:
-- cd scoringSystem-cf/packages/backend && pnpm db:sync-schema
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  userId TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  userEmail TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  registrationTime INTEGER,
  lastActivityTime INTEGER,
  status TEXT DEFAULT 'active',
  preferences TEXT DEFAULT '{}',
  avatarSeed TEXT,
  avatarStyle TEXT DEFAULT 'avataaars',
  avatarOptions TEXT DEFAULT '{}',
  lockUntil INTEGER DEFAULT NULL,
  lockReason TEXT DEFAULT NULL,
  lockCount INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  projectId TEXT PRIMARY KEY,
  projectName TEXT NOT NULL,
  description TEXT,
  totalStages INTEGER DEFAULT 0,
  currentStage INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  createdBy TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  lastModified INTEGER NOT NULL,
  scoreRangeMin REAL DEFAULT 0,
  scoreRangeMax REAL DEFAULT 100,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  -- Scoring System Configuration (added 2025-12-08)
  maxCommentSelections INTEGER DEFAULT NULL,
  studentRankingWeight REAL DEFAULT NULL,
  teacherRankingWeight REAL DEFAULT NULL,
  commentRewardPercentile REAL DEFAULT NULL
);

-- Global groups table
CREATE TABLE IF NOT EXISTS globalgroups (
  globalGroupId TEXT PRIMARY KEY,
  groupName TEXT UNIQUE NOT NULL,
  description TEXT,
  globalPermissions TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Global user groups table
CREATE TABLE IF NOT EXISTS globalusergroups (
  globalUserGroupId TEXT PRIMARY KEY,
  globalGroupId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  joinedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  FOREIGN KEY (globalGroupId) REFERENCES globalgroups(globalGroupId)
);

-- DISABLED: Global tags table (tag definitions)
-- Tags system has been disabled - kept for reference only
/*
CREATE TABLE IF NOT EXISTS globaltags (
  tagId TEXT PRIMARY KEY,
  tagName TEXT UNIQUE NOT NULL,
  description TEXT,
  isActive INTEGER DEFAULT 1,
  createdBy TEXT NOT NULL
);
*/

-- DISABLED: User tags table (user tag scope)
-- Tags system has been disabled - kept for reference only
/*
CREATE TABLE IF NOT EXISTS usertags (
  assignmentId TEXT PRIMARY KEY,
  userEmail TEXT NOT NULL,
  tagId TEXT NOT NULL,
  assignedBy TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  FOREIGN KEY (tagId) REFERENCES globaltags(tagId)
);
*/

-- DISABLED: Project tags table (project tag scope)
-- Tags system has been disabled - kept for reference only
/*
CREATE TABLE IF NOT EXISTS projecttags (
  assignmentId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  assignedBy TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (tagId) REFERENCES globaltags(tagId)
);
*/

-- Invitation codes table
-- Status architecture (refactored 2025-12-09):
--   - Auto-calculated status (VIEW): active/used/expired/deactivated based on timestamps
--   - usedTime: When invitation was used for registration
--   - deactivatedTime: When invitation was manually deactivated
--   - Final status = VIEW calculation (deactivated > used > expired > active)
CREATE TABLE IF NOT EXISTS invitation_codes (
  invitationId TEXT PRIMARY KEY,
  invitationCode TEXT UNIQUE NOT NULL,
  displayCode TEXT,
  targetEmail TEXT,
  createdBy TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  expiryTime INTEGER,
  status TEXT DEFAULT 'active',  -- DEPRECATED: Use invitation_codes_with_status VIEW instead
  usedTime INTEGER,
  deactivatedTime INTEGER,       -- Manual deactivation timestamp (NULL if not deactivated)
  defaultTags TEXT,
  defaultGlobalGroups TEXT,
  metadata TEXT,
  usedCount INTEGER DEFAULT 0    -- Statistical counter (not used for status determination)
);

-- Two-factor authentication codes table
CREATE TABLE IF NOT EXISTS two_factor_codes (
  codeId TEXT PRIMARY KEY,
  userEmail TEXT NOT NULL,
  verificationCode TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  isUsed INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0
);

-- Groups table (project groups)
CREATE TABLE IF NOT EXISTS groups (
  groupId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupName TEXT NOT NULL,
  description TEXT,
  createdBy TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  allowChange INTEGER DEFAULT 1
);

-- User groups table (project user groups)
-- Business rule: A user can only join ONE group per project
-- role field stores group-specific role (leader/member)
CREATE TABLE IF NOT EXISTS usergroups (
  membershipId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joinTime INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1
);

-- Project viewers table (4-Level Permission System: Level 1-2)
-- This table manages teacher and observer assignments for projects
--
-- Business Rules (CRITICAL):
-- 1. Each user can only have ONE role per project (enforced by handlers):
--    - Either teacher/observer (in projectviewers table)
--    - OR student (in usergroups table)
--    - NEVER both simultaneously
-- 2. addProjectViewer() checks usergroups and rejects if user is already a student
-- 3. addUserToGroup() checks projectviewers and rejects if user is already teacher/observer
--
-- Permission Levels:
-- - Level 0: System Admin / Project Creator (all permissions, not in this table)
-- - Level 1: Teacher (manage, view, comment)
-- - Level 2: Observer (view only, read-only access)
-- - Level 3: Student (via usergroups, not in this table)
--
-- Roles:
-- - 'teacher': Level 1 - Can manage stages, groups, settlements, view all data, post comments
-- - 'observer': Level 2 - Read-only access, can view all data but cannot modify or comment
-- - 'member': DEPRECATED - Use usergroups table for student membership
CREATE TABLE IF NOT EXISTS projectviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('teacher', 'observer', 'member')),
  assignedBy TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  UNIQUE(projectId, userEmail)
);

-- Stages table
-- Status architecture (refactored 2025-12-08, updated 2025-12-29):
--   - Pure timestamp-driven status calculation (VIEW-based)
--   - settlingTime: Settlement lock timestamp (CAS mechanism)
--   - settledTime: Settlement completion timestamp
--   - archivedTime: Archive timestamp
--   - forceVotingTime: Force stage into voting status (overrides time-based calculation)
--   - pausedTime: Pause timestamp (NULL if not paused)
--   - Status priority: archived > settling > completed > paused > voting > active > pending
CREATE TABLE IF NOT EXISTS stages (
  stageId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageName TEXT NOT NULL,
  stageOrder INTEGER NOT NULL,
  stageType TEXT DEFAULT 'normal',
  startTime INTEGER,
  endTime INTEGER,
  status TEXT DEFAULT 'pending',  -- DEPRECATED: Use stages_with_status VIEW instead
  forceVotingTime INTEGER,        -- Force voting timestamp (NULL if not forced)
  pausedTime INTEGER,             -- Pause timestamp (NULL if not paused)
  description TEXT,
  config TEXT,
  createdTime INTEGER NOT NULL,
  updatedAt INTEGER,
  reportRewardPool REAL DEFAULT 0,
  commentRewardPool REAL DEFAULT 0,
  finalRankings TEXT,
  scoringResults TEXT,
  settledTime INTEGER,
  settlingTime INTEGER,           -- Settlement lock timestamp (NULL if not settling)
  archivedTime INTEGER            -- Archive timestamp (NULL if not archived)
);

-- Submissions table
-- Status architecture (refactored 2025-12-15):
--   - Timestamp-driven status calculation (VIEW-based)
--   - withdrawnTime: Withdrawal by user or system (ONLY if approvedTime IS NULL)
--   - approvedTime: Consensus reached timestamp (irreversible - cannot withdraw after approval)
--   - Final status = VIEW calculation (withdrawn > approved > submitted)
--
-- Business Rules:
--   1. Withdrawal: Can ONLY withdraw if approvedTime IS NULL (not yet approved)
--   2. Approval: Once approvedTime is set, status is locked to 'approved' (irreversible)
--   3. New version submission: Old active versions are marked as withdrawn (withdrawnBy = 'system' or userEmail)
--   4. Restore old version: Create new submission (copy content) + mark current as withdrawn
--   5. Status priority: withdrawn > approved > submitted
--
-- Version Management:
--   - "Supersede" = withdrawn (no separate status needed)
--   - withdrawnBy field indicates reason:
--     * userEmail = explicit user deletion
--     * 'system' = replaced by newer version
CREATE TABLE IF NOT EXISTS submissions (
  submissionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  contentMarkdown TEXT,
  actualAuthors TEXT,
  participationProposal TEXT,
  submitTime INTEGER NOT NULL,
  submitterEmail TEXT NOT NULL,

  -- Timestamp-driven status fields
  withdrawnTime INTEGER,        -- Withdrawal timestamp (NULL if not withdrawn)
  withdrawnBy TEXT,             -- Who/what withdrew (userEmail or 'system')
  approvedTime INTEGER,         -- Approval timestamp (NULL if not approved)

  updatedAt INTEGER,
  createdAt INTEGER NOT NULL
);

-- Rankings table (voting and ranking proposals)
CREATE TABLE IF NOT EXISTS rankings (
  proposalId TEXT PRIMARY KEY,
  stageId TEXT NOT NULL,
  groupId TEXT,
  proposerUserId TEXT NOT NULL,
  rankingData TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  createdAt INTEGER NOT NULL,
  lastModified INTEGER NOT NULL,
  FOREIGN KEY (stageId) REFERENCES stages(stageId)
);

-- Ranking proposals table
-- Supports multi-version proposals using createdTime as natural version identifier
-- Status architecture (refactored 2025-12-16):
--   - Voting and settlement are separated (vote API only records, settlement API finalizes)
--   - Auto-calculated votingResult (VIEW): agree/disagree/tie/no_votes based on SUM(agree)
--   - Auto-calculated status (VIEW): settled/withdrawn/pending based on timestamp priority
--   - Timestamp priority: settleTime > withdrawnTime > resetTime (record only)
-- Status values (from rankingproposals_with_status VIEW):
--   'settled' (final status determined at stage settlement)
--   'withdrawn' (proposal withdrawn by user, recorded in withdrawnBy)
--   'pending' (awaiting votes or settlement)
--   'reset' (REMOVED - resetTime is record-only, not a status)
-- votingResult values (real-time calculation from votes):
--   'agree' (SUM(agree) > 0)
--   'disagree' (SUM(agree) < 0)
--   'tie' (SUM(agree) = 0)
--   'no_votes' (no votes yet)
CREATE TABLE IF NOT EXISTS rankingproposals (
  proposalId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  proposerEmail TEXT NOT NULL,
  rankingData TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- DEPRECATED: Use rankingproposals_with_status VIEW instead
  createdTime INTEGER NOT NULL,

  -- Timestamp-driven status fields (priority: settleTime > withdrawnTime)
  settleTime INTEGER,      -- Settlement timestamp (NULL if not settled)
  withdrawnTime INTEGER,   -- Withdrawal timestamp (NULL if not withdrawn)
  withdrawnBy TEXT,        -- Withdrawal actor (userEmail)
  resetTime INTEGER        -- Reset timestamp (record only, does not affect status)
);

-- Proposal votes table
CREATE TABLE IF NOT EXISTS proposalvotes (
  voteId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  proposalId TEXT NOT NULL,
  voterEmail TEXT NOT NULL,
  groupId TEXT NOT NULL,
  agree INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  comment TEXT,
  UNIQUE(proposalId, voterEmail)
);

-- Comment ranking proposals table
CREATE TABLE IF NOT EXISTS commentrankingproposals (
  proposalId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  rankingData TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  metadata TEXT
);

-- Teacher comment rankings table
CREATE TABLE IF NOT EXISTS teachercommentrankings (
  rankingId TEXT PRIMARY KEY,
  stageId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  teacherEmail TEXT NOT NULL,
  commentId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  rank INTEGER NOT NULL,
  createdTime INTEGER NOT NULL
);

-- Teacher submission rankings table
CREATE TABLE IF NOT EXISTS teachersubmissionrankings (
  teacherRankingId TEXT PRIMARY KEY,
  stageId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  teacherEmail TEXT NOT NULL,
  submissionId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  rank INTEGER NOT NULL,
  createdTime INTEGER NOT NULL
);

-- Submission approval votes table
CREATE TABLE IF NOT EXISTS submissionapprovalvotes (
  voteId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  submissionId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  voterEmail TEXT NOT NULL,
  agree INTEGER NOT NULL,
  comment TEXT,
  createdTime INTEGER NOT NULL,
  UNIQUE(submissionId, voterEmail)  -- Prevent duplicate votes from same user
);

-- Settlement history table
CREATE TABLE IF NOT EXISTS settlementhistory (
  settlementId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  settlementType TEXT NOT NULL,
  settlementTime INTEGER NOT NULL,
  operatorEmail TEXT NOT NULL,
  totalRewardDistributed REAL DEFAULT 0,
  participantCount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  reversedTime INTEGER,
  reversedBy TEXT,
  reversedReason TEXT,
  settlementData TEXT
);

-- Stage settlements table
CREATE TABLE IF NOT EXISTS stagesettlements (
  settlementDetailId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  settlementId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  finalRank INTEGER,
  studentScore REAL DEFAULT 0,
  teacherScore REAL DEFAULT 0,
  totalScore REAL DEFAULT 0,
  allocatedPoints REAL DEFAULT 0,
  memberEmails TEXT,
  memberPointsDistribution TEXT
);

-- Comment settlements table
CREATE TABLE IF NOT EXISTS commentsettlements (
  settlementDetailId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  settlementId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  commentId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  finalRank INTEGER,
  studentScore REAL DEFAULT 0,
  teacherScore REAL DEFAULT 0,
  totalScore REAL DEFAULT 0,
  allocatedPoints REAL DEFAULT 0,
  rewardPercentage REAL DEFAULT 0
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  commentId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  content TEXT NOT NULL,
  mentionedGroups TEXT,
  mentionedUsers TEXT,
  parentCommentId TEXT,
  isReply INTEGER DEFAULT 0,
  replyLevel INTEGER DEFAULT 0,
  isAwarded INTEGER DEFAULT 0,
  awardRank INTEGER,
  createdTime INTEGER NOT NULL
);

-- Reactions table
CREATE TABLE IF NOT EXISTS reactions (
  reactionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  reactionType TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Transactions table (pure ledger - balances calculated via SUM())
CREATE TABLE IF NOT EXISTS transactions (
  transactionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  stageId TEXT,
  settlementId TEXT,
  transactionType TEXT NOT NULL,
  amount REAL NOT NULL,
  source TEXT,
  timestamp INTEGER NOT NULL,
  relatedSubmissionId TEXT,
  relatedCommentId TEXT,
  metadata TEXT
);

-- Transaction logs table
CREATE TABLE IF NOT EXISTS transactionlogs (
  logId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  transactionId TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Event logs table (used for tracking system events including failed logins)
CREATE TABLE IF NOT EXISTS eventlogs (
  logId TEXT PRIMARY KEY,
  projectId TEXT,
  eventType TEXT NOT NULL,
  userId TEXT,
  entityType TEXT,
  entityId TEXT,
  details TEXT,
  timestamp INTEGER NOT NULL
);

-- System logs table
CREATE TABLE IF NOT EXISTS sys_logs (
  logId TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  functionName TEXT,
  userId TEXT,
  action TEXT,
  message TEXT NOT NULL,
  context TEXT,
  createdAt INTEGER NOT NULL,
  projectId TEXT,           -- Project ID (for project-scoped operations)
  entityType TEXT,          -- Primary entity type (e.g., 'stage', 'submission', 'comment')
  entityId TEXT,            -- Primary entity ID (e.g., 'stg_xxx', 'sub_xxx')
  relatedEntities TEXT,     -- JSON: secondary entities (e.g., '{"stage":"stg_xxx","group":"grp_xxx"}')
  dedupKey TEXT             -- Deduplication key for idempotent operations
);

-- Notifications table (matches GAS structure)
CREATE TABLE IF NOT EXISTS notifications (
  notificationId TEXT PRIMARY KEY,
  targetUserEmail TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  projectId TEXT,
  stageId TEXT,
  commentId TEXT,
  submissionId TEXT,
  groupId TEXT,
  transactionId TEXT,
  settlementId TEXT,
  rankingProposalId TEXT,
  relatedEntityId TEXT,  -- 保留向後兼容
  isRead INTEGER DEFAULT 0,
  isDeleted INTEGER DEFAULT 0,
  emailSent INTEGER DEFAULT 0,
  createdTime INTEGER NOT NULL,
  readTime INTEGER,
  deletedTime INTEGER,
  emailSentTime INTEGER,
  metadata TEXT
);

-- Global email logs table (centralized email audit trail)
CREATE TABLE IF NOT EXISTS globalemaillogs (
  logId TEXT PRIMARY KEY,
  emailId TEXT NOT NULL,
  trigger TEXT NOT NULL,
  triggeredBy TEXT,
  triggerSource TEXT,
  recipient TEXT NOT NULL,
  recipientUserId TEXT,
  subject TEXT NOT NULL,
  htmlBody TEXT,
  textBody TEXT,
  emailSize INTEGER,
  status TEXT NOT NULL,
  statusCode INTEGER,
  error TEXT,
  errorType TEXT,
  retryCount INTEGER DEFAULT 0,
  emailContext TEXT,
  timestamp INTEGER NOT NULL,
  durationMs INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- AI service calls table (records all AI API invocations for cost tracking and history)
-- Supports multiple service types: ranking_direct, ranking_bt, summary, translation, etc.
-- Design principles:
--   - All teachers in a project can view AI call history for a stage
--   - Token usage tracked for cost analysis
--   - BT mode stores all pairwise comparisons for transparency
CREATE TABLE IF NOT EXISTS aiservicecalls (
  callId TEXT PRIMARY KEY,

  -- Relationships
  projectId TEXT NOT NULL,
  stageId TEXT,                          -- Optional (some AI services may be project-level)
  userEmail TEXT NOT NULL,               -- Requester email

  -- AI service type (extensible)
  serviceType TEXT NOT NULL,             -- 'ranking_direct', 'ranking_bt', 'summary', 'translation', etc.
  rankingType TEXT,                      -- 'submission' | 'comment' (only for ranking services)

  -- Provider info
  providerId TEXT NOT NULL,
  providerName TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Request content
  itemCount INTEGER,                     -- Number of items processed (for ranking)
  customPrompt TEXT,                     -- User-provided custom prompt

  -- Results
  status TEXT NOT NULL,                  -- 'pending', 'processing', 'success', 'failed', 'timeout'
  result TEXT,                           -- JSON: ranking result or other service result
  reason TEXT,                           -- AI explanation/reasoning
  thinkingProcess TEXT,                  -- DeepSeek reasoning_content or similar
  errorMessage TEXT,                     -- Error message if failed

  -- BT mode specific
  btComparisons TEXT,                    -- JSON: all pairwise comparisons [{itemA, itemB, winner, reason}]
  btStrengthParams TEXT,                 -- JSON: strength parameters {itemId: strength}

  -- Multi-Agent mode specific
  parentCallId TEXT,                     -- Parent call ID (for Multi-Agent sub-requests)
  debateRound INTEGER,                   -- Debate round number (1 or 2)
  debateChanged INTEGER,                 -- Whether position changed in Round 2 (0/1)
  debateCritique TEXT,                   -- Critique of other rankings in Round 2

  -- Token usage (cost tracking)
  requestTokens INTEGER,
  responseTokens INTEGER,
  totalTokens INTEGER,

  -- Performance
  responseTimeMs INTEGER,

  -- Timestamps
  createdAt INTEGER NOT NULL,
  completedAt INTEGER,                   -- Completion timestamp (for duration calculation)

  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (stageId) REFERENCES stages(stageId)
);

-- Email idempotency table (prevents duplicate email sends during queue retries)
CREATE TABLE IF NOT EXISTS email_idempotency (
  idempotencyKey TEXT PRIMARY KEY,
  emailId TEXT NOT NULL,
  queueMessageId TEXT NOT NULL,
  emailType TEXT NOT NULL,
  recipient TEXT NOT NULL,
  logId TEXT,
  processedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Notification idempotency table (prevents duplicate notification creation during queue retries)
CREATE TABLE IF NOT EXISTS notification_idempotency (
  idempotencyKey TEXT PRIMARY KEY,
  notificationId TEXT NOT NULL,
  queueMessageId TEXT NOT NULL,
  processedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Announcements table (system-wide announcements displayed on login page)
-- Added 2026-01-13 for login page announcement board feature
CREATE TABLE IF NOT EXISTS announcements (
  announcementId TEXT PRIMARY KEY,

  -- Announcement content
  title TEXT NOT NULL,
  content TEXT NOT NULL,               -- Markdown content

  -- Time range
  startTime INTEGER NOT NULL,          -- Unix timestamp (ms) - announcement start time
  endTime INTEGER NOT NULL,            -- Unix timestamp (ms) - announcement end time

  -- Announcement type (affects display priority and icon)
  type TEXT NOT NULL DEFAULT 'info',   -- 'info' | 'warning' | 'success' | 'error'

  -- Creator info
  createdBy TEXT NOT NULL,             -- userEmail

  -- Timestamps
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER,

  -- Soft delete flag
  isActive INTEGER DEFAULT 1
);

-- ============================================
-- TRIGGERS (Scoring Configuration Validation)
-- ============================================

-- Validate scoring configuration on INSERT
CREATE TRIGGER IF NOT EXISTS validate_scoring_config_insert
BEFORE INSERT ON projects
BEGIN
  -- Validate maxCommentSelections >= 1
  SELECT RAISE(ABORT, 'maxCommentSelections must be >= 1')
  WHERE NEW.maxCommentSelections IS NOT NULL AND NEW.maxCommentSelections < 1;

  -- Validate weights are between 0 and 1
  SELECT RAISE(ABORT, 'Weights must be between 0 and 1')
  WHERE (NEW.studentRankingWeight IS NOT NULL AND (NEW.studentRankingWeight < 0 OR NEW.studentRankingWeight > 1))
     OR (NEW.teacherRankingWeight IS NOT NULL AND (NEW.teacherRankingWeight < 0 OR NEW.teacherRankingWeight > 1));

  -- Validate weight sum = 1.0 (with 0.001 tolerance)
  SELECT RAISE(ABORT, 'Student and teacher weights must sum to 1.0')
  WHERE NEW.studentRankingWeight IS NOT NULL
    AND NEW.teacherRankingWeight IS NOT NULL
    AND ABS((NEW.studentRankingWeight + NEW.teacherRankingWeight) - 1.0) > 0.001;

  -- Validate percentile range
  SELECT RAISE(ABORT, 'Percentile must be between 0 and 100')
  WHERE NEW.commentRewardPercentile IS NOT NULL
    AND (NEW.commentRewardPercentile < 0 OR NEW.commentRewardPercentile > 100);
END;

-- Validate scoring configuration on UPDATE
CREATE TRIGGER IF NOT EXISTS validate_scoring_config_update
BEFORE UPDATE ON projects
BEGIN
  -- Validate maxCommentSelections >= 1
  SELECT RAISE(ABORT, 'maxCommentSelections must be >= 1')
  WHERE NEW.maxCommentSelections IS NOT NULL AND NEW.maxCommentSelections < 1;

  -- Validate weights are between 0 and 1
  SELECT RAISE(ABORT, 'Weights must be between 0 and 1')
  WHERE (NEW.studentRankingWeight IS NOT NULL AND (NEW.studentRankingWeight < 0 OR NEW.studentRankingWeight > 1))
     OR (NEW.teacherRankingWeight IS NOT NULL AND (NEW.teacherRankingWeight < 0 OR NEW.teacherRankingWeight > 1));

  -- Validate weight sum = 1.0 (with 0.001 tolerance)
  SELECT RAISE(ABORT, 'Student and teacher weights must sum to 1.0')
  WHERE NEW.studentRankingWeight IS NOT NULL
    AND NEW.teacherRankingWeight IS NOT NULL
    AND ABS((NEW.studentRankingWeight + NEW.teacherRankingWeight) - 1.0) > 0.001;

  -- Validate percentile range
  SELECT RAISE(ABORT, 'Percentile must be between 0 and 100')
  WHERE NEW.commentRewardPercentile IS NOT NULL
    AND (NEW.commentRewardPercentile < 0 OR NEW.commentRewardPercentile > 100);
END;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(userEmail);
CREATE INDEX IF NOT EXISTS idx_globalusergroups_email ON globalusergroups(userEmail);
CREATE INDEX IF NOT EXISTS idx_globalusergroups_groupid ON globalusergroups(globalGroupId);
CREATE INDEX IF NOT EXISTS idx_usergroups_project ON usergroups(projectId);
CREATE INDEX IF NOT EXISTS idx_usergroups_email ON usergroups(userEmail);
-- Partial unique index to enforce business rule: one active group membership per user per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_usergroups_unique_active ON usergroups(userEmail, projectId) WHERE isActive = 1;
CREATE INDEX IF NOT EXISTS idx_projectviewers_project ON projectviewers(projectId);
CREATE INDEX IF NOT EXISTS idx_projectviewers_user ON projectviewers(userEmail);
CREATE INDEX IF NOT EXISTS idx_projectviewers_role ON projectviewers(role);
CREATE INDEX IF NOT EXISTS idx_groups_project ON groups(projectId);
CREATE INDEX IF NOT EXISTS idx_stages_project ON stages(projectId);
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(projectId);
CREATE INDEX IF NOT EXISTS idx_submissions_stage ON submissions(stageId);
CREATE INDEX IF NOT EXISTS idx_submissions_group ON submissions(groupId);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(projectId);
CREATE INDEX IF NOT EXISTS idx_comments_stage ON comments(stageId);
CREATE INDEX IF NOT EXISTS idx_rankings_stage ON rankings(stageId);
CREATE INDEX IF NOT EXISTS idx_rankings_proposer ON rankings(proposerUserId);
CREATE INDEX IF NOT EXISTS idx_rankings_status ON rankings(stageId, status);
CREATE INDEX IF NOT EXISTS idx_rankingproposals_stage ON rankingproposals(stageId);
CREATE INDEX IF NOT EXISTS idx_proposalvotes_proposal ON proposalvotes(proposalId);
CREATE INDEX IF NOT EXISTS idx_teachercommentrankings_stage ON teachercommentrankings(stageId);
CREATE INDEX IF NOT EXISTS idx_teachersubmissionrankings_stage ON teachersubmissionrankings(stageId);
CREATE INDEX IF NOT EXISTS idx_submissionapprovalvotes_submission ON submissionapprovalvotes(submissionId);
CREATE INDEX IF NOT EXISTS idx_settlementhistory_stage ON settlementhistory(stageId);
CREATE INDEX IF NOT EXISTS idx_stagesettlements_settlement ON stagesettlements(settlementId);
CREATE INDEX IF NOT EXISTS idx_commentsettlements_settlement ON commentsettlements(settlementId);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(projectId);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(userEmail);
CREATE INDEX IF NOT EXISTS idx_transactions_stage ON transactions(stageId);
CREATE INDEX IF NOT EXISTS idx_eventlogs_project ON eventlogs(projectId);
CREATE INDEX IF NOT EXISTS idx_eventlogs_user ON eventlogs(userId);
CREATE INDEX IF NOT EXISTS idx_eventlogs_timestamp ON eventlogs(timestamp);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(targetUserEmail);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(isRead);
CREATE INDEX IF NOT EXISTS idx_notifications_deleted ON notifications(isDeleted);
CREATE INDEX IF NOT EXISTS idx_notifications_emailsent ON notifications(emailSent);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(projectId);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdTime);
CREATE INDEX IF NOT EXISTS idx_sys_logs_function_action ON sys_logs(functionName, action, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_sys_logs_level ON sys_logs(level, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_sys_logs_created ON sys_logs(createdAt DESC);
-- New indexes for improved query performance
CREATE INDEX IF NOT EXISTS idx_sys_logs_userid ON sys_logs(userId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_sys_logs_action_only ON sys_logs(action, createdAt DESC);
-- Indexes for new sys_logs fields (added 2025-01-27)
CREATE INDEX IF NOT EXISTS idx_sys_logs_project ON sys_logs(projectId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_sys_logs_entity ON sys_logs(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_sys_logs_project_entity ON sys_logs(projectId, entityType, createdAt DESC);
-- Deduplication index with time bucketing (added for security deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sys_logs_dedupkey_bucket
  ON sys_logs(dedupKey, (createdAt / 60000))
  WHERE dedupKey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_globalemaillogs_trigger ON globalemaillogs(trigger, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_globalemaillogs_recipient ON globalemaillogs(recipient);
CREATE INDEX IF NOT EXISTS idx_globalemaillogs_status ON globalemaillogs(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_globalemaillogs_timestamp ON globalemaillogs(timestamp DESC);

-- Reactions performance indexes (added 2025-12-19 for append-only architecture)
-- Optimizes "get latest reaction per user" queries (Window function performance)
CREATE INDEX IF NOT EXISTS idx_reactions_target_user_created
  ON reactions(targetId, userEmail, createdAt DESC);
-- Optimizes "get all active reactions for a comment" queries
CREATE INDEX IF NOT EXISTS idx_reactions_target_type_created
  ON reactions(targetId, targetType, createdAt DESC);

-- AI service calls indexes (added 2025-12-30 for AI ranking history)
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_project ON aiservicecalls(projectId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_stage ON aiservicecalls(stageId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_user ON aiservicecalls(userEmail, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_service ON aiservicecalls(serviceType, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_status ON aiservicecalls(status, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_parent ON aiservicecalls(parentCallId);

-- Idempotency table indexes (added 2025-12-08 for queue consumer deduplication)
CREATE INDEX IF NOT EXISTS idx_email_idempotency_emailid ON email_idempotency(emailId);
CREATE INDEX IF NOT EXISTS idx_email_idempotency_queuemsgid ON email_idempotency(queueMessageId);
CREATE INDEX IF NOT EXISTS idx_notification_idempotency_notificationid ON notification_idempotency(notificationId);
CREATE INDEX IF NOT EXISTS idx_notification_idempotency_queuemsgid ON notification_idempotency(queueMessageId);

-- UNIQUE constraint to prevent duplicate active invitations to same email (added 2025-12-07)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_active_email
ON invitation_codes(targetEmail)
WHERE status = 'active';

-- Indexes for VIEW performance optimization (added 2025-12-08)
CREATE INDEX IF NOT EXISTS idx_submissionapprovalvotes_submission_agree
  ON submissionapprovalvotes(submissionId, agree);
CREATE INDEX IF NOT EXISTS idx_proposalvotes_proposal_agree
  ON proposalvotes(proposalId, agree);
CREATE INDEX IF NOT EXISTS idx_usergroups_project_group_active
  ON usergroups(projectId, groupId, isActive);

-- Announcements indexes (added 2026-01-13 for announcement board feature)
CREATE INDEX IF NOT EXISTS idx_announcements_time ON announcements(startTime, endTime, isActive);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type, isActive);

-- ============================================
-- VIEWS (Status Auto-Calculation Architecture)
-- Added 2025-12-08: Refactored status systems to use VIEWs
-- Updated 2025-12-20: Pure timestamp-driven architecture (removed manualStatus)
-- Pattern: status = CASE WHEN timestamp IS NOT NULL THEN status END
-- Benefits: Eliminates TOCTOU race conditions, removes ~1500 lines of middleware
-- ============================================

-- 1. stages_with_status VIEW
-- Pure timestamp-driven status calculation (refactored 2025-12-29)
-- Status priority: archived > settling > completed > paused > voting > active > pending
-- Time-based statuses: pending (before startTime) → active (startTime-endTime) → voting (after endTime)
-- Force voting: If forceVotingTime IS NOT NULL AND > 0, status = 'voting' (overrides time calculation)
-- Pause: If pausedTime IS NOT NULL, status = 'paused' (blocks all operations)
-- Note: This VIEW overrides the 'status' column to provide real-time calculated status
CREATE VIEW IF NOT EXISTS stages_with_status AS
SELECT
  s.stageId,
  s.projectId,
  s.stageName,
  s.stageOrder,
  s.stageType,
  s.startTime,
  s.endTime,
  CASE
    WHEN s.archivedTime IS NOT NULL THEN 'archived'
    WHEN s.settlingTime IS NOT NULL THEN 'settling'
    WHEN s.settledTime IS NOT NULL THEN 'completed'
    WHEN s.pausedTime IS NOT NULL THEN 'paused'
    WHEN s.forceVotingTime IS NOT NULL AND s.forceVotingTime > 0 THEN 'voting'
    WHEN (strftime('%s', 'now') * 1000) >= s.endTime THEN 'voting'
    WHEN (strftime('%s', 'now') * 1000) >= s.startTime THEN 'active'
    ELSE 'pending'
  END AS status,  -- Pure timestamp-driven calculation
  s.forceVotingTime,
  s.pausedTime,
  s.settlingTime,
  s.settledTime,
  s.archivedTime,
  s.description,
  s.config,
  s.createdTime,
  s.updatedAt,
  s.reportRewardPool,
  s.commentRewardPool,
  s.finalRankings,
  s.scoringResults
FROM stages s;

-- 2. stages_vote_status VIEW
-- Checks if any votes exist for a stage (expensive query - use on-demand only)
-- Used for settlement validation and stage completion checks
CREATE VIEW IF NOT EXISTS stages_vote_status AS
SELECT
  s.stageId,
  s.projectId,
  (
    EXISTS (SELECT 1 FROM rankings WHERE stageId = s.stageId LIMIT 1) OR
    EXISTS (SELECT 1 FROM teachercommentrankings WHERE projectId = s.projectId AND stageId = s.stageId LIMIT 1) OR
    EXISTS (SELECT 1 FROM teachersubmissionrankings WHERE projectId = s.projectId AND stageId = s.stageId LIMIT 1) OR
    EXISTS (SELECT 1 FROM commentrankingproposals WHERE projectId = s.projectId AND stageId = s.stageId LIMIT 1)
  ) AS hasAnyVotes
FROM stages s;

-- 3. submissions_with_status VIEW
-- Auto-calculates submission status based on timestamps
-- Status priority: withdrawn > approved > submitted
--
-- Business logic:
--   - withdrawn: Abandoned by user or system (only possible before approval)
--     * withdrawnBy = userEmail: Explicit user deletion
--     * withdrawnBy = 'system': Replaced by newer version (version management)
--   - approved: Consensus reached (approvedTime set, irreversible)
--   - submitted: Default state (awaiting consensus votes)
--
-- Note: This VIEW provides calculated status based on timestamp fields
CREATE VIEW IF NOT EXISTS submissions_with_status AS
SELECT
  s.submissionId,
  s.projectId,
  s.stageId,
  s.groupId,
  s.contentMarkdown,
  s.actualAuthors,
  s.participationProposal,
  s.submitTime,
  s.submitterEmail,

  -- Calculated status (timestamp-based)
  CASE
    WHEN s.withdrawnTime IS NOT NULL THEN 'withdrawn'     -- Priority 1
    WHEN s.approvedTime IS NOT NULL THEN 'approved'       -- Priority 2
    ELSE 'submitted'                                      -- Priority 3 (default)
  END AS status,

  -- Timestamp fields
  s.withdrawnTime,
  s.withdrawnBy,
  s.approvedTime,
  s.updatedAt,
  s.createdAt,

  -- Helper fields for voting queries
  (SELECT COUNT(*) FROM usergroups ug
   WHERE ug.projectId = s.projectId AND ug.groupId = s.groupId AND ug.isActive = 1
  ) AS totalMembers,
  (SELECT COUNT(*) FROM submissionapprovalvotes sav
   WHERE sav.submissionId = s.submissionId AND sav.agree = 1
  ) AS agreeVotes,

  -- Approval flag (for backward compatibility)
  CASE
    WHEN s.approvedTime IS NOT NULL THEN 1
    ELSE 0
  END AS isApproved
FROM submissions s;

-- 4. rankingproposals_with_status VIEW
-- Separates votingResult (real-time vote calculation) from status (timestamp-based state)
-- Architecture (refactored 2025-12-16):
--   - votingResult: Real-time calculation from votes using SUM(agree) for performance
--   - status: Timestamp priority (settleTime > withdrawnTime > pending)
--   - Vote encoding: agree=1, disagree=-1 (allows SUM optimization)
-- votingResult values:
--   'agree' (SUM(agree) > 0) / 'disagree' (SUM(agree) < 0) / 'tie' (SUM(agree) = 0) / 'no_votes' (no votes yet)
-- status values:
--   'settled' (settleTime IS NOT NULL) / 'withdrawn' (withdrawnTime IS NOT NULL) / 'pending' (default)
-- Note: resetTime is record-only and does not affect status
CREATE VIEW IF NOT EXISTS rankingproposals_with_status AS
WITH ProposalVoteCounts AS (
  SELECT
    proposalId,
    COUNT(*) AS totalVotes,
    SUM(CASE WHEN agree = 1 THEN 1 ELSE 0 END) AS agreeVotes,
    SUM(CASE WHEN agree = -1 THEN 1 ELSE 0 END) AS disagreeVotes,
    SUM(agree) AS voteScore
  FROM proposalvotes
  GROUP BY proposalId
)
SELECT
  rp.proposalId,
  rp.projectId,
  rp.stageId,
  rp.groupId,
  rp.proposerEmail,
  rp.rankingData,
  rp.createdTime,

  -- Timestamp fields
  rp.settleTime,
  rp.withdrawnTime,
  rp.withdrawnBy,
  rp.resetTime,

  -- Vote counts (guaranteed non-null with COALESCE)
  COALESCE(pvc.agreeVotes, 0) AS agreeVotes,
  COALESCE(pvc.disagreeVotes, 0) AS disagreeVotes,
  COALESCE(pvc.agreeVotes, 0) AS supportCount,    -- Frontend-friendly alias
  COALESCE(pvc.disagreeVotes, 0) AS opposeCount,  -- Frontend-friendly alias
  COALESCE(pvc.totalVotes, 0) AS totalVotes,
  COALESCE(pvc.voteScore, 0) AS voteScore,

  -- votingResult: Simplified calculation using count comparison
  CASE
    WHEN COALESCE(pvc.totalVotes, 0) = 0 THEN 'no_votes'
    WHEN COALESCE(pvc.agreeVotes, 0) > COALESCE(pvc.disagreeVotes, 0) THEN 'agree'
    WHEN COALESCE(pvc.agreeVotes, 0) < COALESCE(pvc.disagreeVotes, 0) THEN 'disagree'
    ELSE 'tie'  -- agreeVotes = disagreeVotes
  END AS votingResult,

  -- status: Timestamp-based state (priority: settled > withdrawn > reset > pending)
  CASE
    WHEN rp.settleTime IS NOT NULL THEN 'settled'
    WHEN rp.withdrawnTime IS NOT NULL THEN 'withdrawn'
    WHEN rp.resetTime IS NOT NULL THEN 'reset'
    ELSE 'pending'
  END AS status

FROM rankingproposals rp
LEFT JOIN ProposalVoteCounts pvc USING (proposalId);

-- 5. invitation_codes_with_status VIEW
-- Auto-calculates invitation status based on timestamps
-- Status priority: deactivated > used > expired > active
-- Note: This VIEW overrides the 'status' column to provide real-time calculated status
CREATE VIEW IF NOT EXISTS invitation_codes_with_status AS
SELECT
  ic.invitationId,
  ic.invitationCode,
  ic.displayCode,
  ic.targetEmail,
  ic.createdBy,
  ic.createdTime,
  ic.expiryTime,
  CASE
    WHEN ic.deactivatedTime IS NOT NULL THEN 'deactivated'
    WHEN ic.usedTime IS NOT NULL THEN 'used'
    WHEN (strftime('%s', 'now') * 1000) >= ic.expiryTime THEN 'expired'
    ELSE 'active'
  END AS status,  -- Override status with calculated value (frontend compatible)
  ic.usedTime,
  ic.deactivatedTime,
  ic.defaultTags,
  ic.defaultGlobalGroups,
  ic.metadata,
  ic.usedCount
FROM invitation_codes ic;

-- ============================================
-- Schema synchronized with init-system.ts
-- Total: 32 active tables (28 original + 2 idempotency tables + 1 AI service table + 1 announcements table; 3 tags tables disabled)
-- Total: 72 indexes (60 original + 4 idempotency indexes + 5 AI service indexes + 3 announcements indexes)
-- Total: 2 triggers (scoring configuration validation)
-- Total: 5 VIEWs (status auto-calculation architecture)
-- Last updated: 2026-01-13 (added announcements table)
--
-- Recent Changes:
--   2026-01-13: Added announcements table for login page announcement board,
--               supports markdown content, time-based display, and priority types (error > warning > info > success)
--   2025-12-30: Added aiservicecalls table for AI API cost tracking and history,
--               supports ranking_direct, ranking_bt, and future AI services,
--               enables teacher-shared AI ranking history within stages
--   2025-12-29: Added pausedTime column to stages table,
--               updated stages_with_status VIEW with paused status priority,
--               status priority: archived > settling > completed > paused > voting > active > pending
--   2025-12-15: Simplified submissions table - removed 'superseded' status (merged into 'withdrawn'),
--               only 3 statuses now: withdrawn > approved > submitted,
--               withdrawnBy field indicates reason (userEmail or 'system'),
--               added approvedTime for consensus timestamp tracking
--   2025-12-09: Added invitation_codes_with_status VIEW
--   2025-12-08: Introduced VIEW-based status auto-calculation architecture
-- ============================================
