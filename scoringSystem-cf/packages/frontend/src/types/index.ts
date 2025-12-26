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
} from './models'

// 导出 API 类型
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginationParams,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateStageRequest,
  UpdateStageRequest,
  CreateSubmissionRequest,
  UpdateSubmissionRequest,
  CreateCommentRequest,
  AwardPointsRequest,
  CreateGroupRequest,
  CreateInvitationRequest,
  ScoreSubmissionRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  FileUploadResponse,
  StatsResponse
} from './api'

// 导出 Composables 类型
export type {
  UseAuthReturn,
  UsePermissionsReturn,
  UseProjectsReturn,
  UseProjectDetailReturn,
  UseWalletReturn,
  UseNotificationsReturn,
  UseSubmissionsReturn,
  UseCommentsReturn,
  UseRankingsReturn,
  UseGroupsReturn,
  UseStagesReturn
} from './composables'

// 导出组件类型
export type {
  ProjectCardProps,
  StageCardProps,
  SubmissionCardProps,
  UserAvatarProps,
  CommentListProps,
  NotificationItemProps,
  ModalEmits,
  FormEmits,
  ProjectManagementEmits,
  StageManagementEmits,
  GroupSelectorProps,
  GroupSelectorEmits,
  RichEditorProps,
  RichEditorEmits,
  FileUploadProps,
  FileUploadEmits,
  ChartProps,
  TableProps,
  TableColumn,
  SearchBarProps,
  SearchBarEmits
} from './components'

// 导出工具类型
export type {
  JWTPayload,
  DateFormatOptions,
  ErrorHandlerOptions,
  MarkdownOptions,
  FileInfo,
  UploadProgress,
  ValidationRule,
  ValidationResult,
  StorageOptions,
  ApiClientConfig,
  RequestConfig,
  ResponseInterceptor,
  ErrorInterceptor,
  DebounceOptions,
  ThrottleOptions,
  DeepCloneOptions,
  ColorOptions,
  ChartDataPoint,
  ChartConfig,
  SortFunction,
  FilterFunction,
  MapFunction,
  ReduceFunction
} from './utils'

// 导出认证类型（保持向后兼容）
export type {
  LoginCredentials,
  RegisterData,
  TwoFactorData,
  ForgotPasswordData,
  EmailVerificationResponse,
  InvitationVerificationResponse
} from './auth'
