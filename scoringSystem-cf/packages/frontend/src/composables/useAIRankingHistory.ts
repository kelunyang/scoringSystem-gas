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

import { ref, computed, watch, type Ref } from 'vue'
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

