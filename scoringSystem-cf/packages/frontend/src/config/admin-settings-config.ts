/**
 * @fileoverview Admin Settings Configuration
 * 配置驅動的系統設定表單定義
 *
 * 這個檔案定義了所有系統設定欄位的配置，用於自動生成表單 UI
 */

import type { ConfigCategory } from '@/types/config-panel'
import { transforms } from './transforms'
import { scoringSystemConfigCategories } from './scoring-system-config'

/**
 * 系統設定配置分類
 *
 * 每個分類包含多個欄位，ConfigPanel.vue 會根據這些配置自動渲染表單
 */
export const systemConfigCategories: ConfigCategory[] = [
  // ========================================================================
  // 1. 系統品牌配置
  // ========================================================================
  {
    key: 'branding',
    title: '系統品牌配置',
    icon: 'fa-tag',
    description: '自訂系統名稱和品牌資訊',
    fields: [
      {
        key: 'SYSTEM_TITLE',
        label: '系統標題',
        type: 'input',
        category: 'branding',
        placeholder: '評分系統',
        description: '顯示在郵件主旨和登入頁面的系統名稱',
        maxlength: 50,
        showWordLimit: true,
        prependIcon: 'fa-graduation-cap',
        inputType: 'text'
      },
      {
        key: 'BRANDING_ICON',
        label: '系統圖示',
        type: 'icon-selector',
        category: 'branding',
        description: '選擇一個圖示作為系統品牌標識，將顯示在登入頁面和瀏覽器分頁'
      }
    ]
  },

  // ========================================================================
  // 2. 認證系統配置
  // ========================================================================
  {
    key: 'auth',
    title: '認證系統配置',
    icon: 'fa-lock',
    description: 'Session 和密碼安全設定',
    fields: [
      {
        key: 'SESSION_TIMEOUT',
        label: 'Session 超時時間',
        type: 'slider',
        category: 'auth',
        min: 1,
        max: 168,
        step: 1,
        marks: { 24: '1天', 72: '3天', 168: '7天' },
        description: 'Session 有效時間（小時）',
        suffix: '小時',
        showTooltip: true,
        formatTooltip: (val: number) => `${val} 小時`,
        transform: transforms.msToHours
      },
      {
        key: 'PASSWORD_SALT_ROUNDS',
        label: '密碼雜湊迭代次數',
        type: 'slider',
        category: 'auth',
        min: 8,
        max: 15,
        step: 1,
        marks: { 8: '快', 10: '平衡', 12: '安全', 15: '非常安全' },
        description: '密碼雜湊迭代次數（預設 10，安全性和性能的平衡）',
        suffix: '次',
        showTooltip: true
      }
    ]
  },

  // ========================================================================
  // 3. 邀請系統配置
  // ========================================================================
  {
    key: 'invitation',
    title: '邀請系統配置',
    icon: 'fa-envelope',
    description: '邀請碼和註冊相關設定',
    fields: [
      {
        key: 'INVITE_CODE_TIMEOUT',
        label: '邀請碼有效期限',
        type: 'slider',
        category: 'invitation',
        min: 1,
        max: 30,
        step: 1,
        marks: { 7: '1週', 14: '2週', 30: '1月' },
        description: '邀請碼有效期限（天）',
        suffix: '天',
        showTooltip: true,
        formatTooltip: (val: number) => `${val} 天`,
        transform: transforms.msToDays
      },
      {
        key: 'WEB_APP_URL',
        label: 'Web App URL',
        type: 'input',
        category: 'invitation',
        placeholder: 'https://script.google.com/...',
        description: 'Web App URL（用於邀請碼郵件連結）',
        inputType: 'url'
      }
    ]
  },

  // ========================================================================
  // 4. 安全驗證配置
  // ========================================================================
  {
    key: 'security',
    title: '安全驗證配置',
    icon: 'fa-shield-alt',
    description: 'Turnstile 和 2FA 安全設定',
    fields: [
      {
        key: 'TURNSTILE_ENABLED',
        label: '啟用 Turnstile 驗證',
        type: 'switch',
        category: 'security',
        description: '是否啟用 Cloudflare Turnstile 人機驗證'
      },
      {
        key: 'TURNSTILE_SITE_KEY',
        label: 'Turnstile Site Key',
        type: 'input',
        category: 'security',
        placeholder: '0x4AAAAAAA...',
        description: 'Cloudflare Turnstile Site Key（公開密鑰，前端使用）',
        prependIcon: 'fa-key',
        inputType: 'text'
      },
      {
        key: 'TURNSTILE_SECRET_KEY',
        label: 'Turnstile Secret Key',
        type: 'password',
        category: 'security',
        placeholder: '0x4AAAAAAA...',
        description: 'Cloudflare Turnstile Secret Key（私密密鑰，後端驗證）',
        showPassword: true,
        prependIcon: 'fa-lock'
      },
      {
        key: 'MAX_2FA_FAILED_ATTEMPTS',
        label: '2FA 驗證失敗上限',
        type: 'slider',
        category: 'security',
        min: 3,
        max: 10,
        step: 1,
        marks: { 3: '嚴格', 5: '平衡', 8: '寬鬆', 10: '最寬鬆' },
        description: '連續失敗超過此次數將觸發帳號鎖定',
        suffix: '次',
        showTooltip: true
      }
    ]
  },

  // ========================================================================
  // 5. 日誌系統配置
  // ========================================================================
  {
    key: 'logging',
    title: '日誌系統配置',
    icon: 'fa-file-alt',
    description: '系統日誌記錄等級設定',
    fields: [
      {
        key: 'LOG_LEVEL',
        label: '最低日誌記錄等級',
        type: 'select',
        category: 'logging',
        description: '低於此等級的日誌將不會被記錄',
        options: [
          { label: 'DEBUG', value: 'DEBUG' },
          { label: 'INFO', value: 'INFO' },
          { label: 'WARN', value: 'WARN' },
          { label: 'ERROR', value: 'ERROR' },
          { label: 'FATAL', value: 'FATAL' }
        ]
      }
    ]
  },

  // ========================================================================
  // 6. 業務邏輯限制
  // ========================================================================
  {
    key: 'limits',
    title: '業務邏輯限制',
    icon: 'fa-sliders-h',
    description: '專案、群組、階段等業務規則限制',
    fields: [
      {
        key: 'MAX_PROJECT_NAME_LENGTH',
        label: '專案名稱最大長度',
        type: 'slider',
        category: 'limits',
        min: 50,
        max: 200,
        step: 1,
        description: '專案名稱允許的最大字元數',
        suffix: '字元',
        showTooltip: true
      },
      {
        key: 'MAX_CONCURRENT_PROJECTS',
        label: '同時進行的專案數量限制',
        type: 'slider',
        category: 'limits',
        min: 1,
        max: 20,
        step: 1,
        description: '系統中最多可以同時有幾個進行中的專案',
        suffix: '個',
        showTooltip: true
      },
      {
        key: 'MAX_GROUP_NAME_LENGTH',
        label: '群組名稱最大長度',
        type: 'slider',
        category: 'limits',
        min: 20,
        max: 100,
        step: 1,
        description: '群組名稱允許的最大字元數',
        suffix: '字元',
        showTooltip: true
      },
      {
        key: 'MAX_GROUPS_PER_PROJECT',
        label: '每個專案最大群組數',
        type: 'slider',
        category: 'limits',
        min: 5,
        max: 50,
        step: 1,
        description: '單一專案中最多可以創建幾個群組',
        suffix: '個',
        showTooltip: true
      },
      {
        key: 'MAX_MEMBERS_PER_GROUP',
        label: '每個群組最大成員數',
        type: 'slider',
        category: 'limits',
        min: 5,
        max: 30,
        step: 1,
        description: '單一群組中最多可以有幾位成員',
        suffix: '人',
        showTooltip: true
      },
      {
        key: 'MAX_STAGE_DURATION_DAYS',
        label: '每個階段最大天數',
        type: 'slider',
        category: 'limits',
        min: 7,
        max: 90,
        step: 1,
        marks: { 30: '1月', 60: '2月', 90: '3月' },
        description: '單一專案階段允許的最長持續時間',
        suffix: '天',
        showTooltip: true,
        formatTooltip: (val: number) => `${val} 天`
      }
    ]
  },

  // ========================================================================
  // 7. 評分系統配置（從 scoring-system-config.ts 導入）
  // ========================================================================
  ...scoringSystemConfigCategories,

  // ========================================================================
  // 8. AI 服務配置
  // ========================================================================
  {
    key: 'ai',
    title: 'AI 服務配置',
    icon: 'fa-robot',
    description: 'AI 排名建議功能的模型配置與速率限制',
    fields: [
      {
        key: 'AI_RATE_LIMIT_PER_MINUTE',
        label: 'AI 每分鐘請求上限',
        type: 'slider',
        category: 'ai',
        min: 1,
        max: 30,
        step: 1,
        marks: { 5: '5次', 10: '10次', 20: '20次', 30: '30次' },
        description: '每位用戶每分鐘最多可以發送的 AI 排名查詢次數',
        suffix: '次',
        showTooltip: true
      },
      {
        key: 'AI_RATE_LIMIT_PER_HOUR',
        label: 'AI 每小時請求上限',
        type: 'slider',
        category: 'ai',
        min: 10,
        max: 200,
        step: 10,
        marks: { 30: '30次', 60: '60次', 100: '100次', 200: '200次' },
        description: '每位用戶每小時最多可以發送的 AI 排名查詢次數',
        suffix: '次',
        showTooltip: true
      }
    ]
  },

  // ========================================================================
  // 9. 郵件寄送配置（SMTP）
  // NOTE: Cloudflare Email Service 因 Beta 限制暫時停用
  // ========================================================================
  {
    key: 'smtp',
    title: '郵件寄送配置',
    icon: 'fa-envelope',
    description: '系統使用 SMTP 寄送郵件（邀請碼、密碼重設等）。Cloudflare Email Service 因 Beta 限制暫時停用。',
    fields: [
      // Email sending configuration
      {
        key: 'EMAIL_FROM_EMAIL',
        label: '寄件者郵箱',
        type: 'input',
        category: 'smtp',
        placeholder: 'noreply@yourdomain.com',
        description: '郵件寄件者地址',
        prependIcon: 'fa-at',
        inputType: 'email'
      },
      {
        key: 'EMAIL_FROM_NAME',
        label: '寄件者名稱',
        type: 'input',
        category: 'smtp',
        placeholder: '林口高中評分系統',
        description: '郵件中顯示的寄件者名稱',
        prependIcon: 'fa-user',
        inputType: 'text'
      },
      {
        key: 'EMAIL_REPLY_TO',
        label: '回覆地址',
        type: 'input',
        category: 'smtp',
        placeholder: 'admin@school.edu.tw',
        description: '收件者回覆郵件時會寄到此地址（選填，可與寄件者不同）',
        prependIcon: 'fa-reply',
        inputType: 'email'
      },
      // SMTP configuration
      {
        key: 'SMTP_HOST',
        label: 'SMTP 主機地址',
        type: 'input',
        category: 'smtp',
        placeholder: 'smtp.gmail.com',
        description: 'SMTP 伺服器地址。例如: smtp.gmail.com (Gmail) 或 smtp.office365.com (Outlook)',
        prependIcon: 'fa-server',
        inputType: 'text'
      },
      {
        key: 'SMTP_PORT',
        label: 'SMTP 端口',
        type: 'select',
        category: 'smtp',
        description: '常用端口: 587 (STARTTLS) 或 465 (SSL/TLS)',
        options: [
          { label: '587 (推薦 - STARTTLS)', value: 587 },
          { label: '465 (SSL/TLS)', value: 465 },
          { label: '25 (不安全)', value: 25 }
        ]
      },
      {
        key: 'SMTP_USERNAME',
        label: 'SMTP 用戶名',
        type: 'input',
        category: 'smtp',
        placeholder: 'your-email@gmail.com',
        description: '通常是完整的郵箱地址',
        prependIcon: 'fa-user',
        inputType: 'email'
      },
      {
        key: 'SMTP_PASSWORD',
        label: 'SMTP 密碼',
        type: 'password',
        category: 'smtp',
        placeholder: '輸入 SMTP 密碼或應用程式密碼',
        description: 'Gmail 需使用「應用程式密碼」而非帳號密碼。前往: Google 帳戶 → 安全性 → 兩步驟驗證 → 應用程式密碼',
        showPassword: true,
        prependIcon: 'fa-key'
      }
    ]
  },

  // ========================================================================
  // 10. 郵件速率限制
  // 對應 backend: utils/email-budget.ts、utils/rate-limiter.ts
  // 預設值是照「約 400 人、一節課約 40 人同時登入、Google Workspace 每日
  // 2000 封」估的。換寄件帳號或人數規模變動時，這一區要跟著調。
  // ========================================================================
  {
    key: 'email_limits',
    title: '郵件速率限制',
    icon: 'fa-gauge-high',
    description: '控制系統寄信的速度與總量。每日預算是為了不要把 SMTP 帳號的每日額度用光——額度一旦用光，所有人的登入驗證碼都會寄不出去。',
    fields: [
      {
        key: 'EMAIL_DAILY_BUDGET',
        label: '每日寄信總預算',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 3000,
        step: 50,
        marks: { 0: '關閉', 500: '一般 Gmail', 1500: '預設', 2000: 'Workspace 上限' },
        description: '滾動 24 小時內全系統最多寄幾封。應設在寄件帳號每日上限之下（一般 Gmail 約 500、Google Workspace 約 2000）。設 0 表示不限制。',
        suffix: '封',
        showTooltip: true
      },
      {
        key: 'EMAIL_BUDGET_BULK_PCT',
        label: '批次信可用預算比例',
        type: 'slider',
        category: 'email_limits',
        min: 10,
        max: 100,
        step: 5,
        marks: { 30: '30%', 50: '50%', 80: '80%' },
        description: '通知彙整信、巡邏報告等機器人信件用掉這個比例的預算後就停寄。調低可以替登入驗證碼留更多餘裕。',
        suffix: '%',
        showTooltip: true
      },
      {
        key: 'EMAIL_BUDGET_NORMAL_PCT',
        label: '一般信可用預算比例',
        type: 'slider',
        category: 'email_limits',
        min: 10,
        max: 100,
        step: 5,
        marks: { 50: '50%', 65: '65%', 90: '90%' },
        description: '邀請信、成果撤回通知等用掉這個比例後就停寄。剩下的預算全部保留給登入驗證碼與密碼重設。應大於「批次信」比例。',
        suffix: '%',
        showTooltip: true
      },
      {
        key: 'EMAIL_COOLDOWN_SECONDS',
        label: '同一信箱寄信冷卻',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 300,
        step: 10,
        marks: { 0: '關閉', 60: '60秒', 180: '3分鐘' },
        description: '同一個信箱兩封信之間至少要隔多久。應與前端「重新發送」倒數一致（目前 60 秒）。設 0 表示不限制。',
        suffix: '秒',
        showTooltip: true
      },
      {
        key: 'EMAIL_MAX_PER_RECIPIENT_HOUR',
        label: '每信箱每小時上限',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 30,
        step: 1,
        description: '同一個信箱每小時最多收幾封。免密碼觸發（重寄驗證碼、忘記密碼）與已驗證密碼的登入分開計算，所以有人惡意連打也不會害本人登不進來。',
        suffix: '封',
        showTooltip: true
      },
      {
        key: 'EMAIL_MAX_PER_RECIPIENT_DAY',
        label: '每信箱每日上限',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 100,
        step: 5,
        description: '同一個信箱每日最多收幾封，同樣分開計算。',
        suffix: '封',
        showTooltip: true
      },
      {
        key: 'EMAIL_MAX_PER_IP_HOUR',
        label: '每 IP 每小時上限',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 500,
        step: 10,
        marks: { 60: '預設', 200: '200' },
        description: '只套用在「不需要密碼就會寄信」的端點（重寄驗證碼、忘記密碼）。一般登入不受此限制，所以整班共用學校 NAT 出口 IP 同時登入不會被擋。設 0 表示不限制。',
        suffix: '封',
        showTooltip: true
      },
      {
        key: 'MAX_EMAILS_PER_HOUR',
        label: '每帳號每小時寄信上限',
        type: 'slider',
        category: 'email_limits',
        min: 0,
        max: 2000,
        step: 50,
        marks: { 0: '關閉', 500: '預設' },
        description: '單一管理員/教師帳號每小時能觸發幾封信（發邀請碼、批次通知、重送郵件）。一次發 400 張邀請碼會一口氣扣 400。設 0 表示不限制。',
        suffix: '封',
        showTooltip: true
      }
    ]
  }
]

