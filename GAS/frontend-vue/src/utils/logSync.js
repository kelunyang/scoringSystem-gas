/**
 * 前後端日誌同步工具
 * 確保前端console輸出與後端LOG_CONSOLE設定一致
 */

let consoleEnabled = true; // 預設狀態
let originalConsole = null;

/**
 * 備份原始console方法
 */
function backupConsole() {
  if (!originalConsole) {
    originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console)
    };
  }
}

/**
 * 從後端同步console設定
 */
export async function syncConsoleSettings() {
  try {
    // 備份原始console
    backupConsole();
    
    // 使用Google Apps Script的API調用方式
    const result = await new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.handleAPIRequest === 'function') {
        google.script.run
          .withSuccessHandler((response) => {
            // 確保response不是null或undefined
            if (response === null || response === undefined) {
              resolve({ success: true, data: { enabled: true } }); // 預設啟用
            } else {
              resolve(response);
            }
          })
          .withFailureHandler((error) => {
            // API調用失敗，使用預設設置
            resolve({ success: true, data: { enabled: true } });
          })
          .handleAPIRequest('GET', '/system/console-logging/status', {});
      } else {
        // 如果Google Apps Script不可用，假設是開發環境，保持console開啟
        resolve({ success: true, data: { enabled: true } });
      }
    });
    
    if (result && result.success) {
      consoleEnabled = result.data.enabled;
      applyConsolePolicy();
      
      // 使用force輸出來通知狀態（不受設定影響）
      if (consoleEnabled) {
        originalConsole.log('📊 Console輸出已與後端LOG_CONSOLE設定同步');
      } else {
        originalConsole.log('📕 Console logging: DISABLED (前後端同步)');
      }
    } else {
      // 後端API返回null或失敗，使用預設行為
      consoleEnabled = true;
      applyConsolePolicy();
      originalConsole.log('📊 Console輸出已與後端LOG_CONSOLE設定同步');
    }
  } catch (error) {
    // 同步失敗時保持預設行為
    originalConsole.error('⚠️ Failed to sync console settings with backend:', error);
    originalConsole.error('保持console輸出開啟作為預設行為');
  }
}

/**
 * 應用console政策
 */
function applyConsolePolicy() {
  if (consoleEnabled) {
    // 恢復原始console
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  } else {
    // 靜音console輸出
    const noop = () => {};
    console.log = noop;
    console.error = noop;
    console.warn = noop;
    console.info = noop;
    console.debug = noop;
  }
}

/**
 * 獲取當前console狀態
 */
export function getConsoleStatus() {
  return consoleEnabled;
}

/**
 * 強制輸出函數（不受LOG_CONSOLE影響）
 * 用於重要的系統訊息
 */
export const forceLog = (...args) => originalConsole?.log(...args);
export const forceError = (...args) => originalConsole?.error(...args);
export const forceWarn = (...args) => originalConsole?.warn(...args);

/**
 * 受控輸出函數（遵循LOG_CONSOLE設定）
 */
export const log = (...args) => consoleEnabled && originalConsole?.log(...args);
export const error = (...args) => consoleEnabled && originalConsole?.error(...args);
export const warn = (...args) => consoleEnabled && originalConsole?.warn(...args);

// 延遲初始化，等待Vue應用準備好
if (typeof window !== 'undefined') {
  // 等待DOM和Google Apps Script環境準備好
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(syncConsoleSettings, 1000); // 延遲1秒確保環境準備好
    });
  } else {
    setTimeout(syncConsoleSettings, 1000);
  }
}