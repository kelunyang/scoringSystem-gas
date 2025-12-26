/**
 * 統一匯出工具函數
 * 支援 CSV 和 JSON 格式匯出，自動處理特殊字元和 UTF-8 BOM
 */

import { ElMessage } from 'element-plus'

/**
 * CSV 行建構函數（處理特殊字元）
 * @param cells 單元格陣列
 * @returns CSV 格式的行字串
 */
export const buildCsvRow = (cells: (string | number | undefined | null)[]): string => {
  return cells.map(cell => {
    const cellStr = String(cell ?? '-')
    // 檢查是否包含逗號、雙引號或換行符
    if (/[,"\n]/.test(cellStr)) {
      // 將雙引號轉義為兩個雙引號，並用雙引號包裹整個字串
      return `"${cellStr.replace(/"/g, '""')}"`
    }
    return cellStr
  }).join(',')
}

/**
 * 匯出 CSV（帶 UTF-8 BOM）
 * @param data 資料陣列
 * @param filename 檔名（不含副檔名）
 * @param headers 表頭陣列
 * @param rowMapper 行映射函數
 */
export const exportToCsv = (
  data: any[],
  filename: string,
  headers: string[],
  rowMapper: (item: any) => any[]
): void => {
  if (!data || data.length === 0) {
    ElMessage.warning('沒有可匯出的資料')
    return
  }

  try {
    // 構建 CSV 內容
    const csvLines = [buildCsvRow(headers)]

    data.forEach(item => {
      csvLines.push(buildCsvRow(rowMapper(item)))
    })

    // 添加 UTF-8 BOM 以確保 Excel 正確顯示中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    })

    downloadBlob(blob, `${filename}_${getDateStamp()}.csv`)
    ElMessage.success(`已匯出 ${data.length} 筆資料`)
  } catch (error) {
    console.error('CSV 匯出失敗:', error)
    ElMessage.error('CSV 匯出失敗')
  }
}

/**
 * 匯出 JSON（格式化）
 * @param data 資料陣列
 * @param filename 檔名（不含副檔名）
 */
export const exportToJson = (data: any[], filename: string): void => {
  if (!data || data.length === 0) {
    ElMessage.warning('沒有可匯出的資料')
    return
  }

  try {
    // 格式化 JSON（縮排 2 空格）
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], {
      type: 'application/json;charset=utf-8;'
    })

    downloadBlob(blob, `${filename}_${getDateStamp()}.json`)
    ElMessage.success(`已匯出 ${data.length} 筆資料`)
  } catch (error) {
    console.error('JSON 匯出失敗:', error)
    ElMessage.error('JSON 匯出失敗')
  }
}

/**
 * 下載 Blob
 * @param blob Blob 物件
 * @param filename 檔名（含副檔名）
 */
const downloadBlob = (blob: Blob, filename: string): void => {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // 清理 URL 物件
  URL.revokeObjectURL(url)
}

/**
 * 取得日期戳記（YYYY-MM-DD）
 * @returns 日期字串
 */
const getDateStamp = (): string => {
  return new Date().toISOString().split('T')[0]
}
