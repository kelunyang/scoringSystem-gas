/**
 * UserManagement 組件測試
 *
 * 目的：作為 Options API → <script setup> 遷移的安全網。
 * 這些測試必須在遷移前後「不改一字」通過，因此：
 * - 禁用 wrapper.vm.x = y 直接改內部狀態（script setup 綁定不可變異）
 * - 全部透過 DOM 事件 / 子組件 stub 的 $emit 驅動行為
 *
 * Mock 佈局注意事項：
 * - src/test/setup.ts 的 beforeEach 會 vi.clearAllMocks()、afterEach 會
 *   vi.restoreAllMocks()，所以所有 mockReturnValue / mockResolvedValue
 *   一律放在本檔的 beforeEach 內（setup 的 hook 先執行）。
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach, type MockInstance } from 'vitest'
import { mount, flushPromises, config } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import { useQuery } from '@tanstack/vue-query'
import { adminApi } from '@/api/admin'
import UserManagement from '../UserManagement.vue'
import PasswordResetDrawer from '../user/PasswordResetDrawer.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import {
  makeAuthUser,
  makeUser,
  makeQueryResult,
  makeUserListResponse
} from '@/test/factories/adminUsers'

// ---------------------------------------------------------------------------
// Mutation composables → 可斷言的 spies
// （用 importOriginal spread 保留其他 export，避免掛載樹中其他模組 import 失敗）
// ---------------------------------------------------------------------------
const spies = vi.hoisted(() => ({
  updateStatus: vi.fn().mockResolvedValue(undefined),
  batchUpdateStatus: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue(undefined),
  unlockUser: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  addToGroup: vi.fn().mockResolvedValue(undefined),
  removeFromGroup: vi.fn().mockResolvedValue(undefined)
}))

const asMutation = (spy: ReturnType<typeof vi.fn>) => ({
  mutateAsync: spy,
  mutate: vi.fn(),
  isPending: { value: false },
  isError: { value: false },
  error: { value: null },
  reset: vi.fn()
})

vi.mock('@/composables/admin/useUserMutations', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUpdateUserStatus: () => asMutation(spies.updateStatus),
  useBatchUpdateUserStatus: () => asMutation(spies.batchUpdateStatus),
  useResetPassword: () => asMutation(spies.resetPassword),
  useUnlockUser: () => asMutation(spies.unlockUser),
  useUpdateUserProfile: () => asMutation(spies.updateProfile)
}))

vi.mock('@/composables/admin/useGlobalGroups', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAddUserToGlobalGroup: () => asMutation(spies.addToGroup),
  useRemoveUserFromGlobalGroup: () => asMutation(spies.removeFromGroup)
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fixtureUsers = [
  makeUser({ userId: 'usr_0001', userEmail: 'alice@example.com', displayName: 'Alice' }),
  makeUser({ userId: 'usr_0002', userEmail: 'bob@example.com', displayName: 'Bob', status: 'disabled' })
]

const useQueryMock = vi.mocked(useQuery)
const listMock = vi.mocked(adminApi.users.list)

function mountUserManagement() {
  return mount(UserManagement, {
    global: {
      // main.ts 是 app.use(ElementPlus) 全域註冊，測試掛載時比照辦理，
      // 讓 el-* 解析成組件（global stubs 才會生效）、v-loading 指令可用
      plugins: [ElementPlus],
      stubs: {
        // 重型子組件 stub 掉；承載斷言 DOM 的（AdminFilterToolbar、
        // ExpandableTableRow、ResponsiveTableHeader）用真組件
        UserActivityHeatmap: true,
        UserActivityDetail: true,
        InvitationManagementDrawer: true,
        UserEditorDrawer: true,
        PasswordResetDrawer: true,
        AnimatedStatistic: true,
        ConfirmationInput: true,
        EmptyState: true,
        // setup.ts 全域 stub 清單以外、本組件會用到的 el-*
        'el-badge': true,
        'el-checkbox': true,
        'el-switch': true,
        'el-avatar': true,
        'el-dropdown': true,
        'el-dropdown-menu': true,
        'el-dropdown-item': true
      }
    }
  })
}

async function mountAndSettle() {
  const wrapper = mountUserManagement()
  await flushPromises()
  return wrapper
}

describe('UserManagement', () => {
  let consoleErrorSpy: MockInstance

  beforeAll(() => {
    // 讓 el-button 等 stub 渲染 default slot（按鈕文字才找得到）
    config.global.renderStubDefaultSlot = true
  })

  afterAll(() => {
    config.global.renderStubDefaultSlot = false
  })

  beforeEach(() => {
    // setup.ts 的 clearAllMocks 已先執行，這裡重建所有回傳值
    useQueryMock.mockReturnValue(makeQueryResult(makeAuthUser()) as never)
    listMock.mockResolvedValue(makeUserListResponse(fixtureUsers) as never)
    vi.mocked(adminApi.globalGroups.list).mockResolvedValue({ success: true, data: { groups: [] } } as never)
    localStorage.clear()
    consoleErrorSpy = vi.spyOn(console, 'error')
  })

  afterEach(() => {
    // onErrorCaptured return false 會吞掉子組件錯誤讓測試假綠 —— 絆線檢查
    const dump = consoleErrorSpy.mock.calls.flat().map(String).join('\n')
    expect(dump).not.toContain('=== Error in UserManagement ===')
  })

  // -------------------------------------------------------------------------
  // A. 列表渲染
  // -------------------------------------------------------------------------
  it('渲染使用者列表（每位使用者一列，顯示 email 與名稱）', async () => {
    const wrapper = await mountAndSettle()

    // 掛載後恰好呼叫一次列表 API（防 infinite scroll 迴圈回歸）
    expect(listMock).toHaveBeenCalledTimes(1)

    const rows = wrapper.findAll('tr.expandable-main-row')
    expect(rows).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('alice@example.com')
    expect(text).toContain('Alice')
    expect(text).toContain('bob@example.com')
    expect(text).toContain('Bob')
    expect(text).toContain('顯示 2 / 2 位使用者')

    wrapper.unmount()
  })

  it('列表為空時顯示 EmptyState', async () => {
    listMock.mockResolvedValue(makeUserListResponse([]) as never)
    const wrapper = await mountAndSettle()

    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(0)
    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)

    wrapper.unmount()
  })

  it('權限載入中時顯示 loading 狀態（三態權限防護）', async () => {
    useQueryMock.mockReturnValue(makeQueryResult(undefined, { isLoading: true }) as never)
    const wrapper = await mountAndSettle()

    expect(wrapper.find('.loading-state').exists()).toBe(true)
    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(0)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // B. 篩選（server-side：改變篩選 → debounce 300ms → 重新呼叫列表 API）
  // -------------------------------------------------------------------------
  it('搜尋文字變更後（debounce）以 search 參數重新載入列表', async () => {
    const wrapper = await mountAndSettle()
    expect(listMock).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    try {
      const searchInput = wrapper
        .findAllComponents({ name: 'ElInput' })
        // stub 不宣告 props，placeholder 會落在 attrs 上
        .find(w => w.attributes('placeholder') === '搜尋使用者名稱或 Email')
      expect(searchInput).toBeTruthy()

      searchInput!.vm.$emit('update:modelValue', 'alice')
      await nextTick() // watch 觸發 → 排入 debounce timer

      await vi.advanceTimersByTimeAsync(400) // debounce 300ms

      expect(listMock).toHaveBeenCalledTimes(2)
      expect(listMock.mock.lastCall?.[0]).toMatchObject({
        search: 'alice',
        offset: 0
      })
    } finally {
      vi.useRealTimers()
    }

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // C. 開啟 drawer
  // -------------------------------------------------------------------------
  it('點擊「重設密碼」開啟 PasswordResetDrawer 並帶入該列使用者', async () => {
    const wrapper = await mountAndSettle()

    const drawer = wrapper.findComponent(PasswordResetDrawer)
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('visible')).toBe(false)

    const resetButton = wrapper
      .findAllComponents({ name: 'ElButton' })
      .find(b => b.text().includes('重設密碼'))
    expect(resetButton).toBeTruthy()

    await resetButton!.trigger('click')

    expect(drawer.props('visible')).toBe(true)
    expect(drawer.props('user')).toMatchObject({ userEmail: 'alice@example.com' })

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // D. 送出表單（drawer confirm → mutation → drawer 關閉）
  // -------------------------------------------------------------------------
  it('PasswordResetDrawer confirm 後呼叫 resetPassword mutation 並關閉 drawer', async () => {
    const wrapper = await mountAndSettle()

    // 先開啟 drawer
    const resetButton = wrapper
      .findAllComponents({ name: 'ElButton' })
      .find(b => b.text().includes('重設密碼'))
    await resetButton!.trigger('click')

    const drawer = wrapper.findComponent(PasswordResetDrawer)
    expect(drawer.props('visible')).toBe(true)

    drawer.vm.$emit('confirm', { userEmail: 'alice@example.com' })
    await flushPromises()

    expect(spies.resetPassword).toHaveBeenCalledWith({ targetEmail: 'alice@example.com' })
    expect(drawer.props('visible')).toBe(false)

    wrapper.unmount()
  })
})
