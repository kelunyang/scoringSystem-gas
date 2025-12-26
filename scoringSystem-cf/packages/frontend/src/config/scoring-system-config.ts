/**
 * @fileoverview Scoring System Configuration
 * 評分系統配置定義 - 用於 ConfigPanel 自動渲染
 *
 * 配置項目：
 * 1. 學生/教師評分權重（雙向聯動滑桿）
 * 2. 教師最多可排名評論數量
 * 3. 評論獎勵百分位數（0 = 固定 TOP N）
 */

import type { ConfigCategory } from '@/types/config-panel'

/**
 * 評分系統配置分類
 *
 * 使用 custom-dual-slider 類型實現雙向聯動滑桿：
 * - 兩個滑桿值總和必須為 1.0
 * - 調整任一滑桿時，另一個自動同步
 */
export const scoringSystemConfigCategories: ConfigCategory[] = [
  {
    key: 'scoring_weights',
    title: '評分權重配置',
    icon: 'fa-balance-scale',
    description: '配置學生評分與教師評分的權重比例（總和必須為 1.0）',
    fields: [
      {
        key: 'SCORING_WEIGHTS',
        label: '學生/教師評分權重',
        type: 'custom-dual-slider',
        category: 'scoring_weights',
        description: '調整學生評分和教師評分在最終分數中的佔比',
        customConfig: {
          slider1: {
            key: 'DEFAULT_STUDENT_RANKING_WEIGHT',
            label: '學生評分權重',
            color: '#409EFF',  // Element Plus primary blue
            min: 0,
            max: 1,
            step: 0.05,
            marks: {
              0: '0%',
              0.3: '30%',
              0.5: '50%',
              0.7: '70%',
              1: '100%'
            }
          },
          slider2: {
            key: 'DEFAULT_TEACHER_RANKING_WEIGHT',
            label: '教師評分權重',
            color: '#67C23A',  // Element Plus success green
            min: 0,
            max: 1,
            step: 0.05,
            marks: {
              0: '0%',
              0.3: '30%',
              0.5: '50%',
              0.7: '70%',
              1: '100%'
            }
          },
          sumConstraint: 1.0,
          formatTooltip: (val: number) => `${Math.round(val * 100)}%`
        }
      }
    ]
  },

  {
    key: 'comment_ranking',
    title: '評論排名配置',
    icon: 'fa-comments',
    description: '配置教師可排名的評論數量限制',
    fields: [
      {
        key: 'DEFAULT_MAX_COMMENT_SELECTIONS',
        label: '教師最多可排名評論數',
        type: 'slider',
        category: 'comment_ranking',
        min: 1,
        max: 10,
        step: 1,
        marks: {
          1: '1',
          3: '3',
          5: '5',
          10: '10'
        },
        description: '教師在單一階段最多可以排名幾個評論（預設 3 個）',
        suffix: '個',
        showTooltip: true,
        formatTooltip: (val: number) => `${val} 個評論`
      }
    ]
  },

  {
    key: 'comment_reward',
    title: '評論獎勵配置',
    icon: 'fa-trophy',
    description: '配置評論獎勵發放方式（固定名次 vs 百分位數）',
    fields: [
      {
        key: 'DEFAULT_COMMENT_REWARD_PERCENTILE',
        label: '評論獎勵百分位數',
        type: 'slider',
        category: 'comment_reward',
        min: 0,
        max: 50,
        step: 5,
        marks: {
          0: '固定TOP N',
          10: '前10%',
          20: '前20%',
          30: '前30%',
          50: '前50%'
        },
        description: '0 = 使用固定 TOP N（由上方「教師最多可排名評論數」決定）\n非0 = 使用百分位數（例如：20 表示前 20% 的評論作者獲得獎勵，Math.ceil 無條件進位）',
        suffix: '%',
        showTooltip: true,
        formatTooltip: (val: number) => val === 0 ? '固定 TOP N' : `前 ${val}%`
      }
    ]
  }
]

/**
 * 根據 key 查找欄位配置
 */
export function getScoringFieldConfig(key: string) {
  for (const category of scoringSystemConfigCategories) {
    const field = category.fields.find(f => f.key === key)
    if (field) return field
  }
  return undefined
}

/**
 * 根據分類 key 查找分類配置
 */
export function getScoringCategoryConfig(key: string) {
  return scoringSystemConfigCategories.find(c => c.key === key)
}

/**
 * 取得所有欄位的 keys
 */
export function getAllScoringFieldKeys(): string[] {
  return scoringSystemConfigCategories.flatMap(category =>
    category.fields.map(field => field.key)
  )
}
