/**
 * @fileoverview Transaction reversal composable
 * 交易撤銷 composable
 *
 * 從 Wallet.vue 提取的交易撤銷邏輯
 * 負責管理員撤銷交易功能（使用 Drawer 模式）
 */

import { ref, type Ref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { handleError, showSuccess, showWarning } from '@/utils/errorHandler'
import type { Transaction } from '@repo/shared' // Use shared Transaction type for consistency

/**
 * 交易撤銷 composable（Drawer 模式）
 * @param {import('vue').Ref<string>} projectId - 項目 ID (必需)
 * @param {Function} [onSuccess] - 撤銷成功回調
 * @returns {Object} 撤銷管理相關函數和狀態
 */
export function useTransactionReversal(projectId: string | Ref<string | null>, onSuccess: any) {
  console.log('🔧 [useTransactionReversal] composable 初始化')

  // 使用數組而不是 Set，避免手動觸發響應式
  const reversingTransactionIds = ref<string[]>([])

  // Drawer 狀態管理
  const showReversalDrawer = ref(false)
  const selectedTransaction = ref<Transaction | null>(null)

  // ===== Methods =====

  /**
   * 打開撤銷交易抽屜
   * @param {Object} transaction - 交易對象
   */
  function openReversalDrawer(transaction: Transaction) {
    selectedTransaction.value = transaction
    showReversalDrawer.value = true
  }

  /**
   * 關閉撤銷交易抽屜
   */
  function closeReversalDrawer() {
    showReversalDrawer.value = false
    // 延遲清空數據，等待關閉動畫完成
    setTimeout(() => {
      selectedTransaction.value = null
    }, 300)
  }

  /**
   * 撤銷交易
   * @param {string} transactionId - 交易 ID
   * @param {string} reason - 撤銷理由
   * @returns {Promise<boolean>} 是否成功
   */
  async function reverseTransaction(transactionId: string, reason: any) {
    const pid = typeof projectId === 'string' ? projectId : projectId.value
    if (!pid) {
      showWarning('請先選擇專案')
      return false
    }

    reversingTransactionIds.value.push(transactionId)

    try {
      console.log('Reversing transaction:', transactionId)
      const httpResponse = await rpcClient.wallets.reverse.$post({
        json: {
          projectId: pid,
          transactionId: transactionId,
          reason: reason
        }
      })
      const response = await httpResponse.json()

      if (response.success) {
        showSuccess('交易已成功撤銷')

        // 關閉抽屜
        closeReversalDrawer()

        // 調用成功回調（通常用於重新加載交易記錄）
        if (onSuccess && typeof onSuccess === 'function') {
          await onSuccess()
        }

        return true
      } else {
        throw new Error(response.error?.message || '撤銷交易失敗')
      }
    } catch (error) {
      console.error('Error reversing transaction:', error)
      handleError(error instanceof Error ? error : String(error), {
        action: '撤銷交易',
        type: 'error'
      })
      return false
    } finally {
      // 移除加載中狀態
      const index = reversingTransactionIds.value.indexOf(transactionId)
      if (index > -1) {
        reversingTransactionIds.value.splice(index, 1)
      }
    }
  }

  /**
   * 檢查特定交易是否正在撤銷中
   * @param {string} transactionId - 交易 ID
   * @returns {boolean}
   */
  function isReversing(transactionId: string) {
    return reversingTransactionIds.value.includes(transactionId)
  }

  return {
    reversingTransactionIds,
    showReversalDrawer,
    selectedTransaction,
    openReversalDrawer,
    closeReversalDrawer,
    reverseTransaction,
    isReversing
  }
}
