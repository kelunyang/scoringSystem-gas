/**
 * Mock KV Namespace for unit testing
 * Provides in-memory key-value storage
 */

interface KVValueWithMetadata<T = string> {
  value: T | null
  metadata: Record<string, unknown> | null
  cacheStatus: string | null
}

interface KVListResult {
  keys: { name: string; expiration?: number; metadata?: Record<string, unknown> }[]
  list_complete: boolean
  cursor?: string
  cacheStatus: string | null
}

/**
 * Create a mock KV namespace for testing
 * @param initialData - Optional initial key-value pairs
 */
export function createMockKVNamespace(
  initialData: Map<string, string> = new Map()
): KVNamespace {
  const store = new Map<string, { value: string; metadata?: Record<string, unknown>; expiration?: number }>(
    Array.from(initialData.entries()).map(([k, v]) => [k, { value: v }])
  )

  return {
    async get(
      key: string,
      options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }
    ): Promise<string | null> {
      const entry = store.get(key)
      if (!entry) return null

      // Check expiration
      if (entry.expiration && entry.expiration < Date.now()) {
        store.delete(key)
        return null
      }

      if (options?.type === 'json') {
        try {
          return JSON.parse(entry.value)
        } catch {
          return entry.value
        }
      }

      return entry.value
    },

    async put(
      key: string,
      value: string | ArrayBuffer | ReadableStream,
      options?: { expiration?: number; expirationTtl?: number; metadata?: Record<string, unknown> }
    ): Promise<void> {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

      let expiration: number | undefined
      if (options?.expiration) {
        expiration = options.expiration * 1000 // Convert seconds to ms
      } else if (options?.expirationTtl) {
        expiration = Date.now() + options.expirationTtl * 1000
      }

      store.set(key, {
        value: stringValue,
        metadata: options?.metadata,
        expiration
      })
    },

    async delete(key: string): Promise<void> {
      store.delete(key)
    },

    async list(options?: {
      prefix?: string
      limit?: number
      cursor?: string
    }): Promise<KVListResult> {
      const keys: { name: string; expiration?: number; metadata?: Record<string, unknown> }[] = []

      for (const [key, entry] of store.entries()) {
        if (options?.prefix && !key.startsWith(options.prefix)) {
          continue
        }

        // Skip expired entries
        if (entry.expiration && entry.expiration < Date.now()) {
          continue
        }

        keys.push({
          name: key,
          expiration: entry.expiration ? Math.floor(entry.expiration / 1000) : undefined,
          metadata: entry.metadata
        })

        if (options?.limit && keys.length >= options.limit) {
          break
        }
      }

      return {
        keys,
        list_complete: true,
        cacheStatus: null
      }
    },

    async getWithMetadata<T = string>(
      key: string,
      options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }
    ): Promise<KVValueWithMetadata<T>> {
      const entry = store.get(key)

      if (!entry) {
        return { value: null, metadata: null, cacheStatus: null }
      }

      // Check expiration
      if (entry.expiration && entry.expiration < Date.now()) {
        store.delete(key)
        return { value: null, metadata: null, cacheStatus: null }
      }

      let value: T | null = entry.value as unknown as T
      if (options?.type === 'json') {
        try {
          value = JSON.parse(entry.value) as T
        } catch {
          // Keep as string if parsing fails
        }
      }

      return {
        value,
        metadata: entry.metadata || null,
        cacheStatus: null
      }
    }
  } as KVNamespace
}

/**
 * Helper to get all data from mock KV (for test assertions)
 */
export function getAllKVData(kv: KVNamespace): Map<string, string> {
  // Note: This only works with our mock implementation
  const mockKv = kv as unknown as { _store?: Map<string, { value: string }> }
  const result = new Map<string, string>()

  if (mockKv._store) {
    for (const [key, entry] of mockKv._store.entries()) {
      result.set(key, entry.value)
    }
  }

  return result
}
