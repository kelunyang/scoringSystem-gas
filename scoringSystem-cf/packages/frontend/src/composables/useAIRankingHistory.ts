/**
 * AI Ranking History Composable
 *
 * Manages AI ranking query history in localStorage with user isolation.
 * Each user's history is stored separately per stage and ranking type.
 *
 * Storage structure:
 * localStorage.userPref_aiRankingQueries = {
 *   [userId]: {
 *     [stageId]: {
 *       submission: AIQueryHistoryItem[],
 *       comment: AIQueryHistoryItem[]
 *     }
 *   }
 * }
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { useAuth } from './useAuth'
import type { AIQueryHistoryItem } from '@repo/shared'

/** localStorage key for AI ranking queries */
const STORAGE_KEY = 'userPref_aiRankingQueries'

/** Maximum number of history items per type */
const MAX_HISTORY_ITEMS = 10

/**
 * Storage structure for AI ranking queries
 */
interface AIRankingHistoryStorage {
  [userId: string]: {
    [stageId: string]: {
      submission: AIQueryHistoryItem[]
      comment: AIQueryHistoryItem[]
    }
  }
}

/**
 * Read entire storage from localStorage
 */
function readStorage(): AIRankingHistoryStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed
    }
    return {}
  } catch (e) {
    console.error('Failed to read AI ranking history from localStorage:', e)
    return {}
  }
}

/**
 * Write entire storage to localStorage
 */
function writeStorage(storage: AIRankingHistoryStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (e) {
    console.error('Failed to write AI ranking history to localStorage:', e)
  }
}

/**
 * Get history for a specific user/stage/type
 */
function getHistoryFromStorage(
  userId: string,
  stageId: string,
  rankingType: 'submission' | 'comment'
): AIQueryHistoryItem[] {
  const storage = readStorage()
  return storage[userId]?.[stageId]?.[rankingType] || []
}

/**
 * Set history for a specific user/stage/type
 */
function setHistoryToStorage(
  userId: string,
  stageId: string,
  rankingType: 'submission' | 'comment',
  history: AIQueryHistoryItem[]
): void {
  const storage = readStorage()

  // Ensure structure exists
  if (!storage[userId]) {
    storage[userId] = {}
  }
  if (!storage[userId][stageId]) {
    storage[userId][stageId] = { submission: [], comment: [] }
  }

  // Set history (limit to MAX_HISTORY_ITEMS)
  storage[userId][stageId][rankingType] = history.slice(0, MAX_HISTORY_ITEMS)

  writeStorage(storage)
}

/**
 * AI Ranking History Composable
 *
 * @param stageId - Stage ID (reactive ref)
 * @param rankingType - Ranking type: 'submission' or 'comment' (reactive ref)
 * @returns History management functions and reactive history array
 *
 * @example
 * ```typescript
 * const stageId = ref('stg_123')
 * const rankingType = ref<'submission' | 'comment'>('submission')
 *
 * const {
 *   history,
 *   addQueryResult,
 *   removeQueryResult,
 *   clearHistory
 * } = useAIRankingHistory(stageId, rankingType)
 *
 * // Add new result
 * addQueryResult({
 *   queryId: '123_abc',
 *   providerId: 'deepseek-v3',
 *   providerName: 'DeepSeek V3',
 *   model: 'deepseek-chat',
 *   reason: 'Based on content quality...',
 *   ranking: ['sub_1', 'sub_2', 'sub_3'],
 *   createdAt: Date.now(),
 *   itemCount: 3
 * })
 *
 * // Remove specific result
 * removeQueryResult('123_abc')
 *
 * // Clear all history for current stage/type
 * clearHistory()
 * ```
 */
export function useAIRankingHistory(
  stageId: Ref<string>,
  rankingType: Ref<'submission' | 'comment'>
) {
  const { userId } = useAuth()

  // Reactive history array
  const history = ref<AIQueryHistoryItem[]>([])

  /**
   * Load history from localStorage
   */
  function loadHistory(): void {
    const uid = userId.value
    const sid = stageId.value
    const type = rankingType.value

    if (!uid || !sid) {
      history.value = []
      return
    }

    history.value = getHistoryFromStorage(uid, sid, type)
  }

  /**
   * Save current history to localStorage
   */
  function saveHistory(): void {
    const uid = userId.value
    const sid = stageId.value
    const type = rankingType.value

    if (!uid || !sid) return

    setHistoryToStorage(uid, sid, type, history.value)
  }

  /**
   * Add a new query result to history
   * - Prepends to beginning of array (newest first)
   * - Limits to MAX_HISTORY_ITEMS
   */
  function addQueryResult(result: AIQueryHistoryItem): void {
    // Prepend new result
    history.value = [result, ...history.value].slice(0, MAX_HISTORY_ITEMS)
    saveHistory()
  }

  /**
   * Remove a query result by queryId
   */
  function removeQueryResult(queryId: string): void {
    history.value = history.value.filter(item => item.queryId !== queryId)
    saveHistory()
  }

  /**
   * Clear all history for current stage/type
   */
  function clearHistory(): void {
    history.value = []
    saveHistory()
  }

  /**
   * Get a specific query result by queryId
   */
  function getQueryById(queryId: string): AIQueryHistoryItem | undefined {
    return history.value.find(item => item.queryId === queryId)
  }

  // Watch for changes in stageId, rankingType, or userId and reload history
  watch(
    [userId, stageId, rankingType],
    () => {
      loadHistory()
    },
    { immediate: true }
  )

  // Computed: Whether history is empty
  const isEmpty = computed(() => history.value.length === 0)

  // Computed: Latest query result
  const latestQuery = computed(() => history.value[0] || null)

  return {
    // Reactive state
    history,
    isEmpty,
    latestQuery,

    // Methods
    addQueryResult,
    removeQueryResult,
    clearHistory,
    getQueryById,
    loadHistory
  }
}

/**
 * Get all AI ranking history for a user (across all stages)
 * Useful for admin/debugging purposes
 */
export function getAllAIRankingHistoryForUser(userId: string): {
  stageId: string
  rankingType: 'submission' | 'comment'
  items: AIQueryHistoryItem[]
}[] {
  const storage = readStorage()
  const userStorage = storage[userId]

  if (!userStorage) return []

  const result: {
    stageId: string
    rankingType: 'submission' | 'comment'
    items: AIQueryHistoryItem[]
  }[] = []

  for (const [stageId, stageData] of Object.entries(userStorage)) {
    if (stageData.submission && stageData.submission.length > 0) {
      result.push({
        stageId,
        rankingType: 'submission',
        items: stageData.submission
      })
    }
    if (stageData.comment && stageData.comment.length > 0) {
      result.push({
        stageId,
        rankingType: 'comment',
        items: stageData.comment
      })
    }
  }

  return result
}

/**
 * Clear all AI ranking history (for all users)
 * Use with caution - primarily for debugging
 */
export function clearAllAIRankingHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
