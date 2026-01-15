/**
 * 多用戶 localStorage 偏好設定管理工具（分散式存儲）
 *
 * 設計理念：
 * - 每個偏好屬性使用獨立的 localStorage key
 * - 每個 key 存儲 { userId: value } 的映射
 * - 避免單一大 JSON 的並發寫入問題
 * - 提升讀寫效能和容錯能力
 */

import type { ErrorLogEntry, NotificationEntry } from '@/types/utils'

// ============================================================================
// 類型定義
// ============================================================================

/**
 * 用戶偏好設定介面
 */
export interface UserPrefs {
  /** 自動刷新間隔（秒），範圍 600-3600 */
  refreshTimer?: number;
  /** 階段顯示模式：線性流程圖或甘特圖 */
  stageDisplayMode?: 'linear' | 'gantt';

  // 首次使用教學標誌
  /** Dashboard 首次使用教學是否已完成 */
  tutorialDashboardCompleted?: boolean;
  /** WalletNew 首次使用教學是否已完成 */
  tutorialWalletCompleted?: boolean;
  /** ProjectDetail 首次使用教學是否已完成 */
  tutorialProjectDetailCompleted?: boolean;

  // 通知設定
  /** 有未讀通知時是否自動開啟通知中心（預設開啟） */
  autoOpenNotificationCenter?: boolean;

  // 用戶日誌（用戶隔離）
  /** 錯誤日誌（最多 20 筆） */
  errorLog?: ErrorLogEntry[];
  /** 通知日誌（最多 50 筆） */
  notificationLog?: NotificationEntry[];

  // 管理頁面過濾器
  /** 系統日誌過濾器 */
  adminFilters_systemLogs?: Record<string, any>;
  /** 用戶管理過濾器 */
  adminFilters_userManagement?: Record<string, any>;
  /** 通知管理過濾器 */
  adminFilters_notificationManagement?: Record<string, any>;
  /** Email 記錄過濾器 */
  adminFilters_emailLogsManagement?: Record<string, any>;
  /** 全域群組管理過濾器 */
  adminFilters_globalGroupManagement?: Record<string, any>;
  /** 專案群組管理過濾器 */
  adminFilters_projectGroupManagement?: Record<string, any>;
  /** 事件日誌過濾器 */
  adminFilters_eventLogViewer?: Record<string, any>;
  /** 專案管理過濾器 */
  adminFilters_projectManagement?: Record<string, any>;
  /** AI 服務日誌過濾器 */
  adminFilters_aiServiceLogsManagement?: Record<string, any>;
}

/**
 * 預設用戶偏好
 */
export const DEFAULT_USER_PREFS: UserPrefs = {
  refreshTimer: 1800,        // 30 分鐘
  stageDisplayMode: 'linear', // 線性模式

  // 首次使用教學預設為未完成
  tutorialDashboardCompleted: false,
  tutorialWalletCompleted: false,
  tutorialProjectDetailCompleted: false,

  // 通知設定：預設開啟自動顯示
  autoOpenNotificationCenter: true
};

/**
 * localStorage key 前綴
 */
const PREF_KEY_PREFIX = 'userPref_';

/**
 * 偏好屬性的 localStorage key 映射
 */
const PREF_KEYS = {
  refreshTimer: `${PREF_KEY_PREFIX}refreshTimer`,
  stageDisplayMode: `${PREF_KEY_PREFIX}stageDisplayMode`,

  // 首次使用教學
  tutorialDashboardCompleted: `${PREF_KEY_PREFIX}tutorialDashboardCompleted`,
  tutorialWalletCompleted: `${PREF_KEY_PREFIX}tutorialWalletCompleted`,
  tutorialProjectDetailCompleted: `${PREF_KEY_PREFIX}tutorialProjectDetailCompleted`,

  // 通知設定
  autoOpenNotificationCenter: `${PREF_KEY_PREFIX}autoOpenNotificationCenter`,

  // 用戶日誌
  errorLog: `${PREF_KEY_PREFIX}errorLog`,
  notificationLog: `${PREF_KEY_PREFIX}notificationLog`,

  // 管理頁面過濾器
  adminFilters_systemLogs: `${PREF_KEY_PREFIX}adminFilters_systemLogs`,
  adminFilters_userManagement: `${PREF_KEY_PREFIX}adminFilters_userManagement`,
  adminFilters_notificationManagement: `${PREF_KEY_PREFIX}adminFilters_notificationManagement`,
  adminFilters_emailLogsManagement: `${PREF_KEY_PREFIX}adminFilters_emailLogsManagement`,
  adminFilters_globalGroupManagement: `${PREF_KEY_PREFIX}adminFilters_globalGroupManagement`,
  adminFilters_projectGroupManagement: `${PREF_KEY_PREFIX}adminFilters_projectGroupManagement`,
  adminFilters_eventLogViewer: `${PREF_KEY_PREFIX}adminFilters_eventLogViewer`,
  adminFilters_projectManagement: `${PREF_KEY_PREFIX}adminFilters_projectManagement`,
  adminFilters_aiServiceLogsManagement: `${PREF_KEY_PREFIX}adminFilters_aiServiceLogsManagement`
} as const;

// ============================================================================
// 快取層
// ============================================================================

/**
 * 偏好快取，減少 JSON 解析次數
 * 結構：{ key: { userId: value } }
 */
const prefsCache: Record<string, Record<string, any>> = {};

/**
 * 防抖計時器映射
 * 結構：{ key: timerId }
 */
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// ============================================================================
// 核心函數
// ============================================================================

/**
 * 安全讀取特定偏好屬性的所有用戶數據
 * @param key localStorage key
 * @returns 用戶 ID 到值的映射
 */
function safeLoadPrefKey(key: string): Record<string, any> {
  // 如果有快取，直接返回
  if (prefsCache[key]) {
    return prefsCache[key];
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      prefsCache[key] = {};
      return prefsCache[key];
    }

    const parsed = JSON.parse(raw);

    // 驗證格式是否為物件
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      prefsCache[key] = parsed;
      return prefsCache[key];
    }

    // 格式錯誤，重置
    console.warn(`Invalid format for ${key}, resetting`);
    prefsCache[key] = {};
    return prefsCache[key];

  } catch (e) {
    console.error(`Failed to parse ${key} from localStorage:`, e);
    prefsCache[key] = {};
    return prefsCache[key];
  }
}

/**
 * 防抖保存特定偏好屬性
 * @param key localStorage key
 * @param data 要保存的用戶映射數據
 * @param immediate 是否立即保存（跳過防抖）
 */
function debouncedSavePrefKey(
  key: string,
  data: Record<string, any>,
  immediate = false
): void {
  // 清除之前的計時器
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
  }

  // 實際保存函數
  const doSave = () => {
    try {
      const jsonString = JSON.stringify(data);
      localStorage.setItem(key, jsonString);
      prefsCache[key] = data;
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage:`, e);
    }
  };

  // 立即保存或延遲保存
  if (immediate) {
    doSave();
  } else {
    debounceTimers[key] = setTimeout(doSave, 500); // 500ms 防抖
  }
}

// ============================================================================
// 公開 API
// ============================================================================

/**
 * 讀取特定用戶的偏好設定
 * @param userId 用戶 ID (格式: usr_xxxxx)
 * @returns 該用戶的偏好設定（與預設值合併）
 */
export function getUserPreferences(userId: string): UserPrefs {
  const prefs: UserPrefs = { ...DEFAULT_USER_PREFS };

  // 讀取每個偏好屬性
  for (const [prefName, storageKey] of Object.entries(PREF_KEYS)) {
    const allUsersData = safeLoadPrefKey(storageKey);
    const userValue = allUsersData[userId];

    if (userValue !== undefined) {
      (prefs as any)[prefName] = userValue;
    }
  }

  return prefs;
}

/**
 * 設定特定用戶的單個偏好
 * @param userId 用戶 ID (格式: usr_xxxxx)
 * @param key 偏好欄位名稱
 * @param value 偏好值
 */
export function setUserPreference(
  userId: string,
  key: keyof UserPrefs,
  value: any
): void {
  const storageKey = PREF_KEYS[key];
  if (!storageKey) {
    console.error(`Unknown preference key: ${key}`);
    return;
  }

  // 讀取當前數據
  const allUsersData = safeLoadPrefKey(storageKey);

  // 更新特定用戶的值
  allUsersData[userId] = value;

  // 防抖保存
  debouncedSavePrefKey(storageKey, allUsersData);

  // 觸發變更事件（用於跨 Tab 同步）
  window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
    detail: { key, userId, value }
  }));
}

/**
 * 批量設定特定用戶的偏好
 * @param userId 用戶 ID (格式: usr_xxxxx)
 * @param prefs 要設定的偏好物件
 */
export function setUserPreferences(
  userId: string,
  prefs: Partial<UserPrefs>
): void {
  // 逐個設定偏好
  for (const [key, value] of Object.entries(prefs)) {
    if (value !== undefined) {
      setUserPreference(userId, key as keyof UserPrefs, value);
    }
  }
}

/**
 * 清除特定用戶的所有偏好設定
 * @param userId 用戶 ID (格式: usr_xxxxx)
 */
export function clearUserPreferences(userId: string): void {
  // 清除每個偏好屬性中的該用戶數據
  for (const storageKey of Object.values(PREF_KEYS)) {
    const allUsersData = safeLoadPrefKey(storageKey);
    delete allUsersData[userId];

    // 立即保存（不防抖）
    debouncedSavePrefKey(storageKey, allUsersData, true);
  }

  // 觸發變更事件
  window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
    detail: { userId, cleared: true }
  }));
}

/**
 * 清除所有用戶的偏好設定（危險操作，僅供測試/除錯使用）
 */
export function clearAllPreferences(): void {
  for (const storageKey of Object.values(PREF_KEYS)) {
    localStorage.removeItem(storageKey);
    delete prefsCache[storageKey];
  }

  window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
    detail: { clearedAll: true }
  }));
}

/**
 * 匯出所有偏好設定（用於備份或除錯）
 * @returns 偏好設定的 JSON 字串
 */
export function exportPreferences(): string {
  const allPrefs: Record<string, any> = {};

  for (const [prefName, storageKey] of Object.entries(PREF_KEYS)) {
    allPrefs[prefName] = safeLoadPrefKey(storageKey);
  }

  return JSON.stringify(allPrefs, null, 2);
}

/**
 * 匯入偏好設定（用於還原備份）
 * @param jsonString 偏好設定的 JSON 字串
 * @returns 是否成功匯入
 */
export function importPreferences(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);

    if (typeof parsed !== 'object' || parsed === null) {
      console.error('Invalid preferences format');
      return false;
    }

    // 匯入每個偏好屬性
    for (const [prefName, storageKey] of Object.entries(PREF_KEYS)) {
      const data = parsed[prefName];
      if (data && typeof data === 'object') {
        localStorage.setItem(storageKey, JSON.stringify(data));
        prefsCache[storageKey] = data;
      }
    }

    window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
      detail: { imported: true }
    }));

    return true;

  } catch (e) {
    console.error('Failed to import preferences:', e);
    return false;
  }
}

// ============================================================================
// 跨 Tab 同步
// ============================================================================

/**
 * 監聽其他 Tab 對 localStorage 的修改
 * 當其他 Tab 修改偏好設定時，清除快取並觸發自定義事件
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    // 檢查是否為偏好設定相關的 key
    const isPrefKey = Object.values(PREF_KEYS).some(key => e.key === key);

    if (isPrefKey && e.key) {
      // 清除該 key 的快取，下次讀取時會重新載入
      delete prefsCache[e.key];

      // 觸發自定義事件，讓其他組件知道偏好已更新
      window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
        detail: { storageEvent: e }
      }));
    }
  });
}
