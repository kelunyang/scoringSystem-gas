/**
 * @fileoverview 管理員使用者操作：送出去的 body 要通得過後端的 zod schema
 *
 * 這些 mutation 的參數用 targetEmail 命名，後端 schema 收的是 userEmail。
 * 名字對不上時 zValidator 直接回 400，畫面上只會看到「解鎖失敗」四個字，
 * 元件測試把整個 composable mock 掉也照樣過關——所以這裡不驗畫面，
 * 只驗真正送到線上的那個 body 能不能被後端 schema 接受。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  UnlockUserRequestSchema,
  UpdateUserStatusRequestSchema,
  BatchUpdateUserStatusRequestSchema,
  ResetUserPasswordRequestSchema
} from '@repo/shared'

const requests: Array<{ url: string; body: Record<string, unknown> }> = []

vi.mock('@/utils/api-helpers', () => ({
  fetchWithAuth: vi.fn(async (url: string, options: { body?: Record<string, unknown> }) => {
    requests.push({ url, body: options.body ?? {} })
    return { success: true, data: { successCount: 1, failureCount: 0, results: [] } }
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

// useMutation 原封不動回傳 options，測試就能直接呼叫 mutationFn，
// 不用為了拿一個 request body 去架 QueryClientProvider
vi.mock('@tanstack/vue-query', () => ({
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() })
}))

import {
  useUnlockUser,
  useUpdateUserStatus,
  useBatchUpdateUserStatus,
  useResetPassword
} from '../useUserMutations'

/** 取出 mutationFn 並執行，回傳它送出的 request */
async function callMutation(mutation: unknown, params: unknown) {
  const { mutationFn } = mutation as { mutationFn: (p: unknown) => Promise<unknown> }
  await mutationFn(params)
  return requests[requests.length - 1]
}

beforeEach(() => {
  requests.length = 0
  vi.clearAllMocks()
})

describe('useUserMutations 送出的 body', () => {
  it('解鎖帳戶符合 UnlockUserRequestSchema', async () => {
    const request = await callMutation(useUnlockUser(), {
      targetEmail: 'student@school.tw',
      unlockReason: '使用者本人來電確認身分，確認是自己打錯密碼',
      resetLockCount: true
    })

    expect(request.url).toBe('/api/admin/users/unlock')
    expect(UnlockUserRequestSchema.safeParse(request.body).success).toBe(true)
  })

  it('重設密碼符合 ResetUserPasswordRequestSchema', async () => {
    const request = await callMutation(useResetPassword(), {
      targetEmail: 'student@school.tw'
    })

    expect(ResetUserPasswordRequestSchema.safeParse(request.body).success).toBe(true)
  })

  it('單筆更新狀態符合 UpdateUserStatusRequestSchema', async () => {
    const request = await callMutation(useUpdateUserStatus(), {
      targetEmail: 'student@school.tw',
      status: 'active'
    })

    expect(UpdateUserStatusRequestSchema.safeParse(request.body).success).toBe(true)
  })

  it('批次更新狀態符合 BatchUpdateUserStatusRequestSchema', async () => {
    // 注意：畫面上的「批次停用」目前送的是 status: 'disabled'，
    // 但後端 enum 只收 active / inactive——那是另一個還沒修的洞，見 plan/issue.md
    const request = await callMutation(useBatchUpdateUserStatus(), {
      targetEmails: ['a@school.tw', 'b@school.tw'],
      status: 'inactive'
    })

    expect(BatchUpdateUserStatusRequestSchema.safeParse(request.body).success).toBe(true)
  })
})
