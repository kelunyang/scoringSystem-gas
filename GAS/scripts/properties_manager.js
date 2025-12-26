/**
 * @fileoverview PropertiesService 配置管理工具
 * @module PropertiesManager
 * 
 * 提供檢查和設定 PropertiesService 配置的功能
 * 確保所有必要配置項目都已正確設定
 */

/**
 * 所有必要的 PropertiesService 配置項目及其預設值
 * 根據實際程式碼使用情況整理
 */
const REQUIRED_PROPERTIES = {
  // === 核心資料庫配置 ===
  'DATABASE_FOLDER_ID': {
    required: true,
    default: null,
    description: '資料庫文件夾 ID (唯一需要手動設定的參數)',
    category: 'database',
    readonly: false
  },
  'GLOBAL_WORKBOOK_ID': {
    required: false,
    default: null,
    description: '全域活頁簿 ID (由 initSystem() 自動建立)',
    category: 'database',
    readonly: true,
    autoCreated: true
  },
  'LOG_SPREADSHEET_ID': {
    required: false,
    default: null,
    description: '日誌表格 ID (由 initSystem() 自動建立)',
    category: 'database',
    readonly: true,
    autoCreated: true
  },
  'NOTIFICATION_SPREADSHEET_ID': {
    required: false,
    default: null,
    description: '通知表格 ID (由 initSystem() 自動建立)',
    category: 'database',
    readonly: true,
    autoCreated: true
  },
  'TWOFACTOR_SHEET_ID': {
    required: false,
    default: null,
    description: '雙因素認證表格 ID (選填)',
    category: 'database',
    readonly: false
  },

  // === 認證系統配置 ===
  'SESSION_TIMEOUT': {
    required: false,
    default: '86400000',
    description: 'Session 有效時間 (毫秒，預設24小時)',
    category: 'auth',
    readonly: false,
    inputType: 'timeout'
  },
  'PASSWORD_SALT_ROUNDS': {
    required: false,
    default: '10',
    description: '密碼雜湊迭代次數 (預設10，安全性和性能的平衡)',
    category: 'auth',
    readonly: false,
    inputType: 'number'
  },

  // === 邀請系統配置 ===
  'MAX_INVITES_PER_DAY': {
    required: false,
    default: '50',
    description: '每日最大邀請碼數量',
    category: 'invitation',
    readonly: false,
    inputType: 'number'
  },
  'INVITE_CODE_TIMEOUT': {
    required: false,
    default: '604800000',
    description: '邀請碼有效期限 (毫秒，預設7天)',
    category: 'invitation',
    readonly: false,
    inputType: 'timeout'
  },
  'WEB_APP_URL': {
    required: false,
    default: null,
    description: 'Web App URL (用於邀請碼郵件連結)',
    category: 'invitation',
    readonly: false,
    inputType: 'text'
  },

  // === 安全驗證配置 ===
  'TURNSTILE_SITE_KEY': {
    required: false,
    default: null,
    description: 'Cloudflare Turnstile Site Key (公開密鑰，前端使用)',
    category: 'security',
    readonly: false,
    inputType: 'text'
  },
  'TURNSTILE_SECRET_KEY': {
    required: false,
    default: null,
    description: 'Cloudflare Turnstile Secret Key (私密密鑰，後端驗證)',
    category: 'security',
    readonly: false,
    inputType: 'password'
  },
  'TURNSTILE_ENABLED': {
    required: false,
    default: 'false',
    description: '是否啟用 Turnstile 驗證 (true/false)',
    category: 'security',
    readonly: false,
    inputType: 'boolean'
  },

  // === 日誌系統配置 ===
  'LOG_CONSOLE': {
    required: false,
    default: 'true',
    description: '是否輸出日誌到 Console (true/false)',
    category: 'logging',
    readonly: false,
    inputType: 'boolean'
  },
  'LOG_LEVEL': {
    required: false,
    default: 'INFO',
    description: '最低日誌記錄等級 (DEBUG/INFO/WARN/ERROR/FATAL)',
    category: 'logging',
    readonly: false,
    inputType: 'select',
    options: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
  },

  // === 業務邏輯限制 ===
  'MAX_PROJECT_NAME_LENGTH': {
    required: false,
    default: '100',
    description: '專案名稱最大長度',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },
  'MAX_CONCURRENT_PROJECTS': {
    required: false,
    default: '5',
    description: '同時進行的專案數量限制',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },
  'MAX_GROUP_NAME_LENGTH': {
    required: false,
    default: '50',
    description: '群組名稱最大長度',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },
  'MAX_GROUPS_PER_PROJECT': {
    required: false,
    default: '20',
    description: '每個專案最大群組數',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },
  'MAX_MEMBERS_PER_GROUP': {
    required: false,
    default: '10',
    description: '每個群組最大成員數',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },
  'MAX_STAGE_DURATION_DAYS': {
    required: false,
    default: '30',
    description: '每個階段最大天數',
    category: 'limits',
    readonly: false,
    inputType: 'number'
  },

  // === 系統狀態監控 (唯讀，由系統自動更新) ===
  'LAST_CLEANUP': {
    required: false,
    default: null,
    description: '上次每日清理執行時間 (ISO 8601 timestamp)',
    category: 'status',
    readonly: true
  },
  'LAST_NOTIFICATION_PATROL': {
    required: false,
    default: null,
    description: '上次通知巡檢執行時間 (ISO 8601 timestamp)',
    category: 'status',
    readonly: true
  },
  'LAST_LOG_ARCHIVE': {
    required: false,
    default: null,
    description: '上次日誌歸檔執行時間 (ISO 8601 timestamp)',
    category: 'status',
    readonly: true
  }
};

/**
 * 檢查 PropertiesService 配置完整性 + Global Workbook 結構
 * @returns {Object} 檢查結果
 */
function checkPropertiesServiceConfiguration() {
  console.log('=== PropertiesService 配置檢查開始 ===');
  
  const properties = PropertiesService.getScriptProperties();
  const results = {
    success: true,
    missing: [],
    existing: [],
    errors: [],
    systemStatus: {},
    globalWorkbook: {
      accessible: false,
      worksheets: {},
      issues: []
    },
    summary: {}
  };
  
  try {
    // 檢查所有必要配置項目
    for (const [key, config] of Object.entries(REQUIRED_PROPERTIES)) {
      const value = properties.getProperty(key);
      
      if (!value) {
        if (config.required) {
          results.missing.push({
            key: key,
            required: true,
            default: config.default,
            description: config.description
          });
          results.success = false;
        } else {
          results.missing.push({
            key: key,
            required: false,
            default: config.default,
            description: config.description
          });
        }
      } else {
        results.existing.push({
          key: key,
          value: value,
          description: config.description
        });
      }
    }

    // 檢查動態配置 (JSON格式)
    const invitations = properties.getProperty('INVITATIONS');
    results.systemStatus['INVITATIONS'] = invitations ? 'SET (JSON)' : 'NOT_SET';
    
    // 檢查 Global Workbook 結構
    const globalWorkbookId = properties.getProperty('GLOBAL_WORKBOOK_ID');
    if (globalWorkbookId) {
      results.globalWorkbook = validateGlobalWorkbookStructure(globalWorkbookId);
      if (!results.globalWorkbook.accessible || results.globalWorkbook.issues.length > 0) {
        results.success = false;
      }
    } else {
      results.globalWorkbook.issues.push('GLOBAL_WORKBOOK_ID 未設定，無法檢查工作簿結構');
      results.success = false;
    }
    
    // 生成統計摘要
    results.summary = {
      totalRequired: Object.keys(REQUIRED_PROPERTIES).length,
      existingCount: results.existing.length,
      missingCount: results.missing.length,
      missingRequiredCount: results.missing.filter(item => item.required).length
    };

    // 輸出詳細報告
    console.log('📊 配置統計:');
    console.log('  - 總配置項目: ' + results.summary.totalRequired);
    console.log('  - 已設定: ' + results.summary.existingCount);
    console.log('  - 缺少: ' + results.summary.missingCount);
    console.log('  - 缺少必要項目: ' + results.summary.missingRequiredCount);
    
    if (results.existing.length > 0) {
      console.log('\n✅ 已設定的配置項目:');
      results.existing.forEach(item => {
        console.log('  - ' + item.key + ': "' + item.value + '"');
      });
    }
    
    if (results.missing.length > 0) {
      console.log('\n❌ 缺少的配置項目:');
      results.missing.forEach(item => {
        const status = item.required ? '[必要]' : '[選用]';
        console.log('  ' + status + ' ' + item.key + ': ' + item.description);
        if (item.default) {
          console.log('    預設值: "' + item.default + '"');
        }
      });
    }
    
    console.log('\n🔧 系統狀態:');
    for (const [key, value] of Object.entries(results.systemStatus)) {
      console.log('  - ' + key + ': ' + value);
    }
    
    // 顯示 Global Workbook 檢查結果
    console.log('\n📊 Global Workbook 結構檢查:');
    if (results.globalWorkbook.accessible) {
      console.log('  ✅ Global Workbook 可存取');
      
      const worksheetNames = Object.keys(results.globalWorkbook.worksheets);
      const validWorksheets = worksheetNames.filter(name => 
        results.globalWorkbook.worksheets[name].exists && results.globalWorkbook.worksheets[name].headersValid
      );
      
      console.log('  📋 工作表狀態: ' + validWorksheets.length + '/' + worksheetNames.length + ' 正常');
      
      for (const [sheetName, info] of Object.entries(results.globalWorkbook.worksheets)) {
        const status = info.exists && info.headersValid ? '✅' : '❌';
        console.log('    ' + status + ' ' + sheetName + ': ' + (info.exists ? '存在' : '不存在'));
        
        if (info.exists && !info.headersValid) {
          console.log('      預期欄位: [' + info.expectedHeaders.join(', ') + ']');
          console.log('      實際欄位: [' + info.actualHeaders.join(', ') + ']');
        }
      }
      
      if (results.globalWorkbook.issues.length > 0) {
        console.log('  ⚠️ 發現的問題:');
        results.globalWorkbook.issues.forEach(issue => {
          console.log('    - ' + issue);
        });
      }
    } else {
      console.log('  ❌ Global Workbook 無法存取');
      results.globalWorkbook.issues.forEach(issue => {
        console.log('    - ' + issue);
      });
    }
    
    if (results.success) {
      console.log('\n🎉 所有必要配置項目都已設定！');
    } else {
      console.log('\n⚠️ 發現 ' + results.summary.missingRequiredCount + ' 個缺少的必要配置項目');
      console.log('請執行 setupMissingProperties() 來補齊缺少的配置');
    }
    
  } catch (error) {
    results.success = false;
    results.errors.push(error.toString());
    console.error('❌ 檢查過程中發生錯誤:', error);
  }
  
  console.log('=== PropertiesService 配置檢查完成 ===');
  return results;
}

/**
 * 設定缺少的 PropertiesService 配置項目
 * @param {boolean} forceDefaults - 是否強制使用預設值覆蓋現有值
 * @returns {Object} 設定結果
 */
function setupMissingProperties(forceDefaults) {
  console.log('=== PropertiesService 配置設定開始 ===');
  
  // 先檢查當前狀態
  const checkResults = checkPropertiesServiceConfiguration();
  
  if (checkResults.missing.length === 0 && !forceDefaults) {
    console.log('✅ 所有配置項目都已設定，無需設定');
    return {
      success: true,
      message: '所有配置項目都已設定',
      updated: []
    };
  }
  
  const properties = PropertiesService.getScriptProperties();
  const results = {
    success: true,
    updated: [],
    skipped: [],
    errors: []
  };
  
  try {
    // 需要手動設定的項目
    const manualSetupRequired = [];
    
    // 設定預設值
    const toUpdate = {};
    
    for (const missingItem of checkResults.missing) {
      const key = missingItem.key;
      const config = REQUIRED_PROPERTIES[key];
      
      if (config.default === null) {
        // 必須手動設定的項目
        manualSetupRequired.push(missingItem);
        continue;
      }
      
      // 檢查是否已存在值
      const existingValue = properties.getProperty(key);
      if (existingValue && !forceDefaults) {
        results.skipped.push({
          key: key,
          value: existingValue,
          reason: '已存在值，跳過設定'
        });
        continue;
      }
      
      // 準備更新
      toUpdate[key] = config.default;
      results.updated.push({
        key: key,
        value: config.default,
        description: config.description,
        action: existingValue ? '覆蓋' : '新增'
      });
    }
    
    // 執行批量更新
    if (Object.keys(toUpdate).length > 0) {
      properties.setProperties(toUpdate);
      console.log('✅ 已設定 ' + Object.keys(toUpdate).length + ' 個配置項目:');
      for (const [key, value] of Object.entries(toUpdate)) {
        console.log('  - ' + key + ': "' + value + '"');
      }
    }
    
    // 顯示跳過的項目
    if (results.skipped.length > 0) {
      console.log('⏭️ 跳過 ' + results.skipped.length + ' 個已存在的配置項目:');
      results.skipped.forEach(item => {
        console.log('  - ' + item.key + ': "' + item.value + '" (' + item.reason + ')');
      });
    }
    
    // 顯示需要手動設定的項目
    if (manualSetupRequired.length > 0) {
      console.log('\n⚠️ 以下 ' + manualSetupRequired.length + ' 個配置項目需要手動設定:');
      manualSetupRequired.forEach(item => {
        console.log('  - ' + item.key + ': ' + item.description);
      });
      console.log('\n請在 Google Apps Script 編輯器中手動設定這些值:');
      console.log('1. 點選左側選單的「設定」(齒輪圖示)');
      console.log('2. 在「指令碼屬性」區域點選「新增指令碼屬性」');
      console.log('3. 依照上述清單逐一添加屬性');
    }
    
    console.log('\n📊 設定結果統計:');
    console.log('  - 已更新: ' + results.updated.length + ' 個');
    console.log('  - 已跳過: ' + results.skipped.length + ' 個');
    console.log('  - 需手動設定: ' + manualSetupRequired.length + ' 個');
    
  } catch (error) {
    results.success = false;
    results.errors.push(error.toString());
    console.error('❌ 設定過程中發生錯誤:', error);
  }
  
  console.log('=== PropertiesService 配置設定完成 ===');
  return results;
}

/**
 * 顯示所有 PropertiesService 配置項目 (除了動態 session keys)
 */
function listAllProperties() {
  console.log('=== PropertiesService 所有配置項目 ===');
  
  const properties = PropertiesService.getScriptProperties();
  const allProps = properties.getProperties();
  
  // 分類顯示
  const categories = {
    core: [],
    auth: [],
    invitation: [],
    limits: [],
    system: [],
    maintenance: [],
    dynamic: []
  };
  
  for (const [key, value] of Object.entries(allProps)) {
    const item = { key, value };
    
    if (key.startsWith('session_')) {
      categories.dynamic.push(item);
    } else if (key.startsWith('inv_') || key.startsWith('rst_')) {
      categories.dynamic.push(item);
    } else if (key.includes('DATABASE') || key.includes('WORKBOOK')) {
      categories.core.push(item);
    } else if (key.includes('SESSION') || key.includes('PASSWORD')) {
      categories.auth.push(item);
    } else if (key.includes('INVITE')) {
      categories.invitation.push(item);
    } else if (key.includes('MAX_')) {
      categories.limits.push(item);
    } else if (key.includes('SYSTEM') || key.includes('ADMIN') || key.includes('INITIALIZATION')) {
      categories.system.push(item);
    } else if (key.includes('LAST_') || key.includes('CLEANUP') || key.includes('MAINTENANCE')) {
      categories.maintenance.push(item);
    } else {
      categories.system.push(item);
    }
  }
  
  const categoryNames = {
    core: '📁 核心資料庫配置',
    auth: '🔐 認證系統配置', 
    invitation: '📧 邀請系統配置',
    limits: '⚖️ 業務邏輯限制',
    system: '🔧 系統狀態配置',
    maintenance: '🔄 系統維護配置',
    dynamic: '⚡ 動態配置 (部分顯示)'
  };
  
  let totalCount = 0;
  for (const [categoryKey, categoryName] of Object.entries(categoryNames)) {
    const items = categories[categoryKey];
    if (items.length > 0) {
      console.log('\n' + categoryName + ':');
      
      if (categoryKey === 'dynamic') {
        // 動態配置只顯示統計，不顯示詳細內容
        const sessionCount = items.filter(item => item.key.startsWith('session_')).length;
        const inviteCount = items.filter(item => item.key.startsWith('inv_')).length;
        const resetCount = items.filter(item => item.key.startsWith('rst_')).length;
        const otherCount = items.length - sessionCount - inviteCount - resetCount;
        
        console.log('  - Session keys: ' + sessionCount + ' 個');
        console.log('  - Invite cache keys: ' + inviteCount + ' 個');
        console.log('  - Reset token keys: ' + resetCount + ' 個');
        if (otherCount > 0) {
          console.log('  - Other dynamic keys: ' + otherCount + ' 個');
        }
      } else {
        items.forEach(item => {
          console.log('  - ' + item.key + ': "' + item.value + '"');
        });
      }
      
      totalCount += items.length;
    }
  }
  
  console.log('\n📊 總計: ' + totalCount + ' 個配置項目');
  console.log('=== 配置項目列表完成 ===');
  
  return allProps;
}

/**
 * 清理過期的動態配置項目 (session, invite cache, reset tokens)
 * @returns {Object} 清理結果
 */
function cleanupExpiredDynamicProperties() {
  console.log('=== 清理過期動態配置開始 ===');
  
  const properties = PropertiesService.getScriptProperties();
  const allProps = properties.getProperties();
  
  const results = {
    success: true,
    cleaned: [],
    errors: []
  };
  
  const now = Date.now();
  const sessionTimeout = parseInt(properties.getProperty('SESSION_TIMEOUT') || '86400000'); // 24小時
  const inviteTimeout = parseInt(properties.getProperty('INVITE_CODE_TIMEOUT') || '604800000'); // 7天
  
  try {
    for (const [key, value] of Object.entries(allProps)) {
      let shouldDelete = false;
      
      if (key.startsWith('session_')) {
        // 檢查 session 是否過期
        try {
          const sessionData = JSON.parse(value);
          const loginTime = parseInt(sessionData.loginTime || 0);
          if (now - loginTime > sessionTimeout) {
            shouldDelete = true;
          }
        } catch (e) {
          // JSON 解析失敗，清理掉
          shouldDelete = true;
        }
      } else if (key.startsWith('inv_') || key.startsWith('rst_')) {
        // 簡單的時間戳檢查 (假設這些 key 包含時間戳資訊)
        // 實際實作可能需要根據具體資料結構調整
        shouldDelete = true; // 暫時清理所有快取
      }
      
      if (shouldDelete) {
        properties.deleteProperty(key);
        results.cleaned.push(key);
      }
    }
    
    console.log('✅ 已清理 ' + results.cleaned.length + ' 個過期配置項目');
    if (results.cleaned.length > 0) {
      console.log('清理的項目:');
      results.cleaned.forEach(key => {
        console.log('  - ' + key);
      });
    }
    
  } catch (error) {
    results.success = false;
    results.errors.push(error.toString());
    console.error('❌ 清理過程中發生錯誤:', error);
  }
  
  console.log('=== 清理過期動態配置完成 ===');
  return results;
}

/**
 * 獲取 Global Workbook 結構定義 (避免與 database.js 中的常數衝突)
 * @returns {Object} Global Workbook 模板定義
 */
function getGlobalWorkbookTemplates() {
  return {
    Projects: [
      'projectId', 'projectName', 'description', 'totalStages', 
      'currentStage', 'status', 'createdBy', 'createdTime', 
      'lastModified', 'workbookId'
    ],
    
    Users: [
      'userId', 'username', 'password', 'userEmail', 'displayName', 
      'registrationTime', 'lastLoginTime', 'status', 'preferences'
    ],
    
    SystemConfigs: [
      'configKey', 'configValue', 'description', 'category', 
      'lastModified'
    ]
  };
}

/**
 * 驗證 Global Workbook 結構完整性
 * @param {string} workbookId - Global Workbook 的 ID
 * @returns {Object} 驗證結果
 */
function validateGlobalWorkbookStructure(workbookId) {
  const TEMPLATES = getGlobalWorkbookTemplates();
  const results = {
    accessible: false,
    workbookId: workbookId,
    worksheets: {},
    issues: [],
    summary: {
      totalWorksheets: Object.keys(TEMPLATES).length,
      existingWorksheets: 0,
      validWorksheets: 0,
      missingWorksheets: 0,
      invalidWorksheets: 0
    }
  };
  
  try {
    // 嘗試開啟 Global Workbook
    let workbook;
    try {
      workbook = SpreadsheetApp.openById(workbookId);
      results.accessible = true;
    } catch (error) {
      results.issues.push('無法開啟 Global Workbook (ID: ' + workbookId + '): ' + error.message);
      return results;
    }
    
    // 檢查每個必要的工作表
    for (const [sheetName, expectedHeaders] of Object.entries(TEMPLATES)) {
      const sheetInfo = {
        exists: false,
        headersValid: false,
        expectedHeaders: expectedHeaders,
        actualHeaders: [],
        columnCount: 0,
        rowCount: 0
      };
      
      try {
        const sheet = workbook.getSheetByName(sheetName);
        
        if (!sheet) {
          results.issues.push('缺少工作表: ' + sheetName);
          results.summary.missingWorksheets++;
        } else {
          sheetInfo.exists = true;
          results.summary.existingWorksheets++;
          
          // 檢查欄位標題
          const lastColumn = sheet.getLastColumn();
          const lastRow = sheet.getLastRow();
          
          sheetInfo.columnCount = lastColumn;
          sheetInfo.rowCount = lastRow;
          
          if (lastColumn > 0 && lastRow > 0) {
            const actualHeaders = sheet.getRange(1, 1, 1, Math.max(lastColumn, expectedHeaders.length)).getValues()[0];
            sheetInfo.actualHeaders = actualHeaders.slice(0, expectedHeaders.length);
            
            // 檢查欄位是否完全匹配
            const headersMatch = expectedHeaders.every((expectedHeader, index) => {
              return sheetInfo.actualHeaders[index] === expectedHeader;
            });
            
            sheetInfo.headersValid = headersMatch;
            
            if (headersMatch) {
              results.summary.validWorksheets++;
            } else {
              results.summary.invalidWorksheets++;
              results.issues.push('工作表 ' + sheetName + ' 的欄位標題不符合預期');
              
              // 詳細比對欄位差異
              const differences = [];
              expectedHeaders.forEach((expected, index) => {
                const actual = sheetInfo.actualHeaders[index];
                if (actual !== expected) {
                  differences.push('第' + (index + 1) + '欄: 預期"' + expected + '", 實際"' + actual + '"');
                }
              });
              
              if (differences.length > 0) {
                results.issues.push(sheetName + ' 欄位差異: ' + differences.join(', '));
              }
            }
            
            // 檢查是否有額外的欄位
            if (lastColumn > expectedHeaders.length) {
              const extraHeaders = actualHeaders.slice(expectedHeaders.length);
              results.issues.push('工作表 ' + sheetName + ' 有額外的欄位: [' + extraHeaders.join(', ') + ']');
            }
          } else {
            results.issues.push('工作表 ' + sheetName + ' 是空的或沒有標題行');
            results.summary.invalidWorksheets++;
          }
        }
        
      } catch (error) {
        results.issues.push('檢查工作表 ' + sheetName + ' 時發生錯誤: ' + error.message);
        results.summary.invalidWorksheets++;
      }
      
      results.worksheets[sheetName] = sheetInfo;
    }
    
    // 檢查是否有多餘的工作表
    const allSheets = workbook.getSheets();
    const expectedSheetNames = Object.keys(TEMPLATES);
    const extraSheets = allSheets.filter(sheet => 
      !expectedSheetNames.includes(sheet.getName())
    );
    
    if (extraSheets.length > 0) {
      const extraSheetNames = extraSheets.map(sheet => sheet.getName());
      results.issues.push('發現額外的工作表: [' + extraSheetNames.join(', ') + ']');
    }
    
  } catch (error) {
    results.accessible = false;
    results.issues.push('Global Workbook 結構檢查失敗: ' + error.message);
  }
  
  return results;
}

/**
 * 修復 Global Workbook 結構
 * @param {string} workbookId - Global Workbook 的 ID
 * @param {boolean} createMissing - 是否創建缺少的工作表
 * @param {boolean} fixHeaders - 是否修復錯誤的欄位標題
 * @returns {Object} 修復結果
 */
function repairGlobalWorkbookStructure(workbookId, createMissing, fixHeaders) {
  console.log('=== Global Workbook 結構修復開始 ===');
  
  const TEMPLATES = getGlobalWorkbookTemplates();
  const results = {
    success: true,
    created: [],
    fixed: [],
    errors: []
  };
  
  // 先檢查當前結構
  const validation = validateGlobalWorkbookStructure(workbookId);
  
  if (!validation.accessible) {
    results.success = false;
    results.errors.push('Global Workbook 無法存取，無法進行修復');
    return results;
  }
  
  try {
    const workbook = SpreadsheetApp.openById(workbookId);
    
    // 創建缺少的工作表
    if (createMissing) {
      for (const [sheetName, expectedHeaders] of Object.entries(TEMPLATES)) {
        const sheetInfo = validation.worksheets[sheetName];
        
        if (!sheetInfo.exists) {
          try {
            const newSheet = workbook.insertSheet(sheetName);
            
            // 設定欄位標題
            if (expectedHeaders.length > 0) {
              newSheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
              
              // 設定標題行格式
              const headerRange = newSheet.getRange(1, 1, 1, expectedHeaders.length);
              headerRange.setFontWeight('bold');
              headerRange.setBackground('#f0f0f0');
              
              // 設定欄寬
              expectedHeaders.forEach((header, index) => {
                const columnWidth = getColumnWidth(header);
                newSheet.setColumnWidth(index + 1, columnWidth);
              });
            }
            
            results.created.push(sheetName);
            console.log('✅ 已創建工作表: ' + sheetName);
            
          } catch (error) {
            results.errors.push('創建工作表 ' + sheetName + ' 失敗: ' + error.message);
            results.success = false;
          }
        }
      }
    }
    
    // 修復欄位標題
    if (fixHeaders) {
      for (const [sheetName, expectedHeaders] of Object.entries(TEMPLATES)) {
        const sheetInfo = validation.worksheets[sheetName];
        
        if (sheetInfo.exists && !sheetInfo.headersValid) {
          try {
            const sheet = workbook.getSheetByName(sheetName);
            
            // 重設標題行
            sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
            
            // 重新格式化標題行
            const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#f0f0f0');
            
            results.fixed.push(sheetName);
            console.log('🔧 已修復工作表標題: ' + sheetName);
            
          } catch (error) {
            results.errors.push('修復工作表 ' + sheetName + ' 標題失敗: ' + error.message);
            results.success = false;
          }
        }
      }
    }
    
    console.log('📊 修復結果統計:');
    console.log('  - 已創建工作表: ' + results.created.length + ' 個');
    console.log('  - 已修復標題: ' + results.fixed.length + ' 個');
    console.log('  - 發生錯誤: ' + results.errors.length + ' 個');
    
    if (results.errors.length > 0) {
      console.log('❌ 錯誤詳情:');
      results.errors.forEach(error => {
        console.log('  - ' + error);
      });
    }
    
  } catch (error) {
    results.success = false;
    results.errors.push('修復過程中發生錯誤: ' + error.message);
    console.error('❌ 修復失敗:', error);
  }
  
  console.log('=== Global Workbook 結構修復完成 ===');
  return results;
}

/**
 * 根據欄位名稱決定欄寬
 * @param {string} headerName - 欄位名稱
 * @returns {number} 建議的欄寬 (像素)
 */
function getColumnWidth(headerName) {
  // 根據欄位類型設定適當的欄寬
  if (headerName.includes('Id') || headerName.includes('ID')) {
    return 150; // UUID 類型
  } else if (headerName.includes('Email')) {
    return 200; // Email 地址
  } else if (headerName.includes('Time') || headerName.includes('Date')) {
    return 150; // 時間戳
  } else if (headerName.includes('Name') || headerName.includes('Title')) {
    return 180; // 名稱類型
  } else if (headerName.includes('description') || headerName.includes('Description')) {
    return 300; // 描述類型
  } else if (headerName.includes('status') || headerName.includes('Status')) {
    return 100; // 狀態類型
  } else {
    return 120; // 預設寬度
  }
}

/**
 * 獲取所有 PropertiesService 配置的元數據
 * @returns {Object} 所有配置的元數據
 */
function getAllRequiredProperties() {
  return REQUIRED_PROPERTIES;
}

/**
 * 獲取單個配置的預設值
 * @param {string} key - 配置鍵名
 * @returns {string} 預設值
 */
function getPropertyWithDefault(key) {
  const properties = PropertiesService.getScriptProperties();
  const value = properties.getProperty(key);

  if (value !== null && value !== undefined && value !== '') {
    return value;
  }

  const config = REQUIRED_PROPERTIES[key];
  if (config && config.default !== null) {
    return config.default;
  }

  return null;
}

/**
 * 重設所有可配置參數為預設值
 * 不影響 DATABASE_FOLDER_ID 和自動生成的 spreadsheet IDs
 * @returns {Object} 重設結果
 */
function resetPropertiesToDefaults() {
  console.log('=== 重設 PropertiesService 配置為預設值 ===');

  const properties = PropertiesService.getScriptProperties();
  const results = {
    success: true,
    reset: [],
    skipped: [],
    errors: []
  };

  try {
    for (const [key, config] of Object.entries(REQUIRED_PROPERTIES)) {
      // Skip readonly and autoCreated properties
      if (config.readonly || config.autoCreated) {
        results.skipped.push({
          key: key,
          reason: config.autoCreated ? '自動生成' : '唯讀'
        });
        continue;
      }

      // Skip DATABASE_FOLDER_ID (must be manually set)
      if (key === 'DATABASE_FOLDER_ID') {
        results.skipped.push({
          key: key,
          reason: '需手動設定'
        });
        continue;
      }

      // Reset to default value
      if (config.default !== null) {
        properties.setProperty(key, config.default);
        results.reset.push({
          key: key,
          value: config.default,
          description: config.description
        });
        console.log(`  ✓ 重設 ${key} = ${config.default}`);
      } else {
        // Remove property if no default value
        properties.deleteProperty(key);
        results.reset.push({
          key: key,
          value: '(已刪除)',
          description: config.description
        });
        console.log(`  ✓ 刪除 ${key}`);
      }
    }

    console.log('\n📊 重設結果統計:');
    console.log('  - 已重設: ' + results.reset.length + ' 個');
    console.log('  - 已跳過: ' + results.skipped.length + ' 個');

    if (results.skipped.length > 0) {
      console.log('\n⏭️ 跳過的配置項目:');
      results.skipped.forEach(item => {
        console.log(`  - ${item.key}: ${item.reason}`);
      });
    }

  } catch (error) {
    results.success = false;
    results.errors.push(error.toString());
    console.error('❌ 重設過程中發生錯誤:', error);
  }

  console.log('=== PropertiesService 配置重設完成 ===');
  return results;
}

/**
 * 驗證所有配置項目
 * @returns {Object} 驗證結果
 */
function validateAllProperties() {
  console.log('=== 驗證 PropertiesService 配置 ===');

  const properties = PropertiesService.getScriptProperties();
  const results = {
    success: true,
    valid: [],
    invalid: [],
    missing: []
  };

  for (const [key, config] of Object.entries(REQUIRED_PROPERTIES)) {
    const value = properties.getProperty(key);

    if (!value) {
      if (config.required) {
        results.missing.push({
          key: key,
          description: config.description,
          required: true
        });
        results.success = false;
      } else {
        results.missing.push({
          key: key,
          description: config.description,
          required: false,
          hasDefault: config.default !== null
        });
      }
    } else {
      // Basic validation
      let isValid = true;
      let validationError = '';

      if (config.inputType === 'number') {
        if (isNaN(parseInt(value))) {
          isValid = false;
          validationError = '不是有效的數字';
        }
      } else if (config.inputType === 'boolean') {
        if (value !== 'true' && value !== 'false') {
          isValid = false;
          validationError = '必須是 true 或 false';
        }
      } else if (config.inputType === 'timeout') {
        if (isNaN(parseInt(value)) || parseInt(value) < 0) {
          isValid = false;
          validationError = '必須是正整數';
        }
      }

      if (isValid) {
        results.valid.push({
          key: key,
          value: value,
          description: config.description
        });
      } else {
        results.invalid.push({
          key: key,
          value: value,
          error: validationError,
          description: config.description
        });
        results.success = false;
      }
    }
  }

  console.log('📊 驗證結果:');
  console.log('  - 有效: ' + results.valid.length + ' 個');
  console.log('  - 無效: ' + results.invalid.length + ' 個');
  console.log('  - 缺少: ' + results.missing.length + ' 個');

  if (results.invalid.length > 0) {
    console.log('\n❌ 無效的配置:');
    results.invalid.forEach(item => {
      console.log(`  - ${item.key}: ${item.value} (${item.error})`);
    });
  }

  if (results.missing.filter(m => m.required).length > 0) {
    console.log('\n❌ 缺少必要配置:');
    results.missing.filter(m => m.required).forEach(item => {
      console.log(`  - ${item.key}: ${item.description}`);
    });
  }

  console.log('=== 配置驗證完成 ===');
  return results;
}

/**
 * Get all PropertiesService configuration (Admin API)
 */
function getAllProperties(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const properties = PropertiesService.getScriptProperties();
    const config = {};

    // Get all configured properties
    for (const [key, meta] of Object.entries(REQUIRED_PROPERTIES)) {
      const value = properties.getProperty(key);
      config[key] = value || '';
    }

    return createSuccessResponseWithSession(sessionId, config);

  } catch (error) {
    logErr('Get all properties error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get properties');
  }
}

/**
 * Update PropertiesService configuration (Admin API)
 */
function updateProperties(sessionId, propertiesData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    if (!propertiesData || typeof propertiesData !== 'object') {
      return createErrorResponse('INVALID_INPUT', 'Properties data is required');
    }

    const properties = PropertiesService.getScriptProperties();
    const updated = [];
    const errors = [];

    for (const [key, value] of Object.entries(propertiesData)) {
      // Check if property exists in REQUIRED_PROPERTIES
      const config = REQUIRED_PROPERTIES[key];
      if (!config) {
        errors.push({ key: key, error: 'Unknown property' });
        continue;
      }

      // Skip readonly and autoCreated properties
      if (config.readonly || config.autoCreated) {
        errors.push({ key: key, error: 'Property is readonly' });
        continue;
      }

      // Validate value based on inputType
      if (config.inputType === 'number') {
        if (isNaN(parseInt(value))) {
          errors.push({ key: key, error: 'Invalid number' });
          continue;
        }
      } else if (config.inputType === 'boolean') {
        if (value !== 'true' && value !== 'false') {
          errors.push({ key: key, error: 'Must be true or false' });
          continue;
        }
      } else if (config.inputType === 'timeout') {
        if (isNaN(parseInt(value)) || parseInt(value) < 0) {
          errors.push({ key: key, error: 'Must be positive integer' });
          continue;
        }
      }

      // Update property
      properties.setProperty(key, String(value));
      updated.push(key);
    }

    // Log the action
    logOperation(
      sessionResult.userEmail,
      'properties_updated',
      'system',
      'properties',
      { updatedKeys: updated }
    );

    return createSuccessResponseWithSession(sessionId, {
      updated: updated,
      errors: errors,
      success: errors.length === 0
    }, updated.length > 0 ? `${updated.length} properties updated` : 'No properties updated');

  } catch (error) {
    logErr('Update properties error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update properties');
  }
}

/**
 * Reset properties to defaults (Admin API)
 */
function resetPropertiesToDefaultsWithAuth(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const result = resetPropertiesToDefaults();

    // Log the action
    logOperation(
      sessionResult.userEmail,
      'properties_reset',
      'system',
      'properties',
      { resetCount: result.reset.length, skippedCount: result.skipped.length }
    );

    return createSuccessResponseWithSession(sessionId, result, 'Properties reset to defaults');

  } catch (error) {
    logErr('Reset properties error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to reset properties');
  }
}

/**
 * Validate spreadsheet access (Admin API)
 */
function validateSpreadsheetAccess(sessionId, spreadsheetId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    if (!spreadsheetId) {
      return createErrorResponse('INVALID_INPUT', 'spreadsheetId is required');
    }

    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const name = spreadsheet.getName();

      return createSuccessResponseWithSession(sessionId, {
        valid: true,
        name: name,
        spreadsheetId: spreadsheetId
      });

    } catch (e) {
      return createSuccessResponseWithSession(sessionId, {
        valid: false,
        error: e.message
      });
    }

  } catch (error) {
    logErr('Validate spreadsheet error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to validate spreadsheet');
  }
}

/**
 * Get robot execution status (Admin API)
 */
function getRobotStatus(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const properties = PropertiesService.getScriptProperties();
    const status = {
      LAST_CLEANUP: properties.getProperty('LAST_CLEANUP'),
      LAST_CLEANUP_ERROR: properties.getProperty('LAST_CLEANUP_ERROR'),
      LAST_NOTIFICATION_PATROL: properties.getProperty('LAST_NOTIFICATION_PATROL'),
      LAST_NOTIFICATION_PATROL_ERROR: properties.getProperty('LAST_NOTIFICATION_PATROL_ERROR'),
      LAST_LOG_ARCHIVE: properties.getProperty('LAST_LOG_ARCHIVE'),
      LAST_LOG_ARCHIVE_ERROR: properties.getProperty('LAST_LOG_ARCHIVE_ERROR')
    };

    return createSuccessResponseWithSession(sessionId, status);

  } catch (error) {
    logErr('Get robot status error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get robot status');
  }
}

/**
 * Execute cleanup robot (Admin API)
 */
function executeCleanupRobot(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const properties = PropertiesService.getScriptProperties();

    try {
      // Execute cleanup (from scheduled_tasks.js)
      dailyCleanup();

      // Update status
      properties.setProperty('LAST_CLEANUP', new Date().toISOString());
      properties.deleteProperty('LAST_CLEANUP_ERROR');

      logOperation(sessionResult.userEmail, 'robot_cleanup_executed', 'system', 'cleanup', {});

      return createSuccessResponseWithSession(sessionId, {
        executed: true,
        timestamp: new Date().toISOString()
      }, 'Cleanup executed successfully');

    } catch (e) {
      properties.setProperty('LAST_CLEANUP_ERROR', e.message);
      throw e;
    }

  } catch (error) {
    logErr('Execute cleanup robot error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to execute cleanup: ' + error.message);
  }
}

/**
 * Execute notification patrol robot (Admin API)
 */
function executeNotificationPatrol(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const properties = PropertiesService.getScriptProperties();

    try {
      // Execute notification patrol (from scheduled_tasks.js)
      sendPendingNotifications();

      // Update status
      properties.setProperty('LAST_NOTIFICATION_PATROL', new Date().toISOString());
      properties.deleteProperty('LAST_NOTIFICATION_PATROL_ERROR');

      logOperation(sessionResult.userEmail, 'robot_notification_patrol_executed', 'system', 'notification', {});

      return createSuccessResponseWithSession(sessionId, {
        executed: true,
        timestamp: new Date().toISOString()
      }, 'Notification patrol executed successfully');

    } catch (e) {
      properties.setProperty('LAST_NOTIFICATION_PATROL_ERROR', e.message);
      throw e;
    }

  } catch (error) {
    logErr('Execute notification patrol error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to execute notification patrol: ' + error.message);
  }
}

/**
 * Execute log archive robot (Admin API)
 */
function executeLogArchive(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    const properties = PropertiesService.getScriptProperties();

    try {
      // Execute log archive
      const result = archiveOldLogs(50000);

      // Update status
      properties.setProperty('LAST_LOG_ARCHIVE', new Date().toISOString());
      properties.deleteProperty('LAST_LOG_ARCHIVE_ERROR');

      logOperation(sessionResult.userEmail, 'robot_log_archive_executed', 'system', 'logs', {
        archived: result.data?.archived || false
      });

      return createSuccessResponseWithSession(sessionId, {
        executed: true,
        timestamp: new Date().toISOString(),
        result: result.data
      }, result.data?.message || 'Log archive executed successfully');

    } catch (e) {
      properties.setProperty('LAST_LOG_ARCHIVE_ERROR', e.message);
      throw e;
    }

  } catch (error) {
    logErr('Execute log archive error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to execute log archive: ' + error.message);
  }
}

/**
 * Get suspicious login attempts (Admin API)
 */
function getSuspiciousLogins(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }

    // Call analyzeSuspiciousLogins from logging.js
    const result = analyzeSuspiciousLogins();

    if (result && result.success) {
      return createSuccessResponseWithSession(sessionId, result.data || []);
    } else {
      return createSuccessResponseWithSession(sessionId, []);
    }

  } catch (error) {
    logErr('Get suspicious logins error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get suspicious logins');
  }
}