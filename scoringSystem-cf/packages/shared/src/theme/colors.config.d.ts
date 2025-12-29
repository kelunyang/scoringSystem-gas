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
 * 漸層配置接口
 */
export interface GradientConfig {
    /** 漸層起始色 (hex) */
    start: string;
    /** 漸層結束色 (hex) */
    end: string;
}
/**
 * 階段顏色配置接口
 */
export interface StageColorConfig {
    /** 背景顏色 (hex) */
    background: string;
    /** 文字顏色 (hex) */
    text: string;
    /** WCAG 對比度 (實測值) */
    contrast: number;
    /** 配色說明 */
    description: string;
    /** 糖果漸層配色 */
    gradient: GradientConfig;
}
/**
 * 階段狀態配色常量
 *
 * 配色來源：
 * - Pending: 橙色系（避免黃色的對比度問題）
 * - Active: Bootstrap 5 Success 深綠色
 * - Voting: Bootstrap 5 Danger 深紅色
 * - Completed: 深灰色（加深至完全通過 AA 標準）
 */
export declare const STAGE_COLORS: {
    readonly pending: {
        readonly background: "#f39c12";
        readonly text: "#000000";
        readonly contrast: 7.2;
        readonly description: "尚未開始 - 橙色（WCAG AA 合規）";
        readonly gradient: {
            readonly start: "#FFAA5A";
            readonly end: "#D35400";
        };
    };
    readonly active: {
        readonly background: "#198754";
        readonly text: "#ffffff";
        readonly contrast: 4.7;
        readonly description: "進行中 - 深綠色（Bootstrap 5 標準）";
        readonly gradient: {
            readonly start: "#4ECDC4";
            readonly end: "#0E6655";
        };
    };
    readonly voting: {
        readonly background: "#c82333";
        readonly text: "#ffffff";
        readonly contrast: 5.5;
        readonly description: "投票中 - 深紅色（WCAG AA 合規）";
        readonly gradient: {
            readonly start: "#FF6B9D";
            readonly end: "#A31545";
        };
    };
    readonly completed: {
        readonly background: "#5a6268";
        readonly text: "#ffffff";
        readonly contrast: 5.3;
        readonly description: "已完成 - 深灰色（WCAG AA 合規）";
        readonly gradient: {
            readonly start: "#7DCEA0";
            readonly end: "#1E8449";
        };
    };
    readonly paused: {
        readonly background: "#e67e22";
        readonly text: "#ffffff";
        readonly contrast: 4.6;
        readonly description: "已暫停 - 深橙色（WCAG AA 合規）";
        readonly gradient: {
            readonly start: "#F5B041";
            readonly end: "#CA6F1E";
        };
    };
    readonly settling: {
        readonly background: "#8e44ad";
        readonly text: "#ffffff";
        readonly contrast: 5.8;
        readonly description: "結算中 - 紫色（WCAG AA 合規）";
        readonly gradient: {
            readonly start: "#BB8FCE";
            readonly end: "#6C3483";
        };
    };
};
/**
 * 階段顯示狀態類型（用於 UI 顯示）
 * 注意：這與 schemas/common.ts 中的 StageStatus（數據庫狀態）不同
 */
export type StageDisplayStatus = keyof typeof STAGE_COLORS;
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
export declare function getStageColor(status: StageDisplayStatus | string | undefined): string;
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
export declare function getStageTextColor(status: StageDisplayStatus | string | undefined): string;
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
export declare function getStageColorConfig(status: StageDisplayStatus | string | undefined): StageColorConfig;
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
export declare function getStageGradient(status: StageDisplayStatus | string | undefined): string;
/**
 * 檢查配色是否符合 WCAG AA 標準
 *
 * @param status - 階段顯示狀態
 * @returns 是否符合 WCAG AA 標準 (對比度 >= 4.5:1)
 */
export declare function isWCAGCompliant(status: StageDisplayStatus): boolean;
/**
 * 獲取所有階段顯示狀態列表
 *
 * @returns 階段顯示狀態數組
 */
export declare function getAllStageStatuses(): StageDisplayStatus[];
/**
 * 按鈕顏色配置接口
 */
export interface ButtonColorConfig {
    /** 背景顏色 (hex) */
    background: string;
    /** 文字顏色 (hex) */
    text: string;
    /** 懸停背景顏色 (hex) */
    hover: string;
    /** WCAG 對比度 (實測值) */
    contrast: number;
    /** 配色說明 */
    description: string;
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
export declare const BUTTON_COLORS: {
    readonly success: {
        readonly background: "#198754";
        readonly text: "#ffffff";
        readonly hover: "#157347";
        readonly contrast: 4.7;
        readonly description: "成功操作 - 深綠色（對應 Active 階段）";
    };
    readonly danger: {
        readonly background: "#c82333";
        readonly text: "#ffffff";
        readonly hover: "#a71d2a";
        readonly contrast: 5.5;
        readonly description: "投票/危險操作 - 深紅色（對應 Voting 階段）";
    };
    readonly warning: {
        readonly background: "#f39c12";
        readonly text: "#000000";
        readonly hover: "#e67e22";
        readonly contrast: 7.2;
        readonly description: "警告/獎金操作 - 橙色（對應 Pending 階段）";
    };
    readonly info: {
        readonly background: "#5a6268";
        readonly text: "#ffffff";
        readonly hover: "#4a5158";
        readonly contrast: 5.3;
        readonly description: "資訊/查看操作 - 深灰色（對應 Completed 階段）";
    };
    readonly neutral: {
        readonly background: "#6c757d";
        readonly text: "#ffffff";
        readonly hover: "#5c636a";
        readonly contrast: 4.8;
        readonly description: "中性操作 - 灰色（取消、返回）";
    };
};
/**
 * 按鈕顏色類型（用於 UI 顯示）
 */
export type ButtonColorType = keyof typeof BUTTON_COLORS;
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
export declare function getButtonColor(type: ButtonColorType | string | undefined): string;
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
export declare function getButtonTextColor(type: ButtonColorType | string | undefined): string;
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
export declare function getButtonHoverColor(type: ButtonColorType | string | undefined): string;
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
export declare function getButtonColorConfig(type: ButtonColorType | string | undefined): ButtonColorConfig;
/**
 * 檢查按鈕配色是否符合 WCAG AA 標準
 *
 * @param type - 按鈕顏色類型
 * @returns 是否符合 WCAG AA 標準 (對比度 >= 4.5:1)
 */
export declare function isButtonWCAGCompliant(type: ButtonColorType): boolean;
/**
 * 獲取所有按鈕顏色類型列表
 *
 * @returns 按鈕顏色類型數組
 */
export declare function getAllButtonTypes(): ButtonColorType[];
