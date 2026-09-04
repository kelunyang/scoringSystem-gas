/**
 * StagePointsShareChart 組件測試
 *
 * 這張圖的重點是「數字不能算錯」與「顏色不能循環用」，所以斷言集中在：
 * - 總點數 = 各階段（報告獎金 + 評論獎金）加總
 * - 每個區段的 flex-grow = 該階段占比（0 點的階段不進圖）
 * - 超過 8 個階段時，尾端折成單一「其他」區段，配色永不循環
 * - 全部 0 點時走 EmptyState
 *
 * 不斷言 DOM 包裹層級（el-tooltip 的實作細節），只錨定 .share-seg / .legend-row。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StagePointsShareChart from '../StagePointsShareChart.vue'

function makeStage(id: string, title: string, reportReward: number, commentReward: number) {
  return { id, title, reportReward, commentReward }
}

function mountChart(stages: ReturnType<typeof makeStage>[]) {
  return mount(StagePointsShareChart, {
    props: { stages },
    global: {
      plugins: [ElementPlus],
      // setup.ts 全域把 el-tooltip stub 成空殼，會吞掉 default slot（也就是整條長條）。
      // 這裡換成「只渲染 slot、不加包裹層」的 stub，維持 .share-bar > .share-seg 的結構。
      stubs: { 'el-tooltip': { template: '<slot />' } }
    }
  })
}

/** 讀出每個區段的 flex-grow（就是占比） */
function segmentShares(wrapper: ReturnType<typeof mountChart>): number[] {
  return wrapper.findAll('.share-seg').map(seg => {
    const style = seg.attributes('style') ?? ''
    const match = style.match(/flex-grow:\s*([\d.]+)/)
    return match ? Number(match[1]) : NaN
  })
}

describe('StagePointsShareChart', () => {
  it('總點數是所有階段報告獎金 + 評論獎金的加總', () => {
    const wrapper = mountChart([
      makeStage('stg_1', '第一階段', 1000, 500),
      makeStage('stg_2', '第二階段', 2000, 500)
    ])

    expect(wrapper.find('.hero-value').text()).toBe((4000).toLocaleString('zh-TW'))
    expect(wrapper.find('.share-caption').text()).toContain('2 個階段')
  })

  it('每個區段的寬度等於該階段占專案的比例', () => {
    const wrapper = mountChart([
      makeStage('stg_1', '第一階段', 1000, 0),
      makeStage('stg_2', '第二階段', 3000, 0)
    ])

    expect(segmentShares(wrapper)).toEqual([0.25, 0.75])
    expect(wrapper.findAll('.legend-share').map(el => el.text())).toEqual(['25.0%', '75.0%'])
  })

  it('0 點的階段不進圖也不進圖例', () => {
    const wrapper = mountChart([
      makeStage('stg_1', '第一階段', 1000, 0),
      makeStage('stg_2', '空階段', 0, 0),
      makeStage('stg_3', '第三階段', 1000, 0)
    ])

    expect(wrapper.findAll('.share-seg')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('空階段')
  })

  it('超過 8 個階段時把尾端折成單一「其他」區段，顏色不循環', () => {
    const stages = Array.from({ length: 11 }, (_, i) =>
      makeStage(`stg_${i + 1}`, `第 ${i + 1} 階段`, 100, 0)
    )
    const wrapper = mountChart(stages)

    const segs = wrapper.findAll('.share-seg')
    expect(segs).toHaveLength(8) // 前 7 個階段 + 1 個「其他」

    const rows = wrapper.findAll('.legend-row')
    expect(rows[7].text()).toContain('其他 4 個階段')
    expect(rows[7].text()).toContain((400).toLocaleString('zh-TW'))

    // 8 個色塊互不重複 = 沒有循環用色
    const colors = wrapper.findAll('.legend-swatch').map(el => el.attributes('style'))
    expect(new Set(colors).size).toBe(8)
  })

  it('全部 0 點時顯示 EmptyState，不畫出長條', () => {
    const wrapper = mountChart([
      makeStage('stg_1', '第一階段', 0, 0),
      makeStage('stg_2', '第二階段', 0, 0)
    ])

    expect(wrapper.find('.share-bar').exists()).toBe(false)
    expect(wrapper.text()).toContain('目前沒有可統計的階段點數')
  })

  it('沒有階段時也不會炸掉', () => {
    const wrapper = mountChart([])
    expect(wrapper.find('.share-bar').exists()).toBe(false)
  })
})
