/**
 * @fileoverview Transaction data loader composable
 * 交易數據加載 composable
 *
 * 單一職責：從 API 加載交易數據
 * 可重用於任何需要加載交易的場景
 */

import { ref, watch, type Ref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { handleError, getErrorMessage } from '@/utils/errorHandler'
import type { Transaction } from '@repo/shared' // Use shared Transaction type for consistency

const DEFAULT_TRANSACTION_LIMIT = 1000

/**
 * 加載交易數據
 * @param {import('vue').Ref<string>} projectId - 項目 ID (必需)
 * @param {import('vue').Ref<string>} [userEmail] - 用戶郵箱 (可選，用於過濾特定用戶)
 * @returns {Object} 加載狀態和方法
 */
export function useTransactionLoader(projectId: string, userEmail = null) {
  const loading = ref(false)
  const error = ref<unknown | null>(null)
  const transactions = ref<Transaction[]>([])

  /**
   * 加載交易記錄
   */
  async function loadTransactions() {
    if (!projectId) {
      transactions.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const httpResponse = await rpcClient.wallets.transactions.$post({
        json: {
          projectId: projectId,
          targetUserEmail: userEmail || null,
          limit: DEFAULT_TRANSACTION_LIMIT
        }
      })
      const response = await httpResponse.json()

      if (response.success && response.data) {
        const rawTransactions = response.data.transactions || response.data || []

        if (!Array.isArray(rawTransactions)) {
          throw new Error(`Expected transactions array, got ${typeof rawTransactions}`)
        }

        // 數據規範化並排序（只排序一次）
        transactions.value = rawTransactions
          .map((t: any) => ({
            id: t.transactionId,
            transactionId: t.transactionId,
            points: t.amount,
            description: t.description || t.source,
            stage: t.stageOrder || 1,
            stageName: t.stageName,
            timestamp: t.timestamp,
            transactionType: t.type || t.transactionType,
            relatedSubmissionId: t.relatedSubmissionId,
            relatedCommentId: t.relatedCommentId,
            relatedTransactionId: t.relatedTransactionId
          } as unknown as Transaction))
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)) // 只排序一次

        console.log(`✅ [useTransactionLoader] 加載了 ${transactions.value.length} 條交易記錄`)
      }
    } catch (err) {
      error.value = err as Error
      console.error('Error loading transactions:', err)
      handleError(err as Error, {
        action: '載入交易記錄',
        type: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  // 監聽 projectId 或 userEmail 變化，自動重新加載
  watch([projectId, () => userEmail], () => {
    loadTransactions()
  }, { immediate: true })

  return {
    loading,
    error,
    transactions,
    loadTransactions
  }
}

/**
 * 加載交易詳情（相關成果或評論）
 * @param {import('vue').Ref<string>} projectId - 項目 ID
 * @returns {Object} 加載詳情的方法和狀態
 */
export function useTransactionDetailsLoader(projectId: string | Ref<string | null>) {
  const MAX_CACHE_SIZE = 50 // LRU cache limit
  const detailsCache = ref<Record<string, any>>({})
  const loadingIds = ref<string[]>([])
  const cacheAccessOrder = ref<string[]>([]) // Track access order for LRU

  /**
   * Evict least recently used cache entry if cache is full
   */
  function evictLRU() {
    if (cacheAccessOrder.value.length >= MAX_CACHE_SIZE) {
      const oldestKey = cacheAccessOrder.value.shift()
      if (oldestKey !== undefined) {
        delete detailsCache.value[oldestKey]
        if (import.meta.env.DEV) {
          console.log(`[LRU Cache] Evicted transaction details: ${oldestKey}`)
        }
      }
    }
  }

  /**
   * Update LRU access order
   */
  function touchCache(txId: string) {
    // Remove from current position
    const index = cacheAccessOrder.value.indexOf(txId)
    if (index > -1) {
      cacheAccessOrder.value.splice(index, 1)
    }
    // Add to end (most recently used)
    cacheAccessOrder.value.push(txId)
  }

  /**
   * 加載單個交易的詳情
   * @param {Object} transaction - 交易對象
   */
  async function loadDetails(transaction: Transaction) {
    if (import.meta.env.DEV) {
      console.log('[DEBUG] loadDetails called with:', {
        transaction,
        id: transaction?.id,
        transactionId: transaction?.transactionId,
        relatedSubmissionId: transaction?.relatedSubmissionId,
        relatedCommentId: transaction?.relatedCommentId
      })
    }

    const txId = transaction.id || transaction.transactionId
    if (!txId) return

    // 已加載過或正在加載中
    if (detailsCache.value[txId] || loadingIds.value.includes(txId)) {
      if (import.meta.env.DEV) {
        console.log('[DEBUG] loadDetails skipped (already loaded or loading):', txId)
      }
      // Update access order for existing cache
      if (detailsCache.value[txId]) {
        touchCache(txId!)
      }
      return
    }

    if (import.meta.env.DEV) {
      console.log('[DEBUG] loadDetails proceeding with txId:', txId)
    }
    loadingIds.value.push(txId!)

    // Evict LRU entry if cache is full
    evictLRU()

    try {
      const promises = []

      // 只為存在的關聯創建 promise
      if (transaction.relatedSubmissionId) {
        const pid = typeof projectId === 'string' ? projectId : projectId.value
        promises.push(
          rpcClient.submissions.details.$post({
            json: {
              projectId: pid || '',
              submissionId: transaction.relatedSubmissionId
            }
          }).then((httpResponse: any) => httpResponse.json()).then((r: any) => ({ type: 'submission', data: r }))
        )
      }

      if (transaction.relatedCommentId) {
        const pid = typeof projectId === 'string' ? projectId : projectId.value
        promises.push(
          rpcClient.comments.details.$post({
            json: {
              projectId: pid || '',
              commentId: transaction.relatedCommentId
            }
          }).then((httpResponse: any) => httpResponse.json()).then((r: any) => ({ type: 'comment', data: r }))
        )
      }

      if (promises.length === 0) {
        detailsCache.value[txId!] = {}
        return
      }

      const results = await Promise.allSettled(promises)
      const details: Record<string, any> = {}

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          const { type, data } = result.value

          if (data.success) {
            details[type] = data.data
          } else {
            details[`${type}Error`] = data.error?.message || '載入失敗'
          }
        } else if (result.status === 'rejected') {
          console.warn(`Failed to load transaction detail:`, result.reason)
        }
      })

      detailsCache.value[txId!] = details
      // Update LRU order
      touchCache(txId!)
    } catch (err) {
      console.error('Error loading transaction details:', err)
      detailsCache.value[txId!] = { error: getErrorMessage(err) }
      touchCache(txId!)
    } finally {
      loadingIds.value = loadingIds.value.filter(id => id !== txId)
    }
  }

  /**
   * 獲取交易詳情
   * @param {string} transactionId - 交易 ID
   */
  function getDetails(transactionId: string) {
    const details = detailsCache.value[transactionId] || null
    // Update LRU on access
    if (details) {
      touchCache(transactionId)
    }
    return details
  }

  /**
   * 檢查是否正在加載
   * @param {string} transactionId - 交易 ID
   */
  function isLoading(transactionId: string) {
    return loadingIds.value.includes(transactionId)
  }

  /**
   * 清理快取 - 用於組件卸載時防止記憶體洩漏
   */
  function clearCache() {
    detailsCache.value = {}
    cacheAccessOrder.value = []
    loadingIds.value = []
    if (import.meta.env.DEV) {
      console.log('[TransactionDetailsLoader] Cache cleared')
    }
  }

  return {
    loadDetails,
    getDetails,
    isLoading,
    clearCache
  }
}
