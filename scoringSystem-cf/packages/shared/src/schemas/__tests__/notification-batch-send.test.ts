/**
 * Guard: 批次寄通知信的端點必須「勾什麼寄什麼」。
 *
 * 2026-09-07 之前，這個 schema 收的是篩選條件
 * （targetUserEmail / type / isRead / limit），但前端送的一直是
 * notificationIds。Zod 預設會把不認識的欄位靜靜剝掉，handler 因此
 * 拿到空篩選，查詢退化成「最新的 MAX_BATCH_EMAIL_SIZE 筆」，
 * 等於無視勾選、對全系統最新的一批人寄信（而且不看 emailSent，會重寄）。
 *
 * 這個測試釘住兩件事：
 * 1. schema 收的是通知 ID 清單；
 * 2. schema 是 strict 的——形狀不符要當場失敗，不能靜靜剝掉。
 *    第 2 點才是真正的防護：欄位名再次漂走時會是 400，不是誤寄。
 */

import { describe, it, expect } from 'vitest'
import { SendBatchNotificationsRequestSchema } from '../admin'

describe('SendBatchNotificationsRequestSchema', () => {
  it('接受通知 ID 清單', () => {
    const result = SendBatchNotificationsRequestSchema.safeParse({
      notificationIds: ['notif_1', 'notif_2']
    })
    expect(result.success).toBe(true)
  })

  it('拒絕空清單（不該有「什麼都沒指定」的批次）', () => {
    const result = SendBatchNotificationsRequestSchema.safeParse({ notificationIds: [] })
    expect(result.success).toBe(false)
  })

  it('拒絕缺少 notificationIds 的請求', () => {
    const result = SendBatchNotificationsRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('拒絕舊的「篩選條件」形狀，而不是把它剝成空物件', () => {
    const result = SendBatchNotificationsRequestSchema.safeParse({
      targetUserEmail: 'someone@example.com',
      type: 'settlement',
      isRead: false,
      limit: 50
    })
    expect(result.success).toBe(false)
  })

  it('連同 notificationIds 一起送的多餘欄位也要拒絕（strict）', () => {
    const result = SendBatchNotificationsRequestSchema.safeParse({
      notificationIds: ['notif_1'],
      limit: 50
    })
    expect(result.success).toBe(false)
  })
})
