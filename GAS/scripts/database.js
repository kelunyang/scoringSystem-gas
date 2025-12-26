/**
 * @fileoverview Core database management for the scoring system
 * @module Database
 */

// Constants
const GLOBAL_WORKBOOK_TEMPLATES = {
  Projects: [
    'projectId', 'projectName', 'description', 'totalStages', 
    'currentStage', 'status', 'createdBy', 'createdTime', 
    'lastModified', 'workbookId'
  ],
  
  Users: [
    'userId', 'username', 'password', 'userEmail', 'displayName', 
    'registrationTime', 'lastLoginTime', 'status', 'preferences',
    'avatarSeed', 'avatarStyle', 'avatarOptions'
  ],
  
  SystemConfigs: [
    'configKey', 'configValue', 'description', 'category', 
    'lastModified'
  ],
  
  GlobalGroups: [
    'groupId', 'groupName', 'groupDescription', 'isActive', 
    'allowJoin', 'createdBy', 'createdTime', 'globalPermissions'
  ],
  
  GlobalUserGroups: [
    'membershipId', 'groupId', 'userEmail', 'role', 'isActive',
    'joinTime', 'addedBy', 'removedBy', 'removedTime'
  ],
  
  Tags: [
    'tagId', 'tagName', 'tagColor', 'description', 
    'isActive', 'createdBy', 'createdTime', 'lastModified'
  ],
  
  ProjectTags: [
    'assignmentId', 'projectId', 'tagId', 'assignedBy', 
    'assignedTime', 'isActive'
  ],
  
  UserTags: [
    'assignmentId', 'userEmail', 'tagId', 'assignedBy', 
    'assignedTime', 'isActive'
  ],
  
  InvitationCodes: [
    'invitationId', 'invitationCode', 'displayCode', 'targetEmail', 'createdBy', 'createdTime',
    'expiryTime', 'status', 'usedTime', 'emailSent', 'emailSentTime',
    'defaultTags', 'defaultGlobalGroups', 'metadata', 'usedCount'
  ],
  
  TwoFactorAuth: [
    'userEmail', 'verificationCode', 'createdTime', 'expiresAt', 
    'isUsed', 'attempts', 'id'
  ]
};

const PROJECT_WORKBOOK_TEMPLATES = {
  ProjectInfo: [
    'projectId', 'projectName', 'description', 'totalStages', 
    'currentStage', 'status', 'createdBy', 'createdTime', 'lastModified'
  ],
  
  Groups: [
    'groupId', 'groupName', 'description', 'createdBy', 
    'createdTime', 'status', 'allowChange'
  ],
  
  UserGroups: [
    'membershipId', 'groupId', 'userEmail', 'role', 'joinTime', 'isActive'
  ],
  
  ProjectGroups: [
    'mappingId', 'groupId', 'groupRole', 'permissions', 'assignedTime'
  ],
  
  Stages: [
    'stageId', 'stageName', 'stageOrder', 'startDate', 'endDate', 
    'consensusDeadline', 'status', 'description', 'createdTime',
    'reportRewardPool', 'commentRewardPool'
  ],
  
  Submissions: [
    'submissionId', 'stageId', 'groupId', 'contentMarkdown', 
    'actualAuthors', 'participationProposal', 'version', 'submitTime', 
    'submitterEmail', 'status'
  ],
  
  RankingProposals: [
    'proposalId', 'stageId', 'groupId', 'proposerEmail', 'rankingData', 
    'status', 'createdTime'
  ],
  
  ProposalVotes: [
    'voteId', 'proposalId', 'voterEmail', 'groupId', 'agree',
    'timestamp', 'comment'
  ],

  Comments: [
    'commentId', 'stageId', 'authorEmail', 'content', 'mentionedGroups', 'mentionedUsers',
    'parentCommentId', 'isReply', 'replyLevel', 'isAwarded', 'awardRank', 
    'createdTime'
  ],
  
  CommentRankingProposals: [
    'proposalId', 'stageId', 'authorEmail', 'rankingData', 'createdTime', 
    'metadata'
  ],
  
  TeacherCommentRankings: [
    'stageId', 'projectId', 'teacherEmail', 'commentId', 'authorEmail', 
    'rank', 'createdTime'
  ],
  
  TeacherSubmissionRankings: [
    'teacherRankingId', 'stageId', 'projectId', 'teacherEmail', 'submissionId',
    'groupId', 'rank', 'createdTime'
  ],

  Transactions: [
    'transactionId', 'userEmail', 'stageId', 'settlementId', 'transactionType', 
    'amount', 'source', 'timestamp', 'relatedSubmissionId', 
    'relatedCommentId', 'metadata'
  ],
  
  EventLogs: [
    'logId', 'userEmail', 'action', 'resourceType', 'resourceId',
    'details', 'timestamp', 'ipAddress'
  ],
  
  StageConfigs: [
    'configId', 'stageId', 'rank1Reward', 'rank2Reward', 'rank3Reward', 
    'comment1stReward', 'comment2ndReward', 'comment3rdReward', 
    'approvalThreshold', 'maxResubmissions', 'evaluationThreshold', 
    'pmWeight', 'criteria'
  ],
  
  SubmissionApprovalVotes: [
    'voteId', 'submissionId', 'stageId', 'groupId', 'voterEmail', 
    'agree', 'comment', 'createdTime'
  ],
  
  // Settlement related tables
  SettlementHistory: [
    'settlementId', 'stageId', 'settlementType', 'settlementTime', 
    'operatorEmail', 'totalRewardDistributed', 'participantCount', 
    'status', 'reversedTime', 'reversedBy', 'reversedReason', 'settlementData'
  ],
  
  StageSettlements: [
    'settlementId', 'stageId', 'groupId', 'finalRank', 'studentScore', 
    'teacherScore', 'totalScore', 'allocatedPoints', 'memberEmails', 
    'memberPointsDistribution'
  ],
  
  CommentSettlements: [
    'settlementId', 'stageId', 'commentId', 'authorEmail', 'finalRank', 
    'studentScore', 'teacherScore', 'totalScore', 'allocatedPoints', 'rewardPercentage'
  ]
};

// Cache management
const workbookCache = new Map();
const dataCache = new Map();
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize the database system
 */
function initializeDatabase() {
  console.log('Initializing database system...');
  
  // Check DATABASE_FOLDER
  const databaseFolder = PropertiesService.getScriptProperties().getProperty('DATABASE_FOLDER_ID');
  if (!databaseFolder) {
    throw new Error('Please set DATABASE_FOLDER_ID in Script Properties');
  }
  
  // Check if global workbook exists
  let globalWorkbookId = PropertiesService.getScriptProperties().getProperty('GLOBAL_WORKBOOK_ID');
  
  if (!globalWorkbookId) {
    // Create global workbook
    const globalWorkbook = createGlobalWorkbook();
    globalWorkbookId = globalWorkbook.getId();
    PropertiesService.getScriptProperties().setProperty('GLOBAL_WORKBOOK_ID', globalWorkbookId);
    console.log('Created global workbook:', globalWorkbookId);
  }
  
  console.log('Database system initialized successfully');
  return SpreadsheetApp.openById(globalWorkbookId);
}

/**
 * Create the global workbook with all required sheets
 */
function createGlobalWorkbook() {
  const databaseFolderId = PropertiesService.getScriptProperties().getProperty('DATABASE_FOLDER_ID');
  const folder = DriveApp.getFolderById(databaseFolderId);
  
  const spreadsheet = SpreadsheetApp.create('ScoringSystem-Global');
  const file = DriveApp.getFileById(spreadsheet.getId());
  file.moveTo(folder);
  
  setupGlobalWorkbookStructure(spreadsheet);
  
  return spreadsheet;
}

/**
 * Setup global workbook structure
 */
function setupGlobalWorkbookStructure(spreadsheet) {
  const defaultSheet = spreadsheet.getActiveSheet();
  
  // Create all sheets from template
  Object.keys(GLOBAL_WORKBOOK_TEMPLATES).forEach(sheetName => {
    const headers = GLOBAL_WORKBOOK_TEMPLATES[sheetName];
    createSheetWithHeaders(spreadsheet, sheetName, headers);
  });
  
  // Delete default sheet
  if (defaultSheet.getName() !== 'Projects') {
    spreadsheet.deleteSheet(defaultSheet);
  }
}

/**
 * Create a project workbook
 */
function createProjectWorkbook(projectId, projectName) {
  const databaseFolderId = PropertiesService.getScriptProperties().getProperty('DATABASE_FOLDER_ID');
  const folder = DriveApp.getFolderById(databaseFolderId);
  
  const workbookName = 'ScoringSystem-Project-' + projectId;
  const spreadsheet = SpreadsheetApp.create(workbookName);
  const file = DriveApp.getFileById(spreadsheet.getId());
  file.moveTo(folder);
  
  setupProjectWorkbookStructure(spreadsheet, projectId, projectName);
  
  return {
    workbookId: spreadsheet.getId(),
    spreadsheet: spreadsheet
  };
}

/**
 * Setup project workbook structure
 */
function setupProjectWorkbookStructure(spreadsheet, projectId, projectName) {
  const defaultSheet = spreadsheet.getActiveSheet();
  
  // Create all sheets from template
  Object.keys(PROJECT_WORKBOOK_TEMPLATES).forEach(sheetName => {
    const headers = PROJECT_WORKBOOK_TEMPLATES[sheetName];
    createSheetWithHeaders(spreadsheet, sheetName, headers);
  });
  
  // Add initial project info
  const projectInfoSheet = spreadsheet.getSheetByName('ProjectInfo');
  const projectInfo = {
    projectId: projectId,
    projectName: projectName,
    description: '',
    totalStages: 0,
    currentStage: 0,
    status: 'active',
    createdBy: Session.getActiveUser().getEmail(),
    createdTime: Date.now(),
    lastModified: Date.now()
  };
  
  const headers = PROJECT_WORKBOOK_TEMPLATES.ProjectInfo;
  const rowData = headers.map(header => projectInfo[header] || '');
  projectInfoSheet.appendRow(rowData);
  
  // Delete default sheet
  if (defaultSheet.getName() !== 'ProjectInfo') {
    spreadsheet.deleteSheet(defaultSheet);
  }
}

/**
 * Create sheet with headers and formatting
 */
function createSheetWithHeaders(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.insertSheet(sheetName);
  
  // Set headers
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  
  // Format headers
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f0f0f0');
  headerRange.setHorizontalAlignment('center');
  
  // Set column widths based on content type
  headers.forEach((header, index) => {
    if (header.includes('Id') || header.includes('Email')) {
      sheet.setColumnWidth(index + 1, 150);
    } else if (header.includes('Time') || header.includes('Date')) {
      sheet.setColumnWidth(index + 1, 120);
    } else if (header.includes('content') || header.includes('description')) {
      sheet.setColumnWidth(index + 1, 300);
    }
  });
  
  return sheet;
}

/**
 * Get global workbook
 */
function getGlobalWorkbook() {
  const globalWorkbookId = PropertiesService.getScriptProperties().getProperty('GLOBAL_WORKBOOK_ID');
  if (!globalWorkbookId) {
    throw new Error('Global workbook not initialized');
  }
  
  // Check cache
  if (workbookCache.has('global')) {
    const cached = workbookCache.get('global');
    if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.workbook;
    }
  }
  
  const workbook = SpreadsheetApp.openById(globalWorkbookId);
  workbookCache.set('global', {
    workbook: workbook,
    timestamp: Date.now()
  });
  
  return workbook;
}

/**
 * Get project workbook
 */
function getProjectWorkbook(projectId) {
  // Check cache
  const cacheKey = 'project_' + projectId;
  if (workbookCache.has(cacheKey)) {
    const cached = workbookCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.workbook;
    }
  }
  
  // Get workbook ID from global data
  const globalData = readGlobalData();
  const projectInfo = globalData.projects.find(p => p.projectId === projectId);
  
  if (!projectInfo || !projectInfo.workbookId) {
    throw new Error('Project workbook not found: ' + projectId);
  }
  
  const workbook = SpreadsheetApp.openById(projectInfo.workbookId);
  workbookCache.set(cacheKey, {
    workbook: workbook,
    timestamp: Date.now()
  });
  
  return workbook;
}

/**
 * Read all data from global workbook
 */
function readGlobalData() {
  // Check cache
  if (dataCache.has('global')) {
    const cached = dataCache.get('global');
    if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.data;
    }
  }
  
  const globalWorkbook = getGlobalWorkbook();
  
  const data = {
    projects: readFullSheet(globalWorkbook, 'Projects'),
    users: readFullSheet(globalWorkbook, 'Users'),
    systemConfigs: readFullSheet(globalWorkbook, 'SystemConfigs'),
    invitationCodes: readFullSheet(globalWorkbook, 'InvitationCodes')
  };
  
  // Try to read new global permission tables (may not exist in older databases)
  try {
    data.globalgroups = readFullSheet(globalWorkbook, 'GlobalGroups');
  } catch (error) {
    console.warn('GlobalGroups sheet not found, creating empty array');
    data.globalgroups = [];
  }
  
  try {
    data.globalusergroups = readFullSheet(globalWorkbook, 'GlobalUserGroups');
  } catch (error) {
    console.warn('GlobalUserGroups sheet not found, creating empty array');
    data.globalusergroups = [];
  }
  
  // Cache the data
  dataCache.set('global', {
    data: data,
    timestamp: Date.now()
  });
  
  return data;
}

/**
 * Read all data from project workbook
 */
function readProjectData(projectId) {
  // Check cache
  const cacheKey = 'project_' + projectId;
  if (dataCache.has(cacheKey)) {
    const cached = dataCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.data;
    }
  }
  
  const projectWorkbook = getProjectWorkbook(projectId);
  
  const sheetNames = Object.keys(PROJECT_WORKBOOK_TEMPLATES);
  const projectData = {};
  
  sheetNames.forEach(sheetName => {
    try {
      projectData[sheetName.toLowerCase()] = readFullSheet(projectWorkbook, sheetName);
    } catch (error) {
      // 只對某些必要表顯示錯誤，其他表靜默跳過
      const criticalTables = ['Comments', 'CommentRankingProposals', 'TeacherCommentRankings', 'TeacherSubmissionRankings', 'UserGroups'];
      if (criticalTables.includes(sheetName)) {
        console.log('Critical sheet ' + sheetName + ' not found or read failed: ' + error.message);
      }
      projectData[sheetName.toLowerCase()] = [];
    }
  });
  
  // Cache the data
  dataCache.set(cacheKey, {
    data: projectData,
    timestamp: Date.now()
  });
  
  return projectData;
}

/**
 * Read full sheet data
 */
function readFullSheet(workbook, sheetName) {
  const sheet = workbook.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return []; // No data rows
  }
  
  const headers = data[0];
  
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Add row to sheet
 */
function addRowToSheet(projectId, sheetName, data) {
  const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
  const sheet = workbook.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = headers.map(header => data[header] !== undefined ? data[header] : '');
  
  sheet.appendRow(newRow);
  
  // Invalidate cache
  invalidateCache(projectId || 'global');
}

/**
 * Update sheet row
 * @param {string} projectId - Project ID or null for global
 * @param {string} sheetName - Name of the sheet
 * @param {string} idField - Field name to identify the row
 * @param {any} idValue - Value to match in the idField
 * @param {Object} updates - Object with fields to update
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [customSpreadsheet] - Optional custom spreadsheet to use
 */
function updateSheetRow(projectId, sheetName, idField, idValue, updates, customSpreadsheet) {
  const workbook = customSpreadsheet || (projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook());
  const sheet = workbook.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const idColIndex = headers.indexOf(idField);
  if (idColIndex === -1) {
    throw new Error('ID field not found: ' + idField);
  }
  
  const rowIndex = data.findIndex((row, index) => 
    index > 0 && row[idColIndex] === idValue
  );
  
  if (rowIndex === -1) {
    throw new Error('Row not found with ' + idField + ': ' + idValue);
  }
  
  // Update fields
  Object.keys(updates).forEach(field => {
    const colIndex = headers.indexOf(field);
    if (colIndex !== -1) {
      sheet.getRange(rowIndex + 1, colIndex + 1).setValue(updates[field]);
    }
  });
  
  // Invalidate cache only for standard workbooks (not custom spreadsheets)
  if (!customSpreadsheet) {
    invalidateCache(projectId || 'global');
  }
}

/**
 * Batch add rows
 */
function batchAddRows(projectId, sheetName, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  
  const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
  const sheet = workbook.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const newRows = dataArray.map(data => 
    headers.map(header => data[header] !== undefined ? data[header] : '')
  );
  
  if (newRows.length > 0) {
    sheet.getRange(
      sheet.getLastRow() + 1, 
      1, 
      newRows.length, 
      headers.length
    ).setValues(newRows);
  }
  
  // Invalidate cache
  invalidateCache(projectId || 'global');
}

/**
 * Filter data in memory
 */
function filterDataInMemory(data, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }
  
  return data.filter(item => {
    return Object.keys(filters).every(key => {
      const filterValue = filters[key];
      const itemValue = item[key];
      
      if (filterValue === undefined || filterValue === null) {
        return true;
      }
      
      if (Array.isArray(filterValue)) {
        return filterValue.includes(itemValue);
      }
      
      return itemValue === filterValue;
    });
  });
}

/**
 * Invalidate cache
 */
function invalidateCache(key) {
  if (key === 'global') {
    dataCache.delete('global');
    workbookCache.delete('global');
  } else if (key) {
    const cacheKey = 'project_' + key;
    dataCache.delete(cacheKey);
    workbookCache.delete(cacheKey);
  }
}

/**
 * Clear all cache
 */
function clearAllCache() {
  dataCache.clear();
  workbookCache.clear();
}

/**
 * Ensure table exists, create if it doesn't
 * @param {string} projectId - Project ID or null for global
 * @param {string} tableName - Name of the table/sheet
 * @param {Array} headers - Array of column headers
 */
function ensureTableExists(projectId, tableName, headers) {
  try {
    const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
    
    // Check if sheet already exists
    let sheet = workbook.getSheetByName(tableName);
    
    if (!sheet) {
      // Create sheet with headers
      createSheetWithHeaders(workbook, tableName, headers);
      console.log(`Created table ${tableName} with headers:`, headers);
    } else {
      // Verify headers match
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const missingHeaders = headers.filter(h => !existingHeaders.includes(h));
      
      if (missingHeaders.length > 0) {
        console.warn(`Table ${tableName} exists but missing headers:`, missingHeaders);
        // Optionally could add missing columns here
      }
    }
  } catch (error) {
    console.error(`Failed to ensure table ${tableName} exists:`, error);
    throw error;
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeDatabase,
    createProjectWorkbook,
    getGlobalWorkbook,
    getProjectWorkbook,
    readGlobalData,
    readProjectData,
    readFullSheet,
    addRowToSheet,
    updateSheetRow,
    batchAddRows,
    filterDataInMemory,
    invalidateCache,
    clearAllCache,
    ensureTableExists,
    GLOBAL_WORKBOOK_TEMPLATES,
    PROJECT_WORKBOOK_TEMPLATES
  };
}