/**
 * 主題配色方案（WCAG AA 合規）
 *
 * 此文件定義了專案中所有階段狀態與按鈕的配色方案，確保符合 WCAG 2.0 AA 無障礙標準。
 * 所有組件應該從此文件導入配色，而非硬編碼顏色值。
 *
 * @version 2.0.0
 * @updated 2025-12-10
 * @see https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
/**
 * 階段狀態配色常量
 *
 * 配色來源：
 * - Pending: 橙色系（避免黃色的對比度問題）
 * - Active: Bootstrap 5 Success 深綠色
 * - Voting: Bootstrap 5 Danger 深紅色
 * - Completed: 深灰色（加深至完全通過 AA 標準）
 */
export var STAGE_COLORS = {
    pending: {
        background: '#f39c12',
        text: '#000000',
        contrast: 7.2,
        description: '尚未開始 - 橙色（WCAG AA 合規）',
        gradient: {
            start: '#FFAA5A',
            end: '#D35400'
        }
    },
    active: {
        background: '#198754',
        text: '#ffffff',
        contrast: 4.7,
        description: '進行中 - 深綠色（Bootstrap 5 標準）',
        gradient: {
            start: '#4ECDC4',
            end: '#0E6655'
        }
    },
    voting: {
        background: '#c82333',
        text: '#ffffff',
        contrast: 5.5,
        description: '投票中 - 深紅色（WCAG AA 合規）',
        gradient: {
            start: '#FF6B9D',
            end: '#A31545'
        }
    },
    completed: {
        background: '#5a6268',
        text: '#ffffff',
        contrast: 5.3,
        description: '已完成 - 深灰色（WCAG AA 合規）',
        gradient: {
            start: '#7DCEA0',
            end: '#1E8449'
        }
    }
};
/**
 * 獲取階段背景顏色
 *
 * @param status - 階段顯示狀態
 * @returns 背景顏色 hex 值
 *
 * @example
 * ```typescript
 * const bgColor = getStageColor('active') // '#198754'
 * ```
 */
export function getStageColor(status) {
    if (!status || !(status in STAGE_COLORS)) {
        return STAGE_COLORS.completed.background;
    }
    return STAGE_COLORS[status].background;
}
/**
 * 獲取階段文字顏色
 *
 * @param status - 階段顯示狀態
 * @returns 文字顏色 hex 值
 *
 * @example
 * ```typescript
 * const textColor = getStageTextColor('pending') // '#000000'
 * ```
 */
export function getStageTextColor(status) {
    if (!status || !(status in STAGE_COLORS)) {
        return STAGE_COLORS.completed.text;
    }
    return STAGE_COLORS[status].text;
}
/**
 * 獲取階段完整配置
 *
 * @param status - 階段顯示狀態
 * @returns 階段顏色配置對象
 *
 * @example
 * ```typescript
 * const config = getStageColorConfig('voting')
 * console.log(config.background) // '#c82333'
 * console.log(config.text)       // '#ffffff'
 * console.log(config.contrast)   // 5.5
 * ```
 */
export function getStageColorConfig(status) {
    if (!status || !(status in STAGE_COLORS)) {
        return STAGE_COLORS.completed;
    }
    return STAGE_COLORS[status];
}
/**
 * 獲取階段糖果漸層（邊緣融合版）
 *
 * @param status - 階段顯示狀態
 * @returns CSS linear-gradient 字串
 *
 * @example
 * ```typescript
 * const gradient = getStageGradient('active')
 * // 'linear-gradient(90deg, #198754 0%, #4ECDC4 15%, #0E6655 85%, #198754 100%)'
 * ```
 */
export function getStageGradient(status) {
    if (!status || !(status in STAGE_COLORS)) {
        var config_1 = STAGE_COLORS.completed;
        return "linear-gradient(90deg, ".concat(config_1.background, " 0%, ").concat(config_1.gradient.start, " 15%, ").concat(config_1.gradient.end, " 85%, ").concat(config_1.background, " 100%)");
    }
    var config = STAGE_COLORS[status];
    return "linear-gradient(90deg, ".concat(config.background, " 0%, ").concat(config.gradient.start, " 15%, ").concat(config.gradient.end, " 85%, ").concat(config.background, " 100%)");
}
/**
 * 檢查配色是否符合 WCAG AA 標準
 *
 * @param status - 階段顯示狀態
 * @returns 是否符合 WCAG AA 標準 (對比度 >= 4.5:1)
 */
export function isWCAGCompliant(status) {
    var config = STAGE_COLORS[status];
    return config.contrast >= 4.5;
}
/**
 * 獲取所有階段顯示狀態列表
 *
 * @returns 階段顯示狀態數組
 */
export function getAllStageStatuses() {
    return Object.keys(STAGE_COLORS);
}
/**
 * 按鈕配色常量（語義化配色方案）
 *
 * 配色策略：
 * - Success: 使用 Active 階段綠色（#198754）- 用於提交、確認等成功操作
 * - Danger: 使用 Voting 階段紅色（#c82333）- 用於投票、危險操作
 * - Warning: 使用 Pending 階段橙色（#f39c12）- 用於警告、獎金等醒目操作
 * - Info: 使用 Completed 階段灰色（#5a6268）- 用於查看、資訊顯示
 * - Neutral: 中性灰色（#6c757d）- 用於取消、返回等中性操作
 *
 * 所有配色均符合 WCAG 2.0 AA 標準（對比度 ≥ 4.5:1）
 */
export var BUTTON_COLORS = {
    success: {
        background: '#198754',
        text: '#ffffff',
        hover: '#157347',
        contrast: 4.7,
        description: '成功操作 - 深綠色（對應 Active 階段）'
    },
    danger: {
        background: '#c82333',
        text: '#ffffff',
        hover: '#a71d2a',
        contrast: 5.5,
        description: '投票/危險操作 - 深紅色（對應 Voting 階段）'
    },
    warning: {
        background: '#f39c12',
        text: '#000000',
        hover: '#e67e22',
        contrast: 7.2,
        description: '警告/獎金操作 - 橙色（對應 Pending 階段）'
    },
    info: {
        background: '#5a6268',
        text: '#ffffff',
        hover: '#4a5158',
        contrast: 5.3,
        description: '資訊/查看操作 - 深灰色（對應 Completed 階段）'
    },
    neutral: {
        background: '#6c757d',
        text: '#ffffff',
        hover: '#5c636a',
        contrast: 4.8,
        description: '中性操作 - 灰色（取消、返回）'
    }
};
/**
 * 獲取按鈕背景顏色
 *
 * @param type - 按鈕顏色類型
 * @returns 背景顏色 hex 值
 *
 * @example
 * ```typescript
 * const bgColor = getButtonColor('success') // '#198754'
 * ```
 */
export function getButtonColor(type) {
    if (!type || !(type in BUTTON_COLORS)) {
        return BUTTON_COLORS.neutral.background;
    }
    return BUTTON_COLORS[type].background;
}
/**
 * 獲取按鈕文字顏色
 *
 * @param type - 按鈕顏色類型
 * @returns 文字顏色 hex 值
 *
 * @example
 * ```typescript
 * const textColor = getButtonTextColor('warning') // '#000000'
 * ```
 */
export function getButtonTextColor(type) {
    if (!type || !(type in BUTTON_COLORS)) {
        return BUTTON_COLORS.neutral.text;
    }
    return BUTTON_COLORS[type].text;
}
/**
 * 獲取按鈕懸停背景顏色
 *
 * @param type - 按鈕顏色類型
 * @returns 懸停背景顏色 hex 值
 *
 * @example
 * ```typescript
 * const hoverColor = getButtonHoverColor('danger') // '#a71d2a'
 * ```
 */
export function getButtonHoverColor(type) {
    if (!type || !(type in BUTTON_COLORS)) {
        return BUTTON_COLORS.neutral.hover;
    }
    return BUTTON_COLORS[type].hover;
}
/**
 * 獲取按鈕完整配置
 *
 * @param type - 按鈕顏色類型
 * @returns 按鈕顏色配置對象
 *
 * @example
 * ```typescript
 * const config = getButtonColorConfig('success')
 * console.log(config.background) // '#198754'
 * console.log(config.text)       // '#ffffff'
 * console.log(config.hover)      // '#157347'
 * console.log(config.contrast)   // 4.7
 * ```
 */
export function getButtonColorConfig(type) {
    if (!type || !(type in BUTTON_COLORS)) {
        return BUTTON_COLORS.neutral;
    }
    return BUTTON_COLORS[type];
}
/**
 * 檢查按鈕配色是否符合 WCAG AA 標準
 *
 * @param type - 按鈕顏色類型
 * @returns 是否符合 WCAG AA 標準 (對比度 >= 4.5:1)
 */
export function isButtonWCAGCompliant(type) {
    var config = BUTTON_COLORS[type];
    return config.contrast >= 4.5;
}
/**
 * 獲取所有按鈕顏色類型列表
 *
 * @returns 按鈕顏色類型數組
 */
export function getAllButtonTypes() {
    return Object.keys(BUTTON_COLORS);
}
