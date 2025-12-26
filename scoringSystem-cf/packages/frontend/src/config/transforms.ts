/**
 * @fileoverview Centralized Transform Functions
 *
 * 用於配置驅動表單的值轉換函數
 * 避免在配置中重複定義相同的轉換邏輯
 */

import type { FieldTransform } from '@/types/config-panel'

/**
 * 毫秒 ↔ 小時 轉換
 *
 * 用於時間相關配置（如 SESSION_TIMEOUT）
 *
 * @example
 * // 儲存值: 86400000 (毫秒)
 * // 顯示值: 24 (小時)
 */
export const msToHours: FieldTransform = {
  toDisplay: (ms: string | number) => Math.floor(Number(ms) / 3600000),
  toValue: (hours: number) => hours * 3600000
}

/**
 * 毫秒 ↔ 天數 轉換
 *
 * 用於時間相關配置（如 INVITE_CODE_TIMEOUT, MAX_STAGE_DURATION_DAYS）
 *
 * @example
 * // 儲存值: 604800000 (毫秒)
 * // 顯示值: 7 (天)
 */
export const msToDays: FieldTransform = {
  toDisplay: (ms: string | number) => Math.floor(Number(ms) / 86400000),
  toValue: (days: number) => days * 86400000
}

/**
 * 字串 ↔ 布林值 轉換
 *
 * 用於開關類配置（如 TURNSTILE_ENABLED）
 *
 * @example
 * // 儲存值: 'true' (字串)
 * // 顯示值: true (布林值)
 */
export const stringToBoolean: FieldTransform = {
  toDisplay: (val: string | boolean) => {
    if (typeof val === 'boolean') return val
    return val === 'true'
  },
  toValue: (val: boolean) => val ? 'true' : 'false'
}

/**
 * 所有轉換函數的集合
 */
export const transforms = {
  msToHours,
  msToDays,
  stringToBoolean
} as const
