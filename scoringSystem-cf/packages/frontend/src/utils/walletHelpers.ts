/**
 * @fileoverview Wallet helper utilities
 * 钱包工具函数
 *
 * 从 WalletNew.vue 提取的工具函数
 * 提供格式化、计算等辅助功能
 */

import type { Stage, StageStatus } from './stageStatus'

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
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, any>
}

export interface StageWithEarnings extends Stage {
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

/**
 * 计算所有阶段与收入信息
 * @param projectStages - 项目阶段列表
 * @param projectTransactions - 项目交易列表
 * @returns 包含收入信息的阶段列表
 */
export function calculateStagesWithEarnings(
  projectStages: any[] | null | undefined,
  projectTransactions: any[] | null | undefined
): StageWithEarnings[] {
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
 * 计算钱包摘要信息
 * @param transactions - 交易列表
 * @returns 包含总收入和交易数量的对象
 */
export function calculateWalletSummary(transactions: Transaction[] | null | undefined): WalletSummary {
  if (!transactions || transactions.length === 0) {
    return { totalEarned: 0, transactionCount: 0 }
  }

  let totalEarned = 0

  transactions.forEach(transaction => {
    // Sum all transactions (both positive and negative) for correct net balance
    totalEarned += transaction.points
  })

  return {
    totalEarned: totalEarned,
    transactionCount: transactions.length
  }
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
 * 过滤交易列表
 * @param transactions - 交易列表
 * @param filters - 过滤条件
 * @returns 过滤后的交易列表
 */
export function filterTransactions(
  transactions: Transaction[] | null | undefined,
  filters: TransactionFilters = {}
): Transaction[] {
  if (!transactions || !Array.isArray(transactions)) {
    console.warn('Transactions is not an array:', transactions)
    return []
  }

  let filtered = [...transactions]

  // 点数过滤
  if (filters.points !== null && filters.points !== undefined) {
    filtered = filtered.filter(t => t.points === filters.points)
  }

  // 说明过滤
  if (filters.description && filters.description.trim()) {
    const searchText = filters.description.trim().toLowerCase()
    filtered = filtered.filter(t =>
      t.description && t.description.toLowerCase().includes(searchText)
    )
  }

  // 排序并限制数量
  const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp)

  if (filters.limit && filters.limit > 0) {
    return sorted.slice(0, filters.limit)
  }

  return sorted
}

/**
 * 检查交易是否已被撤销
 * @param transaction - 交易对象
 * @param allTransactions - 所有交易列表
 * @returns 是否已撤销
 */
export function isTransactionReversed(transaction: Transaction, allTransactions: Transaction[]): boolean {
  // 检查是否已经是撤销交易
  if (transaction.transactionType === 'reversal') {
    return true
  }

  // 检查是否有对应的撤销记录
  return allTransactions.some(t =>
    t.transactionType === 'reversal' &&
    t.relatedTransactionId === (transaction.transactionId || transaction.id)
  )
}

/**
 * 创建CSV内容
 * @param transactions - 交易列表
 * @returns CSV内容字符串
 */
export function createTransactionCSV(transactions: Transaction[]): string {
  // CSV标题行
  const headers = ['时间', '金额', '类型', '说明', '阶段', '阶段名称', '交易ID']

  // 转换交易记录为CSV格式
  const csvData = transactions.map(transaction => [
    formatTime(transaction.timestamp),
    transaction.points.toString(),
    transaction.transactionType || '',
    (transaction.description || '').replace(/"/g, '""'), // 处理CSV中的引号
    transaction.stage.toString(),
    (transaction.stageName || '').replace(/"/g, '""'),
    transaction.id || transaction.transactionId || ''
  ])

  // 组合CSV内容
  const csvContent = [headers, ...csvData]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n')

  // 添加BOM以支持中文字符
  const BOM = '\uFEFF'
  return BOM + csvContent
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
