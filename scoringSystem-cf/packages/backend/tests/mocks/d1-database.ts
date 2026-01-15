/**
 * Mock D1 Database for unit testing
 * Provides in-memory SQLite-like behavior for testing
 */

interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta: {
    duration: number
    size_after: number
    rows_read: number
    rows_written: number
    last_row_id: number
    changed_db: boolean
    changes: number
  }
}

interface MockPreparedStatement {
  bind(...values: unknown[]): MockPreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
  raw<T = unknown>(): Promise<T[]>
}

type TableData = Map<string, Record<string, unknown>[]>

/**
 * Extract table name from SQL query
 */
function extractTableName(query: string): string {
  const fromMatch = query.match(/FROM\s+["']?(\w+)["']?/i)
  if (fromMatch) return fromMatch[1]

  const intoMatch = query.match(/INTO\s+["']?(\w+)["']?/i)
  if (intoMatch) return intoMatch[1]

  const updateMatch = query.match(/UPDATE\s+["']?(\w+)["']?/i)
  if (updateMatch) return updateMatch[1]

  const deleteMatch = query.match(/DELETE\s+FROM\s+["']?(\w+)["']?/i)
  if (deleteMatch) return deleteMatch[1]

  return 'unknown'
}

/**
 * Create a mock D1 database for testing
 * @param initialData - Optional initial data for tables
 */
export function createMockD1Database(initialData: TableData = new Map()): D1Database {
  const data = new Map(initialData)

  function createPreparedStatement(query: string): MockPreparedStatement {
    let boundValues: unknown[] = []

    return {
      bind(...values: unknown[]) {
        boundValues = values
        return this
      },

      async first<T = unknown>(column?: string): Promise<T | null> {
        const tableName = extractTableName(query)
        const tableData = data.get(tableName) || []

        // Simple filtering based on WHERE clause and bound values
        let result: Record<string, unknown> | null = null

        if (query.toLowerCase().includes('where') && boundValues.length > 0) {
          // Extract field name from WHERE clause (simplified)
          const whereMatch = query.match(/WHERE\s+(\w+)\s*=\s*\?/i)
          if (whereMatch) {
            const fieldName = whereMatch[1]
            result = tableData.find(row => row[fieldName] === boundValues[0]) || null
          } else {
            result = tableData[0] || null
          }
        } else {
          result = tableData[0] || null
        }

        if (column && result) {
          return result[column] as T
        }
        return result as T | null
      },

      async all<T = unknown>(): Promise<D1Result<T>> {
        const tableName = extractTableName(query)
        const tableData = data.get(tableName) || []

        return {
          results: tableData as T[],
          success: true,
          meta: {
            duration: 0,
            size_after: 0,
            rows_read: tableData.length,
            rows_written: 0,
            last_row_id: 0,
            changed_db: false,
            changes: 0
          }
        }
      },

      async run(): Promise<D1Result> {
        const tableName = extractTableName(query)
        const lowerQuery = query.toLowerCase()

        let changes = 0

        if (lowerQuery.includes('insert')) {
          if (!data.has(tableName)) {
            data.set(tableName, [])
          }
          // Create a mock row from bound values
          const tableRows = data.get(tableName)!
          tableRows.push({ id: tableRows.length + 1, ...boundValues })
          changes = 1
        } else if (lowerQuery.includes('update')) {
          changes = 1
        } else if (lowerQuery.includes('delete')) {
          changes = 1
        }

        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: changes,
            last_row_id: 0,
            changed_db: changes > 0,
            changes
          }
        }
      },

      async raw<T = unknown>(): Promise<T[]> {
        const tableName = extractTableName(query)
        const tableData = data.get(tableName) || []
        return tableData.map(row => Object.values(row)) as T[]
      }
    }
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return createPreparedStatement(query) as unknown as D1PreparedStatement
    },

    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0)
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = []
      for (const stmt of statements) {
        results.push(await (stmt as unknown as MockPreparedStatement).all<T>())
      }
      return results
    },

    async exec(query: string): Promise<D1ExecResult> {
      return {
        count: 1,
        duration: 0
      }
    }
  } as D1Database
}

/**
 * Helper to set data for a specific table
 */
export function setTableData(
  db: D1Database,
  tableName: string,
  rows: Record<string, unknown>[]
): void {
  // Note: This only works with our mock implementation
  const mockDb = db as unknown as { _data?: TableData }
  if (!mockDb._data) {
    mockDb._data = new Map()
  }
  mockDb._data.set(tableName, rows)
}
