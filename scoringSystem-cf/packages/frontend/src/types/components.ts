/**
 * @fileoverview Vue 组件 Props 和 Emits 类型定义
 */

// @ts-nocheck - This file exports types that may not all be used
import type {
  Project,
  Stage,
  Submission,
  Group,
  User,
  Comment,
  Notification
} from './models'

/**
 * 项目卡片组件 Props
 */
export interface ProjectCardProps {
  project: Project
  showActions?: boolean
}

/**
 * 阶段卡片组件 Props
 */
export interface StageCardProps {
  stage: Stage
  editable?: boolean
}

/**
 * 提交卡片组件 Props
 */
export interface SubmissionCardProps {
  submission: Submission
  showAuthor?: boolean
  showActions?: boolean
}

/**
 * 用户头像组件 Props
 */
export interface UserAvatarProps {
  user?: User | { avatarSeed?: string; avatarStyle?: string; displayName?: string }
  size?: number | string
  shape?: 'circle' | 'square'
}

/**
 * 评论列表组件 Props
 */
export interface CommentListProps {
  submissionId: string
  editable?: boolean
}

/**
 * 通知项组件 Props
 */
export interface NotificationItemProps {
  notification: Notification
}

/**
 * 模态框组件 Emits
 */
export interface ModalEmits {
  (e: 'close'): void
  (e: 'confirm', data?: any): void
  (e: 'cancel'): void
}

/**
 * 表单组件 Emits
 */
export interface FormEmits {
  (e: 'submit', data: any): void
  (e: 'cancel'): void
  (e: 'update:modelValue', value: any): void
}

/**
 * 项目管理组件 Emits
 */
export interface ProjectManagementEmits {
  (e: 'create', project: Project): void
  (e: 'update', projectId: string, data: any): void
  (e: 'delete', projectId: string): void
  (e: 'archive', projectId: string): void
}

/**
 * 阶段管理组件 Emits
 */
export interface StageManagementEmits {
  (e: 'create', stage: Stage): void
  (e: 'update', stageId: string, data: any): void
  (e: 'delete', stageId: string): void
  (e: 'reorder', stageIds: string[]): void
}

/**
 * 群组选择器组件 Props
 */
export interface GroupSelectorProps {
  projectId: string
  modelValue?: string
  multiple?: boolean
}

/**
 * 群组选择器组件 Emits
 */
export interface GroupSelectorEmits {
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'change', value: string | string[]): void
}

/**
 * 富文本编辑器组件 Props
 */
export interface RichEditorProps {
  modelValue: string
  placeholder?: string
  readonly?: boolean
  maxLength?: number
}

/**
 * 富文本编辑器组件 Emits
 */
export interface RichEditorEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}

/**
 * 文件上传组件 Props
 */
export interface FileUploadProps {
  accept?: string
  maxSize?: number
  multiple?: boolean
}

/**
 * 文件上传组件 Emits
 */
export interface FileUploadEmits {
  (e: 'success', file: any): void
  (e: 'error', error: Error): void
  (e: 'progress', percent: number): void
}

/**
 * 图表组件通用 Props
 */
export interface ChartProps {
  data: any[]
  width?: number
  height?: number
  config?: Record<string, any>
}

/**
 * 表格组件 Props
 */
export interface TableProps<T = any> {
  data: T[]
  columns: TableColumn[]
  loading?: boolean
  pagination?: boolean
  pageSize?: number
}

/**
 * 表格列定义
 */
export interface TableColumn {
  key: string
  label: string
  width?: number | string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  formatter?: (value: any, row: any) => string
}

/**
 * 搜索栏组件 Props
 */
export interface SearchBarProps {
  placeholder?: string
  modelValue?: string
  showFilters?: boolean
}

/**
 * 搜索栏组件 Emits
 */
export interface SearchBarEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'search', query: string): void
  (e: 'filter', filters: Record<string, any>): void
}

/**
 * 成员信息接口 (用于贡献度计算)
 */
export interface Member {
  email: string
  displayName: string
  contribution: number
}

/**
 * 组别点击事件数据接口 (用于图表交互)
 */
export interface GroupClickData {
  groupId: string
  groupName: string
  rank: number
  points: number
  members: Member[]
  allGroupMembers: Member[]
}
