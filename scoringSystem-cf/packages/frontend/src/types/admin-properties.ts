/**
 * @fileoverview Admin Properties and Configuration Type Definitions
 * 用於 SystemSettings 組件的系統屬性和配置類型
 */

/**
 * 系統屬性配置介面
 * 對應 backend PropertiesService 的配置項
 */
export interface PropertiesConfig {
  /** 系統標題 */
  SYSTEM_TITLE?: string
  /** Session 超時時間 (毫秒) */
  SESSION_TIMEOUT?: string
  /** 邀請碼超時時間 (毫秒) */
  INVITE_CODE_TIMEOUT?: string
  /** 密碼加密迭代次數 */
  PASSWORD_SALT_ROUNDS?: number
  /** Web App URL */
  WEB_APP_URL?: string
  /** 是否啟用 Turnstile 驗證 */
  TURNSTILE_ENABLED?: string
  /** Turnstile Site Key */
  TURNSTILE_SITE_KEY?: string
  /** Turnstile Secret Key */
  TURNSTILE_SECRET_KEY?: string
  /** 2FA 最大失敗次數 */
  MAX_2FA_FAILED_ATTEMPTS?: number
  /** 日誌等級 */
  LOG_LEVEL?: string
  /** 專案名稱最大長度 */
  MAX_PROJECT_NAME_LENGTH?: number
  /** 同時進行的專案數量限制 */
  MAX_CONCURRENT_PROJECTS?: number
  /** 群組名稱最大長度 */
  MAX_GROUP_NAME_LENGTH?: number
  /** 每個專案最大群組數 */
  MAX_GROUPS_PER_PROJECT?: number
  /** 每個群組最大成員數 */
  MAX_MEMBERS_PER_GROUP?: number
  /** 每個階段最大天數 */
  MAX_STAGE_DURATION_DAYS?: number
  /** SMTP 主機地址 */
  SMTP_HOST?: string
  /** SMTP 端口 */
  SMTP_PORT?: number
  /** SMTP 用戶名 */
  SMTP_USERNAME?: string
  /** SMTP 密碼 */
  SMTP_PASSWORD?: string
  /** SMTP 寄件者名稱 */
  SMTP_FROM_NAME?: string
  /** SMTP 寄件者郵箱 */
  SMTP_FROM_EMAIL?: string
  /** 其他動態屬性 */
  [key: string]: string | number | undefined
}

/**
 * SMTP 郵件配置
 */
export interface SmtpConfig {
  /** SMTP 主機地址 */
  host: string
  /** SMTP 端口 */
  port: number
  /** SMTP 用戶名 */
  username: string
  /** SMTP 密碼 */
  password: string
  /** 寄件者名稱 */
  fromName: string
  /** 寄件者郵箱 */
  fromEmail: string
}

/**
 * 機器人狀態
 */
export interface RobotStatus {
  /** 通知巡檢最後執行時間 */
  LAST_NOTIFICATION_PATROL: string | null
  /** 通知巡檢最後錯誤 */
  LAST_NOTIFICATION_PATROL_ERROR: string | null
  /** 其他機器人狀態 */
  [key: string]: string | null | undefined
}

/**
 * 通知巡檢配置
 */
export interface NotificationPatrolConfig {
  /** 定期掃描間隔（天） */
  notificationRobotInterval: number
  /** 時間窗口（小時） */
  timeWindowHours: number
  /** 每封郵件最多通知數 */
  maxNotificationsPerEmail: number
}

/**
 * 通知巡檢統計
 */
export interface NotificationPatrolStats {
  /** 待發送通知數 */
  pendingCount: number
  /** 已發送通知數 */
  sentCount: number
  /** 上次執行時間 */
  lastRun: string | null
}

/**
 * 機器人執行狀態
 */
export interface ExecutingStatus {
  /** 通知巡檢執行中 */
  notificationPatrol: boolean
  /** 其他機器人執行狀態 */
  [key: string]: boolean
}

/**
 * 可疑登入記錄
 */
export interface SuspiciousLogin {
  /** 用戶名 */
  username: string
  /** 原因 */
  reason: string
  /** 客戶端 IP */
  clientIP: string
  /** 時間戳 */
  timestamp: number
  /** 失敗次數 */
  failedCount?: number
  /** 不同 IP 數量 */
  ipCount?: number
}
