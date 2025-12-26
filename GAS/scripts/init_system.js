/**
 * @fileoverview System initialization script for complete setup
 * @module InitSystem
 */

/**
 * Initialize the entire system with all required database structures
 * This function performs a COMPLETE SYSTEM RESET and should be used carefully
 *
 * WARNING: This function will DELETE ALL EXISTING DATA and recreate everything from scratch
 *
 * What this function does:
 * 1. Validates DATABASE_FOLDER is set
 * 2. Auto-creates all spreadsheets (GLOBAL_WORKBOOK, LOG_SPREADSHEET, NOTIFICATION_SPREADSHEET)
 * 3. Auto-sets all PropertiesService parameters with default values
 * 4. DELETES and recreates all data sheets
 * 5. Creates default admin user and PM group
 * 6. Initializes logging and notification systems
 * 7. Sets up default system configurations
 *
 * IMPORTANT: Before running this function, you MUST:
 * 1. Set DATABASE_FOLDER: PropertiesService.getScriptProperties().setProperty('DATABASE_FOLDER', 'your_folder_id')
 * 2. Modify DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD below
 * 3. BACKUP any existing data if you want to preserve it
 *
 * Everything else is auto-created and auto-configured!
 */
function initSystem() {
  // ========== CONFIGURATION - MODIFY THESE VALUES ==========
  const DEFAULT_ADMIN_USERNAME = 'admin';
  const DEFAULT_ADMIN_PASSWORD = 'admin123456';
  const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
  const DEFAULT_ADMIN_DISPLAY_NAME = '系統管理員';
  // ========================================================

  try {
    console.log('開始系統初始化...');

    // Step 0: 檢查 DATABASE_FOLDER (唯一必要的手動設定)
    console.log('步驟 0: 檢查 DATABASE_FOLDER 設定...');
    const properties = PropertiesService.getScriptProperties();
    const databaseFolderId = properties.getProperty('DATABASE_FOLDER') || properties.getProperty('DATABASE_FOLDER_ID');

    if (!databaseFolderId) {
      console.error('========================================');
      console.error('系統初始化失敗：缺少必要的 DATABASE_FOLDER 設定');
      console.error('========================================');
      console.error('DATABASE_FOLDER 是唯一需要手動設定的參數');
      console.error('');
      console.error('設定命令:');
      console.error('PropertiesService.getScriptProperties().setProperty("DATABASE_FOLDER", "your_folder_id")');
      console.error('');
      console.error('請先設定 DATABASE_FOLDER 後，再次執行 initSystem()');
      console.error('========================================');

      throw new Error('系統初始化中止：缺少 DATABASE_FOLDER 設定');
    }

    // Verify DATABASE_FOLDER is accessible
    try {
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      console.log('  ✓ DATABASE_FOLDER 可正常訪問: ' + databaseFolder.getName());
    } catch (error) {
      throw new Error(`DATABASE_FOLDER 設定錯誤：無法訪問文件夾 ${databaseFolderId}。請檢查文件夾ID是否正確，以及是否有訪問權限。`);
    }

    // Step 1: Auto-set all default PropertiesService parameters
    console.log('步驟 1: 設定預設系統參數...');
    const defaultParameters = {
      // Authentication
      'SESSION_TIMEOUT': '86400000',              // 24 hours
      'PASSWORD_SALT_ROUNDS': '10',

      // Invitation system
      'MAX_INVITES_PER_DAY': '50',
      'INVITE_CODE_TIMEOUT': '604800000',         // 7 days

      // Logging
      'LOG_CONSOLE': 'true',
      'LOG_LEVEL': 'INFO',

      // Business logic limits
      'MAX_PROJECT_NAME_LENGTH': '100',
      'MAX_CONCURRENT_PROJECTS': '5',
      'MAX_GROUP_NAME_LENGTH': '50',
      'MAX_GROUPS_PER_PROJECT': '20',
      'MAX_MEMBERS_PER_GROUP': '10',
      'MAX_STAGE_DURATION_DAYS': '30'
    };

    for (const [key, value] of Object.entries(defaultParameters)) {
      const existingValue = properties.getProperty(key);
      if (!existingValue) {
        properties.setProperty(key, value);
        console.log(`  ✓ 設定 ${key} = ${value}`);
      } else {
        console.log(`  ⏭ ${key} 已存在，跳過 (值: ${existingValue})`);
      }
    }
    console.log('  ✓ 系統參數設定完成');

    // Step 2: Auto-create Global Workbook
    console.log('步驟 2: 建立全域資料庫...');
    let globalWorkbookId = properties.getProperty('GLOBAL_WORKBOOK_ID');
    let globalWorkbook;

    if (!globalWorkbookId) {
      const timestamp = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
      globalWorkbook = SpreadsheetApp.create(`評分系統_全域資料庫_${timestamp}`);
      globalWorkbookId = globalWorkbook.getId();

      // Move to DATABASE_FOLDER
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      DriveApp.getFileById(globalWorkbookId).moveTo(databaseFolder);

      // Save to PropertiesService
      properties.setProperty('GLOBAL_WORKBOOK_ID', globalWorkbookId);
      console.log('  ✓ 建立全域資料庫: ' + globalWorkbookId);
    } else {
      globalWorkbook = SpreadsheetApp.openById(globalWorkbookId);
      console.log('  ✓ 使用現有全域資料庫: ' + globalWorkbookId);
    }

    // Step 3: Auto-create LOG_SPREADSHEET
    console.log('步驟 3: 建立日誌系統...');
    let logSpreadsheetId = properties.getProperty('LOG_SPREADSHEET_ID');

    if (!logSpreadsheetId) {
      const timestamp = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
      const logSpreadsheet = SpreadsheetApp.create(`系統日誌_${timestamp}`);
      logSpreadsheetId = logSpreadsheet.getId();

      // Move to DATABASE_FOLDER
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      DriveApp.getFileById(logSpreadsheetId).moveTo(databaseFolder);

      // Initialize log sheet structure
      const logSheet = logSpreadsheet.getActiveSheet();
      logSheet.setName('SystemLogs');
      const logHeaders = ['timestamp', 'level', 'context', 'message', 'details'];
      logSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
      logSheet.getRange(1, 1, 1, logHeaders.length).setFontWeight('bold').setBackground('#e1e8ed');

      // Save to PropertiesService
      properties.setProperty('LOG_SPREADSHEET_ID', logSpreadsheetId);
      console.log('  ✓ 建立日誌系統: ' + logSpreadsheetId);
    } else {
      console.log('  ✓ 使用現有日誌系統: ' + logSpreadsheetId);
    }

    // Step 4: Auto-create NOTIFICATION_SPREADSHEET
    console.log('步驟 4: 建立通知系統...');
    let notificationSpreadsheetId = properties.getProperty('NOTIFICATION_SPREADSHEET_ID');

    if (!notificationSpreadsheetId) {
      const timestamp = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
      const notificationSpreadsheet = SpreadsheetApp.create(`通知記錄_${timestamp}`);
      notificationSpreadsheetId = notificationSpreadsheet.getId();

      // Move to DATABASE_FOLDER
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      DriveApp.getFileById(notificationSpreadsheetId).moveTo(databaseFolder);

      // Initialize notification sheet structure
      const notificationSheet = notificationSpreadsheet.getActiveSheet();
      notificationSheet.setName('Notifications');
      const notificationHeaders = ['notificationId', 'recipientEmail', 'subject', 'message', 'sentTime', 'status', 'errorMessage'];
      notificationSheet.getRange(1, 1, 1, notificationHeaders.length).setValues([notificationHeaders]);
      notificationSheet.getRange(1, 1, 1, notificationHeaders.length).setFontWeight('bold').setBackground('#e1e8ed');

      // Save to PropertiesService
      properties.setProperty('NOTIFICATION_SPREADSHEET_ID', notificationSpreadsheetId);
      console.log('  ✓ 建立通知系統: ' + notificationSpreadsheetId);
    } else {
      console.log('  ✓ 使用現有通知系統: ' + notificationSpreadsheetId);
    }

    // Step 5: Delete existing sheets and create new ones (complete overwrite)
    console.log('步驟 5: 重建資料表結構...');
    const sheets = [
      'Projects', 'Users', 'SystemConfigs', 'GlobalGroups',
      'Tags', 'ProjectTags', 'UserTags', 'Sessions',
      'InvitationCodes', 'GlobalUserGroups'
    ];

    for (const sheetName of sheets) {
      const existingSheet = globalWorkbook.getSheetByName(sheetName);
      if (existingSheet) {
        console.log(`  - 刪除現有 ${sheetName} 表`);
        globalWorkbook.deleteSheet(existingSheet);
      }
      
      const template = GLOBAL_WORKBOOK_TEMPLATES[sheetName];
      if (template) {
        createSheetWithHeaders(globalWorkbook, sheetName, template);
        console.log(`  ✓ 重建 ${sheetName} 表`);
      }
    }

    // Step 6: Create Global Groups (always create since we deleted all sheets)
    console.log('步驟 6: 建立系統全域群組...');
    const timestamp = getCurrentTimestamp();
    const pmGroupId = 'grp_global_pm_001';
    
    const pmGroupData = {
      groupId: pmGroupId,
      groupName: '總PM群組',
      groupDescription: '系統總PM群組，擁有建立專案和系統管理權限',
      isActive: true,
      allowJoin: false,
      createdBy: 'system',
      createdTime: timestamp,
      globalPermissions: JSON.stringify([
        'create_project',
        'system_admin',
        'manage_users',
        'manage_groups',
        'generate_invites',
        'teacher_privilege'
      ])
    };
    
    addRowToSheet(null, 'GlobalGroups', pmGroupData);
    console.log('  ✓ 建立總PM群組: ' + pmGroupId);

    // Create Teacher Group (has teacher_privilege only)
    const teacherGroupId = 'grp_teacher_001';
    const teacherGroupData = {
      groupId: teacherGroupId,
      groupName: '教師群組',
      groupDescription: '教師群組，擁有教師投票和教學相關權限',
      isActive: true,
      allowJoin: false,
      createdBy: 'system',
      createdTime: timestamp,
      globalPermissions: JSON.stringify([
        'teacher_privilege'
      ])
    };
    
    addRowToSheet(null, 'GlobalGroups', teacherGroupData);
    console.log('  ✓ 建立教師群組: ' + teacherGroupId);

    // Step 7: Create default admin user (always create since we deleted all sheets)
    console.log('步驟 7: 建立預設管理員帳號...');
    const adminUserId = generateIdWithType('user');
    const hashedPassword = hashPassword(DEFAULT_ADMIN_PASSWORD);
    
    const adminUserData = {
      userId: adminUserId,
      username: DEFAULT_ADMIN_USERNAME,
      password: hashedPassword,
      userEmail: DEFAULT_ADMIN_EMAIL,
      displayName: DEFAULT_ADMIN_DISPLAY_NAME,
      registrationTime: timestamp,
      lastLoginTime: '',
      status: 'active',
      preferences: '{}',
      avatarSeed: `${DEFAULT_ADMIN_EMAIL}_${timestamp}`,
      avatarStyle: 'avataaars',
      avatarOptions: JSON.stringify({
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      })
    };
    
    addRowToSheet(null, 'Users', adminUserData);
    console.log('  ✓ 建立管理員帳號:');
    console.log('    使用者名稱: ' + DEFAULT_ADMIN_USERNAME);
    console.log('    密碼: ' + DEFAULT_ADMIN_PASSWORD);
    console.log('    請記得登入後修改密碼！');

    // Step 8: Add admin user to Global PM group (always create since we deleted all sheets)
    console.log('步驟 8: 將管理員加入總PM群組...');
    const membershipData = {
      membershipId: generateIdWithType('membership'),
      groupId: pmGroupId,
      userEmail: DEFAULT_ADMIN_EMAIL,
      role: 'admin',
      isActive: true,
      joinTime: timestamp,
      addedBy: 'system',
      removedBy: '',
      removedTime: ''
    };
    
    addRowToSheet(null, 'GlobalUserGroups', membershipData);
    console.log('  ✓ 管理員已加入總PM群組');

    // Step 9: Set default system configurations
    console.log('步驟 9: 設定預設系統配置...');
    
    // Set SystemConfigs table entries
    const defaultConfigs = [
      { configKey: 'default_stage_duration', configValue: '7', description: '預設階段持續天數', category: 'timing' },
      { configKey: 'scoring_enabled', configValue: 'true', description: '是否啟用評分功能', category: 'features' },
      { configKey: 'wallet_enabled', configValue: 'true', description: '是否啟用錢包功能', category: 'features' },
      { configKey: 'comment_max_length', configValue: '5000', description: '評論最大字數', category: 'limits' },
      { configKey: 'submission_max_size', configValue: '50000', description: '成果最大字數', category: 'limits' },
      { configKey: 'session_timeout', configValue: '86400000', description: '會話超時時間(毫秒)', category: 'security' },
      { configKey: 'notification_email_enabled', configValue: 'true', description: '是否啟用通知郵件', category: 'notifications' },
      { configKey: 'notification_email_daily', configValue: 'true', description: '是否啟用每日通知郵件', category: 'notifications' },
      { configKey: 'log_max_rows', configValue: '50000', description: '日誌表最大行數', category: 'system' },
      { configKey: 'notification_max_rows', configValue: '50000', description: '通知表最大行數', category: 'system' }
    ];

    const existingConfigs = readFullSheet(globalWorkbook, 'SystemConfigs');
    for (const config of defaultConfigs) {
      if (!existingConfigs.some(c => c.configKey === config.configKey)) {
        addRowToSheet(null, 'SystemConfigs', {
          ...config,
          lastModified: timestamp
        });
        console.log(`  ✓ 設定 ${config.configKey}: ${config.configValue}`);
      }
    }

    // Step 10: Initialize Two-Factor Authentication system (optional)
    console.log('步驟 10: 初始化兩階段認證系統...');
    try {
      const twoFactorSheetId = properties.getProperty('TWOFACTOR_SHEET_ID');
      if (!twoFactorSheetId) {
        console.warn('⚠️  TWOFACTOR_SHEET_ID 未設定，跳過兩階段認證初始化');
        console.log('   請手動設定: PropertiesService.getScriptProperties().setProperty("TWOFACTOR_SHEET_ID", "your_sheet_id")');
      } else {
        // Initialize two-factor auth spreadsheet
        const twoFactorSpreadsheet = SpreadsheetApp.openById(twoFactorSheetId);
        
        // Clear existing sheets and create new one with headers
        const sheets = twoFactorSpreadsheet.getSheets();
        if (sheets.length > 0) {
          // Delete all existing sheets except the first one
          for (let i = sheets.length - 1; i > 0; i--) {
            twoFactorSpreadsheet.deleteSheet(sheets[i]);
          }
          
          // Clear and setup the first sheet
          const sheet = sheets[0];
          sheet.clear();
          sheet.setName('TwoFactorAuth');
          
          // Add headers
          const headers = ['userEmail', 'verificationCode', 'createdTime', 'expiresAt', 'isUsed', 'attempts', 'id'];
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          
          // Format headers
          const headerRange = sheet.getRange(1, 1, 1, headers.length);
          headerRange.setFontWeight('bold');
          headerRange.setBackground('#e1e8ed');
          
          console.log('  ✓ 兩階段認證表格已初始化');
        }
      }
    } catch (error) {
      console.warn('兩階段認證系統初始化失敗:', error.message);
    }

    // Step 11: Log successful initialization
    console.log('步驟 11: 記錄系統初始化日誌...');
    try {
      logInfo('initSystem', '系統初始化完成', {
        globalWorkbookId: globalWorkbookId,
        adminUsername: DEFAULT_ADMIN_USERNAME,
        details: '完整系統初始化包含資料庫、日誌、通知系統'
      });
    } catch (error) {
      console.warn('無法記錄初始化日誌:', error.message);
    }

    console.log('\n========================================');
    console.log('🎉 完整系統初始化完成！');
    console.log('========================================');
    console.log('⚠️  注意：所有現有資料已被刪除並重新創建');
    console.log('');
    console.log('📊 系統資訊：');
    console.log('1. DATABASE_FOLDER: ' + databaseFolderId);
    console.log('2. GLOBAL_WORKBOOK_ID: ' + globalWorkbookId);
    console.log('3. LOG_SPREADSHEET_ID: ' + logSpreadsheetId);
    console.log('4. NOTIFICATION_SPREADSHEET_ID: ' + notificationSpreadsheetId);
    console.log('');
    console.log('👤 管理員帳號：');
    console.log('• 帳號: ' + DEFAULT_ADMIN_USERNAME);
    console.log('• 密碼: ' + DEFAULT_ADMIN_PASSWORD);
    console.log('• Email: ' + DEFAULT_ADMIN_EMAIL);
    console.log('');
    console.log('✅ 已完成項目：');
    console.log('• 系統參數: 已設定所有預設值');
    console.log('• 資料庫: 已自動建立 (Global Workbook)');
    console.log('• 日誌系統: 已自動建立 (Log Spreadsheet)');
    console.log('• 通知系統: 已自動建立 (Notification Spreadsheet)');
    console.log('• 資料表: 已完全重建所有表格結構');
    console.log('• 系統群組: 總PM群組 + 教師群組已建立');
    console.log('• 預設配置: 已設定系統配置項目');
    console.log('');
    console.log('⚠️  安全提醒：');
    console.log('• 請立即登入並修改管理員密碼！');
    console.log('• 請確保已部署 Web App');
    console.log('• 如有需要，請重新匯入資料');
    console.log('========================================');

    return {
      success: true,
      databaseFolderId: databaseFolderId,
      globalWorkbookId: globalWorkbookId,
      logSpreadsheetId: logSpreadsheetId,
      notificationSpreadsheetId: notificationSpreadsheetId,
      adminUsername: DEFAULT_ADMIN_USERNAME,
      message: '完整系統初始化成功！所有資料庫、日誌、通知系統均已自動建立，請查看執行日誌獲取詳細資訊。'
    };

  } catch (error) {
    console.error('系統初始化失敗:', error.message);
    console.error(error.stack);
    throw new Error('系統初始化失敗: ' + error.message);
  }
}

/**
 * Reset system (DANGEROUS - will delete all data)
 * Only use this for development/testing
 */
function resetSystem() {
  const confirmation = 'DELETE_ALL_DATA';
  const userInput = Browser.inputBox(
    '危險操作警告', 
    '此操作將刪除所有資料！如果確定要繼續，請輸入: ' + confirmation, 
    Browser.Buttons.OK_CANCEL
  );
  
  if (userInput !== confirmation) {
    console.log('重置操作已取消');
    return;
  }

  try {
    // Clear all properties
    const properties = PropertiesService.getScriptProperties();
    properties.deleteAllProperties();
    
    console.log('系統已重置。請重新執行 initSystem()');
    return { success: true, message: '系統已重置' };
  } catch (error) {
    console.error('重置系統失敗:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check system initialization status
 */
function checkSystemStatus() {
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const globalWorkbookId = properties['GLOBAL_WORKBOOK_ID'];
    const databaseFolder = properties['DATABASE_FOLDER'];
    
    console.log('========================================');
    console.log('系統狀態檢查');
    console.log('========================================');
    console.log('DATABASE_FOLDER: ' + (databaseFolder || '未設定'));
    console.log('GLOBAL_WORKBOOK_ID: ' + (globalWorkbookId || '未設定'));
    
    if (globalWorkbookId) {
      try {
        const workbook = SpreadsheetApp.openById(globalWorkbookId);
        console.log('Global Workbook 名稱: ' + workbook.getName());
        
        // Check sheets
        const sheets = workbook.getSheets();
        console.log('\n資料表列表:');
        sheets.forEach(sheet => {
          const rowCount = sheet.getLastRow();
          console.log(`  - ${sheet.getName()}: ${rowCount} 行`);
        });
        
        // Check for admin user
        const users = readFullSheet(workbook, 'Users');
        const adminCount = users.filter(u => u.status === 'active').length;
        console.log('\n活躍用戶數: ' + adminCount);
        
        // Check for system groups
        const groups = readFullSheet(workbook, 'GlobalGroups');
        const pmGroup = groups.find(g => g.groupId === 'grp_global_pm_001');
        const teacherGroup = groups.find(g => g.groupId === 'grp_teacher_001');
        console.log('總PM群組: ' + (pmGroup ? '已建立' : '未建立'));
        console.log('教師群組: ' + (teacherGroup ? '已建立' : '未建立'));
        
      } catch (error) {
        console.error('無法訪問 Global Workbook: ' + error.message);
      }
    }
    
    // Check log system
    console.log('\n日誌系統狀態:');
    const logSpreadsheetId = properties['LOG_SPREADSHEET_ID'];
    if (logSpreadsheetId) {
      try {
        const logSpreadsheet = SpreadsheetApp.openById(logSpreadsheetId);
        const logRowCount = logSpreadsheet.getActiveSheet().getLastRow();
        console.log('  日誌表ID: ' + logSpreadsheetId);
        console.log('  日誌表名稱: ' + logSpreadsheet.getName());
        console.log('  日誌記錄數: ' + (logRowCount - 1) + ' 條');
      } catch (error) {
        console.error('  無法訪問日誌表: ' + error.message);
      }
    } else {
      console.log('  日誌系統尚未初始化');
    }
    
    // Check notification system
    console.log('\n通知系統狀態:');
    const notificationSpreadsheetId = properties['NOTIFICATION_SPREADSHEET_ID'];
    if (notificationSpreadsheetId) {
      try {
        const notificationSpreadsheet = SpreadsheetApp.openById(notificationSpreadsheetId);
        const notificationRowCount = notificationSpreadsheet.getActiveSheet().getLastRow();
        console.log('  通知表ID: ' + notificationSpreadsheetId);
        console.log('  通知表名稱: ' + notificationSpreadsheet.getName());
        console.log('  通知記錄數: ' + (notificationRowCount - 1) + ' 條');
      } catch (error) {
        console.error('  無法訪問通知表: ' + error.message);
      }
    } else {
      console.log('  通知系統尚未初始化');
    }
    
    console.log('========================================');
    
    return {
      initialized: !!globalWorkbookId,
      databaseFolder: databaseFolder,
      globalWorkbookId: globalWorkbookId
    };
    
  } catch (error) {
    console.error('檢查系統狀態失敗:', error.message);
    return { error: error.message };
  }
}

/**
 * Setup system triggers for scheduled maintenance
 * Call this function after initSystem() to enable automatic maintenance
 */
function setupSystemTriggers() {
  try {
    console.log('設定系統定時觸發器...');
    
    // Delete existing triggers first
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'runDailyCleanup' || 
          trigger.getHandlerFunction() === 'runWeeklyMaintenance') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create daily cleanup trigger (every day at 2 AM)
    ScriptApp.newTrigger('runDailyCleanup')
      .timeBased()
      .everyDays(1)
      .atHour(2)
      .create();
    console.log('  ✓ 每日清理觸發器已設定 (每天凌晨2點執行)');
    
    // Create weekly maintenance trigger (every Sunday at 3 AM)
    ScriptApp.newTrigger('runWeeklyMaintenance')
      .timeBased()
      .everyWeeks(1)
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(3)
      .create();
    console.log('  ✓ 每週維護觸發器已設定 (每週日凌晨3點執行)');
    
    // Log the setup
    logInfo('setupSystemTriggers', '系統觸發器設定完成', {
      dailyCleanup: '每天凌晨2點',
      weeklyMaintenance: '每週日凌晨3點'
    });
    
    console.log('系統觸發器設定完成！');
    return { success: true, message: '系統觸發器已設定' };
    
  } catch (error) {
    console.error('設定系統觸發器失敗:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Remove all system triggers
 */
function removeSystemTriggers() {
  try {
    console.log('移除系統定時觸發器...');
    
    const triggers = ScriptApp.getProjectTriggers();
    let removedCount = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'runDailyCleanup' || 
          trigger.getHandlerFunction() === 'runWeeklyMaintenance') {
        ScriptApp.deleteTrigger(trigger);
        removedCount++;
      }
    });
    
    console.log(`已移除 ${removedCount} 個系統觸發器`);
    
    logInfo('removeSystemTriggers', '移除系統觸發器', {
      removedCount: removedCount
    });
    
    return { success: true, removedCount: removedCount };
    
  } catch (error) {
    console.error('移除系統觸發器失敗:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Migrate database to add displayCode column to InvitationCodes table
 * This function should be run once to update existing invitation codes
 */
function migrateAddDisplayCodeToInvitations() {
  try {
    console.log('開始資料庫遷移：新增 displayCode 欄位到 InvitationCodes 表...');
    
    // Get global workbook
    const globalWorkbookId = PropertiesService.getScriptProperties().getProperty('GLOBAL_WORKBOOK_ID');
    if (!globalWorkbookId) {
      throw new Error('Global workbook not initialized. Please run initSystem() first.');
    }
    
    const globalWorkbook = SpreadsheetApp.openById(globalWorkbookId);
    const sheet = globalWorkbook.getSheetByName('InvitationCodes');
    
    if (!sheet) {
      console.log('InvitationCodes 表不存在，跳過遷移');
      return { success: false, message: 'InvitationCodes table does not exist' };
    }
    
    // Check if displayCode column already exists
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const displayCodeIndex = headers.indexOf('displayCode');
    
    if (displayCodeIndex === -1) {
      // Add displayCode column after invitationCode
      const invitationCodeIndex = headers.indexOf('invitationCode');
      if (invitationCodeIndex === -1) {
        throw new Error('invitationCode column not found');
      }
      
      // Insert new column
      sheet.insertColumnAfter(invitationCodeIndex + 1);
      sheet.getRange(1, invitationCodeIndex + 2).setValue('displayCode');
      
      // Update all existing rows with masked display codes
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const dataRange = sheet.getRange(2, invitationCodeIndex + 2, lastRow - 1, 1);
        const values = [];
        for (let i = 0; i < lastRow - 1; i++) {
          values.push(['****-****-****']); // Default masked value for existing codes
        }
        dataRange.setValues(values);
      }
      
      console.log(`  ✓ 新增 displayCode 欄位並設定預設值給 ${lastRow - 1} 個邀請碼`);
    } else {
      console.log('  displayCode 欄位已存在，跳過欄位新增');
    }
    
    console.log('========================================');
    console.log('🎉 資料庫遷移完成！');
    console.log('========================================');
    console.log('重要說明：');
    console.log('1. displayCode 欄位已新增到 InvitationCodes 表');
    console.log('2. 現有邀請碼顯示為 ****-****-****');
    console.log('3. 新生成的邀請碼會顯示部分遮罩的代碼');
    console.log('========================================');
    
    return { success: true, message: 'Successfully added displayCode column' };
    
  } catch (error) {
    console.error('資料庫遷移失敗:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// InvitationUsages table removed - no longer needed.
// Invitation usage count is tracked directly in InvitationCodes.usedCount field.

/**
 * Add migration for new invitation code fields (targetEmail, emailSent, emailSentTime)
 */
function migrateAddNewInvitationFields() {
  try {
    console.log('開始資料庫遷移：新增邀請碼新欄位...');
    
    // Get global workbook
    const globalWorkbookId = PropertiesService.getScriptProperties().getProperty('GLOBAL_WORKBOOK_ID');
    if (!globalWorkbookId) {
      throw new Error('Global workbook not initialized. Please run initSystem() first.');
    }
    
    const globalWorkbook = SpreadsheetApp.openById(globalWorkbookId);
    const invitationSheet = globalWorkbook.getSheetByName('InvitationCodes');
    
    if (!invitationSheet) {
      console.log('InvitationCodes 表不存在，跳過遷移');
      return { success: true, message: 'InvitationCodes sheet not found' };
    }
    
    // Get current headers
    const headerRow = invitationSheet.getRange(1, 1, 1, invitationSheet.getLastColumn()).getValues()[0];
    const currentHeaders = headerRow.map(h => h.toString());
    
    // Define expected headers with new fields (simplified one-to-one structure)
    const expectedHeaders = [
      'invitationId', 'invitationCode', 'displayCode', 'targetEmail', 'createdBy', 'createdTime', 
      'expiryTime', 'status', 'usedTime', 'emailSent', 'emailSentTime',
      'defaultTags', 'defaultGlobalGroups', 'metadata'
    ];
    
    // Find missing headers
    const missingHeaders = expectedHeaders.filter(h => !currentHeaders.includes(h));
    
    if (missingHeaders.length === 0) {
      console.log('所有邀請碼欄位已存在，跳過遷移');
      return { success: true, message: 'All fields already exist' };
    }
    
    console.log('發現缺少的欄位:', missingHeaders);
    
    // Add missing columns
    const startCol = currentHeaders.length + 1;
    missingHeaders.forEach((header, index) => {
      const col = startCol + index;
      invitationSheet.getRange(1, col).setValue(header);
      
      // Initialize new fields with default values for existing rows
      const lastRow = invitationSheet.getLastRow();
      if (lastRow > 1) {
        let defaultValue = '';
        if (header === 'emailSent') defaultValue = false;
        if (header === 'targetEmail') defaultValue = ''; // Will need manual update
        if (header === 'emailSentTime') defaultValue = null;
        if (header === 'usedTime') defaultValue = null;
        
        if (defaultValue !== '') {
          const range = invitationSheet.getRange(2, col, lastRow - 1, 1);
          const values = Array(lastRow - 1).fill([defaultValue]);
          range.setValues(values);
        }
      }
      
      console.log(`✓ 新增欄位: ${header}`);
    });
    
    console.log('========================================');
    console.log('邀請碼表格遷移完成');
    console.log(`新增 ${missingHeaders.length} 個欄位:`);
    missingHeaders.forEach(field => console.log(`- ${field}`));
    
    if (missingHeaders.includes('targetEmail')) {
      console.log('');
      console.log('⚠️  重要提醒:');
      console.log('- targetEmail 欄位已新增但現有邀請碼需要手動設定目標email');
      console.log('- 新系統採用一對一邀請碼機制');
      console.log('- 建議停用舊邀請碼，重新產生新的一對一邀請碼');
    }
    console.log('========================================');
    
    // Log migration
    logInfo('migrateAddNewInvitationFields', '資料庫遷移：新增邀請碼新欄位', {
      addedFields: missingHeaders
    });
    
    return { 
      success: true, 
      message: `Added ${missingHeaders.length} new fields to InvitationCodes`,
      addedFields: missingHeaders
    };
    
  } catch (error) {
    console.error('邀請碼欄位遷移失敗:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}