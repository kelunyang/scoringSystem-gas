/**
 * @fileoverview Wallet helper utilities
 * 钱包工具函数
 *
 * 从 Wallet.vue 提取的工具函数
 * 提供格式化、计算等辅助功能
 */

import type { StageStatus } from './stageStatus'

export interface Transaction {
  transactionId?: string
  id?: string
  timestamp: number
  points: number
  transactionType?: string
  description?: string
  stage: number
  stageName?: string
  relatedTransactionId?: string
}

export interface Person {
  userEmail?: string
  // 這三欄在 users 表可為 NULL，型別要照實說
  avatarSeed?: string | null
  avatarStyle?: string | null
  avatarOptions?: string | Record<string, unknown> | null
}

/** 這個函式從階段物件讀到的欄位；其餘欄位原樣保留 */
export interface StageEarningsInput {
  stageId: string
  stageOrder?: number
  stageName?: string
  stageTitle?: string
}

/** isTransactionReversed 實際會讀的欄位（呼叫端傳的是後端的 Transaction，欄位比這裡多） */
export interface ReversalCheckTransaction {
  transactionId?: string
  id?: string
  transactionType?: string
  /**
   * 撤銷交易把原交易 ID 放在這裡（`metadata.originalTransactionId`）。
   * 後端回的是 JSON 字串，但保留物件形態以防日後改成先解析。
   */
  metadata?: string | Record<string, unknown> | null
}

/** 從撤銷交易的 metadata 取出它撤銷的是哪一筆 */
function originalTransactionIdOf(transaction: ReversalCheckTransaction): string | undefined {
  const { metadata } = transaction
  if (!metadata) return undefined

  let parsed: unknown = metadata
  if (typeof metadata === 'string') {
    try {
      parsed = JSON.parse(metadata)
    } catch {
      return undefined
    }
  }
  if (!parsed || typeof parsed !== 'object') return undefined

  const value = (parsed as Record<string, unknown>).originalTransactionId
  return typeof value === 'string' ? value : undefined
}

/** 由 calculateStagesWithEarnings 補上的欄位 */
export interface StageEarnings {
  stageId: string
  stageOrder: number
  stageName: string
  points: number
}

export interface WalletSummary {
  totalEarned: number
  transactionCount: number
}

export interface TransactionFilters {
  points?: number | null
  description?: string
  limit?: number
}

/**
 * 格式化时间戳为可读字符串
 * @param timestamp - 时间戳
 * @returns 格式化后的时间字符串 (YYYY/MM/DD HH:MM:SS)
 */
export function formatTime(timestamp: number | string | null | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return ''
  return date.getFullYear() + '/' +
         String(date.getMonth() + 1).padStart(2, '0') + '/' +
         String(date.getDate()).padStart(2, '0') + ' ' +
         String(date.getHours()).padStart(2, '0') + ':' +
         String(date.getMinutes()).padStart(2, '0') + ':' +
         String(date.getSeconds()).padStart(2, '0')
}

/**
 * 格式化点数（大数字使用单位）
 * @param value - 点数值
 * @returns 格式化后的点数字符串
 */
export function formatPoints(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  } else {
    return value.toString()
  }
}

/**
 * 获取交易类型文字
 * @param type - 交易类型
 * @returns 本地化的交易类型文字
 */
export function getTransactionTypeText(type: string | undefined): string {
  const typeMap: Record<string, string> = {
    'submission_reward': '提交奖励',
    'comment_reward': '评论奖励',
    'vote_reward': '投票奖励',
    'bonus_award': '额外奖励',
    'penalty': '扣分处罚',
    'stage_completion': '阶段完成',
    'settlement_reversal': '撤销结算',
    'comment_settlement': '评论结算',
    'excellence_award': '优秀表现',
    'reversal': '撤销点数'
  }
  return type ? (typeMap[type] || type) : ''
}

/**
 * 获取阶段样式类名（根据阶段状态）
 * @param status - 阶段状态（来自 backend stages_with_status VIEW）
 * @returns CSS类名
 */
export function getStageClass(status: StageStatus | string): string {
  switch (status) {
    case 'completed':
    case 'archived':
      return 'stage-completed'
    case 'active':
      return 'stage-active'
    case 'voting':
      return 'stage-voting'
    case 'pending':
    default:
      return 'stage-pending'
  }
}

/** 這個函式從交易物件讀到的欄位 */
export interface StageEarningsTransaction {
  points: number
  stage?: number
}

/**
 * 计算所有阶段与收入信息
 * @param projectStages - 项目阶段列表
 * @param projectTransactions - 项目交易列表
 * @returns 包含收入信息的阶段列表
 */
export function calculateStagesWithEarnings<T extends StageEarningsInput>(
  projectStages: T[] | null | undefined,
  projectTransactions: StageEarningsTransaction[] | null | undefined
): Array<T & StageEarnings> {
  if (!projectStages || projectStages.length === 0) return []

  // 先计算每个阶段的收入
  const stageEarningsMap = new Map<number, number>()

  if (projectTransactions && projectTransactions.length > 0) {
    projectTransactions.forEach(transaction => {
      if (transaction.points > 0) {
        const stageOrder = transaction.stage || 1
        const currentPoints = stageEarningsMap.get(stageOrder) || 0
        stageEarningsMap.set(stageOrder, currentPoints + transaction.points)
      }
    })
  }

  // 结合阶段信息与收入信息
  return projectStages
    .sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
    .map(stage => ({
      stageOrder: stage.stageOrder || 0,
      stageName: stage.stageName || stage.stageTitle || `阶段${stage.stageOrder}`,
      points: stageEarningsMap.get(stage.stageOrder || 0) || 0,
      // 保留原始阶段信息供状态计算
      ...stage,
      stageId: stage.stageId
    }))
}

/**
 * 生成头像URL
 * @param person - 人员对象
 * @returns 头像URL
 */
export function generateAvatarUrl(person: Person): string {
  if (person.avatarSeed && person.avatarStyle) {
    const style = person.avatarStyle || 'avataaars'
    const seed = person.avatarSeed

    // 如果有avatarOptions，添加到URL参数中
    if (person.avatarOptions) {
      const options = typeof person.avatarOptions === 'string'
        ? JSON.parse(person.avatarOptions)
        : person.avatarOptions

      const params = new URLSearchParams()
      Object.entries(options).forEach(([key, value]) => {
        params.append(key, String(value))
      })

      const optionsQuery = params.toString()
      return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&${optionsQuery}`
    }

    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`
  }

  // 使用邮箱作为种子
  const seed = person.userEmail || 'default'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

/**
 * 检查交易是否已被撤销
 * @param transaction - 交易对象
 * @param allTransactions - 所有交易列表
 * @returns 是否已撤销
 */
export function isTransactionReversed(
  transaction: ReversalCheckTransaction,
  allTransactions: ReversalCheckTransaction[]
): boolean {
  // 检查是否已经是撤销交易
  if (transaction.transactionType === 'reversal') {
    return true
  }

  // 检查是否有对应的撤销记录
  const targetId = transaction.transactionId || transaction.id
  if (!targetId) return false

  return allTransactions.some(t =>
    t.transactionType === 'reversal' &&
    originalTransactionIdOf(t) === targetId
  )
}

/**
 * 触发CSV文件下载
 * @param csvContent - CSV内容
 * @param fileName - 文件名
 * @returns 下载是否成功
 */
export function downloadCSV(csvContent: string, fileName: string): boolean {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  }

  return false
}
