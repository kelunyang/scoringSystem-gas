-- Schema for every table the change-email cascade touches.
--
-- Dumped from the running D1 database: the base schema predates
-- packages/backend/migrations/ and lives only in the deployed database, so this
-- fixture is how the test gets real column names, real UNIQUE constraints and
-- real indexes instead of a hand-written approximation that could drift.
--
-- Regenerate: pnpm --filter @repo/backend dump:email-cascade-schema

-- users ------------------------------------------------------------
CREATE TABLE users (
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
, totpSecret TEXT DEFAULT NULL, totpEnabled INTEGER DEFAULT 0, totpEnabledAt INTEGER DEFAULT NULL, passkeyEnabled INTEGER DEFAULT 0, passkeyEnabledAt INTEGER DEFAULT NULL);
CREATE INDEX idx_users_email ON users(userEmail);

-- globalusergroups ------------------------------------------------------------
CREATE TABLE globalusergroups (
  globalUserGroupId TEXT PRIMARY KEY,
  globalGroupId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  joinedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  FOREIGN KEY (globalGroupId) REFERENCES globalgroups(globalGroupId)
);
CREATE INDEX idx_globalusergroups_email ON globalusergroups(userEmail);
CREATE INDEX idx_globalusergroups_groupid ON globalusergroups(globalGroupId);

-- usergroups ------------------------------------------------------------
CREATE TABLE usergroups (
  membershipId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joinTime INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1
);
CREATE INDEX idx_usergroups_project ON usergroups(projectId);
CREATE INDEX idx_usergroups_email ON usergroups(userEmail);
CREATE UNIQUE INDEX idx_usergroups_unique_active ON usergroups(userEmail, projectId) WHERE isActive = 1;
CREATE INDEX idx_usergroups_project_group_active
  ON usergroups(projectId, groupId, isActive);

-- projectviewers ------------------------------------------------------------
CREATE TABLE projectviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('teacher', 'observer', 'member')),
  assignedBy TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  UNIQUE(projectId, userEmail)
);
CREATE INDEX idx_projectviewers_project ON projectviewers(projectId);
CREATE INDEX idx_projectviewers_user ON projectviewers(userEmail);
CREATE INDEX idx_projectviewers_role ON projectviewers(role);

-- transactions ------------------------------------------------------------
CREATE TABLE transactions (
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
CREATE INDEX idx_transactions_project ON transactions(projectId);
CREATE INDEX idx_transactions_user ON transactions(userEmail);
CREATE INDEX idx_transactions_stage ON transactions(stageId);

-- submissions ------------------------------------------------------------
CREATE TABLE submissions (
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
CREATE INDEX idx_submissions_project ON submissions(projectId);
CREATE INDEX idx_submissions_stage ON submissions(stageId);
CREATE INDEX idx_submissions_group ON submissions(groupId);

-- rankingproposals ------------------------------------------------------------
CREATE TABLE rankingproposals (
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
, withdrawnReason TEXT);
CREATE INDEX idx_rankingproposals_stage ON rankingproposals(stageId);

-- proposalvotes ------------------------------------------------------------
CREATE TABLE proposalvotes (
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
CREATE INDEX idx_proposalvotes_proposal ON proposalvotes(proposalId);
CREATE INDEX idx_proposalvotes_proposal_agree
  ON proposalvotes(proposalId, agree);

-- submissionapprovalvotes ------------------------------------------------------------
CREATE TABLE submissionapprovalvotes (
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
CREATE INDEX idx_submissionapprovalvotes_submission ON submissionapprovalvotes(submissionId);
CREATE INDEX idx_submissionapprovalvotes_submission_agree
  ON submissionapprovalvotes(submissionId, agree);

-- commentrankingproposals ------------------------------------------------------------
CREATE TABLE commentrankingproposals (
  proposalId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  rankingData TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  metadata TEXT
);

-- teachercommentrankings ------------------------------------------------------------
CREATE TABLE teachercommentrankings (
  rankingId TEXT PRIMARY KEY,
  stageId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  teacherEmail TEXT NOT NULL,
  commentId TEXT NOT NULL,
  authorEmail TEXT NOT NULL,
  rank INTEGER NOT NULL,
  createdTime INTEGER NOT NULL
);
CREATE INDEX idx_teachercommentrankings_stage ON teachercommentrankings(stageId);

-- teachersubmissionrankings ------------------------------------------------------------
CREATE TABLE teachersubmissionrankings (
  teacherRankingId TEXT PRIMARY KEY,
  stageId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  teacherEmail TEXT NOT NULL,
  submissionId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  rank INTEGER NOT NULL,
  createdTime INTEGER NOT NULL
);
CREATE INDEX idx_teachersubmissionrankings_stage ON teachersubmissionrankings(stageId);

-- settlementhistory ------------------------------------------------------------
CREATE TABLE settlementhistory (
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
CREATE INDEX idx_settlementhistory_stage ON settlementhistory(stageId);

-- commentsettlements ------------------------------------------------------------
CREATE TABLE commentsettlements (
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
CREATE INDEX idx_commentsettlements_settlement ON commentsettlements(settlementId);

-- stagesettlements ------------------------------------------------------------
CREATE TABLE stagesettlements (
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
CREATE INDEX idx_stagesettlements_settlement ON stagesettlements(settlementId);

-- comments ------------------------------------------------------------
CREATE TABLE comments (
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
CREATE INDEX idx_comments_project ON comments(projectId);
CREATE INDEX idx_comments_stage ON comments(stageId);

-- reactions ------------------------------------------------------------
CREATE TABLE reactions (
  reactionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  reactionType TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX idx_reactions_target_user_created
  ON reactions(targetId, userEmail, createdAt DESC);
CREATE INDEX idx_reactions_target_type_created
  ON reactions(targetId, targetType, createdAt DESC);

-- notifications ------------------------------------------------------------
CREATE TABLE notifications (
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
CREATE INDEX idx_notifications_user ON notifications(targetUserEmail);
CREATE INDEX idx_notifications_read ON notifications(isRead);
CREATE INDEX idx_notifications_deleted ON notifications(isDeleted);
CREATE INDEX idx_notifications_emailsent ON notifications(emailSent);
CREATE INDEX idx_notifications_project ON notifications(projectId);
CREATE INDEX idx_notifications_created ON notifications(createdTime);

-- aiservicecalls ------------------------------------------------------------
CREATE TABLE aiservicecalls (
  callId TEXT PRIMARY KEY,

  -- 關聯
  projectId TEXT NOT NULL,
  stageId TEXT,                          -- 可選，有些 AI 服務可能是專案層級
  userEmail TEXT NOT NULL,               -- 請求者

  -- AI 服務類型（可擴展）
  serviceType TEXT NOT NULL,             -- 'ranking_direct', 'ranking_bt', 'ranking_multi_agent', 'summary', 'translation' 等
  rankingType TEXT,                      -- 'submission' | 'comment'（僅排名服務用）

  -- Provider 資訊
  providerId TEXT NOT NULL,
  providerName TEXT NOT NULL,
  model TEXT NOT NULL,

  -- 請求內容
  itemCount INTEGER,                     -- 處理項目數（排名用）
  customPrompt TEXT,                     -- 用戶自訂 prompt

  -- 結果
  status TEXT NOT NULL,                  -- 'pending', 'processing', 'success', 'failed', 'timeout'
  result TEXT,                           -- JSON: 排名結果或其他服務結果
  reason TEXT,                           -- AI 的解釋/思考過程
  thinkingProcess TEXT,                  -- DeepSeek 等的 reasoning_content
  errorMessage TEXT,                     -- 錯誤訊息

  -- BT 模式專用
  btComparisons TEXT,                    -- JSON: 所有配對比較結果 [{itemA, itemB, winner, reason}]
  btStrengthParams TEXT,                 -- JSON: 能力值 {itemId: strength}

  -- Multi-Agent 模式專用
  parentCallId TEXT,                     -- 關聯主請求（Multi-Agent 的子請求用）
  debateRound INTEGER,                   -- 辯論輪次 (1 或 2)
  debateChanged INTEGER,                 -- Round 2 是否改變立場 (0 or 1)
  debateCritique TEXT,                   -- Round 2 對其他排名的評論

  -- Token 使用量（成本追蹤）
  requestTokens INTEGER,
  responseTokens INTEGER,
  totalTokens INTEGER,

  -- 效能
  responseTimeMs INTEGER,

  -- 時間戳
  createdAt INTEGER NOT NULL,
  completedAt INTEGER,                   -- 完成時間（用於計算耗時）

  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (stageId) REFERENCES stages(stageId),
  FOREIGN KEY (parentCallId) REFERENCES aiservicecalls(callId)
);
CREATE INDEX idx_aiservicecalls_project ON aiservicecalls(projectId, createdAt DESC);
CREATE INDEX idx_aiservicecalls_stage ON aiservicecalls(stageId, createdAt DESC);
CREATE INDEX idx_aiservicecalls_user ON aiservicecalls(userEmail, createdAt DESC);
CREATE INDEX idx_aiservicecalls_service ON aiservicecalls(serviceType, createdAt DESC);
CREATE INDEX idx_aiservicecalls_status ON aiservicecalls(status, createdAt DESC);
CREATE INDEX idx_aiservicecalls_parent ON aiservicecalls(parentCallId);

-- two_factor_codes ------------------------------------------------------------
CREATE TABLE two_factor_codes (
  codeId TEXT PRIMARY KEY,
  userEmail TEXT NOT NULL,
  verificationCode TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  isUsed INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0
);

-- announcements ------------------------------------------------------------
CREATE TABLE announcements (
  announcementId TEXT PRIMARY KEY,

  
  title TEXT NOT NULL,
  content TEXT NOT NULL,               

  
  startTime INTEGER NOT NULL,          
  endTime INTEGER NOT NULL,            

  
  type TEXT NOT NULL DEFAULT 'info',   

  
  createdBy TEXT NOT NULL,             

  
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER,

  
  isActive INTEGER DEFAULT 1
);
CREATE INDEX idx_announcements_time ON announcements(startTime, endTime, isActive);
CREATE INDEX idx_announcements_created ON announcements(createdAt DESC);
CREATE INDEX idx_announcements_type ON announcements(type, isActive);

-- sys_logs ------------------------------------------------------------
CREATE TABLE sys_logs (
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
CREATE INDEX idx_sys_logs_function_action ON sys_logs(functionName, action, createdAt DESC);
CREATE INDEX idx_sys_logs_level ON sys_logs(level, createdAt DESC);
CREATE INDEX idx_sys_logs_created ON sys_logs(createdAt DESC);
CREATE INDEX idx_sys_logs_userid ON sys_logs(userId, createdAt DESC);
CREATE INDEX idx_sys_logs_action_only ON sys_logs(action, createdAt DESC);
CREATE INDEX idx_sys_logs_project ON sys_logs(projectId, createdAt DESC);
CREATE INDEX idx_sys_logs_entity ON sys_logs(entityType, entityId);
CREATE INDEX idx_sys_logs_project_entity ON sys_logs(projectId, entityType, createdAt DESC);
CREATE UNIQUE INDEX idx_sys_logs_dedupkey_bucket
  ON sys_logs(dedupKey, (createdAt / 60000))
  WHERE dedupKey IS NOT NULL;

-- projects ------------------------------------------------------------
CREATE TABLE projects (
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
, maxVoteResetCount INTEGER DEFAULT 1);

-- stages ------------------------------------------------------------
CREATE TABLE stages (
  stageId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  stageName TEXT NOT NULL,
  stageOrder INTEGER NOT NULL,
  stageType TEXT DEFAULT 'normal',
  startTime INTEGER,
  endTime INTEGER,
  status TEXT DEFAULT 'pending',  -- DEPRECATED: Use stages_with_status VIEW instead
  forceVotingTime INTEGER,        -- Force voting timestamp (NULL if not forced)
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
, pausedTime INTEGER DEFAULT NULL);
CREATE INDEX idx_stages_project ON stages(projectId);

-- groups ------------------------------------------------------------
CREATE TABLE groups (
  groupId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupName TEXT NOT NULL,
  description TEXT,
  createdBy TEXT NOT NULL,
  createdTime INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  allowChange INTEGER DEFAULT 1
);
CREATE INDEX idx_groups_project ON groups(projectId);

-- globalgroups ------------------------------------------------------------
CREATE TABLE globalgroups (
  globalGroupId TEXT PRIMARY KEY,
  groupName TEXT UNIQUE NOT NULL,
  description TEXT,
  globalPermissions TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

