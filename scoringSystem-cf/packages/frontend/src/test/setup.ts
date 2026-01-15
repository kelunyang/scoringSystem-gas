/**
 * Vitest setup file for frontend tests
 * This file runs before each test file
 */

import { vi, beforeEach, afterEach } from 'vitest'
import { config } from '@vue/test-utils'

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})

// Mock Vue Router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    currentRoute: { value: { params: {}, query: {}, path: '/', name: 'home' } }
  }),
  useRoute: () => ({
    params: {},
    query: {},
    path: '/',
    name: 'home',
    fullPath: '/',
    hash: '',
    matched: [],
    meta: {}
  }),
  createRouter: vi.fn(),
  createWebHistory: vi.fn()
}))

// Mock TanStack Vue Query
vi.mock('@tanstack/vue-query', () => ({
  useQuery: vi.fn(() => ({
    data: { value: undefined },
    isLoading: { value: false },
    isError: { value: false },
    error: { value: null },
    refetch: vi.fn(),
    isPending: { value: false },
    isSuccess: { value: true },
    isFetching: { value: false },
    status: { value: 'success' }
  })),
  useQueries: vi.fn(() => []),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isLoading: { value: false },
    isPending: { value: false },
    error: { value: null },
    isError: { value: false },
    isSuccess: { value: false },
    reset: vi.fn()
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    prefetchQuery: vi.fn(),
    cancelQueries: vi.fn(),
    removeQueries: vi.fn()
  })),
  QueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn()
  })),
  VueQueryPlugin: { install: vi.fn() }
}))

// Mock Element Plus
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    },
    ElMessageBox: {
      confirm: vi.fn().mockResolvedValue(true),
      alert: vi.fn().mockResolvedValue(true),
      prompt: vi.fn().mockResolvedValue({ value: 'test' })
    },
    ElNotification: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    }
  }
})

// Mock RPC client
vi.mock('@/utils/rpc-client', () => ({
  rpcClient: {
    users: {
      me: { $get: vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: {} }) }) }
    },
    projects: {
      $get: vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: [] }) })
    }
  },
  createRpcClient: vi.fn()
}))

// Mock admin API
vi.mock('@/api/admin', () => ({
  adminApi: {
    users: {
      list: vi.fn(),
      updateStatus: vi.fn(),
      resetPassword: vi.fn(),
      unlock: vi.fn(),
      batchUpdateStatus: vi.fn(),
      batchResetPassword: vi.fn(),
      activity: vi.fn(),
      globalGroups: vi.fn(),
      projectGroups: vi.fn(),
      updateProfile: vi.fn()
    },
    globalGroups: {
      list: vi.fn(),
      members: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
      activate: vi.fn(),
      addUser: vi.fn(),
      removeUser: vi.fn(),
      batchAddUsers: vi.fn(),
      batchRemoveUsers: vi.fn(),
      batchDeactivate: vi.fn(),
      batchActivate: vi.fn()
    },
    system: {
      stats: vi.fn(),
      logs: vi.fn(),
      logStatistics: vi.fn(),
      entityDetails: vi.fn()
    },
    emailLogs: {
      query: vi.fn(),
      statistics: vi.fn(),
      resendSingle: vi.fn(),
      resendBatch: vi.fn()
    },
    aiServiceLogs: {
      query: vi.fn(),
      statistics: vi.fn(),
      detail: vi.fn()
    },
    notifications: {
      list: vi.fn(),
      statistics: vi.fn(),
      sendSingle: vi.fn(),
      sendBatch: vi.fn(),
      delete: vi.fn()
    },
    robots: {
      status: vi.fn(),
      notificationPatrol: {
        config: vi.fn(),
        updateConfig: vi.fn(),
        pending: vi.fn(),
        statistics: vi.fn()
      }
    },
    security: {
      suspiciousLogins: vi.fn()
    },
    properties: {
      getAll: vi.fn(),
      update: vi.fn(),
      reset: vi.fn()
    },
    smtp: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      testConnection: vi.fn()
    }
  }
}))

// Mock error handler
vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
  handleApiError: vi.fn(),
  handleValidationError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  parseErrorMessage: vi.fn((error) => error?.message || 'Unknown error'),
  translateErrorMessage: vi.fn((message) => message)
}))

// Global config for Vue Test Utils
config.global.stubs = {
  teleport: true,
  transition: false,
  'el-button': true,
  'el-input': true,
  'el-form': true,
  'el-form-item': true,
  'el-dialog': true,
  'el-drawer': true,
  'el-table': true,
  'el-table-column': true,
  'el-pagination': true,
  'el-select': true,
  'el-option': true,
  'el-date-picker': true,
  'el-tooltip': true,
  'el-icon': true,
  'el-tag': true,
  'el-card': true,
  'el-row': true,
  'el-col': true,
  'el-alert': true,
  'el-loading': true
}

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
  get length() {
    return Object.keys(localStorageMock.store).length
  },
  key: vi.fn((index: number) => Object.keys(localStorageMock.store)[index] || null)
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
})

// Mock sessionStorage
Object.defineProperty(globalThis, 'sessionStorage', {
  value: { ...localStorageMock, store: {} },
  writable: true
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver
})

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver
})

// Export for type inference
export {}
