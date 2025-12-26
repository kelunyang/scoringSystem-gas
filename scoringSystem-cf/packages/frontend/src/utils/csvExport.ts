/**
 * @fileoverview CSV export utilities
 * CSV 導出工具函數
 *
 * 純函數，無響應式，專注於數據轉換和文件下載
 */

import { formatTime } from './walletHelpers'
import { showSuccess, showWarning, handleError } from './errorHandler'

interface Transaction {
  timestamp: number
  points: number
  transactionType?: string
  description?: string
  stage: number
  stageName?: string
  id: string
}

interface ErrorContext {
  action: string
  type: string
}

// CSV 常量
const CSV_BOM = '\uFEFF'
const CSV_HEADERS = ['時間', '金額', '類型', '說明', '階段', '階段名稱', '交易ID']

/**
 * 生成格式化的時間戳字符串用於文件名
 * @returns 格式化的時間戳 (YYYYMMDDTHHmmss)
 */
function generateTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
}

/**
 * 轉換交易記錄為 CSV 格式
 * @param transactions - 交易記錄列表
 * @returns CSV 內容
 */
export function generateTransactionCSV(transactions: Transaction[]): string {
  if (!transactions || transactions.length === 0) {
    return ''
  }

  // 轉換交易記錄為 CSV 行
  const csvData = transactions.map(transaction => [
    formatTime(transaction.timestamp),
    transaction.points.toString(),
    transaction.transactionType || '',
    (transaction.description || '').replace(/"/g, '""'), // 處理 CSV 中的引號
    transaction.stage.toString(),
    (transaction.stageName || '').replace(/"/g, '""'),
    transaction.id
  ])

  // 組合 CSV 內容
  const csvContent = [CSV_HEADERS, ...csvData]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n')

  // 添加 BOM 以支持中文字符
  return CSV_BOM + csvContent
}

/**
 * 下載 CSV 文件
 * @param csvContent - CSV 內容
 * @param fileName - 文件名
 */
export function downloadCSV(csvContent: string, fileName: string): void {
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')

    if (link.download === undefined) {
      throw new Error('Browser does not support download attribute')
    }

    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showSuccess('CSV檔案已成功匯出')
  } catch (error) {
    console.error('Error downloading CSV:', error)
    handleError(error as Error, {
      action: '匯出CSV檔案',
      type: 'error'
    } as any)
  }
}

/**
 * 導出錢包交易 CSV
 * @param transactions - 交易記錄
 * @param projectName - 項目名稱
 * @param userDisplay - 用戶顯示名稱
 */
export function exportWalletCSV(
  transactions: Transaction[],
  projectName: string,
  userDisplay: string
): void {
  if (!transactions || transactions.length === 0) {
    showWarning('沒有可匯出的交易記錄')
    return
  }

  const csvContent = generateTransactionCSV(transactions)
  const timestamp = generateTimestamp()
  const fileName = `錢包記錄_${projectName}_${userDisplay}_${timestamp}.csv`

  downloadCSV(csvContent, fileName)
}
