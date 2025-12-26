/**
 * 主題配置模塊導出
 *
 * 此模塊提供統一的主題配置接口，包括：
 * - 階段狀態配色方案
 * - 按鈕配色方案（語義化）
 * - 配色工具函數
 * - 類型定義
 *
 * @module @repo/shared/theme
 * @version 2.0.0
 */

export {
  // ========================================
  // 階段狀態配色
  // ========================================

  // 配色常量
  STAGE_COLORS,

  // 類型定義
  type StageColorConfig,
  type StageDisplayStatus,

  // 工具函數
  getStageColor,
  getStageTextColor,
  getStageColorConfig,
  isWCAGCompliant,
  getAllStageStatuses,

  // ========================================
  // 按鈕配色（語義化方案A）
  // ========================================

  // 配色常量
  BUTTON_COLORS,

  // 類型定義
  type ButtonColorConfig,
  type ButtonColorType,

  // 工具函數
  getButtonColor,
  getButtonTextColor,
  getButtonHoverColor,
  getButtonColorConfig,
  isButtonWCAGCompliant,
  getAllButtonTypes
} from './colors.config'
