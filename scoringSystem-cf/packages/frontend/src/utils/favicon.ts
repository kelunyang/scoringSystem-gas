/**
 * @fileoverview Favicon Generation Utility
 * 從 FontAwesome 圖示動態生成 SVG favicon
 */

/**
 * FontAwesome 圖示對應的 Unicode 映射表
 * 這些是 Font Awesome Free 中常用的圖示
 */
const FA_ICON_MAP: Record<string, string> = {
  // 成就類
  'fa-star': 'f005',
  'fa-trophy': 'f091',
  'fa-medal': 'f5a2',
  'fa-award': 'f559',
  'fa-crown': 'f521',

  // 教育類
  'fa-graduation-cap': 'f19d',
  'fa-book': 'f02d',
  'fa-book-open': 'f518',
  'fa-school': 'f549',
  'fa-chalkboard': 'f51b',

  // 商業類
  'fa-briefcase': 'f0b1',
  'fa-building': 'f1ad',
  'fa-chart-line': 'f201',
  'fa-lightbulb': 'f0eb',

  // 自然類
  'fa-leaf': 'f06c',
  'fa-tree': 'f1bb',
  'fa-sun': 'f185',
  'fa-moon': 'f186',
  'fa-mountain': 'f6fc',

  // 符號類
  'fa-heart': 'f004',
  'fa-flag': 'f024',
  'fa-bolt': 'f0e7',
  'fa-fire': 'f06d',
  'fa-gem': 'f3a5',

  // 其他
  'fa-rocket': 'f135',
  'fa-compass': 'f14e',
  'fa-anchor': 'f13d',
  'fa-shield-alt': 'f3ed',
  'fa-user-graduate': 'f501',
  'fa-pencil-alt': 'f303',
  'fa-code': 'f121',
  'fa-cog': 'f013',
  'fa-check': 'f00c',
  'fa-circle': 'f111',
}

/**
 * 從 FontAwesome 圖示生成 SVG favicon 的 data URL
 * @param iconClass - FontAwesome 圖示 class (例如: 'fa-star')
 * @param color - 圖示顏色 (預設: 主題色 #1A9B8E)
 * @returns SVG data URL
 */
export function generateFaviconFromIcon(iconClass: string, color = '#1A9B8E'): string {
  const unicode = FA_ICON_MAP[iconClass] || FA_ICON_MAP['fa-star']

  // 建立 SVG，使用 Font Awesome 字體
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <style>
      @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
    </style>
  </defs>
  <circle cx="50" cy="50" r="48" fill="${color}" opacity="0.1"/>
  <text x="50" y="70" font-size="55" text-anchor="middle"
        font-family="'Font Awesome 6 Free', 'Font Awesome 5 Free'"
        font-weight="900"
        fill="${color}">&#x${unicode};</text>
</svg>`.trim()

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * 更新 document head 中的 favicon
 * @param iconClass - FontAwesome 圖示 class (例如: 'fa-star')
 * @param color - 圖示顏色 (可選)
 */
export function updateFavicon(iconClass: string, color?: string): void {
  const faviconUrl = generateFaviconFromIcon(iconClass, color)

  // 移除現有的 favicon
  const existingFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
  existingFavicons.forEach(el => el.remove())

  // 新增新的 favicon
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = faviconUrl
  document.head.appendChild(link)
}

/**
 * 取得支援的圖示清單
 * @returns 圖示清單 (class name)
 */
export function getSupportedIcons(): string[] {
  return Object.keys(FA_ICON_MAP)
}

/**
 * 檢查圖示是否支援 favicon 生成
 * @param iconClass - FontAwesome 圖示 class
 * @returns 是否支援
 */
export function isFaviconSupported(iconClass: string): boolean {
  return iconClass in FA_ICON_MAP
}
