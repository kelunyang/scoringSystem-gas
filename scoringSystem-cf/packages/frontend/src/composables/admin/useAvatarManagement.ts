/**
 * Avatar Management Composable
 * Handles avatar style selection, preview, and updates
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  generateDicebearUrl,
  generateAvatarSeed,
  parseAvatarOptions
} from '@/utils/avatar'

export interface AvatarStyle {
  id: string
  name: string
  description: string
  category: 'human' | 'fun' | 'abstract'
}

export function useAvatarManagement() {
  // Available avatar styles from DiceBear
  const availableStyles: AvatarStyle[] = [
    { id: 'avataaars', name: 'Avataaars', description: '卡通風格人物頭像', category: 'human' },
    { id: 'big-ears', name: 'Big Ears', description: '大耳朵卡通頭像', category: 'fun' },
    { id: 'big-smile', name: 'Big Smile', description: '大笑臉頭像', category: 'fun' },
    { id: 'bottts', name: 'Bottts', description: '機器人頭像', category: 'fun' },
    { id: 'croodles', name: 'Croodles', description: '手繪風格頭像', category: 'human' },
    { id: 'fun-emoji', name: 'Fun Emoji', description: '有趣的 Emoji', category: 'fun' },
    { id: 'identicon', name: 'Identicon', description: '幾何圖形頭像', category: 'abstract' },
    { id: 'initials', name: 'Initials', description: '首字母頭像', category: 'abstract' },
    { id: 'lorelei', name: 'Lorelei', description: '簡約人物頭像', category: 'human' },
    { id: 'micah', name: 'Micah', description: '插畫風格頭像', category: 'human' },
    { id: 'miniavs', name: 'Miniavs', description: '極簡頭像', category: 'abstract' },
    { id: 'notionists', name: 'Notionists', description: 'Notion 風格頭像', category: 'human' },
    { id: 'open-peeps', name: 'Open Peeps', description: '開放插畫頭像', category: 'human' },
    { id: 'personas', name: 'Personas', description: '個性化頭像', category: 'human' },
    { id: 'pixel-art', name: 'Pixel Art', description: '像素藝術頭像', category: 'fun' },
    { id: 'shapes', name: 'Shapes', description: '形狀組合頭像', category: 'abstract' },
    { id: 'thumbs', name: 'Thumbs', description: '拇指頭像', category: 'fun' }
  ]

  // State
  const currentStyle = ref<string>('avataaars')
  const currentSeed = ref<string>('')
  const currentOptions = ref<Record<string, any>>({})
  const previewUrl = ref<string>('')

  // Computed
  const humanStyles = computed(() => availableStyles.filter(s => s.category === 'human'))
  const funStyles = computed(() => availableStyles.filter(s => s.category === 'fun'))
  const abstractStyles = computed(() => availableStyles.filter(s => s.category === 'abstract'))

  const currentStyleInfo = computed(() => {
    return availableStyles.find(s => s.id === currentStyle.value)
  })

  // Methods
  const setAvatarStyle = (style: string) => {
    if (!availableStyles.find(s => s.id === style)) {
      ElMessage.error('不支援的頭像風格')
      return false
    }
    currentStyle.value = style
    updatePreview()
    return true
  }

  const setAvatarSeed = (seed: string) => {
    currentSeed.value = seed
    updatePreview()
  }

  const generateNewSeed = (email?: string) => {
    const newSeed = email ? generateAvatarSeed(email) : `seed_${Date.now()}`
    currentSeed.value = newSeed
    updatePreview()
    return newSeed
  }

  const setAvatarOptions = (options: Record<string, any>) => {
    currentOptions.value = { ...options }
    updatePreview()
  }

  const updatePreview = () => {
    if (!currentSeed.value) {
      previewUrl.value = ''
      return
    }

    previewUrl.value = generateDicebearUrl(
      currentSeed.value,
      currentStyle.value,
      currentOptions.value
    )
  }

  const randomizeAvatar = (email?: string) => {
    // Generate new seed
    generateNewSeed(email)

    // Randomly select style
    const randomStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)]
    currentStyle.value = randomStyle.id

    // Clear options for fresh randomization
    currentOptions.value = {}

    updatePreview()

    ElMessage.success('已生成隨機頭像')
  }

  const resetToDefault = (email: string) => {
    currentStyle.value = 'avataaars'
    currentSeed.value = generateAvatarSeed(email)
    currentOptions.value = {}
    updatePreview()
  }

  const initializeAvatar = (params: {
    style?: string
    seed?: string
    options?: string | Record<string, any>
  }) => {
    currentStyle.value = params.style || 'avataaars'
    currentSeed.value = params.seed || ''

    if (params.options) {
      currentOptions.value = parseAvatarOptions(params.options)
    } else {
      currentOptions.value = {}
    }

    updatePreview()
  }

  const getAvatarData = () => {
    return {
      avatarStyle: currentStyle.value,
      avatarSeed: currentSeed.value,
      avatarOptions: JSON.stringify(currentOptions.value)
    }
  }

  const copyAvatarUrl = async () => {
    if (!previewUrl.value) {
      ElMessage.error('沒有可複製的頭像 URL')
      return
    }

    try {
      await navigator.clipboard.writeText(previewUrl.value)
      ElMessage.success('頭像 URL 已複製到剪貼簿')
    } catch (error) {
      console.error('Copy avatar URL error:', error)
      ElMessage.error('複製失敗')
    }
  }

  // Style-specific options (could be expanded based on DiceBear API)
  const getStyleOptions = (style: string): Array<{ key: string; label: string; type: string; options?: any[] }> => {
    // Common options for most styles
    const commonOptions = [
      { key: 'backgroundColor', label: '背景顏色', type: 'color' },
      { key: 'radius', label: '圓角', type: 'slider', min: 0, max: 50 }
    ]

    // Style-specific options
    const styleOptionsMap: Record<string, any[]> = {
      'avataaars': [
        ...commonOptions,
        { key: 'accessoriesColor', label: '配件顏色', type: 'color' },
        { key: 'clothingColor', label: '衣服顏色', type: 'color' },
        { key: 'hairColor', label: '頭髮顏色', type: 'color' }
      ],
      'bottts': [
        ...commonOptions,
        { key: 'colors', label: '顏色組合', type: 'select', options: ['blue', 'red', 'green', 'yellow'] }
      ],
      'initials': [
        ...commonOptions,
        { key: 'fontSize', label: '字體大小', type: 'slider', min: 30, max: 80 }
      ]
    }

    return styleOptionsMap[style] || commonOptions
  }

  return {
    // Constants
    availableStyles,

    // State
    currentStyle,
    currentSeed,
    currentOptions,
    previewUrl,

    // Computed
    humanStyles,
    funStyles,
    abstractStyles,
    currentStyleInfo,

    // Methods
    setAvatarStyle,
    setAvatarSeed,
    generateNewSeed,
    setAvatarOptions,
    updatePreview,
    randomizeAvatar,
    resetToDefault,
    initializeAvatar,
    getAvatarData,
    copyAvatarUrl,
    getStyleOptions
  }
}
