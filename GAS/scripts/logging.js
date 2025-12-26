/**
 * @fileoverview 系統日誌管理模組
 * @module Logging
 */

// 日誌等級常數
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO', 
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL'
};

// 日誌等級優先級（數字越大等級越高）
const LOG_LEVEL_PRIORITY = {
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
};

// 日誌欄位常數
const LOG_COLUMNS = {
  TIMESTAMP: 0,      // 時間戳
  LEVEL: 1,          // 日誌等級
  FUNCTION_NAME: 2,  // 函數名稱
  USER_ID: 3,        // 用戶ID
  SESSION_ID: 4,     // 會話ID
  ACTION: 5,         // 操作描述
  DETAILS: 6,        // 詳細訊息
  REQUEST_DATA: 7,   // 請求數據
  RESPONSE_STATUS: 8, // 響應狀態
  EXECUTION_TIME: 9,  // 執行時間(ms)
  IP_ADDRESS: 10,     // IP地址
  USER_AGENT: 11      // 用戶代理
};

/**
 * 檢查日誌等級是否應該被記錄
 * @param {string} level 要檢查的日誌等級
 * @returns {boolean} 是否應該記錄該等級的日誌
 */
function shouldLogLevel(level) {
  try {
    // 從 PropertiesService 獲取設定的最低日誌等級
    const minLogLevel = PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') || 'INFO';
    
    // 獲取當前等級和最低等級的優先級
    const currentPriority = LOG_LEVEL_PRIORITY[level] || 0;
    const minPriority = LOG_LEVEL_PRIORITY[minLogLevel] || 2; // 預設 INFO
    
    // 只有等級優先級大於或等於最低等級才記錄
    return currentPriority >= minPriority;
  } catch (error) {
    // 如果讀取失敗，預設記錄所有等級
    console.error('Failed to read LOG_LEVEL property:', error.message);
    return true;
  }
}

/**
 * 獲取或創建日誌試算表
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} 日誌試算表
 */
function getLogSpreadsheet() {
  try {
    // 從PropertiesService獲取日誌試算表ID
    const properties = PropertiesService.getScriptProperties();
    let logSpreadsheetId = properties.getProperty('LOG_SPREADSHEET_ID');
    
    let logSpreadsheet;
    
    if (logSpreadsheetId) {
      try {
        logSpreadsheet = SpreadsheetApp.openById(logSpreadsheetId);
      } catch (error) {
        console.warn('無法打開現有日誌試算表，將創建新的:', error.toString());
        logSpreadsheet = null;
      }
    }
    
    // 如果沒有找到或無法打開，創建新的
    if (!logSpreadsheet) {
      const timestamp = new Date().toISOString().split('T')[0];
      logSpreadsheet = SpreadsheetApp.create(`系統日誌_${timestamp}`);
      
      // 保存新的試算表ID
      properties.setProperty('LOG_SPREADSHEET_ID', logSpreadsheet.getId());
      
      // 初始化日誌表結構
      initializeLogSheet(logSpreadsheet);
      
      console.log(`創建新日誌試算表: ${logSpreadsheet.getId()}`);
    }
    
    return logSpreadsheet;
  } catch (error) {
    console.error('獲取日誌試算表失敗:', error.toString());
    throw new Error('日誌系統初始化失敗');
  }
}

/**
 * 初始化日誌表結構
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet 日誌試算表
 */
function initializeLogSheet(spreadsheet) {
  const sheet = spreadsheet.getActiveSheet();
  sheet.setName('SystemLogs');
  
  // 設定表頭
  const headers = [
    '時間戳',
    '等級', 
    '函數名稱',
    '用戶ID',
    '會話ID', 
    '操作描述',
    '詳細訊息',
    '請求數據',
    '響應狀態',
    '執行時間(ms)',
    'IP地址',
    '用戶代理'
  ];
  
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  
  // 設定表頭樣式
  headerRange.setBackground('#2c3e50');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // 凍結表頭
  sheet.setFrozenRows(1);
  
  // 設定欄位寬度
  sheet.setColumnWidth(1, 180); // 時間戳
  sheet.setColumnWidth(2, 80);  // 等級
  sheet.setColumnWidth(3, 150); // 函數名稱
  sheet.setColumnWidth(4, 120); // 用戶ID
  sheet.setColumnWidth(5, 120); // 會話ID
  sheet.setColumnWidth(6, 200); // 操作描述
  sheet.setColumnWidth(7, 300); // 詳細訊息
  sheet.setColumnWidth(8, 200); // 請求數據
  sheet.setColumnWidth(9, 80);  // 響應狀態
  sheet.setColumnWidth(10, 100); // 執行時間
  sheet.setColumnWidth(11, 120); // IP地址
  sheet.setColumnWidth(12, 200); // 用戶代理
}

/**
 * 記錄日誌
 * @param {string} level 日誌等級
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function writeLog(level, functionName, action, options = {}) {
  try {
    // 檢查是否應該記錄該等級的日誌
    if (!shouldLogLevel(level)) {
      return; // 不記錄低於設定等級的日誌
    }
    
    const {
      userId = null,
      sessionId = null, 
      details = '',
      requestData = null,
      responseStatus = null,
      executionTime = null,
      ipAddress = null,
      userAgent = null
    } = options;
    
    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();
    
    // 準備日誌數據
    const logData = [
      new Date().toISOString(),
      level,
      functionName || 'Unknown',
      userId,
      sessionId,
      action,
      details,
      requestData ? JSON.stringify(requestData) : '',
      responseStatus,
      executionTime,
      ipAddress,
      userAgent
    ];
    
    // 添加到表格末尾
    sheet.appendRow(logData);
    
    // 根據等級設定顏色
    const lastRow = sheet.getLastRow();
    const levelCell = sheet.getRange(lastRow, LOG_COLUMNS.LEVEL + 1);
    
    switch(level) {
      case LOG_LEVELS.ERROR:
      case LOG_LEVELS.FATAL:
        levelCell.setBackground('#ffebee');
        levelCell.setFontColor('#c62828');
        break;
      case LOG_LEVELS.WARN:
        levelCell.setBackground('#fff3e0');
        levelCell.setFontColor('#ef6c00');
        break;
      case LOG_LEVELS.INFO:
        levelCell.setBackground('#e8f5e8');
        levelCell.setFontColor('#2e7d32');
        break;
      case LOG_LEVELS.DEBUG:
        levelCell.setBackground('#f3e5f5');
        levelCell.setFontColor('#7b1fa2');
        break;
    }
    
  } catch (error) {
    console.error('寫入日誌失敗:', error.toString());
    // 日誌系統失敗不應該影響主要功能
  }
}

/**
 * 記錄INFO等級日誌
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function logInfo(functionName, action, options = {}) {
  writeLog(LOG_LEVELS.INFO, functionName, action, options);
}

/**
 * 記錄WARN等級日誌
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function logWarn(functionName, action, options = {}) {
  writeLog(LOG_LEVELS.WARN, functionName, action, options);
}

/**
 * 記錄ERROR等級日誌
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function logError(functionName, action, options = {}) {
  writeLog(LOG_LEVELS.ERROR, functionName, action, options);
}

/**
 * 記錄DEBUG等級日誌
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function logDebug(functionName, action, options = {}) {
  writeLog(LOG_LEVELS.DEBUG, functionName, action, options);
}

/**
 * 記錄FATAL等級日誌
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function logFatal(functionName, action, options = {}) {
  writeLog(LOG_LEVELS.FATAL, functionName, action, options);
}

// ==================== 便利日誌函數 ====================

/**
 * 簡化的資訊日誌 - 替換 console.log
 * @param {string} message 日誌訊息
 * @param {Object} context 上下文資訊
 */
function log(message, context = {}) {
  // 根據 LOG_CONSOLE 參數決定是否輸出到 console
  if (shouldLogToConsole()) {
    console.log(message, context);
  }
  
  // 獲取調用函數名稱
  const functionName = getFunctionName() || 'unknown';
  
  logInfo(functionName, message, {
    details: JSON.stringify(context),
    ...context
  });
}

/**
 * 簡化的錯誤日誌 - 替換 console.error
 * @param {string} message 錯誤訊息
 * @param {Error|Object} errorOrContext 錯誤對象或上下文
 */
function logErr(message, errorOrContext = {}) {
  // 處理錯誤對象
  let error, context;
  if (errorOrContext instanceof Error) {
    error = errorOrContext;
    context = { 
      errorName: error.name,
      errorStack: error.stack 
    };
  } else {
    context = errorOrContext;
  }
  
  // 根據 LOG_CONSOLE 參數決定是否輸出到 console
  if (shouldLogToConsole()) {
    console.error(message, errorOrContext);
  }
  
  // 獲取調用函數名稱
  const functionName = getFunctionName() || 'unknown';
  
  logError(functionName, message, {
    details: error ? error.stack : JSON.stringify(context),
    responseStatus: 'error',
    ...context
  });
}

/**
 * 簡化的警告日誌 - 替換 console.warn
 * @param {string} message 警告訊息
 * @param {Object} context 上下文資訊
 */
function logWrn(message, context = {}) {
  // 根據 LOG_CONSOLE 參數決定是否輸出到 console
  if (shouldLogToConsole()) {
    console.warn(message, context);
  }
  
  // 獲取調用函數名稱
  const functionName = getFunctionName() || 'unknown';
  
  logWarn(functionName, message, {
    details: JSON.stringify(context),
    ...context
  });
}

/**
 * 強制寫入日誌 - 忽略 LOG_LEVEL 設定
 * 專門用於安全相關的日誌（登入失敗、可疑活動等）
 * @param {string} level 日誌等級
 * @param {string} functionName 函數名稱
 * @param {string} action 操作描述
 * @param {Object} options 選項參數
 */
function forceWriteLog(level, functionName, action, options = {}) {
  try {
    const {
      userId = null,
      sessionId = null,
      details = '',
      requestData = null,
      responseStatus = null,
      executionTime = null,
      ipAddress = null,
      userAgent = null
    } = options;

    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();

    // 準備日誌數據
    const logData = [
      new Date().toISOString(),
      level,
      functionName || 'Unknown',
      userId,
      sessionId,
      action,
      details,
      requestData ? JSON.stringify(requestData) : '',
      responseStatus,
      executionTime,
      ipAddress,
      userAgent
    ];

    // 添加到表格末尾
    sheet.appendRow(logData);

    // 根據等級設定顏色
    const lastRow = sheet.getLastRow();
    const levelCell = sheet.getRange(lastRow, LOG_COLUMNS.LEVEL + 1);

    switch(level) {
      case LOG_LEVELS.ERROR:
      case LOG_LEVELS.FATAL:
        levelCell.setBackground('#ffebee');
        levelCell.setFontColor('#c62828');
        break;
      case LOG_LEVELS.WARN:
        levelCell.setBackground('#fff3e0');
        levelCell.setFontColor('#ef6c00');
        break;
      case LOG_LEVELS.INFO:
        levelCell.setBackground('#e8f5e8');
        levelCell.setFontColor('#2e7d32');
        break;
      case LOG_LEVELS.DEBUG:
        levelCell.setBackground('#f3e5f5');
        levelCell.setFontColor('#7b1fa2');
        break;
    }

  } catch (error) {
    console.error('強制寫入日誌失敗:', error.toString());
    // 日誌系統失敗不應該影響主要功能
  }
}

/**
 * 強制記錄安全事件 - 用於登入嘗試、認證失敗等關鍵安全日誌
 * @param {string} message 日誌訊息
 * @param {Object} context 上下文資訊
 */
function logSecurityEvent(message, context = {}) {
  // 根據 LOG_CONSOLE 參數決定是否輸出到 console
  if (shouldLogToConsole()) {
    console.log('[SECURITY]', message, context);
  }

  // 獲取調用函數名稱
  const functionName = getFunctionName() || 'security_event';

  // 強制寫入，不受 LOG_LEVEL 限制
  forceWriteLog(LOG_LEVELS.WARN, functionName, message, {
    details: JSON.stringify(context),
    ipAddress: context.clientIP || context.ipAddress || null,
    userId: context.username || context.userEmail || null,
    ...context
  });
}

/**
 * API 函數執行日誌裝飾器
 * @param {string} apiName API 名稱
 * @param {Function} apiFunction 要執行的 API 函數
 * @param {Object} params 輸入參數
 * @returns {*} API 執行結果
 */
function logApiExecution(apiName, apiFunction, params = {}) {
  const startTime = Date.now();
  
  // 記錄 API 開始
  logInfo(apiName, 'API 調用開始', {
    requestData: JSON.stringify(params),
    userId: params.sessionId ? extractUserFromSession(params.sessionId) : null,
    sessionId: params.sessionId || null
  });
  
  try {
    // 執行 API
    const result = apiFunction(params);
    const executionTime = Date.now() - startTime;
    
    // 記錄成功結果
    logInfo(apiName, 'API 調用成功', {
      responseStatus: 'success',
      executionTime: executionTime,
      userId: params.sessionId ? extractUserFromSession(params.sessionId) : null,
      sessionId: params.sessionId || null,
      details: result && result.success ? '操作成功' : '操作完成但狀態未知'
    });
    
    return result;
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // 記錄錯誤
    logError(apiName, 'API 調用失敗', {
      responseStatus: 'error',
      executionTime: executionTime,
      details: error.stack || error.toString(),
      userId: params.sessionId ? extractUserFromSession(params.sessionId) : null,
      sessionId: params.sessionId || null
    });
    
    throw error;
  }
}

/**
 * 獲取調用函數的名稱（簡化版）
 * @returns {string} 函數名稱
 */
function getFunctionName() {
  try {
    const stack = new Error().stack;
    if (stack) {
      const lines = stack.split('\n');
      // 跳過當前函數和直接調用者，找到真正的調用者
      for (let i = 3; i < lines.length; i++) {
        const match = lines[i].match(/at\s+(\w+)/);
        if (match && match[1] !== 'getFunctionName') {
          return match[1];
        }
      }
    }
  } catch (e) {
    // 忽略錯誤，返回預設值
  }
  return 'unknown';
}

/**
 * 從 sessionId 提取用戶資訊（輔助函數）
 * @param {string} sessionId 會話ID
 * @returns {string|null} 用戶ID
 */
function extractUserFromSession(sessionId) {
  try {
    if (!sessionId) return null;
    
    // 使用新的 validateSession 函數來獲取會話資訊
    const sessionData = validateSession(sessionId);
    if (sessionData) {
      const userId = sessionData.userId || sessionData.userEmail;
      log('extractUserFromSession: Success', {
        sessionId: sessionId,
        userId: userId
      });
      return userId;
    }
    
    log('extractUserFromSession: Failed', {
      sessionId: sessionId,
      sessionData: sessionData
    });
    return null;
  } catch (error) {
    log('extractUserFromSession: Error', {
      sessionId: sessionId,
      error: error.message
    });
    return null;
  }
}

// ==================== 全域 Console 替換 ====================

/**
 * 全域替換 console 對象（可選）
 * 謹慎使用：這會影響所有現有的 console 輸出
 */
function replaceConsole() {
  // 備份原始 console
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };
  
  // 替換 console 方法
  console.log = function(message, ...args) {
    originalConsole.log(message, ...args);
    log(message, args.length > 0 ? { args: args } : {});
  };
  
  console.error = function(message, ...args) {
    originalConsole.error(message, ...args);
    logErr(message, args.length > 0 ? { args: args } : {});
  };
  
  console.warn = function(message, ...args) {
    originalConsole.warn(message, ...args);
    logWrn(message, args.length > 0 ? { args: args } : {});
  };
  
  console.info = console.log;  // info 映射到 log
  console.debug = console.log; // debug 映射到 log
  
  return originalConsole; // 返回備份，以防需要還原
}

// ==================== Console 控制機制 ====================

/**
 * 檢查是否應該輸出到 console
 * @returns {boolean} 是否輸出到 console
 */
function shouldLogToConsole() {
  try {
    // 從 PropertiesService 獲取 LOG_CONSOLE 設定
    const logConsole = PropertiesService.getScriptProperties().getProperty('LOG_CONSOLE');
    
    // 預設為 true (開發環境友善)，可設為 'false' 關閉
    if (logConsole === 'false' || logConsole === false) {
      return false;
    }
    
    return true; // 預設開啟
  } catch (error) {
    // 如果讀取失敗，預設開啟 console 輸出
    return true;
  }
}

/**
 * 動態設定 console 輸出控制
 * @param {boolean} enabled 是否啟用 console 輸出
 */
function setConsoleLogging(enabled) {
  try {
    PropertiesService.getScriptProperties().setProperty('LOG_CONSOLE', enabled.toString());
    console.log(`Console logging ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  } catch (error) {
    console.error('Failed to set console logging:', error.message);
    return false;
  }
}

/**
 * 獲取當前 console 輸出狀態
 * @returns {boolean} 當前狀態
 */
function getConsoleLoggingStatus() {
  return shouldLogToConsole();
}

/**
 * 設定系統日誌等級
 * @param {string} level 日誌等級 (DEBUG/INFO/WARN/ERROR/FATAL)
 * @returns {boolean} 設定是否成功
 */
function setLogLevel(level) {
  try {
    // 驗證等級是否有效
    if (!LOG_LEVELS[level]) {
      console.error('Invalid log level:', level);
      return false;
    }
    
    PropertiesService.getScriptProperties().setProperty('LOG_LEVEL', level);
    console.log(`Log level set to: ${level}`);
    return true;
  } catch (error) {
    console.error('Failed to set log level:', error.message);
    return false;
  }
}

/**
 * 獲取當前日誌等級設定
 * @returns {string} 當前日誌等級
 */
function getLogLevel() {
  try {
    return PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') || 'INFO';
  } catch (error) {
    console.error('Failed to get log level:', error.message);
    return 'INFO';
  }
}

/**
 * 測試日誌等級過濾功能
 */
function testLogLevels() {
  console.log('=== 測試日誌等級過濾功能 ===');
  console.log('當前日誌等級:', getLogLevel());
  
  // 測試各種等級的日誌
  logDebug('testLogLevels', '這是DEBUG等級日誌', { test: 'debug' });
  logInfo('testLogLevels', '這是INFO等級日誌', { test: 'info' });
  logWarn('testLogLevels', '這是WARN等級日誌', { test: 'warn' });
  logError('testLogLevels', '這是ERROR等級日誌', { test: 'error' });
  logFatal('testLogLevels', '這是FATAL等級日誌', { test: 'fatal' });
  
  console.log('測試完成，請檢查日誌記錄');
}

/**
 * 獲取系統日誌（用於前端查看）
 * @param {Object} options 查詢選項
 * @returns {Object} 日誌查詢結果
 */
function getSystemLogs(options = {}) {
  const startTime = Date.now();
  
  try {
    const {
      limit = 20,
      search = '',
      level = '',
      startDate = null,
      endDate = null
    } = options;
    
    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return {
        success: true,
        data: {
          logs: [],
          total: 0,
          hasMore: false
        }
      };
    }
    
    // 讀取所有數據（除表頭）
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 12);
    const allData = dataRange.getValues();
    
    // 過濾數據
    let filteredData = allData.filter(row => {
      // 文字搜尋過濾
      if (search) {
        const searchLower = search.toLowerCase();
        const searchFields = [
          row[LOG_COLUMNS.FUNCTION_NAME],
          row[LOG_COLUMNS.ACTION], 
          row[LOG_COLUMNS.DETAILS]
        ];
        
        const hasMatch = searchFields.some(field => 
          field && field.toString().toLowerCase().includes(searchLower)
        );
        
        if (!hasMatch) return false;
      }
      
      // 等級過濾
      if (level && row[LOG_COLUMNS.LEVEL] !== level) {
        return false;
      }
      
      // 日期過濾
      const logDate = new Date(row[LOG_COLUMNS.TIMESTAMP]);
      if (startDate && logDate < new Date(startDate)) {
        return false;
      }
      if (endDate && logDate > new Date(endDate)) {
        return false;
      }
      
      return true;
    });
    
    // 按時間倒序排列（最新在前）
    filteredData.sort((a, b) => {
      return new Date(b[LOG_COLUMNS.TIMESTAMP]) - new Date(a[LOG_COLUMNS.TIMESTAMP]);
    });
    
    const total = filteredData.length;
    const hasMore = total > limit;
    
    // 限制返回數量
    const limitedData = filteredData.slice(0, limit);
    
    // 轉換為前端格式
    const logs = limitedData.map(row => ({
      timestamp: row[LOG_COLUMNS.TIMESTAMP],
      level: row[LOG_COLUMNS.LEVEL],
      functionName: row[LOG_COLUMNS.FUNCTION_NAME],
      userId: row[LOG_COLUMNS.USER_ID],
      sessionId: row[LOG_COLUMNS.SESSION_ID],
      action: row[LOG_COLUMNS.ACTION],
      details: row[LOG_COLUMNS.DETAILS],
      requestData: row[LOG_COLUMNS.REQUEST_DATA],
      responseStatus: row[LOG_COLUMNS.RESPONSE_STATUS],
      executionTime: row[LOG_COLUMNS.EXECUTION_TIME],
      ipAddress: row[LOG_COLUMNS.IP_ADDRESS],
      userAgent: row[LOG_COLUMNS.USER_AGENT]
    }));
    
    const executionTime = Date.now() - startTime;
    
    logInfo('getSystemLogs', '獲取系統日誌', {
      details: `返回${logs.length}條日誌，總共${total}條`,
      executionTime: executionTime
    });
    
    return {
      success: true,
      data: {
        logs: logs,
        total: total,
        hasMore: hasMore
      }
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logError('getSystemLogs', '獲取系統日誌失敗', {
      details: error.toString(),
      executionTime: executionTime
    });
    
    return {
      success: false,
      error: {
        code: 'LOG_FETCH_ERROR',
        message: '獲取日誌失敗: ' + error.toString()
      }
    };
  }
}

/**
 * 清理舊日誌並創建新的日誌文件（定時執行函數）
 * @param {number} maxRows 日誌表最大行數，超過則歸檔
 * @returns {Object} 執行結果
 */
function archiveOldLogs(maxRows = 50000) {
  const startTime = Date.now();
  
  try {
    logInfo('archiveOldLogs', '開始日誌歸檔檢查', {
      details: `最大行數限制: ${maxRows}`
    });
    
    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();
    const currentRows = sheet.getLastRow();
    
    if (currentRows <= maxRows) {
      logInfo('archiveOldLogs', '日誌歸檔檢查完成', {
        details: `當前行數${currentRows}，未達到歸檔條件`,
        executionTime: Date.now() - startTime
      });
      
      return {
        success: true,
        data: {
          archived: false,
          currentRows: currentRows,
          message: `當前行數${currentRows}，未達到歸檔條件`
        }
      };
    }
    
    // 需要歸檔
    const timestamp = new Date().toISOString().split('T')[0];
    const oldSpreadsheetName = logSpreadsheet.getName();

    // 重命名當前試算表為歸檔名稱
    const archiveName = `${oldSpreadsheetName}_歷史檔案_${timestamp}`;
    logSpreadsheet.rename(archiveName);

    // 創建新的日誌試算表
    const newLogSpreadsheet = SpreadsheetApp.create(`系統日誌_${timestamp}`);
    const newLogSpreadsheetId = newLogSpreadsheet.getId();

    // 移動新試算表到資料庫文件夾
    const properties = PropertiesService.getScriptProperties();
    const databaseFolderId = properties.getProperty('DATABASE_FOLDER');
    if (databaseFolderId) {
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      DriveApp.getFileById(newLogSpreadsheetId).moveTo(databaseFolder);
    }

    // 更新PropertiesService中的ID
    properties.setProperty('LOG_SPREADSHEET_ID', newLogSpreadsheetId);

    // 初始化新的日誌表
    initializeLogSheet(newLogSpreadsheet);

    const endTime = new Date();
    const executionTime = Date.now() - startTime;

    // 記錄執行時間到 PropertiesService
    properties.setProperty('LAST_LOG_ARCHIVE', endTime.toISOString());

    // 在新日誌表中記錄歸檔事件
    logInfo('archiveOldLogs', '日誌歸檔完成', {
      details: `歸檔文件: ${archiveName}，原行數: ${currentRows}，新日誌表ID: ${newLogSpreadsheetId}`,
      executionTime: executionTime
    });
    
    return {
      success: true,
      data: {
        archived: true,
        oldRows: currentRows,
        oldSpreadsheetName: archiveName,
        newSpreadsheetId: newLogSpreadsheet.getId(),
        message: `成功歸檔${currentRows}行日誌，創建新日誌表`
      }
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logError('archiveOldLogs', '日誌歸檔失敗', {
      details: error.toString(),
      executionTime: executionTime
    });
    
    return {
      success: false,
      error: {
        code: 'LOG_ARCHIVE_ERROR',
        message: '日誌歸檔失敗: ' + error.toString()
      }
    };
  }
}

/**
 * 日誌統計資訊
 * @returns {Object} 統計結果
 */
function getLogStatistics() {
  const startTime = Date.now();
  
  try {
    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return {
        success: true,
        data: {
          totalLogs: 0,
          levelCounts: {},
          oldestLog: null,
          newestLog: null
        }
      };
    }
    
    // 讀取等級列數據
    const levelRange = sheet.getRange(2, LOG_COLUMNS.LEVEL + 1, lastRow - 1, 1);
    const levelData = levelRange.getValues().flat();
    
    // 統計各等級數量
    const levelCounts = {};
    levelData.forEach(level => {
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    });
    
    // 獲取最新和最舊的日誌時間
    const timestampRange = sheet.getRange(2, LOG_COLUMNS.TIMESTAMP + 1, lastRow - 1, 1);
    const timestampData = timestampRange.getValues().flat();
    
    const timestamps = timestampData.map(ts => new Date(ts)).filter(date => !isNaN(date));
    const oldestLog = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const newestLog = timestamps.length > 0 ? Math.max(...timestamps) : null;
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      data: {
        totalLogs: lastRow - 1,
        levelCounts: levelCounts,
        oldestLog: oldestLog ? new Date(oldestLog).toISOString() : null,
        newestLog: newestLog ? new Date(newestLog).toISOString() : null,
        spreadsheetId: logSpreadsheet.getId(),
        spreadsheetName: logSpreadsheet.getName(),
        executionTime: executionTime
      }
    };
    
  } catch (error) {
    logError('getLogStatistics', '獲取日誌統計失敗', {
      details: error.toString(),
      executionTime: Date.now() - startTime
    });
    
    return {
      success: false,
      error: {
        code: 'LOG_STATS_ERROR',
        message: '獲取日誌統計失敗: ' + error.toString()
      }
    };
  }
}

// 導出常數和函數供其他模組使用
// (在GAS中，這些將成為全域函數)