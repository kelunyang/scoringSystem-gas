/**
 * @fileoverview 工具函数类型定义
 */

/**
 * JWT 载荷类型
 */
export interface JWTPayload {
  userId: string
  userEmail: string
  displayName: string
  status: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string
  permissions?: string[]
  iat?: number
  exp?: number
}

/**
 * 日期格式化选项
 */
export interface DateFormatOptions {
  format?: string
  locale?: string
  timezone?: string
}

/**
 * 错误处理器选项
 */
export interface ErrorHandlerOptions {
  showNotification?: boolean
  logToConsole?: boolean
  rethrow?: boolean
}

/**
 * Markdown 渲染选项
 */
export interface MarkdownOptions {
  sanitize?: boolean
  breaks?: boolean
  gfm?: boolean
  highlight?: (code: string, lang: string) => string
}

/**
 * 文件信息类型
 */
export interface FileInfo {
  name: string
  size: number
  type: string
  lastModified: number
}

/**
 * 上传进度信息
 */
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

/**
 * 验证规则类型
 */
export interface ValidationRule {
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  validator?: (value: any) => boolean | string
  message?: string
}

/**
 * 表单验证结果
 */
export interface ValidationResult {
  valid: boolean
  errors: Record<string, string[]>
}

/**
 * 本地存储选项
 */
export interface StorageOptions {
  prefix?: string
  expire?: number
  encrypt?: boolean
}

/**
 * API 客户端配置
 */
export interface ApiClientConfig {
  baseURL: string
  timeout?: number
  headers?: Record<string, string>
  withCredentials?: boolean
}

/**
 * 请求配置
 */
export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  params?: Record<string, any>
  data?: any
  timeout?: number
}

/**
 * 响应拦截器
 */
export type ResponseInterceptor = (response: any) => any

/**
 * 错误拦截器
 */
export type ErrorInterceptor = (error: any) => any

/**
 * 防抖选项
 */
export interface DebounceOptions {
  leading?: boolean
  trailing?: boolean
  maxWait?: number
}

/**
 * 节流选项
 */
export interface ThrottleOptions {
  leading?: boolean
  trailing?: boolean
}

/**
 * 深拷贝选项
 */
export interface DeepCloneOptions {
  circular?: boolean
  prototype?: boolean
  includeNonEnumerable?: boolean
}

/**
 * 颜色选项
 */
export interface ColorOptions {
  hue?: string | number
  luminosity?: 'bright' | 'light' | 'dark' | 'random'
  format?: 'rgb' | 'rgba' | 'hex' | 'hsl' | 'hsla'
  alpha?: number
}

/**
 * 图表数据点
 */
export interface ChartDataPoint {
  x: number | string | Date
  y: number
  label?: string
  [key: string]: any
}

/**
 * 图表配置
 */
export interface ChartConfig {
  width?: number
  height?: number
  margin?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  colors?: string[]
  animation?: boolean
  tooltip?: boolean
  legend?: boolean
}

/**
 * 排序函数类型
 */
export type SortFunction<T> = (a: T, b: T) => number

/**
 * 过滤函数类型
 */
export type FilterFunction<T> = (item: T) => boolean

/**
 * 映射函数类型
 */
export type MapFunction<T, U> = (item: T, index: number) => U

/**
 * 归约函数类型
 */
export type ReduceFunction<T, U> = (accumulator: U, current: T, index: number) => U

/**
 * 錯誤日誌條目
 */
export interface ErrorLogEntry {
  timestamp: Date
  type: string
  title: string
  action: string
  message: string
  error: any
}

/**
 * 通知日誌條目
 */
export interface NotificationEntry {
  id: number
  timestamp: Date
  message: string
  level: 'error' | 'warning' | 'success' | 'info'
  type: string
  context: Record<string, any>
  stack?: string | null
}
