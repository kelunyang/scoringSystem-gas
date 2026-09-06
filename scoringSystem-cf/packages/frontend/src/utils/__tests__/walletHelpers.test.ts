/**
 * isTransactionReversed 的回歸測試
 *
 * 這個函式原本比對 `t.relatedTransactionId === 原交易 ID`，但
 * `transactions` 資料表沒有 `relatedTransactionId` 欄位，後端那句
 * SELECT 也沒有回傳它——撤銷是把原交易 ID 寫在
 * `metadata.originalTransactionId`（handlers/wallets/transactions.ts
 * 的 reverseTransaction）。
 *
 * 結果：被撤銷的原交易永遠不會被判定為已撤銷，錢包列表上仍然顯示
 * 「撤銷」按鈕（按下去會被後端的 ALREADY_REVERSED 擋掉）。
 */

import { describe, test, expect } from 'vitest'
import { isTransactionReversed } from '../walletHelpers'

const original = { transactionId: 'txn_1', transactionType: 'award' }
const reversal = {
  transactionId: 'txn_2',
  transactionType: 'reversal',
  metadata: JSON.stringify({ originalTransactionId: 'txn_1', reversedBy: 'a@example.com' })
}
const unrelatedReversal = {
  transactionId: 'txn_3',
  transactionType: 'reversal',
  metadata: JSON.stringify({ originalTransactionId: 'txn_99' })
}

describe('isTransactionReversed', () => {
  test('撤銷交易自己一定算已撤銷', () => {
    expect(isTransactionReversed(reversal, [original, reversal])).toBe(true)
  })

  test('原交易在有對應撤銷記錄時算已撤銷', () => {
    expect(isTransactionReversed(original, [original, reversal])).toBe(true)
  })

  test('只有別筆交易的撤銷記錄時不算', () => {
    expect(isTransactionReversed(original, [original, unrelatedReversal])).toBe(false)
  })

  test('沒有撤銷記錄時不算', () => {
    expect(isTransactionReversed(original, [original])).toBe(false)
  })

  test('metadata 不是合法 JSON 時當作沒有撤銷，不拋錯', () => {
    const broken = { transactionId: 'txn_4', transactionType: 'reversal', metadata: '{不是 JSON' }
    expect(() => isTransactionReversed(original, [original, broken])).not.toThrow()
    expect(isTransactionReversed(original, [original, broken])).toBe(false)
  })

  test('metadata 已經是物件（未來若後端改成回物件）也要能處理', () => {
    const asObject = {
      transactionId: 'txn_5',
      transactionType: 'reversal',
      metadata: { originalTransactionId: 'txn_1' }
    }
    expect(isTransactionReversed(original, [original, asObject])).toBe(true)
  })
})
