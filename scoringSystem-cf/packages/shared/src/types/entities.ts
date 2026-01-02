/**
 * @fileoverview Database entity type definitions
 * These types represent the structure of database records
 * Shared between frontend and backend for consistency
 */

/**
 * User entity
 */
export interface User {
  userId: string;
  password?: string; // Only available in backend
  userEmail: string;
  email?: string; // Alias for userEmail
  displayName: string | null;
  registrationTime: number;
  lastActivityTime: number | null;
  status: 'active' | 'disabled';
  preferences: string; // JSON
  avatarSeed: string | null;
  avatarStyle: string;
  avatarOptions: string; // JSON
  lockUntil: number | null;
  lockReason: string | null;
  lockCount: number;
  // Extended properties (frontend-specific)
  totalPoints?: number; // Total points earned
  grade?: string; // User grade/level
  emailVerified?: boolean; // Email verification status
  role?: 'admin' | 'user' | 'pm' | 'reviewer'; // User role
}

/**
 * Authenticated user info (from JWT payload)
 */
export interface AuthUser {
  userId: string;
  userEmail: string;
  displayName: string;
  status: string;
  avatarSeed?: string;
  avatarStyle?: string;
  avatarOptions?: string;
  permissions?: string[]; // Global permissions array
}

/**
 * Project entity
 */
export interface Project {
  projectId: string;
  id?: string; // Alias for projectId
  projectName: string;
  name?: string; // Alias for projectName
  description: string | null;
  creatorId: string;
  creationTime: number;
  status: 'active' | 'archived' | 'deleted';
  settings: string; // JSON
  lastActivityTime: number | null;
  // Extended properties (computed by backend or frontend)
  projectDescription?: string; // Alias for description
  title?: string; // Alias for projectName
  viewerRole?: string; // User's role in this project (viewer, editor, admin)
  userGroups?: Group[]; // User's groups in this project
  groups?: Group[]; // All groups in project
  users?: User[]; // All users in project
  stages?: Stage[]; // All stages in project
}

/**
 * Project settings type (parsed from settings JSON field)
 */
export interface ProjectSettings {
  allowGroupMultiSubmit?: boolean;
  allowMemberMultiSubmit?: boolean;
  submissionEditDeadline?: number;
  enableWallet?: boolean;
  walletSettings?: {
    initialBalance?: number;
    currency?: string;
  };
  [key: string]: any;
}

/**
 * Global Group entity
 */
export interface GlobalGroup {
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  isActive: number; // 0 or 1
  globalPermissions: string; // JSON array
  createdTime: number;
  lastModifiedTime: number | null;
}

/**
 * Group member information
 */
export interface Member {
  userId: string;
  userEmail: string;
  email?: string; // Alias for userEmail
  displayName: string;
  role?: string;
  participation?: unknown;
  avatarSeed?: string;
  avatarStyle?: string;
  avatarOptions?: string;
  // Contribution and scoring properties
  contribution?: number; // Member's contribution percentage
  finalWeight?: number; // Final calculated weight for scoring
  points?: number; // Points earned by member
}

/**
 * Project Group entity
 */
export interface Group {
  groupId: string;
  projectId: string;
  groupName: string;
  description: string | null;
  isActive: number; // 0 or 1
  createdTime: number;
  // Extended properties (computed by backend or used in frontend)
  id?: string; // Alias for groupId
  members?: Member[];
  role?: string;
  status?: 'active' | 'inactive' | 'approved';
  allowChange?: boolean;
  rank?: number;
  showReport?: boolean;
  submitTime?: number;
  submissionId?: string;
  approvalVotesLoading?: boolean;
  votingData?: any;
  participationProposal?: any;
  // UI state properties (frontend-specific)
  rankingsLoading?: boolean;
  settlementRank?: number | null;
  voteRank?: number | string | null;
  teacherRank?: number | null;
  voteRankData?: any;
  teacherRankData?: any;
  finalSettlementRank?: number | null;
  earnedPoints?: number | null;
  memberNames?: string | string[];
  reportContent?: string;
  participationPercentages?: Record<string, number>;
  submittedAt?: number;
  // Proposal stats (teacher/observer view only)
  proposalStats?: {
    versionCount: number;
    latestStatus: 'pending' | 'settled' | 'withdrawn' | 'reset' | null;
    latestVotingResult: 'agree' | 'disagree' | 'tie' | 'no_votes' | null;
  };
}

/**
 * Stage entity
 */
export interface Stage {
  stageId: string;
  id?: string; // Alias for stageId (used in frontend)
  projectId: string;
  stageName: string;
  stageOrder: number;
  description: string | null;
  startTime: number | null;
  endTime: number | null;
  status: 'draft' | 'pending' | 'active' | 'voting' | 'completed' | 'archived' | 'closed' | 'paused' | 'settling';
  manualStatus?: 'completed' | 'archived' | null; // Manual status override from stages_with_status VIEW
  autoStatus?: 'pending' | 'active' | 'voting'; // Auto-calculated status from stages_with_status VIEW
  forceVotingTime?: number | null; // Force voting timestamp (NULL if not forced) - overrides time-based status calculation
  pausedTime?: number | null; // Pause timestamp (NULL if not paused) - overrides time-based status calculation
  settings: string; // JSON
  createdTime: number;
  lastModifiedTime: number | null;
  // Extended properties (computed/used in frontend)
  deadline?: number;
  viewMode?: string;
  refreshing?: boolean;
  contentLoaded?: boolean; // Indicates if stage content has been loaded
  loadingReports?: boolean; // Indicates if reports are being loaded
  groups?: Group[]; // Groups associated with this stage
  submissions?: Submission[]; // Submissions in this stage
  comments?: Comment[]; // Comments in this stage
  proposals?: Proposal[]; // Proposals in this stage
  title?: string; // Stage title (alternative to stageName)
  settledTime?: number; // Settlement timestamp
  updatedAt?: number; // Last update timestamp
  shortTitle?: string; // Short title for UI
  originalStatus?: string; // Original status before changes
  name?: string; // Alias for stageName
  // Date aliases for compatibility
  startDate?: number; // Alias for startTime
  endDate?: number; // Alias for endTime
}

/**
 * Stage settings type
 */
export interface StageSettings {
  allowLateSubmission?: boolean;
  requireApproval?: boolean;
  maxSubmissions?: number;
  [key: string]: any;
}

/**
 * Submission entity
 * Status architecture (refactored 2025-12-15):
 * - Timestamp-driven status: 'withdrawn' | 'approved' | 'submitted' (3 states)
 * - Status calculated from: withdrawnTime, approvedTime (see submissions_with_status VIEW)
 */
export interface Submission {
  submissionId: string;
  id?: string; // Alias for submissionId
  projectId: string;
  stageId: string;
  groupId: string;
  submitterId: string;
  submitterEmail?: string; // Submitter's email
  title: string;
  content: string;
  contentMarkdown?: string; // Markdown version of content
  submissionTime: number;
  submitTime?: number; // Alias for submissionTime
  lastModifiedTime: number | null;
  status: 'withdrawn' | 'approved' | 'submitted'; // Calculated from timestamps (VIEW)
  metadata: string; // JSON
  // Timestamp fields (source of truth for status)
  withdrawnTime?: number | null; // Withdrawal timestamp
  withdrawnBy?: string | null;   // Who/what withdrew: userEmail or 'system'
  approvedTime?: number | null;  // Approval timestamp (consensus achieved)
  createdAt?: number;            // Creation timestamp
  updatedAt?: number | null;     // Last update timestamp
  // Extended properties
  deadline?: number; // Submission deadline timestamp
  showReport?: boolean;
  groupName?: string;
  memberNames?: string;
  reportContent?: string;
  approvalVotesLoading?: boolean;
  rankingsLoading?: boolean;
  settlementRank?: number;
  voteRank?: number;
  teacherRank?: number;
  teacherRankData?: any;
  finalSettlementRank?: number;
  earnedPoints?: number;
  voteRankData?: any;
  userEmail?: string; // Submitter email
  groupEmail?: string; // Group email for group submissions
  // Voting metadata (from VIEW)
  totalMembers?: number;   // Total group members
  agreeVotes?: number;     // Number of approval votes
  isApproved?: 0 | 1;      // Approval flag (1 if approved)
}

/**
 * Submission metadata type
 */
export interface SubmissionMetadata {
  attachments?: Array<{
    filename: string;
    url: string;
    size: number;
  }>;
  tags?: string[];
  [key: string]: any;
}

/**
 * Comment entity
 */
export interface Comment {
  commentId: string;
  id?: string; // Alias for commentId
  projectId: string;
  submissionId: string;
  authorId: string;
  authorEmail?: string; // Author's email
  parentCommentId: string | null;
  content: string;
  fullContent?: string; // Full content (not truncated)
  commentTime: number;
  timestamp?: number; // Alias for commentTime
  createdTime?: number; // Alias for commentTime
  lastModifiedTime: number | null;
  isDeleted: number; // 0 or 1
  metadata: string; // JSON
  // Extended properties
  author?: string; // Author display name
  type?: string; // Comment type
  status?: string; // Comment status
  mentionedUsers?: string[]; // Mentioned user IDs
  mentionedGroups?: string[]; // Mentioned group IDs
  viewers?: string[]; // Users who can view this comment
  comments?: Comment[]; // Nested comments
  replyLevel?: number; // Reply nesting level
}

/**
 * Transaction entity (Wallet)
 */
export interface Transaction {
  transactionId: string;
  id?: string; // Alias for transactionId
  projectId: string;
  walletId: string;
  userId: string;
  userEmail?: string;
  displayName?: string;
  amount: number;
  points?: number; // Alias for amount (used in some contexts)
  transactionType: 'award' | 'deduct' | 'reversal';
  description: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdById: string;
  createdTime: number;
  timestamp?: number; // Alias for createdTime
  createdAt?: number; // Alias for createdTime
  reversalTransactionId: string | null;
  metadata: string; // JSON
  // Extended properties
  title?: string;
  groupId?: string;
  groupName?: string;
  action?: string;
  entityType?: string;
  transactions?: Transaction[]; // For grouped/nested transactions
  stageId?: string; // Related stage ID
  stageName?: string; // Related stage name
  stageOrder?: number; // Related stage order for sorting
  settlementId?: string; // Settlement ID for settlement transactions
  relatedSubmissionId?: string; // Related submission ID
  relatedCommentId?: string; // Related comment ID
}

/**
 * Criteria entity (Scoring)
 */
export interface Criteria {
  criteriaId: string;
  projectId: string;
  categoryId: string | null;
  criteriaName: string;
  description: string | null;
  weight: number;
  maxScore: number;
  criteriaOrder: number;
  isActive: number; // 0 or 1
}

/**
 * Score entity
 */
export interface Score {
  scoreId: string;
  projectId: string;
  submissionId: string;
  criteriaId: string;
  scorerId: string;
  score: number;
  comment: string | null;
  scoredTime: number;
  lastModifiedTime: number | null;
}

/**
 * Invitation entity
 */
export interface Invitation {
  invitationId: string;
  inviterId: string;
  inviteeEmail: string;
  inviteCode: string;
  status: 'pending' | 'accepted' | 'expired';
  createdTime: number;
  expiryTime: number;
  acceptedTime: number | null;
  metadata: string; // JSON
}

/**
 * Event Log entity
 */
export interface EventLog {
  logId: string;
  projectId: string;
  eventType: string;
  userId: string | null;
  userEmail?: string;
  displayName?: string;
  entityType: string | null;
  entityId: string | null;
  details: string; // JSON
  timestamp: number;
  // Extended properties (for event log display)
  action?: string;
  resourceType?: string;
  resource?: any;
  stageId?: string;
  stageName?: string;
  stageOrder?: number;
}

/**
 * Notification entity
 */
export interface Notification {
  notificationId: string;
  id?: string; // Alias for notificationId
  userId: string;
  type: string;
  title: string;
  message: string;
  content?: string; // Notification content (detailed message)
  projectName?: string; // Project name for project-related notifications
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  isRead: number; // 0 or 1
  createdTime: number;
  readTime?: number | null;
}

/**
 * Ranking entity
 */
export interface Ranking {
  rankingId: string;
  projectId: string;
  stageId: string;
  groupId: string;
  submissionId: string;
  totalScore: number;
  rank: number;
  calculatedTime: number;
}

/**
 * User preferences type
 */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
  [key: string]: any;
}

/**
 * Avatar options type
 */
export interface AvatarOptions {
  backgroundColor?: string;
  skinColor?: string;
  hairColor?: string;
  clothesColor?: string;
  clothingColor?: string;
  baseColor?: string;
  texture?: string;
  _retry?: number; // Retry counter for avatar generation
  _t?: number; // Timestamp for cache busting
  [key: string]: any;
}

/**
 * Proposal entity (for group voting, etc.)
 */
export interface Proposal {
  proposalId: string;
  id?: string; // Alias for proposalId
  projectId: string;
  stageId?: string;
  groupId?: string;
  title: string;
  content: string;
  proposerId: string;
  createdTime: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  votes?: any[];
  metadata?: string;
  [key: string]: any;
}

/**
 * Ranking Proposal entity
 * Status architecture (refactored 2025-12-17):
 * - Timestamp-driven status: 'settled' | 'withdrawn' | 'reset' | 'pending' (4 states)
 * - Status calculated from: settleTime > withdrawnTime > resetTime > pending (priority order)
 * - votingResult calculated real-time from votes using SUM(agree)
 */
export interface RankingProposal {
  proposalId: string;
  id?: string; // Alias for proposalId
  projectId: string;
  stageId: string;
  groupId: string;
  proposerEmail: string;
  proposerDisplayName?: string; // Proposer's display name (from JOIN)
  rankingData: any; // JSON array or string (parsed on frontend)
  createdTime: number;
  // Calculated fields (from rankingproposals_with_status VIEW)
  status: 'settled' | 'withdrawn' | 'reset' | 'pending';
  votingResult: 'agree' | 'disagree' | 'tie' | 'no_votes';
  voteScore: number; // SUM(agree) where agree=1, disagree=-1
  agreeVotes: number; // COUNT(agree = 1)
  disagreeVotes: number; // COUNT(agree = -1)
  // Timestamp fields (source of truth for status)
  settleTime?: number | null;       // Settlement timestamp (highest priority)
  withdrawnTime?: number | null;    // Withdrawal timestamp
  withdrawnBy?: string | null;      // Who/what withdrew: userEmail or 'system'
  resetTime?: number | null;        // Reset timestamp (record-only field)
  // Extended properties (from API responses)
  supportCount?: number; // Alias for agreeVotes
  opposeCount?: number;  // Alias for disagreeVotes
  totalVotes?: number;   // Total vote count
  votes?: ProposalVote[]; // Complete votes array with voter info
  userVote?: 'support' | 'oppose' | null; // Current user's vote status
  version?: number; // Version number (1-indexed based on createdTime)
}

/**
 * Proposal Vote entity
 */
export interface ProposalVote {
  voteId: string;
  proposalId: string;
  projectId: string;
  voterEmail: string;
  voterDisplayName?: string; // Voter's display name (from JOIN)
  voterAvatarSeed?: string;
  voterAvatarStyle?: string;
  voterAvatarOptions?: string;
  groupId: string;
  agree: number; // 1 (support), -1 (oppose)
  timestamp: number;
  comment?: string | null;
}

/**
 * Voting Result type
 */
export type VotingResult = 'agree' | 'disagree' | 'tie' | 'no_votes';

/**
 * Ranking Proposal Status type
 */
export type RankingProposalStatus = 'settled' | 'withdrawn' | 'reset' | 'pending';
