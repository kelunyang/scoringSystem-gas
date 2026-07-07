/**
 * ProjectManagement 組件測試
 *
 * 目的：作為 Options API 殼 → <script setup> 遷移與內嵌 drawer 抽離的安全網。
 * 這些測試必須在遷移前後「不改一字」通過，因此：
 * - 禁用 wrapper.vm.x = y 直接改內部狀態（script setup 綁定不可變異）
 * - 全部透過 DOM 事件 / 子組件 stub 的 $emit 驅動行為
 * - 斷言只錨定三類穩定面：mutation spy payload、drawer 開關狀態（title 定位）、
 *   drawer 內穩定 DOM（placeholder、按鈕文字）——不斷言內部命名與 DOM 包裹層級
 *
 * Mock 佈局注意事項：
 * - src/test/setup.ts 的 beforeEach 會 vi.clearAllMocks()，所有 mockReturnValue /
 *   mockResolvedValue 一律放在本檔的 beforeEach 內（setup 的 hook 先執行）
 * - 本檔覆寫 setup.ts 的 vue-router 靜態 mock：route 需為 reactive 物件，
 *   否則「URL → 展開狀態」的 watch（route.params.projectId）不會觸發
 * - useAdminProjects 整個 module mock 掉，避免與 currentUser 搶同一個 useQuery mock
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach, type MockInstance } from 'vitest'
import { mount, flushPromises, config, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import { useQuery } from '@tanstack/vue-query'
import ProjectManagement from '../ProjectManagement.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { makeAuthUser, makeQueryResult } from '@/test/factories/adminUsers'
import {
  makeProject,
  makeStage,
  makeStagesResult,
  type TestProject
} from '@/test/factories/adminProjects'

// ---------------------------------------------------------------------------
// vue-router → reactive route（覆寫 setup.ts 的靜態 mock）
// ---------------------------------------------------------------------------
interface MockRoute {
  params: Record<string, string | string[]>
  query: Record<string, unknown>
  path: string
  name: string
  fullPath: string
  hash: string
  matched: unknown[]
  meta: Record<string, unknown>
}

const routeHolder = vi.hoisted(() => ({
  route: null as MockRoute | null,
  push: vi.fn()
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  routeHolder.route = reactive({
    params: {},
    query: {},
    path: '/admin/projects',
    name: 'admin-projects',
    fullPath: '/admin/projects',
    hash: '',
    matched: [],
    meta: {}
  }) as MockRoute
  return {
    useRoute: () => routeHolder.route,
    useRouter: () => ({
      push: routeHolder.push,
      replace: vi.fn(),
      go: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      currentRoute: { value: routeHolder.route }
    })
  }
})

// ---------------------------------------------------------------------------
// useAdminProjects → holder 餵資料（不經 useQuery，避免與 currentUser 打架）
// ---------------------------------------------------------------------------
const projectsHolder = vi.hoisted(() => ({ projects: [] as unknown[] }))

vi.mock('@/composables/useAdminProjects', () => ({
  useAdminProjects: () => ({
    data: { value: { projects: projectsHolder.projects, totalCount: projectsHolder.projects.length } },
    isLoading: { value: false },
    isFetching: { value: false },
    refetch: vi.fn()
  })
}))

// ---------------------------------------------------------------------------
// Mutation composables → 可斷言的 spies
// （用 importOriginal spread 保留其他 export，其餘 composable 落到 setup.ts
//   的全域 useMutation mock）
// ---------------------------------------------------------------------------
const spies = vi.hoisted(() => ({
  listStages: vi.fn(),
  listViewers: vi.fn(),
  cloneProject: vi.fn(),
  cloneStageToProjects: vi.fn(),
  updateProject: vi.fn()
}))

const asMutation = (spy: ReturnType<typeof vi.fn>) => ({
  mutateAsync: spy,
  mutate: vi.fn(),
  isPending: { value: false },
  isError: { value: false },
  error: { value: null },
  reset: vi.fn()
})

vi.mock('@/composables/admin/useProjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useListStages: () => asMutation(spies.listStages),
  useListProjectViewers: () => asMutation(spies.listViewers),
  useCloneProject: () => asMutation(spies.cloneProject),
  useCloneStageToProjects: () => asMutation(spies.cloneStageToProjects),
  useUpdateProject: () => asMutation(spies.updateProject)
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeFixtureProjects(): TestProject[] {
  return [
    makeProject({
      projectId: 'prj_0001',
      projectName: '春季專題',
      description: '春季學期專題評分',
      lastModified: 1750000200000
    }),
    makeProject({
      projectId: 'prj_0002',
      projectName: '秋季專題',
      description: '秋季學期專題評分',
      lastModified: 1750000100000
    })
  ]
}

function makeFixtureStages() {
  return [
    makeStage({ stageId: 'stg_0001', stageName: '期初報告', stageOrder: 1 }),
    makeStage({ stageId: 'stg_0002', stageName: '期末報告', stageOrder: 2 })
  ]
}

const useQueryMock = vi.mocked(useQuery)

function mountProjectManagement() {
  return mount(ProjectManagement, {
    global: {
      // main.ts 是 app.use(ElementPlus) 全域註冊，測試掛載時比照辦理
      plugins: [ElementPlus],
      stubs: {
        // 重型子組件 stub 掉；承載斷言 DOM 的（AdminFilterToolbar、
        // ExpandableTableRow、ResponsiveTableHeader）用真組件。
        // 注意：不得 stub 未來抽離出的 drawer 組件名（抽離後以真組件掛載，
        // 內部 el-* 仍吃全域 stub，DOM 錨點不變）
        VotingAnalysisModal: true,
        CommentVotingAnalysisModal: true,
        EventLogDrawer: true,
        StageGanttChart: true,
        ReverseSettlementDrawer: true,
        SettlementProgressDrawer: true,
        SettlementConfirmationDrawer: true,
        ViewerManagementDrawer: true,
        ProjectEditorDrawer: true,
        StageEditorDrawer: true,
        ForceVotingDrawer: true,
        ClearStageVotesDrawer: true,
        PauseStageDrawer: true,
        ResumeStageDrawer: true,
        AnimatedStatistic: true,
        ConfirmationInput: true,
        EmptyState: true,
        // setup.ts 全域 stub 清單以外、本組件會用到的 el-*
        'el-switch': true,
        'el-dropdown': true,
        'el-dropdown-menu': true,
        'el-dropdown-item': true,
        'el-popconfirm': true
      }
    }
  })
}

async function mountAndSettle() {
  const wrapper = mountProjectManagement()
  await flushPromises()
  return wrapper
}

// ---------------------------------------------------------------------------
// 查找 helpers（只依賴穩定錨點：title / placeholder / 按鈕文字）
// ---------------------------------------------------------------------------
type Wrapper = VueWrapper | Omit<VueWrapper, 'exists'>

function findDrawer(wrapper: VueWrapper, title: string) {
  const drawer = wrapper
    .findAllComponents({ name: 'ElDrawer' })
    .find(w => w.attributes('title') === title)
  expect(drawer, `找不到 title="${title}" 的 el-drawer`).toBeTruthy()
  return drawer!
}

function isDrawerOpen(drawer: ReturnType<typeof findDrawer>) {
  // stub 不宣告 props，modelValue 落在 attrs 上（DOM 序列化為小寫）
  return (drawer.attributes('modelvalue') ?? drawer.attributes('model-value')) === 'true'
}

function findButton(scope: Wrapper, predicate: (text: string) => boolean) {
  const button = (scope as VueWrapper)
    .findAllComponents({ name: 'ElButton' })
    .find(b => predicate(b.text()))
  expect(button, '找不到符合條件的按鈕').toBeTruthy()
  return button!
}

function findInputByPlaceholder(scope: Wrapper, placeholder: string) {
  const input = (scope as VueWrapper)
    .findAllComponents({ name: 'ElInput' })
    .find(w => w.attributes('placeholder') === placeholder)
  expect(input, `找不到 placeholder="${placeholder}" 的輸入框`).toBeTruthy()
  return input!
}

describe('ProjectManagement', () => {
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
    projectsHolder.projects = makeFixtureProjects()
    routeHolder.route!.params = {}
    spies.listStages.mockResolvedValue(makeStagesResult(makeFixtureStages()))
    spies.listViewers.mockResolvedValue([])
    spies.cloneProject.mockResolvedValue(undefined)
    spies.cloneStageToProjects.mockResolvedValue(undefined)
    spies.updateProject.mockResolvedValue(undefined)
    localStorage.clear()
    consoleErrorSpy = vi.spyOn(console, 'error')
  })

  afterEach(() => {
    // Vue runtime 吞掉的組件錯誤會以 console.error 輸出 —— 絆線檢查
    const dump = consoleErrorSpy.mock.calls.flat().map(String).join('\n')
    expect(dump).not.toContain('Unhandled error')
  })

  // -------------------------------------------------------------------------
  // A. 列表渲染
  // -------------------------------------------------------------------------
  it('渲染專案列表（每個專案一列，顯示名稱與分數範圍）', async () => {
    const wrapper = await mountAndSettle()

    const rows = wrapper.findAll('tr.expandable-main-row')
    expect(rows).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('春季專題')
    expect(text).toContain('秋季專題')

    wrapper.unmount()
  })

  it('列表為空時顯示 EmptyState', async () => {
    projectsHolder.projects = []
    const wrapper = await mountAndSettle()

    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(0)
    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // B. 篩選（client-side：computed 立即生效，無 debounce）
  // -------------------------------------------------------------------------
  it('封存專案預設隱藏，開啟「顯示封存專案」開關後出現', async () => {
    projectsHolder.projects = [
      ...makeFixtureProjects(),
      makeProject({
        projectId: 'prj_0003',
        projectName: '去年專題',
        status: 'archived',
        lastModified: 1750000000000
      })
    ]
    const wrapper = await mountAndSettle()

    // 注意：負向斷言要收斂在表格列上 —— drawer stub 的目標專案選單會列出所有專案名
    const rowsText = () => wrapper.findAll('tr.expandable-main-row').map(r => r.text()).join('\n')
    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(2)
    expect(rowsText()).not.toContain('去年專題')

    const archivedSwitch = wrapper
      .findAllComponents({ name: 'ElSwitch' })
      .find(w => w.attributes('active-text') === '顯示封存專案')
    expect(archivedSwitch).toBeTruthy()

    archivedSwitch!.vm.$emit('update:modelValue', true)
    await nextTick()

    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(3)
    expect(rowsText()).toContain('去年專題')

    wrapper.unmount()
  })

  it('搜尋文字即時過濾專案列表', async () => {
    const wrapper = await mountAndSettle()
    expect(wrapper.findAll('tr.expandable-main-row')).toHaveLength(2)

    const searchInput = findInputByPlaceholder(wrapper, '搜尋專案名稱或描述')
    searchInput.vm.$emit('update:modelValue', '春季')
    await nextTick()

    const rows = wrapper.findAll('tr.expandable-main-row')
    expect(rows).toHaveLength(1)
    // 收斂在表格列上斷言（drawer stub 的選單會列出所有專案名）
    expect(rows[0].text()).toContain('春季專題')
    expect(rows[0].text()).not.toContain('秋季專題')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // C. Route 驅動展開（deep link：URL 帶 projectId → 自動展開並載入階段）
  // -------------------------------------------------------------------------
  it('route.params.projectId 存在時自動展開專案並載入階段', async () => {
    routeHolder.route!.params = { projectId: 'prj_0001' }
    const wrapper = await mountAndSettle()

    expect(spies.listStages).toHaveBeenCalledWith({
      projectId: 'prj_0001',
      includeArchived: true
    })

    const text = wrapper.text()
    expect(text).toContain('期初報告')
    expect(text).toContain('期末報告')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // D. Clone Project drawer 全流程
  // -------------------------------------------------------------------------
  it('複製專案：開啟 drawer → 填名稱 + CLONE → 送出 mutation → 關閉', async () => {
    const wrapper = await mountAndSettle()

    const drawer = findDrawer(wrapper, '複製專案')
    expect(isDrawerOpen(drawer)).toBe(false)

    await findButton(wrapper, t => t.includes('複製專案')).trigger('click')
    expect(isDrawerOpen(findDrawer(wrapper, '複製專案'))).toBe(true)
    // 帶入來源專案（列表第一列 = lastModified 最新的春季專題）
    expect(findDrawer(wrapper, '複製專案').text()).toContain('春季專題')

    findInputByPlaceholder(findDrawer(wrapper, '複製專案'), '請輸入新專案名稱')
      .vm.$emit('update:modelValue', '春季專題二版')
    findDrawer(wrapper, '複製專案')
      .findComponent(ConfirmationInput)
      .vm.$emit('update:modelValue', 'CLONE')
    await nextTick()

    await findButton(findDrawer(wrapper, '複製專案'), t => t.includes('確定複製')).trigger('click')
    await flushPromises()

    expect(spies.cloneProject).toHaveBeenCalledWith({
      projectId: 'prj_0001',
      newProjectName: '春季專題二版',
      copyViewers: false
    })
    expect(isDrawerOpen(findDrawer(wrapper, '複製專案'))).toBe(false)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // E. Clone Stage drawer 全流程（先展開專案）
  // -------------------------------------------------------------------------
  it('複製階段：展開專案 → 開啟 drawer → 預設目標為來源專案 → 送出 mutation', async () => {
    routeHolder.route!.params = { projectId: 'prj_0001' }
    const wrapper = await mountAndSettle()
    expect(wrapper.text()).toContain('期初報告')

    await findButton(wrapper, t => t.includes('複製階段')).trigger('click')
    const drawer = findDrawer(wrapper, '複製階段')
    expect(isDrawerOpen(drawer)).toBe(true)
    expect(drawer.text()).toContain('期初報告')

    findInputByPlaceholder(drawer, '請輸入新階段名稱')
      .vm.$emit('update:modelValue', '期中報告')
    drawer.findComponent(ConfirmationInput).vm.$emit('update:modelValue', 'CLONE')
    await nextTick()

    await findButton(drawer, t => t.includes('確定複製')).trigger('click')
    await flushPromises()

    // targetProjectIds 預設帶入來源專案（openCloneStageDrawer 的預選邏輯）
    expect(spies.cloneStageToProjects).toHaveBeenCalledWith({
      sourceProjectId: 'prj_0001',
      stageId: 'stg_0001',
      newStageName: '期中報告',
      targetProjectIds: ['prj_0001']
    })
    expect(isDrawerOpen(findDrawer(wrapper, '複製階段'))).toBe(false)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // F. Archive drawer 全流程
  // -------------------------------------------------------------------------
  it('封存專案：開啟 drawer（顯示專案資訊）→ ARCHIVE 確認 → 送出 mutation → 關閉', async () => {
    const wrapper = await mountAndSettle()

    await findButton(
      wrapper,
      t => t.includes('封存') && !t.includes('確定') && !t.includes('解除')
    ).trigger('click')

    const drawer = findDrawer(wrapper, '封存專案')
    expect(isDrawerOpen(drawer)).toBe(true)
    expect(drawer.text()).toContain('春季專題')
    expect(drawer.text()).toContain('prj_0001')

    drawer.findComponent(ConfirmationInput).vm.$emit('update:modelValue', 'ARCHIVE')
    await nextTick()

    await findButton(drawer, t => t.includes('確定封存')).trigger('click')
    await flushPromises()

    expect(spies.updateProject).toHaveBeenCalledWith({
      projectId: 'prj_0001',
      updates: { status: 'archived' }
    })
    expect(isDrawerOpen(findDrawer(wrapper, '封存專案'))).toBe(false)

    wrapper.unmount()
  })
})
