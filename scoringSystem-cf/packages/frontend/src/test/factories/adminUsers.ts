/**
 * Test factories for admin user-management component tests
 *
 * 注意：此檔案不可放在 __tests__/ 目錄下 —— vitest 的 include pattern
 * 會把 __tests__ 目錄下所有 .ts 當成測試檔收集。
 */

import { vi } from 'vitest'
import type { AuthUser, User } from '@repo/shared'

/**
 * 產生一個已登入的管理員使用者（餵給 useQuery mock → useCurrentUser）
 * 預設帶 system_admin，同時解鎖 canManageUsers 與 canManageInvites
 */
export function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'usr_admin1',
    userEmail: 'admin@example.com',
    displayName: 'Admin',
    status: 'active',
    permissions: ['system_admin'],
    ...overrides
  }
}

/**
 * 產生一筆使用者列表資料（entities.ts 的 User 形狀）
 */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'usr_0001',
    userEmail: 'alice@example.com',
    displayName: 'Alice',
    registrationTime: 1750000000000,
    lastActivityTime: null,
    status: 'active',
    preferences: '{}',
    avatarSeed: null,
    avatarStyle: 'initials',
    avatarOptions: '{}',
    lockUntil: null,
    lockReason: null,
    lockCount: 0,
    ...overrides
  }
}

interface QueryResultOptions {
  isLoading?: boolean
  isError?: boolean
}

/**
 * 組出 TanStack Query useQuery 回傳值的最小可用形狀
 * （滿足 usePermissions / useAuth / useFilterPersistence 的讀取面）
 */
export function makeQueryResult(data: unknown, options: QueryResultOptions = {}) {
  const { isLoading = false, isError = false } = options
  return {
    data: { value: data },
    isLoading: { value: isLoading },
    isError: { value: isError },
    error: { value: null },
    isSuccess: { value: !isLoading && !isError },
    isPending: { value: isLoading },
    isFetching: { value: false },
    status: { value: isError ? 'error' : isLoading ? 'pending' : 'success' },
    refetch: vi.fn()
  }
}

/**
 * 組出 adminApi.users.list 的成功回應
 * totalCount 刻意等於 users.length，讓 hasMore = false，
 * 避免 happy-dom 下 useWindowInfiniteScroll 自動連環載入
 */
export function makeUserListResponse(users: User[]) {
  return {
    success: true as const,
    data: {
      users,
      totalCount: users.length
    }
  }
}
