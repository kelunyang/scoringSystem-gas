/**
 * CloneStageDrawer 組件測試
 *
 * 重點是「同時複製階段起訖時間」開關決定送給後端的資料：
 * - 開關關閉：不帶 startTime / endTime（後端從現在開始、沿用原長度）
 * - 開關打開：帶原階段的 startTime / endTime，一模一樣
 * - 原階段沒排時間：開關鎖住，也不會帶時間
 */

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CloneStageDrawer from '../CloneStageDrawer.vue'

const mutateAsync = vi.fn().mockResolvedValue({ totalCloned: 1 })

vi.mock('@/composables/admin/useProjects', () => ({
  useCloneStageToProjects: () => ({ mutateAsync })
}))

const START = new Date('2026-03-01T08:00:00+08:00').getTime()
const END = new Date('2026-03-15T23:59:00+08:00').getTime()

async function mountDrawer(sourceStage: Record<string, unknown>) {
  const wrapper = mount(CloneStageDrawer, {
    props: {
      visible: false,
      sourceStage: { stageId: 'stg_1', stageName: '第一階段', projectId: 'proj_1', ...sourceStage },
      projects: [{ projectId: 'proj_1', projectName: '專案一' }]
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-drawer': { template: '<div><slot /></div>' },
        ConfirmationInput: true,
        // setup.ts 全域把 el-button stub 掉了，這裡換成真的 <button> 才能點
        'el-button': {
          props: ['type', 'disabled'],
          emits: ['click'],
          template: '<button :class="`btn-${type || \'default\'}`" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
        }
      }
    }
  })
  // 開啟時才會重置表單並預選來源專案
  await wrapper.setProps({ visible: true })
  const vm = wrapper.vm as unknown as { newStageName: string; confirmText: string; copyTimes: boolean }
  vm.newStageName = '複製的階段'
  vm.confirmText = 'CLONE'
  await flushPromises()
  return { wrapper, vm }
}

async function clickClone(wrapper: Awaited<ReturnType<typeof mountDrawer>>['wrapper']) {
  await wrapper.find('.drawer-actions .btn-primary').trigger('click')
  await flushPromises()
}

describe('CloneStageDrawer 同時複製起訖時間', () => {
  it('開關預設關閉，不帶起訖時間', async () => {
    const { wrapper, vm } = await mountDrawer({ startTime: START, endTime: END })
    expect(vm.copyTimes).toBe(false)

    await clickClone(wrapper)

    const payload = mutateAsync.mock.calls[0][0]
    expect(payload).not.toHaveProperty('startTime')
    expect(payload).not.toHaveProperty('endTime')
  })

  it('開關打開時，原階段的起訖時間原封不動帶過去', async () => {
    const { wrapper, vm } = await mountDrawer({ startTime: START, endTime: END })
    vm.copyTimes = true
    await flushPromises()

    await clickClone(wrapper)

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      stageId: 'stg_1',
      targetProjectIds: ['proj_1'],
      startTime: START,
      endTime: END
    })
  })

  it('原階段沒排時間時開關鎖住，也不帶時間', async () => {
    const { wrapper, vm } = await mountDrawer({ startTime: null, endTime: null })
    expect(wrapper.find('.el-switch').classes()).toContain('is-disabled')

    vm.copyTimes = true // 就算狀態被硬改成 true，也不能送出 null 時間
    await flushPromises()
    await clickClone(wrapper)

    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('startTime')
    expect(wrapper.text()).toContain('原階段尚未排定起訖時間')
  })
})
