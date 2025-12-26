import Papa from 'papaparse'

/**
 * CSV Export Utility
 * Uses Papa Parse for robust CSV generation
 */

export interface CsvColumn<T> {
  header: string
  accessor: keyof T | ((row: T) => any)
  formatter?: (value: any) => string
}

/**
 * Export data to CSV file with Papa Parse
 * @param data - Array of data objects
 * @param columns - Column definitions
 * @param filename - Output filename (without .csv extension)
 */
export function exportToCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string
): void {
  if (data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Transform data to CSV-ready format
  const csvData = data.map(row => {
    const csvRow: Record<string, any> = {}

    columns.forEach(col => {
      const value = typeof col.accessor === 'function'
        ? col.accessor(row)
        : row[col.accessor]

      csvRow[col.header] = col.formatter
        ? col.formatter(value)
        : value
    })

    return csvRow
  })

  // Generate CSV with Papa Parse
  const csv = Papa.unparse(csvData, {
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ',',
    header: true,
    newline: '\r\n'
  })

  // Add UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], {
    type: 'text/csv;charset=utf-8;'
  })

  // Trigger download
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
