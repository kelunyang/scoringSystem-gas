/**
 * @fileoverview Configuration Panel Type Definitions
 * 用於配置驅動的通用表單面板組件
 */

/**
 * 欄位類型
 */
export type ConfigFieldType =
  | 'input'              // 文字輸入框
  | 'number'             // 數字輸入框
  | 'slider'             // 滑桿
  | 'select'             // 下拉選單
  | 'switch'             // 開關
  | 'password'           // 密碼輸入框
  | 'custom-dual-slider' // 雙向聯動滑桿（用於權重配置，總和固定為 1.0）
  | 'icon-selector'      // 圖示選擇器（FontAwesome 圖示）

/**
 * 下拉選單選項
 */
export interface SelectOption {
  label: string
  value: string | number
}

/**
 * 值轉換函數（用於 slider 等需要轉換的欄位）
 */
export interface FieldTransform {
  /** 從儲存值轉換為顯示值 */
  toDisplay: (value: any) => any
  /** 從顯示值轉換為儲存值 */
  toValue: (display: any) => any
}

/**
 * 雙向滑桿單一滑桿配置
 */
export interface DualSliderConfig {
  /** 對應的欄位 key */
  key: string
  /** 顯示標籤 */
  label: string
  /** 滑桿顏色 */
  color?: string
  /** 最小值 */
  min: number
  /** 最大值 */
  max: number
  /** 步進值 */
  step: number
  /** 標記點 */
  marks?: Record<number, string>
}

/**
 * 雙向聯動滑桿自訂配置
 */
export interface CustomDualSliderConfig {
  /** 第一個滑桿配置 */
  slider1: DualSliderConfig
  /** 第二個滑桿配置 */
  slider2: DualSliderConfig
  /** 總和約束（例如 1.0 代表兩個滑桿值總和必須為 1.0） */
  sumConstraint: number
  /** 提示框格式化函數 */
  formatTooltip?: (value: number) => string
}

/**
 * 配置欄位定義
 */
export interface ConfigField {
  /** 欄位鍵值（對應 PropertiesConfig 的屬性名） */
  key: string
  /** 顯示標籤 */
  label: string
  /** 欄位類型 */
  type: ConfigFieldType
  /** 所屬分類 */
  category: string
  /** 佔位符文字 */
  placeholder?: string
  /** 最小值（number/slider） */
  min?: number
  /** 最大值（number/slider） */
  max?: number
  /** 步進值（number/slider） */
  step?: number
  /** 滑桿標記點 */
  marks?: Record<number, string>
  /** 下拉選單選項 */
  options?: SelectOption[]
  /** 欄位說明 */
  description?: string
  /** 後綴文字（單位等） */
  suffix?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否顯示提示框（slider） */
  showTooltip?: boolean
  /** 提示框格式化函數（slider） */
  formatTooltip?: (value: number) => string
  /** 值轉換函數 */
  transform?: FieldTransform
  /** 是否顯示密碼切換按鈕（password） */
  showPassword?: boolean
  /** 最大字元數（input） */
  maxlength?: number
  /** 是否顯示字數統計（input） */
  showWordLimit?: boolean
  /** 前置圖標 */
  prependIcon?: string
  /** 輸入類型（input） */
  inputType?: 'text' | 'email' | 'url' | 'number'
  /** 自訂配置（用於 custom-dual-slider 等複雜組件） */
  customConfig?: CustomDualSliderConfig
}

/**
 * 配置分類
 */
export interface ConfigCategory {
  /** 分類鍵值 */
  key: string
  /** 分類標題 */
  title: string
  /** 分類圖標（Font Awesome class） */
  icon: string
  /** 該分類下的欄位 */
  fields: ConfigField[]
  /** 分類說明（可選） */
  description?: string
}
