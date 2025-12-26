/**
 * Secure CSV export utility
 * Prevents XSS, formula injection, and CSV injection attacks
 */

/**
 * Escape a value for safe CSV export
 *
 * Security measures:
 * 1. Formula injection prevention (=, +, -, @, \t, \r)
 * 2. Proper CSV escaping (quotes, commas, newlines)
 * 3. Type coercion safety
 *
 * @param value - The value to escape
 * @returns Safely escaped CSV value
 */
export function escapeCsvValue(value: unknown): string {
  // Handle null/undefined
  if (value === null || value === undefined) return ''

  // Convert to string
  const stringValue = String(value)

  // Prevent formula injection
  // Excel/LibreOffice/Google Sheets execute formulas starting with:
  // = (formula), + (formula), - (formula), @ (formula)
  // \t (tab), \r (carriage return)
  if (/^[=+\-@\t\r]/.test(stringValue)) {
    // Prepend single quote to prevent execution and wrap in quotes
    return `"'${stringValue.replace(/"/g, '""')}"`
  }

  // Escape if contains special CSV characters
  // Comma, quote, newline, carriage return, tab
  if (/[",\n\r\t]/.test(stringValue)) {
    // Double-quote escaping (CSV standard)
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Convert data to CSV format with BOM for UTF-8 Excel compatibility
 *
 * @param data - Array of objects to export
 * @param filename - Optional filename (default: data_YYYY-MM-DD.csv)
 * @returns CSV content as Blob
 */
export function generateCsv<T extends Record<string, unknown>>(
  data: T[],
  filename?: string
): { blob: Blob; filename: string } {
  if (data.length === 0) {
    throw new Error('No data to export')
  }

  // Extract headers from first object
  const headers = Object.keys(data[0])

  // Generate CSV content
  const csvContent = [
    // Header row
    headers.join(','),
    // Data rows
    ...data.map(row =>
      headers.map(header => escapeCsvValue(row[header])).join(',')
    )
  ].join('\n')

  // Add BOM (Byte Order Mark) for UTF-8 Excel compatibility
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;'
  })

  // Generate filename if not provided
  const finalFilename =
    filename || `data_${new Date().toISOString().split('T')[0]}.csv`

  return { blob, filename: finalFilename }
}

/**
 * Download CSV file to user's browser
 *
 * @param data - Array of objects to export
 * @param filename - Filename for download
 */
export function downloadCsv<T extends Record<string, unknown>>(
  data: T[],
  filename?: string
): void {
  const { blob, filename: finalFilename } = generateCsv(data, filename)

  // Create download link
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', finalFilename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up object URL
  URL.revokeObjectURL(url)
}

/**
 * Validate CSV data before export
 *
 * @param data - Data to validate
 * @returns Validation result
 */
export function validateCsvData<T extends Record<string, unknown>>(
  data: T[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Data must be an array' }
  }

  if (data.length === 0) {
    return { valid: false, error: 'Data array is empty' }
  }

  if (typeof data[0] !== 'object' || data[0] === null) {
    return { valid: false, error: 'Data items must be objects' }
  }

  const headers = Object.keys(data[0])
  if (headers.length === 0) {
    return { valid: false, error: 'Data objects have no properties' }
  }

  return { valid: true }
}
