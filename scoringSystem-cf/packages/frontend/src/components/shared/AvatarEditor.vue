<template>
  <div class="avatar-editor" :class="`layout-${customizationLayout}`">
    <!-- Avatar Preview Section -->
    <div class="avatar-preview-section">
      <div class="avatar-preview">
        <el-avatar
          :key="retryCount"
          :src="previewAvatarUrl"
          :alt="`${userName}的頭像`"
          :shape="shape"
          :size="size"
          @load="handleAvatarLoad"
          @error="handleAvatarError"
        >
          {{ generateInitials() }}
        </el-avatar>

        <!-- Retry Indicator -->
        <div v-if="isRetrying" class="avatar-retry-indicator">
          <i class="el-icon-loading"></i>
          <span>{{ retryCount }}/{{ maxRetries }}</span>
        </div>

        <!-- Badges (if provided via slot) -->
        <slot name="badges"></slot>
      </div>
    </div>

    <!-- Avatar Controls Section -->
    <div class="avatar-controls-section">
      <!-- Regenerate Button -->
      <div v-if="showRegenerateButton" class="avatar-actions">
        <el-button type="warning" size="small" @click="handleRegenerate" :loading="regenerating">
          <i class="fas fa-sync"></i> 重新生成
        </el-button>
      </div>

      <!-- Customization UI -->
      <div v-if="customizationLayout === 'dropdown'" class="avatar-params-dropdown" v-click-outside="closeParamsDropdown">
        <el-button type="info" size="small" @click="toggleParamsDropdown">
          <i class="fas fa-sliders-h"></i> 調整參數
        </el-button>

        <div v-if="paramsDropdownOpen" class="params-menu">
          <AvatarCustomizationOptions
            :style="localValue.avatarStyle"
            :options="localValue.avatarOptions"
            layout="dropdown"
            @update:style="handleStyleChange"
            @update:option="handleOptionUpdate"
          />
        </div>
      </div>

      <div v-else-if="customizationLayout === 'inline'" class="avatar-customization-inline">
        <AvatarCustomizationOptions
          :style="localValue.avatarStyle"
          :options="localValue.avatarOptions"
          layout="inline"
          @update:style="handleStyleChange"
          @update:option="handleOptionUpdate"
        />
      </div>

      <!-- Save Actions -->
      <div v-if="showSaveButton && hasChanges" class="avatar-save-actions">
        <el-button type="primary" size="small" @click="handleSave" :loading="saving">
          <i class="fas fa-save"></i> 儲存
        </el-button>
        <el-button size="small" @click="handleCancel">
          <i class="fas fa-times"></i> 取消
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import AvatarCustomizationOptions from './AvatarCustomizationOptions.vue'
import * as AvatarConfig from '@/utils/avatarConfig'

// Types
export interface AvatarData {
  avatarSeed: string
  avatarStyle: string
  avatarOptions: Record<string, any>
}

interface Props {
  modelValue: AvatarData
  size?: number
  shape?: 'circle' | 'square'
  customizationLayout?: 'dropdown' | 'inline'
  showRegenerateButton?: boolean
  showSaveButton?: boolean
  userName?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  shape: 'square',
  customizationLayout: 'dropdown',
  showRegenerateButton: true,
  showSaveButton: false,
  userName: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: AvatarData]
  'save': [value: AvatarData]
  'regenerate': []
  'change': [value: AvatarData]
}>()

// Local state
const localValue = ref<AvatarData>({ ...props.modelValue })
const originalValue = ref<AvatarData>({ ...props.modelValue })

// UI state
const paramsDropdownOpen = ref(false)
const regenerating = ref(false)
const saving = ref(false)

// Error handling state
const verifiedConfigs = ref<Array<{ seed: string; style: string; options: Record<string, any> }>>([])
const retryCount = ref(0)
const isRetrying = ref(false)
const avatarError = ref(false)
const maxRetries = 3

// Computed
const hasChanges = computed(() => {
  return JSON.stringify(localValue.value) !== JSON.stringify(originalValue.value)
})

const previewAvatarUrl = computed(() => {
  if (avatarError.value) {
    return generateInitialsAvatar()
  }
  return generateDicebearUrl(
    localValue.value.avatarSeed,
    localValue.value.avatarStyle,
    localValue.value.avatarOptions
  )
})

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  localValue.value = { ...newValue }
  originalValue.value = { ...newValue }
}, { deep: true })

// Methods
function generateDicebearUrl(seed: string, style: string, options: Record<string, any> = {}): string {
  const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
  const params = new URLSearchParams({
    seed: seed,
    size: props.size.toString(),
    ...options
  })
  return `${baseUrl}?${params.toString()}`
}

function generateInitialsAvatar(): string {
  const name = props.userName || 'U'
  const initials = name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()

  return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=${props.size}&backgroundColor=b6e3f4`
}

function generateInitials(): string {
  const name = props.userName || 'U'
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

function handleAvatarLoad() {
  isRetrying.value = false
  retryCount.value = 0
  avatarError.value = false

  // Save current config to verified list
  const currentConfig = {
    seed: localValue.value.avatarSeed,
    style: localValue.value.avatarStyle,
    options: { ...localValue.value.avatarOptions }
  }

  // Remove internal params
  delete currentConfig.options._retry
  delete currentConfig.options._t

  // Check for duplicates
  const isDuplicate = verifiedConfigs.value.some(config =>
    config.seed === currentConfig.seed &&
    config.style === currentConfig.style &&
    JSON.stringify(config.options) === JSON.stringify(currentConfig.options)
  )

  if (!isDuplicate) {
    verifiedConfigs.value.push(currentConfig)
    // Keep last 10 configs
    if (verifiedConfigs.value.length > 10) {
      verifiedConfigs.value.shift()
    }
  }
}

async function handleAvatarError() {
  if (isRetrying.value) return

  // Retry with exponential backoff
  if (retryCount.value < maxRetries) {
    isRetrying.value = true
    retryCount.value++

    const delay = Math.pow(2, retryCount.value - 1) * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    isRetrying.value = false
    return
  }

  // All retries failed - rollback
  isRetrying.value = false

  if (verifiedConfigs.value.length > 0) {
    // Rollback to last verified config
    const lastGoodConfig = verifiedConfigs.value[verifiedConfigs.value.length - 1]
    localValue.value.avatarSeed = lastGoodConfig.seed
    localValue.value.avatarStyle = lastGoodConfig.style
    localValue.value.avatarOptions = { ...lastGoodConfig.options }

    retryCount.value = 0
    avatarError.value = false

    alert('此配置無法生成頭像，已回退到上一個可用狀態')
  } else {
    // No verified configs - use initials fallback
    avatarError.value = true
    retryCount.value = 0
    alert('頭像載入失敗，已切換為文字縮寫')
  }
}

function handleStyleChange(newStyle: string) {
  localValue.value.avatarStyle = newStyle
  // Set default options for new style
  const defaultOptions = AvatarConfig.DEFAULT_AVATAR_OPTIONS[newStyle as keyof typeof AvatarConfig.DEFAULT_AVATAR_OPTIONS]
  localValue.value.avatarOptions = { ...defaultOptions }

  // Reset error state
  avatarError.value = false
  retryCount.value = 0
  isRetrying.value = false

  emitUpdate()
}

function handleOptionUpdate(key: string, value: any) {
  localValue.value.avatarOptions = {
    ...localValue.value.avatarOptions,
    [key]: value
  }

  // Reset error state
  avatarError.value = false
  retryCount.value = 0
  isRetrying.value = false

  emitUpdate()
}

function handleRegenerate() {
  regenerating.value = true
  emit('regenerate')
  // Parent component should handle actual regeneration
  setTimeout(() => {
    regenerating.value = false
  }, 500)
}

function handleSave() {
  saving.value = true
  emit('save', { ...localValue.value })
  originalValue.value = { ...localValue.value }
  setTimeout(() => {
    saving.value = false
  }, 500)
}

function handleCancel() {
  localValue.value = { ...originalValue.value }
  avatarError.value = false
  retryCount.value = 0
  isRetrying.value = false
  emitUpdate()
}

function emitUpdate() {
  emit('update:modelValue', { ...localValue.value })
  emit('change', { ...localValue.value })
}

function toggleParamsDropdown() {
  paramsDropdownOpen.value = !paramsDropdownOpen.value
}

function closeParamsDropdown() {
  paramsDropdownOpen.value = false
}
</script>

<style scoped>
/* Base Layout */
.avatar-editor {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.avatar-editor.layout-dropdown {
  flex-direction: row;
}

.avatar-editor.layout-inline {
  flex-direction: column;
}

/* Avatar Preview Section */
.avatar-preview-section {
  flex-shrink: 0;
}

.avatar-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-retry-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #409eff;
  font-weight: 500;
  border-radius: 8px;
}

.avatar-retry-indicator i {
  font-size: 24px;
}

/* Avatar Controls Section */
.avatar-controls-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.avatar-actions {
  display: flex;
  gap: 8px;
}

/* Dropdown Layout */
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

/* Inline Layout */
.avatar-customization-inline {
  width: 100%;
}

/* Save Actions */
.avatar-save-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #b3e0ff;
}

/* Responsive */
@media (max-width: 768px) {
  .avatar-editor {
    flex-direction: column;
  }

  .params-menu {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 90vw;
  }
}
</style>
