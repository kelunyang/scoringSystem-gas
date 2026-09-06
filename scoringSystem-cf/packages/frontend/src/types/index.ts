/**
 * @fileoverview 类型定义总入口
 * 统一导出所有类型定义
 */

// 导出模型类型
export type {
  User,
  AuthUser,
  Project,
  ProjectSettings,
  GlobalGroup,
  Member,
  Group,
  GroupVotingData,
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
  AvatarOptions
} from './models'

// 导出 API 类型（唯一來源：@repo/shared/types/api-responses）
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginatedResponse
} from './api'

