/**
 * @fileoverview Favicon Generation Utility
 * 支援兩種渲染模式：
 * 1. SVG path 直接繪製（預設圖標，快速）
 * 2. Canvas 渲染（任意 Font Awesome 圖標，需等字體載入）
 */

/**
 * 預設圖標的 SVG path 映射表（快速渲染，不需等待字體）
 */
const FA_PATH_MAP: Record<string, { viewBox: string; path: string }> = {
  'fa-star': {
    viewBox: '0 0 576 512',
    path: 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z'
  },
  'fa-trophy': {
    viewBox: '0 0 576 512',
    path: 'M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z'
  },
  'fa-medal': {
    viewBox: '0 0 512 512',
    path: 'M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z'
  },
  'fa-award': {
    viewBox: '0 0 384 512',
    path: 'M173.8 5.5c11-7.3 25.4-7.3 36.4 0L228 17.2c6 3.9 13 5.8 20.1 5.4l21.3-1.3c13.2-.8 25.6 6.4 31.5 18.2l9.6 19.1c3.2 6.4 8.4 11.5 14.7 14.7L344.5 83c11.8 5.9 19 18.3 18.2 31.5l-1.3 21.3c-.4 7.1 1.5 14.2 5.4 20.1l11.8 17.8c7.3 11 7.3 25.4 0 36.4L366.8 228c-3.9 6-5.8 13-5.4 20.1l1.3 21.3c.8 13.2-6.4 25.6-18.2 31.5l-19.1 9.6c-6.4 3.2-11.5 8.4-14.7 14.7L301 344.5c-5.9 11.8-18.3 19-31.5 18.2l-21.3-1.3c-7.1-.4-14.2 1.5-20.1 5.4l-17.8 11.8c-11 7.3-25.4 7.3-36.4 0L156 366.8c-6-3.9-13-5.8-20.1-5.4l-21.3 1.3c-13.2 .8-25.6-6.4-31.5-18.2l-9.6-19.1c-3.2-6.4-8.4-11.5-14.7-14.7L39.5 301c-11.8-5.9-19-18.3-18.2-31.5l1.3-21.3c.4-7.1-1.5-14.2-5.4-20.1L5.5 210.2c-7.3-11-7.3-25.4 0-36.4L17.2 156c3.9-6 5.8-13 5.4-20.1l-1.3-21.3c-.8-13.2 6.4-25.6 18.2-31.5l19.1-9.6C65 70.2 70.2 65 73.4 58.6L83 39.5c5.9-11.8 18.3-19 31.5-18.2l21.3 1.3c7.1 .4 14.2-1.5 20.1-5.4L173.8 5.5zM272 192a80 80 0 1 0 -160 0 80 80 0 1 0 160 0zM1.3 441.8L44.4 339.3c.2 .1 .3 .2 .4 .4l9.6 19.1c11.7 23.2 36 37.3 62 35.8l21.3-1.3c.2 0 .5 0 .7 .2l17.8 11.8c5.1 3.3 10.5 5.9 16.1 7.7l-37.6 89.3c-2.3 5.5-7.4 9.2-13.3 9.7s-11.6-2.2-14.8-7.2L74.4 455.5l-56.1 8.3c-5.7 .8-11.4-1.5-15-6s-4.3-10.7-2.1-16zm248 60.4L211.7 413c5.6-1.8 11-4.3 16.1-7.7l17.8-11.8c.2-.1 .4-.2 .7-.2l21.3 1.3c26 1.5 50.3-12.6 62-35.8l9.6-19.1c.1-.2 .2-.3 .4-.4l43.2 102.5c2.2 5.3 1.4 11.4-2.1 16s-9.3 6.9-15 6l-56.1-8.3-32.2 49.2c-3.2 5-8.9 7.7-14.8 7.2s-11-4.3-13.3-9.7z'
  },
  'fa-crown': {
    viewBox: '0 0 576 512',
    path: 'M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z'
  },
  'fa-graduation-cap': {
    viewBox: '0 0 640 512',
    path: 'M320 32c-8.1 0-16.1 1.4-23.7 4.1L15.8 137.4C6.3 140.9 0 149.9 0 160s6.3 19.1 15.8 22.6l57.9 20.9C57.3 229.3 48 259.8 48 291.9l0 28.1c0 28.4-10.8 57.7-22.3 80.8c-6.5 13-13.9 25.8-22.5 37.6C0 442.7-.9 448.3 .9 453.4s6 8.9 11.2 10.2l64 16c4.2 1.1 8.7 .3 12.4-2s6.3-6.1 7.1-10.4c8.6-42.8 4.3-81.2-2.1-108.7C90.3 344.3 86 329.8 80 316.5l0-24.6c0-30.2 10.2-58.7 27.9-81.5c12.9-15.5 29.6-28 49.2-35.7l157-61.7c8.2-3.2 17.5 .8 20.7 9s-.8 17.5-9 20.7l-157 61.7c-12.4 4.9-23.3 12.4-32.2 21.6l159.6 57.6c7.6 2.7 15.6 4.1 23.7 4.1s16.1-1.4 23.7-4.1L624.2 182.6c9.5-3.4 15.8-12.5 15.8-22.6s-6.3-19.1-15.8-22.6L343.7 36.1C336.1 33.4 328.1 32 320 32zM128 408c0 35.3 86 72 192 72s192-36.7 192-72L496.7 262.6 354.5 314c-11.1 4-22.8 6-34.5 6s-23.5-2-34.5-6L143.3 262.6 128 408z'
  },
  'fa-book': {
    viewBox: '0 0 448 512',
    path: 'M96 0C43 0 0 43 0 96L0 416c0 53 43 96 96 96l288 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-64c17.7 0 32-14.3 32-32l0-320c0-17.7-14.3-32-32-32L384 0 96 0zm0 384l256 0 0 64L96 448c-17.7 0-32-14.3-32-32s14.3-32 32-32zm32-240c0-8.8 7.2-16 16-16l192 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-192 0c-8.8 0-16-7.2-16-16zm16 48l192 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-192 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z'
  },
  'fa-fire': {
    viewBox: '0 0 448 512',
    path: 'M159.3 5.4c7.8-7.3 19.9-7.2 27.7 .1c27.6 25.9 53.5 53.8 77.7 84c11-14.4 23.5-30.1 37-42.9c7.9-7.4 20.1-7.4 28 .1c34.6 33 63.9 76.6 84.5 118c20.3 40.8 33.8 82.5 33.8 111.9C448 404.2 348.2 512 224 512C98.4 512 0 404.1 0 276.5c0-38.4 17.8-85.3 45.4-131.7C73.3 97.7 112.7 48.6 159.3 5.4zM225.7 416c25.3 0 47.7-7 68.8-21c42.1-29.4 53.4-88.2 28.1-134.4c-4.5-9-16-9.6-22.5-2l-25.2 29.3c-6.6 7.6-18.5 7.4-24.7-.5c-16.5-21-46-58.5-62.8-79.8c-6.3-8-18.3-8.1-24.7-.1c-33.8 42.5-50.8 69.3-50.8 99.4C112 375.4 162.6 416 225.7 416z'
  },
  'fa-heart': {
    viewBox: '0 0 512 512',
    path: 'M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z'
  },
  'fa-rocket': {
    viewBox: '0 0 512 512',
    path: 'M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z'
  },
  'fa-cog': {
    viewBox: '0 0 512 512',
    path: 'M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z'
  },
  'fa-check': {
    viewBox: '0 0 448 512',
    path: 'M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z'
  },
  'fa-circle': {
    viewBox: '0 0 512 512',
    path: 'M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z'
  },
}

/**
 * 從 DOM 讀取 Font Awesome 圖標的 Unicode
 * 利用 CSS ::before 偽元素的 content 屬性
 */
function getIconUnicodeFromDOM(iconClass: string): string | null {
  // 創建臨時元素
  const tempIcon = document.createElement('i')
  tempIcon.className = `fas fa-${iconClass.replace('fa-', '')}`
  tempIcon.style.cssText = 'position:absolute;left:-9999px;visibility:hidden'
  document.body.appendChild(tempIcon)

  try {
    // 讀取 ::before 偽元素的 content
    const content = window.getComputedStyle(tempIcon, '::before').content
    // content 格式為 '"X"' 其中 X 是 Unicode 字符
    if (content && content !== 'none' && content !== '""') {
      // 移除引號並獲取字符碼
      const char = content.replace(/['"]/g, '')
      if (char.length > 0) {
        return char.codePointAt(0)?.toString(16) || null
      }
    }
  } finally {
    document.body.removeChild(tempIcon)
  }

  return null
}

/**
 * 使用 Canvas 渲染 Font Awesome 圖標
 * @param unicode - 圖標的 Unicode（16進制字串）
 * @param color - 圖標顏色
 * @param size - Canvas 尺寸
 */
async function renderIconWithCanvas(
  unicode: string,
  color: string,
  size = 64
): Promise<string | null> {
  // 等待字體載入
  try {
    await document.fonts.ready
  } catch {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // 清空背景（透明）
  ctx.clearRect(0, 0, size, size)

  // 設置字體和顏色
  ctx.fillStyle = color
  ctx.font = `900 ${size * 0.75}px "Font Awesome 6 Free"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 繪製圖標
  const char = String.fromCodePoint(parseInt(unicode, 16))
  ctx.fillText(char, size / 2, size / 2)

  // 檢查是否成功繪製（不是空白）
  const imageData = ctx.getImageData(0, 0, size, size)
  const hasContent = imageData.data.some((val, i) => i % 4 === 3 && val > 0)

  if (!hasContent) {
    return null
  }

  return canvas.toDataURL('image/png')
}

/**
 * 使用 SVG path 生成 favicon（快速，不需等待字體）
 */
function generateFaviconFromPath(iconClass: string, color: string): string {
  const iconData = FA_PATH_MAP[iconClass] || FA_PATH_MAP['fa-star']

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${iconData.viewBox}">
  <path d="${iconData.path}" fill="${color}"/>
</svg>`.trim()

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * 從 FontAwesome 圖示生成 favicon 的 data URL
 * 策略：
 * 1. 如果是預設圖標（有 SVG path），直接用 SVG 渲染（快速）
 * 2. 如果是自定義圖標，嘗試用 Canvas 渲染（需等字體載入）
 * 3. 如果都失敗，fallback 到星星
 *
 * @param iconClass - FontAwesome 圖示 class (例如: 'fa-star')
 * @param color - 圖示顏色 (預設: 主題色 #1A9B8E)
 * @returns Promise<SVG 或 PNG data URL>
 */
export async function generateFaviconFromIcon(
  iconClass: string,
  color = '#1A9B8E'
): Promise<string> {
  // 標準化 icon class
  const normalizedClass = iconClass.startsWith('fa-') ? iconClass : `fa-${iconClass}`

  // 策略 1：如果有預設的 SVG path，直接使用（最快）
  if (normalizedClass in FA_PATH_MAP) {
    return generateFaviconFromPath(normalizedClass, color)
  }

  // 策略 2：嘗試從 DOM 獲取 Unicode 並用 Canvas 渲染
  const unicode = getIconUnicodeFromDOM(normalizedClass)
  if (unicode) {
    const canvasResult = await renderIconWithCanvas(unicode, color)
    if (canvasResult) {
      return canvasResult
    }
  }

  // 策略 3：Fallback 到星星
  console.warn(`[favicon] Icon "${iconClass}" not found, using fallback (fa-star)`)
  return generateFaviconFromPath('fa-star', color)
}

/**
 * 同步版本的 favicon 生成（僅支援預設圖標）
 * 用於不需要等待的場景
 */
export function generateFaviconFromIconSync(iconClass: string, color = '#1A9B8E'): string {
  const normalizedClass = iconClass.startsWith('fa-') ? iconClass : `fa-${iconClass}`

  if (normalizedClass in FA_PATH_MAP) {
    return generateFaviconFromPath(normalizedClass, color)
  }

  return generateFaviconFromPath('fa-star', color)
}

/**
 * 更新 document head 中的 favicon
 * @param iconClass - FontAwesome 圖示 class (例如: 'fa-star')
 * @param color - 圖示顏色 (可選)
 */
export async function updateFavicon(iconClass: string, color?: string): Promise<void> {
  const faviconUrl = await generateFaviconFromIcon(iconClass, color)

  // 移除現有的 favicon
  const existingFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
  existingFavicons.forEach(el => el.remove())

  // 新增新的 favicon
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = faviconUrl.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml'
  link.href = faviconUrl
  document.head.appendChild(link)
}

/**
 * 取得支援快速渲染的圖示清單（有 SVG path 的）
 * @returns 圖示清單 (class name)
 */
export function getSupportedIcons(): string[] {
  return Object.keys(FA_PATH_MAP)
}

/**
 * 檢查圖示是否支援快速渲染（有 SVG path）
 * @param iconClass - FontAwesome 圖示 class
 * @returns 是否支援快速渲染
 */
export function isFaviconSupported(iconClass: string): boolean {
  const normalizedClass = iconClass.startsWith('fa-') ? iconClass : `fa-${iconClass}`
  return normalizedClass in FA_PATH_MAP
}
