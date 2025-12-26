/**
 * @fileoverview Re-export entity types from shared package
 * This file maintains backward compatibility for existing imports
 */

// Re-export all entity types from shared package
export type {
  User,
  AuthUser,
  Project,
  ProjectSettings,
  GlobalGroup,
  Member,
  Group,
  Stage,
  StageSettings,
  Submission,
  SubmissionMetadata,
  Comment,
  Transaction,
  Criteria,
  Score,
  Invitation,
  EventLog,
  Notification,
  Ranking,
  UserPreferences,
  AvatarOptions,
  Proposal
} from '@repo/shared';
