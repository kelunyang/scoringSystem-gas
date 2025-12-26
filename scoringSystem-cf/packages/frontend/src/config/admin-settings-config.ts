/**
 * @fileoverview Admin Settings Configuration
 * 配置驅動的系統設定表單定義
 *
 * 這個檔案定義了所有系統設定欄位的配置，用於自動生成表單 UI
 */

import type { ConfigCategory, ConfigField } from '@/types/config-panel'
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
  // 9. SMTP 郵件服務配置
  // ========================================================================
  {
    key: 'smtp',
    title: '郵件服務配置 (SMTP)',
    icon: 'fa-envelope',
    description: '配置 SMTP 郵件服務後，系統將可以發送邀請碼郵件給新用戶。支援 Gmail、Outlook、自架 SMTP 伺服器等。',
    fields: [
      {
        key: 'SMTP_HOST',
        label: 'SMTP 主機地址',
        type: 'input',
        category: 'smtp',
        placeholder: 'smtp.gmail.com',
        description: '例如: smtp.gmail.com (Gmail) 或 smtp.office365.com (Outlook)',
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
      },
      {
        key: 'SMTP_FROM_NAME',
        label: '寄件者名稱',
        type: 'input',
        category: 'smtp',
        placeholder: '評分系統',
        description: '郵件中顯示的寄件者名稱',
        inputType: 'text'
      },
      {
        key: 'SMTP_FROM_EMAIL',
        label: '寄件者郵箱',
        type: 'input',
        category: 'smtp',
        placeholder: 'noreply@example.com',
        description: '郵件中顯示的寄件者郵箱地址',
        inputType: 'email'
      }
    ]
  }
]

/**
 * 根據 key 查找欄位配置
 */
export function getFieldConfig(key: string): ConfigField | undefined {
  for (const category of systemConfigCategories) {
    const field = category.fields.find(f => f.key === key)
    if (field) return field
  }
  return undefined
}

/**
 * 根據分類 key 查找分類配置
 */
export function getCategoryConfig(key: string): ConfigCategory | undefined {
  return systemConfigCategories.find(c => c.key === key)
}

/**
 * 取得所有欄位的 keys
 */
export function getAllFieldKeys(): string[] {
  return systemConfigCategories.flatMap(category =>
    category.fields.map(field => field.key)
  )
}
