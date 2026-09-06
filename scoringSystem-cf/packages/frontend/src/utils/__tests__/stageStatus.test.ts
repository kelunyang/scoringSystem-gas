/**
 * getStageStatusText / getStageStatusType 的守門測試
 *
 * 這兩個函式原本只處理六個狀態，漏了 `paused`——而 pause 是完整實作的
 * 功能（0007_add_stage_pause.sql ＋ handlers/stages/pause.ts ＋
 * PauseStageDrawer.vue）。管理端的階段清單因此把已暫停的階段顯示成
 * 「尚未開始」，旁邊卻同時出現「恢復階段」按鈕。
 *
 * 這裡列出 `stages_with_status` VIEW 實際會產出的全部七個值，
 * 之後再加狀態時會被這個測試擋下來。
 */

import { describe, test, expect } from 'vitest'
import { getStageStatusText, getStageStatusType, type StageStatus } from '../stageStatus'

/** VIEW 的 CASE 分支（0007_add_stage_pause.sql:22-29） */
const VIEW_STATUSES: StageStatus[] = [
  'pending', 'active', 'voting', 'settling', 'completed', 'archived', 'paused'
]

describe('stageStatus', () => {
  test('VIEW 會產出的七個狀態都有專屬文字，不會落到 default', () => {
    const texts = VIEW_STATUSES.map(getStageStatusText)
    // 只有 pending 應該是「尚未開始」；其餘不得與它相同（相同就代表掉進 default）
    const fallback = getStageStatusText('pending')
    const unexpected = VIEW_STATUSES.filter(
      s => s !== 'pending' && getStageStatusText(s) === fallback
    )
    expect(unexpected).toEqual([])
    expect(new Set(texts).size).toBe(VIEW_STATUSES.length)
  })

  test('paused 顯示為「已暫停」並用警示色', () => {
    expect(getStageStatusText('paused')).toBe('已暫停')
    expect(getStageStatusType('paused')).toBe('warning')
  })

  test('null / undefined 維持原本的預設行為', () => {
    expect(getStageStatusText(null)).toBe('尚未開始')
    expect(getStageStatusType(undefined)).toBe('info')
  })
})
