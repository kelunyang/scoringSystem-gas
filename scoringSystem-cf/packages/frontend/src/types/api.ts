/**
 * @fileoverview API 请求和响应类型定义
 */

/**
 * API 成功响应类型
 */
export interface ApiSuccessResponse<T = any> {
  success: true
  data: T
  message?: string
}

/**
 * API 错误响应类型
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    context?: any
  }
}

/**
 * API 通用响应类型
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * 分页响应数据
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * 登录请求
 */
export interface LoginRequest {
  userEmail: string
  password: string
  turnstileToken?: string
}

/**
 * 登录响应
 */
export interface LoginResponse {
  token: string
  user: {
    userId: string
    userEmail: string
    displayName: string
    avatarSeed?: string
    avatarStyle?: string
    avatarOptions?: string
    permissions?: string[]
  }
}

/**
 * 注册请求
 */
export interface RegisterRequest {
  password: string
  userEmail: string
  displayName: string
  invitationCode: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, any>
  turnstileToken?: string
}

/**
 * 创建项目请求
 */
export interface CreateProjectRequest {
  projectName: string
  description?: string
  settings?: Record<string, any>
}

/**
 * 更新项目请求
 */
export interface UpdateProjectRequest {
  projectName?: string
  description?: string
  settings?: Record<string, any>
  status?: 'active' | 'archived' | 'deleted'
}

/**
 * 创建阶段请求
 */
export interface CreateStageRequest {
  projectId: string
  stageName: string
  description?: string
  startTime?: number
  endTime?: number
  settings?: Record<string, any>
}

/**
 * 更新阶段请求
 */
export interface UpdateStageRequest {
  stageName?: string
  description?: string
  startTime?: number
  endTime?: number
  status?: 'draft' | 'active' | 'closed'
  settings?: Record<string, any>
}

/**
 * 创建提交请求
 */
export interface CreateSubmissionRequest {
  stageId: string
  groupId: string
  title: string
  content: string
  metadata?: Record<string, any>
}

/**
 * 更新提交请求
 */
export interface UpdateSubmissionRequest {
  title?: string
  content?: string
  status?: 'draft' | 'submitted' | 'reviewed'
  metadata?: Record<string, any>
}

/**
 * 创建评论请求
 */
export interface CreateCommentRequest {
  submissionId: string
  content: string
  parentCommentId?: string
}

/**
 * 奖励积分请求
 */
export interface AwardPointsRequest {
  projectId: string
  userId: string
  amount: number
  description?: string
  relatedEntityType?: string
  relatedEntityId?: string
}

/**
 * 创建群组请求
 */
export interface CreateGroupRequest {
  projectId: string
  groupName: string
  description?: string
}

/**
 * 创建邀请请求
 */
export interface CreateInvitationRequest {
  inviteeEmail: string
  metadata?: Record<string, any>
}

/**
 * 评分请求
 */
export interface ScoreSubmissionRequest {
  submissionId: string
  criteriaId: string
  score: number
  comment?: string
}

/**
 * 更新用户资料请求
 */
export interface UpdateProfileRequest {
  displayName?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, any>
  preferences?: Record<string, any>
}

/**
 * 修改密码请求
 */
export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}

/**
 * 忘记密码请求
 */
export interface ForgotPasswordRequest {
  userEmail: string
}

/**
 * 重置密码请求
 */
export interface ResetPasswordRequest {
  token: string
  newPassword: string
}

/**
 * 文件上传响应
 */
export interface FileUploadResponse {
  fileId: string
  filename: string
  url: string
  size: number
  uploadTime: number
}

/**
 * 统计数据响应
 */
export interface StatsResponse {
  totalUsers?: number
  totalProjects?: number
  totalSubmissions?: number
  activeProjects?: number
  totalLogs?: number
  levelCounts?: Record<string, number>
  [key: string]: any
}

/**
 * 项目核心数据响应 (用于 ProjectCoreData)
 */
export interface ProjectCoreResponse {
  project: {
    projectId: string
    projectName: string
    description: string | null
    creatorId: string
    creationTime: number
    status: 'active' | 'archived' | 'deleted'
    settings: string
    lastActivityTime: number | null
  }
  users: any[]
  groups: any[]
  stages: any[]
  userGroups?: any[]
}

/**
 * 系统日志项
 */
export interface SystemLogItem {
  userId?: string
  userEmail?: string
  displayName?: string
  projectId?: string
  projectName?: string
  level?: string
  message?: string
  timestamp?: number
  details?: any
  [key: string]: any
}

/**
 * 投票资格响应
 */
export interface VotingEligibilityResponse {
  eligible: boolean
  reason?: string
  [key: string]: any
}

/**
 * 排名历史响应
 */
export interface RankingHistoryResponse {
  history: any[]
  [key: string]: any
}

/**
 * 评论投票数据响应
 */
export interface CommentVotingDataResponse {
  comments: any[]
  groups: any[]
  [key: string]: any
}

/**
 * 阶段数据响应
 */
export interface StageDataResponse {
  stage: any
  submissions?: any[]
  comments?: any[]
  [key: string]: any
}

/**
 * 资源数据响应 (用于 EventLog)
 */
export interface ResourceDataResponse {
  resource: any
  [key: string]: any
}
