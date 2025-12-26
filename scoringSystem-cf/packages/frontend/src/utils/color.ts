/**
 * 颜色工具函数
 * 实现 WCAG 2.0 对比度算法，用于计算最佳文字颜色
 */

/**
 * RGB 颜色类型
 */
export type RGB = [number, number, number]

/**
 * 将 Hex 颜色转换为 RGB
 * @param hex - 十六进制颜色码（如 #000000 或 #FFF）
 * @returns RGB 数组 [r, g, b]
 */
export function hexToRgb(hex: string): RGB {
  // 移除 # 符号
  hex = hex.replace(/^#/, '')

  // 处理简写格式 (#FFF → #FFFFFF)
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('')
  }

  const value = parseInt(hex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255

  return [r, g, b]
}

/**
 * 计算 WCAG 2.0 相对亮度（Relative Luminance）
 * @param rgb - RGB 颜色数组
 * @returns 相对亮度值（0-1）
 */
export function getLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((v) => {
    v /= 255 // 归一化到 0-1
    // WCAG 公式：低于阈值使用线性转换，否则使用 gamma 校正
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })

  // WCAG 公式：加权求和
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

/**
 * 计算两个颜色的对比度（Contrast Ratio）
 * @param color1 - RGB 颜色 1
 * @param color2 - RGB 颜色 2
 * @returns 对比度（1-21）
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const lum1 = getLuminance(color1)
  const lum2 = getLuminance(color2)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 判断在给定背景色上应该使用黑色还是白色文字
 * @param backgroundColor - 背景色（Hex 格式）
 * @returns 对比色的 Hex 值（#000000 或 #ffffff）
 */
export function getContrastColorHex(backgroundColor: string): string {
  const bgRgb = hexToRgb(backgroundColor)
  const blackRgb: RGB = [0, 0, 0]
  const whiteRgb: RGB = [255, 255, 255]

  const contrastWithBlack = getContrastRatio(bgRgb, blackRgb)
  const contrastWithWhite = getContrastRatio(bgRgb, whiteRgb)

  // 选择对比度更高的颜色
  return contrastWithBlack > contrastWithWhite ? '#000000' : '#ffffff'
}
