/**
 * @fileoverview Utility functions for the scoring system
 * @module Utils
 */

/**
 * Generate UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate ID with type prefix
 */
function generateIdWithType(type) {
  const typeMap = {
    'project': 'proj',
    'stage': 'stg',
    'submission': 'sub',
    'group': 'grp',
    'user': 'usr',
    'member': 'mbr',
    'mapping': 'map',
    'ranking': 'rnk',
    'comment': 'cmt',
    'transaction': 'txn',
    'vote': 'vote',
    'log': 'log',
    'config': 'cfg',
    'proposal': 'prop',
    'systemranking': 'srnk',
    'commentranking': 'crnk',
    'notification': 'noti',
    'wallet': 'wlt',
    'session': 'sess',
    'invitation': 'inv'
  };
  
  const prefix = typeMap[type] || type;
  return prefix + '_' + generateUUID();
}

/**
 * Standard error response format
 */
function createErrorResponse(code, message, context = null) {
  return {
    success: false,
    error: {
      code: code,
      message: message,
      context: context,
      timestamp: Date.now()
    }
  };
}

/**
 * Standard success response format
 */
function createSuccessResponse(data = null, message = null) {
  const response = {
    success: true,
    timestamp: Date.now()
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * Success response with session information
 */
function createSuccessResponseWithSession(sessionId, data = null, message = null) {
  const response = createSuccessResponse(data, message);
  
  // Add session information if sessionId is provided
  if (sessionId) {
    const sessionData = validateSession(sessionId);
    if (sessionData) {
      response.session = {
        sessionId: sessionId,
        expiryTime: sessionData.expiryTime,
        remainingTime: sessionData.expiryTime - getCurrentTimestamp(),
        sessionTimeout: getSessionTimeout(), // Include session timeout configuration
        isValid: true
      };
    } else {
      response.session = {
        sessionId: sessionId,
        isValid: false,
        message: 'Session已過期或無效'
      };
    }
  }
  
  return response;
}

/**
 * Error response with session information
 */
function createErrorResponseWithSession(sessionId, code, message, context = null) {
  const response = createErrorResponse(code, message, context);
  
  // Add session information if sessionId is provided
  if (sessionId) {
    const sessionData = validateSession(sessionId);
    if (sessionData) {
      response.session = {
        sessionId: sessionId,
        expiryTime: sessionData.expiryTime,
        remainingTime: sessionData.expiryTime - getCurrentTimestamp(),
        isValid: true
      };
    } else {
      response.session = {
        sessionId: sessionId,
        isValid: false,
        message: 'Session已過期或無效'
      };
    }
  }
  
  return response;
}

/**
 * Validate email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate UUID format
 */
function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Validate project ID format
 */
function validateProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return false;
  }
  return projectId.startsWith('proj_') && projectId.length === 41;
}

/**
 * Validate stage ID format
 */
function validateStageId(stageId) {
  if (!stageId || typeof stageId !== 'string') {
    logInfo('validateStageId: Invalid type', { stageId, type: typeof stageId });
    return false;
  }
  
  const isValidPrefix = stageId.startsWith('stg_');
  const isValidLength = stageId.length === 40;
  
  logInfo('validateStageId: Validation check', {
    stageId: stageId,
    length: stageId.length,
    hasPrefix: isValidPrefix,
    hasValidLength: isValidLength,
    isValid: isValidPrefix && isValidLength
  });
  
  return isValidPrefix && isValidLength;
}

/**
 * Validate group ID format
 */
function validateGroupId(groupId) {
  if (!groupId || typeof groupId !== 'string') {
    return false;
  }
  return groupId.startsWith('grp_') && groupId.length === 40;
}

/**
 * Validate user ID format
 */
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  return userId.startsWith('usr_') && userId.length === 40;
}

/**
 * Validate submission ID format
 */
function validateSubmissionId(submissionId) {
  if (!submissionId || typeof submissionId !== 'string') {
    return false;
  }
  return submissionId.startsWith('sub_') && submissionId.length === 40;
}


/**
 * Sanitize string input - 增強版安全清理
 * 防止XSS、SQL注入和其他惡意輸入
 */
function sanitizeString(str, maxLength = 1000) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  
  // 參數驗證
  if (typeof maxLength !== 'number' || maxLength < 0) {
    throw new Error('maxLength must be a positive number');
  }
  
  let cleaned = str;
  
  // 1. 移除所有script標籤及其內容
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // 2. 移除所有HTML標籤
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // 3. 移除危險的JavaScript協議
  cleaned = cleaned.replace(/javascript:/gi, '');
  cleaned = cleaned.replace(/vbscript:/gi, '');
  cleaned = cleaned.replace(/data:text\/html/gi, '');
  
  // 4. 移除事件處理器屬性
  cleaned = cleaned.replace(/on\w+\s*=/gi, '');
  
  // 5. HTML實體編碼特殊字符
  cleaned = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // 6. 移除控制字符（保留換行和tab）
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // 7. 去除首尾空白
  cleaned = cleaned.trim();
  
  // 8. 限制長度
  return cleaned.length > maxLength ? cleaned.substring(0, maxLength) : cleaned;
}

/**
 * Sanitize Markdown content - 保留Markdown語法但移除危險內容
 * 用於評論、報告等支援Markdown的內容
 */
function sanitizeMarkdown(content, maxLength = 10000) {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  let cleaned = content;
  
  // 1. 移除script標籤但保留程式碼區塊
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[removed script]');
  
  // 2. 移除危險的HTML（但保留Markdown語法）
  cleaned = cleaned.replace(/<(?!\/?(pre|code|blockquote|p|br|hr|h[1-6]|ul|ol|li|strong|em|a|img)\b)[^>]+>/gi, '');
  
  // 3. 清理危險的協議
  cleaned = cleaned.replace(/javascript:/gi, '[removed]');
  cleaned = cleaned.replace(/vbscript:/gi, '[removed]');
  cleaned = cleaned.replace(/data:text\/html/gi, '[removed]');
  
  // 4. 清理事件處理器
  cleaned = cleaned.replace(/on\w+\s*=/gi, '');
  
  // 5. 清理圖片和連結的URL
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(javascript:[^)]+\)/gi, '![$1](#)');
  cleaned = cleaned.replace(/\[([^\]]*)\]\(javascript:[^)]+\)/gi, '[$1](#)');
  
  // 6. 限制長度
  return cleaned.length > maxLength ? cleaned.substring(0, maxLength) : cleaned;
}

/**
 * Validate JSON string
 */
function validateJsonString(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return false;
  }
  
  try {
    JSON.parse(jsonStr);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Safe JSON parse
 */
function safeJsonParse(jsonStr, defaultValue = null) {
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn('JSON parse failed:', error.message);
    return defaultValue;
  }
}

/**
 * Safe JSON stringify
 */
function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn('JSON stringify failed:', error.message);
    return defaultValue;
  }
}

/**
 * Get current timestamp
 */
function getCurrentTimestamp() {
  return Date.now();
}

/**
 * Add days to timestamp
 */
function addDaysToTimestamp(timestamp, days) {
  return timestamp + (days * 24 * 60 * 60 * 1000);
}

/**
 * Check if timestamp is in the past
 */
function isTimestampPast(timestamp) {
  return timestamp < Date.now();
}

/**
 * Check if timestamp is in the future
 */
function isTimestampFuture(timestamp) {
  return timestamp > Date.now();
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString('zh-TW');
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Validate required fields
 */
function validateRequiredFields(obj, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    if (!obj.hasOwnProperty(field) || obj[field] === null || obj[field] === undefined || obj[field] === '') {
      missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Log operation to EventLogs table
 * @param {string} projectId - Project ID (null for global operations)
 * @param {string} userEmail - User email
 * @param {string} action - Action performed
 * @param {string} resourceType - Resource type
 * @param {string} resourceId - Resource ID
 * @param {Object} details - Additional details
 * @returns {Object|null} Log entry object or null if failed
 */
function logOperation(projectId, userEmail, action, resourceType, resourceId, details = {}, ipAddress = '') {
  try {
    const logEntry = {
      logId: generateIdWithType('log'),
      userEmail: userEmail,
      action: action,
      resourceType: resourceType,
      resourceId: resourceId,
      details: safeJsonStringify(details),
      timestamp: getCurrentTimestamp(),
      ipAddress: ipAddress || '' // IP address from frontend if available
    };

    // Write to EventLogs sheet if projectId is provided
    if (projectId) {
      try {
        addRowToSheet(projectId, 'EventLogs', logEntry);
      } catch (error) {
        console.error('Failed to write event log to sheet:', error.message);
      }
    }

    return logEntry;
  } catch (error) {
    console.error('Log operation failed:', error.message);
    return null;
  }
}

/**
 * Check if two arrays are equal (same elements in same order)
 */
function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every((val, index) => val === arr2[index]);
}

/**
 * Check if user has permission
 */
function hasPermission(userPermissions, requiredPermission) {
  if (!Array.isArray(userPermissions)) {
    return false;
  }
  
  return userPermissions.includes(requiredPermission);
}

/**
 * Get user permissions from project groups
 */
function getUserPermissions(userEmail, projectGroups, userGroups) {
  const permissions = new Set();
  
  // Find user's groups
  const userGroupIds = userGroups
    .filter(ug => ug.userEmail === userEmail && ug.isActive)
    .map(ug => ug.groupId);
  
  // Get permissions from project groups
  projectGroups.forEach(pg => {
    if (userGroupIds.includes(pg.groupId)) {
      const groupPermissions = safeJsonParse(pg.permissions, []);
      groupPermissions.forEach(permission => permissions.add(permission));
    }
  });
  
  return Array.from(permissions);
}

/**
 * Check if two users share at least one tag (scope checking)
 */
function usersShareTagScope(userEmail1, userEmail2) {
  try {
    // System admins can access all scopes
    if (isSystemAdmin(userEmail1) || isSystemAdmin(userEmail2)) {
      return true;
    }
    
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    
    const user1Tags = userTags
      .filter(ut => ut.userEmail === userEmail1 && ut.isActive)
      .map(ut => ut.tagId);
    
    const user2Tags = userTags
      .filter(ut => ut.userEmail === userEmail2 && ut.isActive)
      .map(ut => ut.tagId);
    
    // If either user has no tags, they cannot interact (strict scope)
    if (user1Tags.length === 0 || user2Tags.length === 0) {
      return false;
    }
    
    // Check if they have exactly the same set of tags
    if (user1Tags.length !== user2Tags.length) {
      return false;
    }
    
    // Sort both arrays and compare
    const sortedUser1Tags = [...user1Tags].sort();
    const sortedUser2Tags = [...user2Tags].sort();
    
    return sortedUser1Tags.every((tagId, index) => tagId === sortedUser2Tags[index]);
    
  } catch (error) {
    console.warn('Failed to check user tag scope:', error.message);
    return false;
  }
}

/**
 * Check if user can access a project based on tag scope
 */
function userCanAccessProjectByTagScope(userEmail, projectId) {
  try {
    // System admins can access all projects
    if (isSystemAdmin(userEmail)) {
      return true;
    }
    
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    const projectTags = readFullSheet(globalDb, 'ProjectTags') || [];
    
    const userTagIds = userTags
      .filter(ut => ut.userEmail === userEmail && ut.isActive)
      .map(ut => ut.tagId);
    
    const projectTagIds = projectTags
      .filter(pt => pt.projectId === projectId && pt.isActive)
      .map(pt => pt.tagId);
    
    // If user has no tags or project has no tags, deny access (strict scope)
    if (userTagIds.length === 0 || projectTagIds.length === 0) {
      return false;
    }
    
    // Check if user has exactly the same set of tags as project
    if (userTagIds.length !== projectTagIds.length) {
      return false;
    }
    
    // Sort both arrays and compare
    const sortedUserTags = [...userTagIds].sort();
    const sortedProjectTags = [...projectTagIds].sort();
    
    return sortedUserTags.every((tagId, index) => tagId === sortedProjectTags[index]);
    
  } catch (error) {
    console.warn('Failed to check project tag scope:', error.message);
    return false;
  }
}

/**
 * Filter users by tag scope for the current user
 */
function filterUsersByTagScope(currentUserEmail, users) {
  try {
    if (isSystemAdmin(currentUserEmail)) {
      return users;
    }
    
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    const currentUserTagIds = userTags
      .filter(ut => ut.userEmail === currentUserEmail && ut.isActive)
      .map(ut => ut.tagId);
    
    // If current user has no tags, they cannot see other users (strict scope)
    if (currentUserTagIds.length === 0) {
      return [];
    }
    
    return users.filter(user => {
      const userTagIds = userTags
        .filter(ut => ut.userEmail === user.userEmail && ut.isActive)
        .map(ut => ut.tagId);
      
      // Include only users who have exactly the same tag set
      return arraysEqual(currentUserTagIds.sort(), userTagIds.sort());
    });
    
  } catch (error) {
    console.warn('Failed to filter users by tag scope:', error.message);
    return users;
  }
}

/**
 * Retry function with exponential backoff
 */
function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    
    function executeAttempt() {
      attempt++;
      
      try {
        const result = fn();
        resolve(result);
      } catch (error) {
        if (attempt >= maxRetries) {
          reject(error);
          return;
        }
        
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        
        setTimeout(executeAttempt, delay);
      }
    }
    
    executeAttempt();
  });
}

/**
 * Batch process array with size limit
 */
function batchProcess(array, batchSize, processor) {
  const results = [];
  
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResult = processor(batch, i);
    results.push(batchResult);
  }
  
  return results;
}

/**
 * Deep clone object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });
  
  return cloned;
}

/**
 * Merge objects
 */
function mergeObjects(target, source) {
  const result = deepClone(target);
  
  Object.keys(source).forEach(key => {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeObjects(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  });
  
  return result;
}

/**
 * 安全的Markdown清理函數
 * 只允許特定的markdown語法和HTML標籤
 */
function sanitizeMarkdown(markdown) {
  if (!markdown) return '';
  
  // 先進行基本的HTML實體編碼
  let cleaned = markdown
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // 允許的標籤模式
  const allowedPatterns = [
    // 粗體
    { pattern: /\*\*(.*?)\*\*/g, tag: '**$1**' },
    // 斜體
    { pattern: /\*(.*?)\*/g, tag: '*$1*' },
    // 底線（HTML標籤）
    { pattern: /&lt;u&gt;(.*?)&lt;\/u&gt;/g, tag: '<u>$1</u>' },
    // 連結
    { pattern: /\[([^\]]*)\]\(([^\)]*)\)/g, tag: '[$1]($2)' },
    // 圖片
    { pattern: /!\[([^\]]*)\]\(([^\)]*)\)/g, tag: '![$1]($2)' },
    // 無序列表
    { pattern: /^\* (.+)$/gm, tag: '* $1' },
    // 有序列表
    { pattern: /^\d+\. (.+)$/gm, tag: '$&' }
  ];
  
  // 先還原允許的HTML標籤
  cleaned = cleaned.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
  
  // 移除所有其他HTML標籤
  cleaned = cleaned.replace(/<(?!u|\/u)[^>]*>/g, '');
  
  // 驗證URL
  cleaned = cleaned.replace(/\[([^\]]*)\]\(([^\)]*)\)/g, function(match, text, url) {
    // 只允許http(s)和相對路徑
    if (url.match(/^(https?:\/\/|\/|\.\/|\.\.\/)/)) {
      return `[${text}](${url})`;
    }
    return text; // 移除不安全的連結
  });
  
  // 驗證圖片URL
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^\)]*)\)/g, function(match, alt, url) {
    // 只允許http(s)和相對路徑
    if (url.match(/^(https?:\/\/|\/|\.\/|\.\.\/)/)) {
      return `![${alt}](${url})`;
    }
    return alt; // 移除不安全的圖片
  });
  
  return cleaned;
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateUUID,
    generateIdWithType,
    createErrorResponse,
    createSuccessResponse,
    validateEmail,
    validateUUID,
    validateProjectId,
    validateStageId,
    validateGroupId,
    validateUserId,
    validateSubmissionId,
    sanitizeString,
    validateJsonString,
    safeJsonParse,
    safeJsonStringify,
    getCurrentTimestamp,
    addDaysToTimestamp,
    isTimestampPast,
    isTimestampFuture,
    formatTimestamp,
    validateRequiredFields,
    logOperation,
    arraysEqual,
    hasPermission,
    getUserPermissions,
    retryWithBackoff,
    batchProcess,
    deepClone,
    mergeObjects,
    sanitizeMarkdown
  };
}