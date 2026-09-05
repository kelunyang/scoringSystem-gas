/**
 * CountdownButton 行為測試
 *
 * 這個元件曾經有三個「寫了但永遠不會執行」的功能（外部進度填充、翻轉動畫、
 * autoStart），全都不會報錯、type-check 也抓不到，只會安靜地什麼都不做。
 * 這裡的斷言就是釘住那三條路徑，外加倒數本身的邊界。
 * 詳見 plan/pitfalls.md 2026-09-05 條目。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CountdownButton from '../CountdownButton.vue'

/** 讀取按鈕 inline style 上的 CSS 變數 */
function cssVar(wrapper: ReturnType<typeof mount>, name: string): string | undefined {
  const style = wrapper.find('button').attributes('style') ?? ''
  return style
    .split(';')
    .map((rule) => rule.trim())
    .find((rule) => rule.startsWith(`${name}:`))
    ?.split(':')[1]
    .trim()
}

const progress = (w: ReturnType<typeof mount>) => cssVar(w, '--countdown-progress')

describe('CountdownButton', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  describe('倒數進度', () => {
    it('逐秒推進填充進度，並在倒數文字上顯示剩餘秒數', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', duration: 4, autoStart: true }
      })

      expect(progress(w)).toBe('0%')

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('25%')
      expect(w.text()).toContain('(3s)')

      vi.advanceTimersByTime(2000)
      await nextTick()
      expect(progress(w)).toBe('75%')
    })

    it('倒數期間按鈕禁用，歸零後解禁且進度歸零（不會卡在滿格）', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', duration: 2, autoStart: true }
      })

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(w.find('button').attributes('disabled')).toBeDefined()

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(w.find('button').attributes('disabled')).toBeUndefined()
      expect(progress(w)).toBe('0%')
    })

    it('歸零的同一個 tick 就發出 complete，不會多空轉一秒', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', duration: 2, autoStart: true }
      })

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(w.emitted('complete')).toBeUndefined()

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(w.emitted('complete')).toHaveLength(1)

      // 再走一秒也不該補送第二次
      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(w.emitted('complete')).toHaveLength(1)
    })
  })

  describe('外部進度（disabled 期間由父層驅動）', () => {
    it('disabled 且有 externalProgress 時改用外部進度', async () => {
      const w = mount(CountdownButton, {
        props: { label: '載入', disabled: true, externalProgress: 30 }
      })

      expect(progress(w)).toBe('30%')

      await w.setProps({ externalProgress: 85 })
      expect(progress(w)).toBe('85%')
    })

    it('未 disabled 時忽略 externalProgress，以內部計時器為準', async () => {
      const w = mount(CountdownButton, {
        props: { label: '載入', externalProgress: 70, duration: 4, autoStart: true }
      })

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('25%')
    })
  })

  describe('autoStart', () => {
    it('掛載後才轉為 true 也要能啟動（父層常傳 !isInitialLoading 這種 computed）', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重新整理', duration: 4, autoStart: false }
      })

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('0%')

      await w.setProps({ autoStart: true })
      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('25%')
    })
  })

  describe('點擊', () => {
    it('預設點擊後自行開始倒數', async () => {
      const w = mount(CountdownButton, { props: { label: '重送', duration: 4 } })

      await w.find('button').trigger('click')
      expect(w.emitted('click')).toHaveLength(1)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('25%')
    })

    it('startOnClick=false 時只發事件不倒數，送出失敗才不會把使用者鎖住', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', duration: 4, startOnClick: false }
      })

      await w.find('button').trigger('click')
      expect(w.emitted('click')).toHaveLength(1)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(progress(w)).toBe('0%')
      expect(w.find('button').attributes('disabled')).toBeUndefined()
    })
  })

  describe('翻轉動畫', () => {
    it('倒數結束時翻一次，animationend 後解除以便下一輪重播', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重新整理', duration: 2, autoStart: true, flip: true }
      })

      expect(w.find('button').classes()).not.toContain('is-flipping')

      vi.advanceTimersByTime(2000)
      await nextTick()
      expect(w.find('button').classes()).toContain('is-flipping')

      await w.find('button').trigger('animationend')
      expect(w.find('button').classes()).not.toContain('is-flipping')
    })

    it('外部進度跑到 100% 時也翻一次（初次載入完成）', async () => {
      const w = mount(CountdownButton, {
        props: { label: '載入', disabled: true, externalProgress: 85, flip: true }
      })

      expect(w.find('button').classes()).not.toContain('is-flipping')

      await w.setProps({ externalProgress: 100 })
      expect(w.find('button').classes()).toContain('is-flipping')
    })

    it('flip 未開啟就不播', async () => {
      const w = mount(CountdownButton, {
        props: { label: '重新整理', duration: 2, autoStart: true }
      })

      vi.advanceTimersByTime(2000)
      await nextTick()
      expect(w.find('button').classes()).not.toContain('is-flipping')
    })
  })

  describe('配色', () => {
    it('沒給 progressColor 時漸變終點等於主題色（單色填充）', () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', themeColor: '#2c5aa0' }
      })

      expect(cssVar(w, '--countdown-color')).toBe('#2c5aa0')
      expect(cssVar(w, '--countdown-progress-color')).toBe('#2c5aa0')
    })

    it('給了 progressColor 就作為 100% 時的填充色', () => {
      const w = mount(CountdownButton, {
        props: { label: '重送', themeColor: '#2c5aa0', progressColor: '#c82333' }
      })

      expect(cssVar(w, '--countdown-color')).toBe('#2c5aa0')
      expect(cssVar(w, '--countdown-progress-color')).toBe('#c82333')
    })
  })
})
