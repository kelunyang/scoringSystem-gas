/**
 * Unit tests for color utility functions
 * Tests WCAG 2.0 contrast ratio calculations
 */

import { describe, test, expect } from 'vitest'
import {
  hexToRgb,
  getLuminance,
  getContrastRatio,
  getContrastColorHex,
  type RGB
} from '../color'

describe('color utilities', () => {
  describe('hexToRgb', () => {
    test('converts 6-digit hex to RGB', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0])
      expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
      expect(hexToRgb('#FF5733')).toEqual([255, 87, 51])
      expect(hexToRgb('#1a2b3c')).toEqual([26, 43, 60])
    })

    test('converts 3-digit shorthand hex to RGB', () => {
      expect(hexToRgb('#FFF')).toEqual([255, 255, 255])
      expect(hexToRgb('#000')).toEqual([0, 0, 0])
      expect(hexToRgb('#F00')).toEqual([255, 0, 0])
      expect(hexToRgb('#0F0')).toEqual([0, 255, 0])
      expect(hexToRgb('#00F')).toEqual([0, 0, 255])
      expect(hexToRgb('#ABC')).toEqual([170, 187, 204])
    })

    test('handles hex without # prefix', () => {
      expect(hexToRgb('FF5733')).toEqual([255, 87, 51])
      expect(hexToRgb('000000')).toEqual([0, 0, 0])
      expect(hexToRgb('FFF')).toEqual([255, 255, 255])
    })

    test('handles lowercase hex values', () => {
      expect(hexToRgb('#ff5733')).toEqual([255, 87, 51])
      expect(hexToRgb('#abcdef')).toEqual([171, 205, 239])
    })

    test('handles mixed case hex values', () => {
      expect(hexToRgb('#Ff5733')).toEqual([255, 87, 51])
      expect(hexToRgb('#AbCdEf')).toEqual([171, 205, 239])
    })
  })

  describe('getLuminance', () => {
    test('returns 0 for black', () => {
      expect(getLuminance([0, 0, 0])).toBe(0)
    })

    test('returns 1 for white', () => {
      expect(getLuminance([255, 255, 255])).toBe(1)
    })

    test('calculates correct luminance for pure red', () => {
      const redLum = getLuminance([255, 0, 0])
      expect(redLum).toBeCloseTo(0.2126, 4)
    })

    test('calculates correct luminance for pure green', () => {
      const greenLum = getLuminance([0, 255, 0])
      expect(greenLum).toBeCloseTo(0.7152, 4)
    })

    test('calculates correct luminance for pure blue', () => {
      const blueLum = getLuminance([0, 0, 255])
      expect(blueLum).toBeCloseTo(0.0722, 4)
    })

    test('returns value between 0 and 1', () => {
      const colors: RGB[] = [
        [128, 128, 128],
        [255, 128, 0],
        [64, 192, 64],
        [100, 100, 200]
      ]

      for (const color of colors) {
        const luminance = getLuminance(color)
        expect(luminance).toBeGreaterThanOrEqual(0)
        expect(luminance).toBeLessThanOrEqual(1)
      }
    })

    test('gray has luminance proportional to intensity', () => {
      // For gray, all channels are equal
      const darkGray = getLuminance([64, 64, 64])
      const midGray = getLuminance([128, 128, 128])
      const lightGray = getLuminance([192, 192, 192])

      expect(darkGray).toBeLessThan(midGray)
      expect(midGray).toBeLessThan(lightGray)
    })
  })

  describe('getContrastRatio', () => {
    test('returns 21:1 for black on white', () => {
      const ratio = getContrastRatio([0, 0, 0], [255, 255, 255])
      expect(ratio).toBeCloseTo(21, 0)
    })

    test('returns 21:1 for white on black (order independent)', () => {
      const ratio = getContrastRatio([255, 255, 255], [0, 0, 0])
      expect(ratio).toBeCloseTo(21, 0)
    })

    test('returns 1:1 for same colors', () => {
      const ratio = getContrastRatio([128, 128, 128], [128, 128, 128])
      expect(ratio).toBe(1)
    })

    test('returns value between 1 and 21', () => {
      const testCases: [RGB, RGB][] = [
        [[255, 0, 0], [0, 255, 0]],
        [[255, 128, 0], [0, 0, 128]],
        [[100, 100, 100], [200, 200, 200]]
      ]

      for (const [color1, color2] of testCases) {
        const ratio = getContrastRatio(color1, color2)
        expect(ratio).toBeGreaterThanOrEqual(1)
        expect(ratio).toBeLessThanOrEqual(21)
      }
    })

    test('meets WCAG AA standard (4.5:1) for large text', () => {
      // Dark blue on white should pass WCAG AA
      const ratio = getContrastRatio([0, 0, 128], [255, 255, 255])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('getContrastColorHex', () => {
    test('returns white for dark backgrounds', () => {
      expect(getContrastColorHex('#000000')).toBe('#ffffff')
      expect(getContrastColorHex('#1a1a1a')).toBe('#ffffff')
      expect(getContrastColorHex('#333333')).toBe('#ffffff')
      expect(getContrastColorHex('#0000FF')).toBe('#ffffff') // Pure blue is dark
    })

    test('returns black for light backgrounds', () => {
      expect(getContrastColorHex('#FFFFFF')).toBe('#000000')
      expect(getContrastColorHex('#f0f0f0')).toBe('#000000')
      expect(getContrastColorHex('#FFFF00')).toBe('#000000') // Yellow is light
      expect(getContrastColorHex('#00FF00')).toBe('#000000') // Green is light
    })

    test('handles edge cases near threshold', () => {
      // Mid-gray should favor one color
      const result = getContrastColorHex('#808080')
      expect(result === '#000000' || result === '#ffffff').toBe(true)
    })

    test('works with shorthand hex', () => {
      expect(getContrastColorHex('#000')).toBe('#ffffff')
      expect(getContrastColorHex('#FFF')).toBe('#000000')
    })

    test('works without # prefix', () => {
      expect(getContrastColorHex('000000')).toBe('#ffffff')
      expect(getContrastColorHex('FFFFFF')).toBe('#000000')
    })

    test('handles common UI colors', () => {
      // Primary colors - verify they return valid contrast colors
      // The actual result depends on the WCAG luminance calculation
      const successGreen = getContrastColorHex('#198754')
      const dangerRed = getContrastColorHex('#dc3545')
      const warningYellow = getContrastColorHex('#ffc107')
      const primaryBlue = getContrastColorHex('#0d6efd')

      // All should return either black or white
      const validColors = ['#000000', '#ffffff']
      expect(validColors).toContain(successGreen)
      expect(validColors).toContain(dangerRed)
      expect(validColors).toContain(warningYellow)
      expect(validColors).toContain(primaryBlue)

      // Yellow should definitely get black text (high luminance)
      expect(warningYellow).toBe('#000000')
    })
  })
})
