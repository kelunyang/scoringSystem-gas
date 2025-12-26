<template>
  <div class="avatar-customizer">
    <!-- 頭像預覽容器 -->
    <div class="avatar-preview-container">
      <div class="avatar-wrapper">
        <img
          v-if="!isInFallbackMode"
          :src="avatarUrl"
          :alt="`${displayName || 'User'}的頭像`"
          @load="handleAvatarLoad"
          @error="handleAvatarError"
          :width="size"
          :height="size"
          class="avatar-image"
          :class="{ 'avatar-square': shape === 'square' }"
        />

        <!-- Fallback: initials -->
        <div
          v-else
          class="avatar-fallback"
          :style="{ width: size + 'px', height: size + 'px' }"
          :class="{ 'avatar-square': shape === 'square' }"
        >
          {{ generatedInitials }}
        </div>

        <!-- Badges overlay -->
        <div v-if="badges && badges.length > 0" class="badge-container">
          <div
            v-for="badge in badges"
            :key="badge.type"
            class="user-badge"
            :style="{ backgroundColor: badge.color }"
            :title="badge.label"
          >
            <i :class="badge.icon"></i>
          </div>
        </div>

        <!-- 重試中的 loading 指示器 -->
        <div v-if="isRetrying" class="loading-overlay">
          <i class="el-icon-loading"></i>
          <span class="retry-text">重試中 ({{ retryCount }}/{{ maxRetries }})</span>
        </div>
      </div>
    </div>

    <!-- 控制面板 -->
    <div v-if="showAdvancedOptions" class="avatar-controls">
      <!-- 重新生成和調整按鈕 -->
      <div class="control-buttons">
        <el-button @click="regenerateAvatar" :loading="isRegenerating" size="default">
          <i class="fas fa-sync"></i>
          重新生成頭像
        </el-button>

        <!-- 參數調整下拉選單 -->
        <div class="avatar-params-dropdown" v-click-outside="closeParamsDropdown">
          <el-button @click="toggleParamsDropdown" size="default">
            <i class="fas fa-sliders-h"></i>
            調整頭像參數
            <i class="fas fa-chevron-down" :class="{ rotated: paramsDropdownOpen }"></i>
          </el-button>

          <div v-if="paramsDropdownOpen" class="params-menu">
            <!-- 風格選擇 -->
            <div class="param-group">
              <label>頭像風格：</label>
              <div class="style-options">
                <div
                  v-for="style in avatarStyles"
                  :key="style.value"
                  class="style-option"
                  :class="{ selected: currentStyle === style.value }"
                  @click="updateStyle(style.value)"
                >
                  {{ style.label }}
                </div>
              </div>
            </div>

            <!-- 動態參數選項（根據風格） -->
            <component
              :is="'div'"
              v-for="(paramGroup, groupIndex) in currentStyleParams"
              :key="groupIndex"
            >
              <div class="param-group">
                <label>{{ paramGroup.label }}：</label>

                <!-- 顏色選擇器 -->
                <div v-if="paramGroup.type === 'color'" class="color-options">
                  <div
                    v-for="color in paramGroup.options"
                    :key="color.value"
                    class="color-option"
                    :style="{ backgroundColor: '#' + color.value }"
                    :class="{ selected: currentOptions[paramGroup.key] === color.value }"
                    @click="updateOption(paramGroup.key, color.value)"
                    :title="color.label"
                  ></div>
                </div>

                <!-- 下拉選擇器 -->
                <el-select
                  v-else-if="paramGroup.type === 'select'"
                  v-model="currentOptions[paramGroup.key]"
                  size="small"
                  @change="handleOptionChange"
                >
                  <el-option
                    v-for="opt in paramGroup.options"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </component>
          </div>
        </div>
      </div>

      <!-- 保存/取消按鈕 -->
      <div v-if="hasChanges && showSaveButton" class="save-actions">
        <el-button type="primary" @click="emitSave" :loading="isSaving">
          儲存頭像設定
        </el-button>
        <el-button @click="cancelChanges">
          取消變更
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import * as AvatarConfig from '@/utils/avatarConfig'
import { rpcClient } from '@/utils/rpc-client'

// Types
interface AvatarOptions {
  [key: string]: any
}

interface AvatarConfig {
  seed: string
  style: string
  options: AvatarOptions
}

interface Badge {
  type: string
  color: string
  label: string
  icon: string
}

interface ParamOption {
  value: string
  label: string
}

interface ParamGroup {
  key: string
  label: string
  type: 'color' | 'select'
  options: ParamOption[]
}

interface UpdatePayload {
  seed: string
  style: string
  options: AvatarOptions
}

// Props
const props = withDefaults(defineProps<{
  initialSeed?: string
  initialStyle?: string
  initialOptions?: AvatarOptions
  displayName?: string
  userEmail?: string
  showAdvancedOptions?: boolean
  showSaveButton?: boolean
  size?: number
  shape?: 'circle' | 'square'
  badges?: Badge[]
  apiClient?: any
}>(), {
  initialSeed: '',
  initialStyle: 'avataaars',
  initialOptions: () => ({}),
  displayName: '',
  userEmail: '',
  showAdvancedOptions: true,
  showSaveButton: true,
  size: 120,
  shape: 'circle',
  badges: () => [],
  apiClient: null
})

// Emits
const emit = defineEmits<{
  update: [payload: UpdatePayload]
  save: [payload: UpdatePayload]
}>()

// State
const currentSeed = ref('')
const currentStyle = ref('avataaars')
const currentOptions = ref<AvatarOptions>({})
const verifiedConfigs = ref<AvatarConfig[]>([])
const loadError = ref(false)
const retryCount = ref(0)
const maxRetries = ref(3)
const isRetrying = ref(false)
const isInFallbackMode = ref(false)
const paramsDropdownOpen = ref(false)
const isRegenerating = ref(false)
const isSaving = ref(false)
const hasChanges = ref(false)
const avatarStyles = AvatarConfig.AVATAR_STYLES

// Computed
const avatarUrl = computed(() => {
  const options = { ...currentOptions.value }
  if (retryCount.value > 0) {
    options._retry = retryCount.value
    options._t = Date.now()
  }
  return generateDicebearUrl(currentSeed.value, currentStyle.value, options)
})

const generatedInitials = computed(() => {
  const name = props.displayName || props.userEmail || 'U'
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
})

const currentStyleParams = computed((): ParamGroup[] => {
  const params: ParamGroup[] = []

  switch (currentStyle.value) {
    case 'avataaars':
      params.push(
        { key: 'skinColor', label: '膚色', type: 'color', options: AvatarConfig.AVATAAARS_SKIN_COLORS },
        { key: 'hairColor', label: '髮色', type: 'color', options: AvatarConfig.AVATAAARS_HAIR_COLORS },
        { key: 'backgroundColor', label: '背景顏色', type: 'color', options: AvatarConfig.AVATAAARS_BACKGROUND_COLORS },
        { key: 'clothesColor', label: '衣服顏色', type: 'color', options: AvatarConfig.AVATAAARS_CLOTHES_COLORS },
        { key: 'eyes', label: '眼睛', type: 'select', options: AvatarConfig.AVATAAARS_EYES },
        { key: 'mouth', label: '嘴巴', type: 'select', options: AvatarConfig.AVATAAARS_MOUTH },
        { key: 'top', label: '髮型', type: 'select', options: AvatarConfig.AVATAAARS_TOP },
        { key: 'clothing', label: '衣服', type: 'select', options: AvatarConfig.AVATAAARS_CLOTHING }
      )
      break

    case 'pixel-art':
      params.push(
        { key: 'skinColor', label: '膚色', type: 'color', options: AvatarConfig.PIXELART_SKIN_COLORS },
        { key: 'hairColor', label: '髮色', type: 'color', options: AvatarConfig.PIXELART_HAIR_COLORS },
        { key: 'clothingColor', label: '衣服顏色', type: 'color', options: AvatarConfig.PIXELART_CLOTHING_COLORS }
      )
      break

    case 'personas':
      params.push(
        { key: 'skinColor', label: '膚色', type: 'color', options: AvatarConfig.PERSONAS_SKIN_COLORS },
        { key: 'hairColor', label: '髮色', type: 'color', options: AvatarConfig.PERSONAS_HAIR_COLORS },
        { key: 'clothingColor', label: '衣服顏色', type: 'color', options: AvatarConfig.PERSONAS_CLOTHING_COLORS },
        { key: 'eyes', label: '眼睛', type: 'select', options: AvatarConfig.PERSONAS_EYES },
        { key: 'mouth', label: '嘴巴', type: 'select', options: AvatarConfig.PERSONAS_MOUTH },
        { key: 'hair', label: '髮型', type: 'select', options: AvatarConfig.PERSONAS_HAIR }
      )
      break

    case 'bottts':
      params.push(
        { key: 'baseColor', label: '機器人顏色', type: 'color', options: AvatarConfig.BOTTTS_BASE_COLORS },
        { key: 'eyes', label: '眼睛', type: 'select', options: AvatarConfig.BOTTTS_EYES },
        { key: 'mouth', label: '嘴巴', type: 'select', options: AvatarConfig.BOTTTS_MOUTH },
        { key: 'texture', label: '紋理', type: 'select', options: AvatarConfig.BOTTTS_TEXTURE }
      )
      break

    case 'initials':
      params.push(
        { key: 'backgroundColor', label: '背景顏色', type: 'color', options: AvatarConfig.INITIALS_BACKGROUND_COLORS },
        { key: 'textColor', label: '文字顏色', type: 'color', options: AvatarConfig.INITIALS_TEXT_COLORS }
      )
      break

    case 'identicon':
      params.push(
        { key: 'rowColor', label: '圖案顏色', type: 'color', options: AvatarConfig.IDENTICON_ROW_COLORS }
      )
      break
  }

  return params
})

// Methods
const initializeAvatar = (): void => {
  currentSeed.value = props.initialSeed || generateSeed()
  currentStyle.value = props.initialStyle || 'avataaars'
  currentOptions.value = { ...AvatarConfig.DEFAULT_AVATAR_OPTIONS[currentStyle.value], ...props.initialOptions }

  if (props.initialSeed && props.initialStyle) {
    verifiedConfigs.value = [{
      seed: currentSeed.value,
      style: currentStyle.value,
      options: { ...currentOptions.value }
    }]
  } else {
    verifiedConfigs.value = []
  }

  hasChanges.value = false
  loadError.value = false
  retryCount.value = 0
  isInFallbackMode.value = false
}

const handleAvatarLoad = (): void => {
  console.log('✅ Avatar loaded successfully')

  loadError.value = false
  retryCount.value = 0
  isRetrying.value = false
  isInFallbackMode.value = false

  const currentConfig: AvatarConfig = {
    seed: currentSeed.value,
    style: currentStyle.value,
    options: { ...currentOptions.value }
  }

  delete currentConfig.options._retry
  delete currentConfig.options._t

  const isDuplicate = verifiedConfigs.value.some(config =>
    config.seed === currentConfig.seed &&
    config.style === currentConfig.style &&
    JSON.stringify(config.options) === JSON.stringify(currentConfig.options)
  )

  if (!isDuplicate) {
    verifiedConfigs.value.push(currentConfig)

    if (verifiedConfigs.value.length > 10) {
      verifiedConfigs.value.shift()
    }

    console.log(`📝 Verified config saved. Total: ${verifiedConfigs.value.length}`)
  }
}

const handleAvatarError = async (event: Event): Promise<void> => {
  console.warn('⚠️ Avatar load error, attempt:', retryCount.value + 1)

  if (isRetrying.value) return

  if (retryCount.value < maxRetries.value) {
    isRetrying.value = true
    retryCount.value++

    const delay = Math.pow(2, retryCount.value - 1) * 1000
    console.log(`⏳ Retrying in ${delay}ms...`)

    await sleep(delay)

    isRetrying.value = false
    return
  }

  console.error('❌ All retries failed, rolling back...')
  rollbackToLastGoodConfig()
}

const rollbackToLastGoodConfig = (): void => {
  isRetrying.value = false

  if (verifiedConfigs.value.length > 0) {
    const lastGoodConfig = verifiedConfigs.value[verifiedConfigs.value.length - 1]

    console.log('🔄 Rolling back to last verified config:', lastGoodConfig)

    currentSeed.value = lastGoodConfig.seed
    currentStyle.value = lastGoodConfig.style
    currentOptions.value = { ...lastGoodConfig.options }

    loadError.value = false
    retryCount.value = 0
    isInFallbackMode.value = false

    ElMessage.warning({
      message: '此配置無法生成頭像，已回退到上一個可用狀態',
      duration: 3000
    })
  } else {
    console.warn('⚠️ No verified configs available, entering fallback mode')

    isInFallbackMode.value = true
    loadError.value = true
    retryCount.value = 0

    ElMessage.error({
      message: '頭像載入失敗，已切換為文字縮寫',
      duration: 5000
    })
  }
}

const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const generateSeed = (): string => {
  const email = props.userEmail || 'user'
  const timestamp = Date.now()
  return `${email}_${timestamp}`
}

const generateDicebearUrl = (seed: string, style: string, options: AvatarOptions = {}): string => {
  const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
  const params = new URLSearchParams({
    seed: seed,
    size: props.size.toString(),
    ...options
  })
  return `${baseUrl}?${params.toString()}`
}

const updateStyle = (newStyle: string): void => {
  console.log('Updating avatar style to:', newStyle)
  currentStyle.value = newStyle
  currentOptions.value = { ...AvatarConfig.DEFAULT_AVATAR_OPTIONS[newStyle] }

  retryCount.value = 0
  loadError.value = false
  isInFallbackMode.value = false
  hasChanges.value = true

  emitUpdate()
}

const updateOption = (key: string, value: any): void => {
  console.log(`Updating avatar option ${key} to:`, value)
  currentOptions.value = {
    ...currentOptions.value,
    [key]: value
  }

  retryCount.value = 0
  loadError.value = false
  isInFallbackMode.value = false
  hasChanges.value = true

  emitUpdate()
}

const handleOptionChange = (): void => {
  retryCount.value = 0
  loadError.value = false
  isInFallbackMode.value = false
  hasChanges.value = true
  emitUpdate()
}

const regenerateAvatar = async (): Promise<void> => {
  isRegenerating.value = true

  try {
    if (props.apiClient) {
      const httpResponse = await rpcClient.users.avatar.regenerate.$post()
      const response = await httpResponse.json()

      if (response.success && response.data) {
        currentSeed.value = response.data.avatarSeed
      } else {
        currentSeed.value = generateSeed()
      }
    } else {
      currentSeed.value = generateSeed()
    }

    currentOptions.value = AvatarConfig.getRandomAvatarOptions(currentStyle.value)

    retryCount.value = 0
    loadError.value = false
    isInFallbackMode.value = false
    hasChanges.value = true

    emitUpdate()

    ElMessage.success('頭像已重新生成！')
  } catch (error) {
    console.error('Regenerate avatar error:', error)
    ElMessage.error('重新生成頭像失敗')
  } finally {
    isRegenerating.value = false
  }
}

const toggleParamsDropdown = (): void => {
  paramsDropdownOpen.value = !paramsDropdownOpen.value
}

const closeParamsDropdown = (): void => {
  paramsDropdownOpen.value = false
}

const emitUpdate = (): void => {
  emit('update', {
    seed: currentSeed.value,
    style: currentStyle.value,
    options: { ...currentOptions.value }
  })
}

const emitSave = (): void => {
  isSaving.value = true
  emit('save', {
    seed: currentSeed.value,
    style: currentStyle.value,
    options: { ...currentOptions.value }
  })

  setTimeout(() => {
    isSaving.value = false
    hasChanges.value = false
  }, 2000)
}

const cancelChanges = (): void => {
  initializeAvatar()
  hasChanges.value = false
}

const resetSavingState = (success: boolean = true): void => {
  isSaving.value = false
  if (success) {
    hasChanges.value = false
  }
}

// Watchers
watch(() => props.initialSeed, (newVal) => {
  if (newVal && newVal !== currentSeed.value) {
    initializeAvatar()
  }
})

watch(() => props.initialStyle, (newVal) => {
  if (newVal && newVal !== currentStyle.value) {
    initializeAvatar()
  }
})

watch(() => props.initialOptions, (newVal) => {
  if (newVal && JSON.stringify(newVal) !== JSON.stringify(currentOptions.value)) {
    initializeAvatar()
  }
}, { deep: true })

// Lifecycle
onMounted(() => {
  initializeAvatar()
})

// Expose methods for parent component
defineExpose({
  resetSavingState
})

// Custom directive: click-outside
const vClickOutside = {
  beforeMount(el: any, binding: any) {
    el.clickOutsideEvent = function(event: MouseEvent) {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}
</script>

<style scoped>
.avatar-customizer {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}

/* Avatar preview */
.avatar-preview-container {
  flex-shrink: 0;
}

.avatar-wrapper {
  position: relative;
  display: inline-block;
}

.avatar-image {
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.avatar-image.avatar-square {
  border-radius: 8px;
}

.avatar-fallback {
  border-radius: 50%;
  background: #b6e3f4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 600;
  color: #2c3e50;
}

.avatar-fallback.avatar-square {
  border-radius: 8px;
}

.badge-container {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  font-size: 12px;
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.loading-overlay i {
  font-size: 24px;
  color: #409eff;
}

.retry-text {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

/* Avatar controls */
.avatar-controls {
  flex: 1;
  min-width: 0;
}

.control-buttons {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.avatar-params-dropdown {
  position: relative;
}

.params-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid #e4e7ed;
  min-width: 320px;
  max-width: 400px;
  max-height: 500px;
  overflow-y: auto;
  z-index: 1000;
  padding: 20px;
}

.param-group {
  margin-bottom: 20px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-group label {
  display: block;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 14px;
}

/* Style options */
.style-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.style-option {
  padding: 8px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  transition: all 0.3s;
  background: white;
}

.style-option:hover {
  border-color: #409eff;
  color: #409eff;
}

.style-option.selected {
  background: #409eff;
  color: white;
  border-color: #409eff;
}

/* Color options */
.color-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.3s;
  position: relative;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.selected::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

/* Save actions */
.save-actions {
  display: flex;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.rotated {
  transform: rotate(180deg);
  transition: transform 0.3s;
}
</style>
