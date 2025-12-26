/**
 * 階段狀態判定工具函數
 * 統一管理所有階段狀態的計算邏輯
 */

/**
 * 計算階段的實際狀態
 * @param {Object} stage - 階段物件
 * @param {number|string} stage.startDate - 開始時間 (timestamp 或 ISO string)
 * @param {number|string} stage.endDate - 結束時間 (timestamp 或 ISO string)
 * @param {string} stage.status - 階段狀態
 * @returns {string} 計算後的階段狀態
 */
export function calculateStageStatus(stage) {
  if (!stage) return 'pending'
  
  const now = Date.now()
  
  // 處理不同的時間格式 (timestamp 或 ISO string)
  let startDate = stage.startDate
  let endDate = stage.endDate
  
  if (typeof startDate === 'string') {
    startDate = new Date(startDate).getTime()
  }
  if (typeof endDate === 'string') {
    endDate = new Date(endDate).getTime()
  }
  
  // 如果已經手動設置為完成或封存狀態，保持原狀態
  if (stage.status === 'completed' || stage.status === 'archived') {
    return stage.status
  }
  
  // 如果已經手動設置為投票狀態，保持投票狀態
  if (stage.status === 'voting') {
    return 'voting'
  }
  
  // 根據時間判斷狀態
  if (now < startDate) {
    return 'pending' // 尚未開始
  } else if (now >= startDate && now < endDate) {
    return 'active' // 進行中
  } else if (now >= endDate) {
    return 'voting' // 應該進入投票階段
  }
  
  // 如果時間資料有問題，至少返回一個合理的預設狀態
  return 'pending'
}

/**
 * 獲取階段狀態的顯示文字
 * @param {Object} stage - 階段物件
 * @returns {string} 狀態顯示文字
 */
export function getStageStatusText(stage) {
  const status = calculateStageStatus(stage)
  switch (status) {
    case 'pending': return '尚未開始'
    case 'active': return '進行中'
    case 'voting': return '投票中'
    case 'completed': return '已結束'
    case 'archived': return '已封存'
    default: return '尚未開始' // 預設為尚未開始，不再有未知狀態
  }
}

/**
 * 獲取階段狀態的CSS類型
 * @param {Object} stage - 階段物件
 * @returns {string} CSS類型
 */
export function getStageStatusType(stage) {
  const status = calculateStageStatus(stage)
  switch (status) {
    case 'pending': return 'info'
    case 'active': return 'success'
    case 'voting': return 'warning'
    case 'completed': return 'primary'
    case 'archived': return 'secondary'
    default: return 'info'
  }
}

/**
 * 找到專案中當前進行中的階段（可能有多個）
 * @param {Array} stages - 階段陣列
 * @returns {Array} 當前進行中的階段陣列
 */
export function getCurrentActiveStages(stages) {
  if (!stages || stages.length === 0) return []
  
  return stages.filter(stage => calculateStageStatus(stage) === 'active')
}

/**
 * 找到專案中當前進行中的階段（優先選擇第一個）
 * @param {Array} stages - 階段陣列
 * @returns {Object|null} 當前進行中的階段
 */
export function getCurrentActiveStage(stages) {
  if (!stages || stages.length === 0) return null
  
  const activeStages = getCurrentActiveStages(stages)
  return activeStages.length > 0 ? activeStages[0] : null
}

/**
 * 獲取專案當前階段的顯示資訊（包含前後各一個階段）
 * @param {Array} stages - 階段陣列（需要按順序排序）
 * @returns {Object} 包含當前階段和前後階段的資訊
 */
export function getProjectStageDisplay(stages) {
  if (!stages || stages.length === 0) {
    return {
      currentStage: null,
      previousStage: null,
      nextStage: null,
      displayStages: []
    }
  }
  
  // 按階段順序排序
  const sortedStages = [...stages].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
  
  // 找到當前進行中的所有階段
  const activeStages = getCurrentActiveStages(sortedStages)
  
  let currentStage = null
  let previousStage = null
  let nextStage = null
  let displayStages = []
  let currentStageIndex = -1
  
  if (activeStages.length > 0) {
    // 有進行中的階段（可能多個）
    // 選擇最早的進行中階段作為"當前"階段
    currentStage = activeStages[0]
    currentStageIndex = sortedStages.findIndex(stage => stage.stageId === currentStage.stageId)
    
    previousStage = currentStageIndex > 0 ? sortedStages[currentStageIndex - 1] : null
    nextStage = currentStageIndex < sortedStages.length - 1 ? sortedStages[currentStageIndex + 1] : null
    
    // 構建顯示陣列
    if (previousStage) displayStages.push(previousStage)
    
    // 如果有多個進行中的階段，都要顯示
    if (activeStages.length === 1) {
      displayStages.push(currentStage)
    } else {
      // 多個進行中階段：顯示所有進行中的階段，避免重複
      activeStages.forEach(stage => {
        // 檢查是否已經存在於 displayStages 中（避免與 previousStage 重複）
        const alreadyExists = displayStages.some(existingStage => 
          existingStage.stageId === stage.stageId
        )
        if (!alreadyExists) {
          displayStages.push(stage)
        }
      })
    }
    
    // 添加下一個階段（如果存在且不重複）
    if (nextStage) {
      const nextStageAlreadyExists = displayStages.some(existingStage => 
        existingStage.stageId === nextStage.stageId
      )
      if (!nextStageAlreadyExists) {
        displayStages.push(nextStage)
      }
    }
  } else {
    // 沒有進行中的階段，檢查是否有尚未開始的階段
    const pendingStageIndex = sortedStages.findIndex(stage => calculateStageStatus(stage) === 'pending')
    
    if (pendingStageIndex >= 0) {
      // 有尚未開始的階段，以最接近的尚未開始階段為中心
      currentStage = sortedStages[pendingStageIndex]
      previousStage = pendingStageIndex > 0 ? sortedStages[pendingStageIndex - 1] : null
      nextStage = pendingStageIndex < sortedStages.length - 1 ? sortedStages[pendingStageIndex + 1] : null
      
      if (previousStage) displayStages.push(previousStage)
      displayStages.push(currentStage)
      if (nextStage) displayStages.push(nextStage)
    } else {
      // 所有階段都已結束，顯示最後3個階段
      displayStages = sortedStages.slice(-3)
      if (displayStages.length > 0) {
        currentStage = displayStages[displayStages.length - 1] // 最後一個為"當前"
      }
    }
  }
  
  // 最終去重檢查：確保 displayStages 中沒有重複的 stageId
  const uniqueDisplayStages = []
  const seenStageIds = new Set()
  
  for (const stage of displayStages) {
    if (stage && stage.stageId && !seenStageIds.has(stage.stageId)) {
      uniqueDisplayStages.push(stage)
      seenStageIds.add(stage.stageId)
    }
  }
  
  return {
    currentStage,
    activeStages: activeStages.length > 0 ? activeStages : [],
    previousStage,
    nextStage,
    displayStages: uniqueDisplayStages,
    currentStageIndex,
    hasMultipleActiveStages: activeStages.length > 1
  }
}

/**
 * 計算階段剩餘時間
 * @param {Object} stage - 階段物件
 * @returns {Object} 剩餘時間資訊
 */
export function getStageTimeRemaining(stage) {
  if (!stage) return { text: '', timeLeft: 0, percentage: 100, colorClass: 'success' }
  
  const now = Date.now()
  let endDate = stage.endDate
  let startDate = stage.startDate
  
  if (typeof endDate === 'string') {
    endDate = new Date(endDate).getTime()
  }
  if (typeof startDate === 'string') {
    startDate = new Date(startDate).getTime()
  }
  
  const timeLeft = endDate - now
  const totalTime = endDate - startDate
  const percentage = totalTime > 0 ? Math.max(0, Math.min(100, (timeLeft / totalTime) * 100)) : 0
  
  // 根據剩餘時間百分比決定顏色
  let colorClass = 'success' // 綠色
  if (percentage < 30) {
    colorClass = 'danger' // 紅色
  } else if (percentage < 60) {
    colorClass = 'warning' // 橙色
  }
  
  if (timeLeft <= 0) {
    return { text: '已截止', timeLeft: 0, percentage: 0, colorClass: 'danger' }
  }
  
  // 格式化剩餘時間文字
  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000))
  const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
  
  let text = ''
  if (days > 0) {
    text = `${days}天${hours}小時`
  } else if (hours > 0) {
    text = `${hours}小時${minutes}分鐘`
  } else {
    text = `${minutes}分鐘`
  }
  
  return { text, timeLeft, percentage, colorClass }
}