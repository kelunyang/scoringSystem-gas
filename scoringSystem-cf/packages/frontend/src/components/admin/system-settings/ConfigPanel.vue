<template>
  <div class="settings-section">
    <div class="section-header-with-actions">
      <h3><i class="fas fa-sliders-h"></i> {{ title }}</h3>
      <div class="header-actions">
        <el-button
          v-if="showReset"
          type="warning"
          size="small"
          @click="handleReset"
          :loading="resetting"
          icon="RefreshLeft"
        >
          重設為預設值
        </el-button>
        <el-badge
          :value="hasChanges && modifiedFieldsCount > 0 ? modifiedFieldsCount : 0"
          :hidden="!hasChanges || modifiedFieldsCount === 0"
          class="save-badge"
          type="warning"
        >
          <el-button
            type="primary"
            size="small"
            @click="handleSave"
            :loading="saving"
            :disabled="!hasChanges"
            icon="Check"
          >
            儲存配置
          </el-button>
        </el-badge>
      </div>
    </div>

    <div
      v-loading="loading"
      element-loading-text="載入配置中..."
      class="properties-container"
    >
      <!-- Modified Fields Summary -->
      <div v-if="hasChanges && modifiedFieldsCount > 0" class="modified-fields-summary">
        <h4>
          <i class="fas fa-exclamation-triangle"></i> 有 {{ modifiedFieldsCount }} 個欄位已修改
        </h4>
      </div>

      <el-collapse v-model="activePanel" accordion>
        <el-collapse-item
          v-for="category in categories"
          :key="category.key"
          :name="category.key"
        >
          <template #title>
            <div class="collapse-title">
              <i class="fas" :class="category.icon"></i>
              <span>{{ category.title }}</span>
            </div>
          </template>

          <div class="config-group">
            <!-- Category Description -->
            <el-alert
              v-if="category.description"
              :title="category.description"
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 20px"
            />

            <!-- Render Fields -->
            <div
              v-for="field in category.fields"
              :key="field.key"
              class="config-item"
              :class="{
                'field-modified': isFieldModified(field.key)
              }"
            >
              <label class="config-label">
                {{ field.label }}
                <el-tag
                  v-if="isFieldModified(field.key)"
                  size="small"
                  type="warning"
                  effect="dark"
                >
                  已修改
                </el-tag>
              </label>

              <p v-if="field.description" class="config-desc">
                {{ field.description }}
              </p>

              <!-- Input Field -->
              <el-input
                v-if="field.type === 'input'"
                v-model="localValues[field.key]"
                :placeholder="field.placeholder"
                :maxlength="field.maxlength"
                :show-word-limit="field.showWordLimit"
                :disabled="field.disabled"
                :type="field.inputType || 'text'"
              >
                <template v-if="field.prependIcon" #prepend>
                  <i class="fas" :class="field.prependIcon"></i>
                </template>
              </el-input>

              <!-- Number Input -->
              <el-input-number
                v-else-if="field.type === 'number'"
                v-model.number="localValues[field.key]"
                :min="field.min"
                :max="field.max"
                :step="field.step"
                :disabled="field.disabled"
              />

              <!-- Slider -->
              <div v-else-if="field.type === 'slider'" class="slider-container">
                <el-slider
                  v-model="displayValues[field.key]"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                  :marks="field.marks"
                  :show-tooltip="field.showTooltip !== false"
                  :format-tooltip="field.formatTooltip"
                  @change="handleSliderChange(field)"
                />
                <span class="slider-value">
                  {{ getSliderDisplayValue(field) }}
                </span>
              </div>

              <!-- Select -->
              <el-select
                v-else-if="field.type === 'select'"
                v-model="localValues[field.key]"
                :placeholder="field.placeholder || '請選擇'"
                :disabled="field.disabled"
              >
                <el-option
                  v-for="option in field.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>

              <!-- Switch -->
              <el-switch
                v-else-if="field.type === 'switch'"
                v-model="displayValues[field.key]"
                active-text="開啟"
                inactive-text="關閉"
                :disabled="field.disabled"
                @change="handleSwitchChange(field)"
              />

              <!-- Password -->
              <el-input
                v-else-if="field.type === 'password'"
                v-model="localValues[field.key]"
                type="password"
                :placeholder="field.placeholder"
                :show-password="field.showPassword"
                :disabled="field.disabled"
              >
                <template v-if="field.prependIcon" #prepend>
                  <i class="fas" :class="field.prependIcon"></i>
                </template>
              </el-input>

              <!-- Custom Dual Slider (for weight配置) -->
              <div v-else-if="field.type === 'custom-dual-slider' && field.customConfig" class="dual-slider-container">
                <!-- Slider 1 -->
                <div class="dual-slider-item">
                  <div class="slider-header">
                    <span class="slider-label">{{ field.customConfig.slider1.label }}</span>
                    <span class="slider-value" :style="{ color: field.customConfig.slider1.color }">
                      {{ formatDualSliderValue(localValues[field.customConfig.slider1.key], field.customConfig) }}
                    </span>
                  </div>
                  <el-slider
                    v-model="localValues[field.customConfig.slider1.key]"
                    :min="field.customConfig.slider1.min"
                    :max="field.customConfig.slider1.max"
                    :step="field.customConfig.slider1.step"
                    :marks="field.customConfig.slider1.marks"
                    :show-tooltip="true"
                    :format-tooltip="field.customConfig.formatTooltip"
                    @change="handleDualSliderChange(field.customConfig.slider1.key, field.customConfig)"
                  />
                </div>

                <!-- Slider 2 -->
                <div class="dual-slider-item">
                  <div class="slider-header">
                    <span class="slider-label">{{ field.customConfig.slider2.label }}</span>
                    <span class="slider-value" :style="{ color: field.customConfig.slider2.color }">
                      {{ formatDualSliderValue(localValues[field.customConfig.slider2.key], field.customConfig) }}
                    </span>
                  </div>
                  <el-slider
                    v-model="localValues[field.customConfig.slider2.key]"
                    :min="field.customConfig.slider2.min"
                    :max="field.customConfig.slider2.max"
                    :step="field.customConfig.slider2.step"
                    :marks="field.customConfig.slider2.marks"
                    :show-tooltip="true"
                    :format-tooltip="field.customConfig.formatTooltip"
                    @change="handleDualSliderChange(field.customConfig.slider2.key, field.customConfig)"
                  />
                </div>

                <!-- Sum Validation Indicator -->
                <div class="dual-slider-sum" :class="{ 'sum-valid': isDualSliderSumValid(field.customConfig) }">
                  <i :class="isDualSliderSumValid(field.customConfig) ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'"></i>
                  總和: {{ formatDualSliderValue(getDualSliderSum(field.customConfig), field.customConfig) }}
                  ({{ isDualSliderSumValid(field.customConfig) ? '正確' : `應為 ${field.customConfig.sumConstraint}` }})
                </div>
              </div>

              <!-- Icon Selector -->
              <IconSelector
                v-else-if="field.type === 'icon-selector'"
                v-model="localValues[field.key]"
                @update:modelValue="(val) => emit('update', field.key, val)"
              />
            </div>

            <!-- Category-level Action Slot -->
            <slot :name="`actions-${category.key}`"></slot>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import type { ConfigCategory, ConfigField } from '@/types/config-panel'
import IconSelector from '@/components/common/IconSelector.vue'

/**
 * Props
 */
interface Props {
  /** 配置分類 */
  categories: ConfigCategory[]
  /** 配置值（響應式對象） */
  values: Record<string, any>
  /** 原始配置值（用於檢測修改） */
  originalValues?: Record<string, any>
  /** 是否正在載入 */
  loading?: boolean
  /** 是否正在儲存 */
  saving?: boolean
  /** 是否正在重設 */
  resetting?: boolean
  /** 是否有變更 */
  hasChanges?: boolean
  /** 已修改的欄位列表 */
  modifiedFields?: string[]
  /** 是否顯示重設按鈕 */
  showReset?: boolean
  /** 標題 */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  originalValues: () => ({}),
  loading: false,
  saving: false,
  resetting: false,
  hasChanges: false,
  modifiedFields: () => [],
  showReset: true,
  title: '系統參數配置'
})

/**
 * Emits
 */
interface Emits {
  /** 儲存配置 */
  (e: 'save'): void
  /** 重設配置 */
  (e: 'reset'): void
  /** 配置值更新 */
  (e: 'update', key: string, value: any): void
}

const emit = defineEmits<Emits>()

/**
 * Local State
 */
const activePanel = ref<string>('auth')
const localValues = reactive<Record<string, any>>({})
const displayValues = reactive<Record<string, any>>({})

/**
 * Computed
 */
const modifiedFieldsCount = computed(() => props.modifiedFields?.length || 0)

/**
 * 檢查欄位是否被修改
 */
const isFieldModified = (key: string): boolean => {
  return props.modifiedFields?.includes(key) || false
}

/**
 * 取得滑桿顯示值
 */
const getSliderDisplayValue = (field: ConfigField): string => {
  const value = displayValues[field.key]
  if (value === undefined || value === null) return '-'

  let displayText = String(value)
  if (field.suffix) {
    displayText += ` ${field.suffix}`
  }

  // 如果有 transform，顯示轉換後的實際值
  if (field.transform) {
    const actualValue = field.transform.toValue(value)
    displayText += ` (${actualValue})`
  }

  return displayText
}

/**
 * 處理滑桿變更
 */
const handleSliderChange = (field: ConfigField): void => {
  const displayValue = displayValues[field.key]

  if (field.transform) {
    // 有 transform 的欄位，需要轉換為實際值
    const actualValue = field.transform.toValue(displayValue)
    localValues[field.key] = actualValue
    emit('update', field.key, actualValue)
  } else {
    // 沒有 transform 的欄位，直接使用顯示值
    localValues[field.key] = displayValue
    emit('update', field.key, displayValue)
  }
}

/**
 * 處理開關變更
 */
const handleSwitchChange = (field: ConfigField): void => {
  const displayValue = displayValues[field.key]

  if (field.transform) {
    const actualValue = field.transform.toValue(displayValue)
    localValues[field.key] = actualValue
    emit('update', field.key, actualValue)
  } else {
    // Switch 通常需要轉換為字串 'true'/'false'
    const stringValue = displayValue ? 'true' : 'false'
    localValues[field.key] = stringValue
    emit('update', field.key, stringValue)
  }
}

/**
 * 處理雙向聯動滑桿變更
 * 當一個滑桿改變時，自動調整另一個滑桿以保持總和為 sumConstraint
 */
const handleDualSliderChange = (changedKey: string, config: any): void => {
  const slider1Key = config.slider1.key
  const slider2Key = config.slider2.key
  const sumConstraint = config.sumConstraint

  if (changedKey === slider1Key) {
    // Slider 1 改變，調整 Slider 2
    const value1 = Number(localValues[slider1Key])
    const value2 = sumConstraint - value1
    localValues[slider2Key] = Math.max(config.slider2.min, Math.min(config.slider2.max, value2))
    emit('update', slider2Key, localValues[slider2Key])
  } else if (changedKey === slider2Key) {
    // Slider 2 改變，調整 Slider 1
    const value2 = Number(localValues[slider2Key])
    const value1 = sumConstraint - value2
    localValues[slider1Key] = Math.max(config.slider1.min, Math.min(config.slider1.max, value1))
    emit('update', slider1Key, localValues[slider1Key])
  }

  // 發出變更事件
  emit('update', changedKey, localValues[changedKey])
}

/**
 * 格式化雙向滑桿值（顯示為百分比）
 */
const formatDualSliderValue = (value: any, config: any): string => {
  if (value === undefined || value === null) return '-'
  if (config.formatTooltip) {
    return config.formatTooltip(value)
  }
  return String(value)
}

/**
 * 計算雙向滑桿總和
 */
const getDualSliderSum = (config: any): number => {
  const value1 = Number(localValues[config.slider1.key] || 0)
  const value2 = Number(localValues[config.slider2.key] || 0)
  return Math.round((value1 + value2) * 1000) / 1000 // 避免浮點數精度問題
}

/**
 * 檢查雙向滑桿總和是否正確
 */
const isDualSliderSumValid = (config: any): boolean => {
  const sum = getDualSliderSum(config)
  return Math.abs(sum - config.sumConstraint) < 0.001
}

/**
 * 初始化本地值
 */
const initializeValues = (): void => {
  // 初始化所有欄位的值
  props.categories.forEach(category => {
    category.fields.forEach(field => {
      if (field.type === 'custom-dual-slider' && field.customConfig) {
        // 特殊處理：custom-dual-slider 需要初始化兩個欄位
        const slider1Key = field.customConfig.slider1.key
        const slider2Key = field.customConfig.slider2.key
        localValues[slider1Key] = props.values[slider1Key]
        localValues[slider2Key] = props.values[slider2Key]
      } else {
        const value = props.values[field.key]

        // 設定本地值
        localValues[field.key] = value

        // 設定顯示值（用於 slider 和 switch）
        if (field.transform) {
          displayValues[field.key] = field.transform.toDisplay(value)
        } else if (field.type === 'switch') {
          displayValues[field.key] = value === 'true' || value === true
        } else {
          displayValues[field.key] = value
        }
      }
    })
  })
}

/**
 * 監聽 props.values 變化
 */
watch(
  () => props.values,
  () => {
    initializeValues()
  },
  { deep: true }
)

/**
 * 監聽本地值變化（除了 slider 和 switch）
 */
watch(
  localValues,
  (newValues) => {
    Object.keys(newValues).forEach(key => {
      const field = getFieldByKey(key)
      if (field && field.type !== 'slider' && field.type !== 'switch') {
        emit('update', key, newValues[key])
      }
    })
  },
  { deep: true }
)

/**
 * 根據 key 查找欄位配置
 */
const getFieldByKey = (key: string): ConfigField | undefined => {
  for (const category of props.categories) {
    const field = category.fields.find(f => f.key === key)
    if (field) return field
  }
  return undefined
}

/**
 * 處理儲存
 */
const handleSave = (): void => {
  emit('save')
}

/**
 * 處理重設
 */
const handleReset = (): void => {
  emit('reset')
}

/**
 * 初始化
 */
onMounted(() => {
  initializeValues()
})
</script>

<style scoped>
.settings-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow: hidden;
}

.section-header-with-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  padding: 20px 20px 0 20px;
}

.section-header-with-actions h3 {
  margin: 0;
  color: #2c5aa0;
  font-size: 18px;
}

.section-header-with-actions h3 i {
  margin-right: 10px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.properties-container {
  padding: 20px;
}

.config-group {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-weight: 600;
  color: #333;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-desc {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
}

.slider-value {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
  align-self: flex-end;
  margin-top: 5px;
}

.collapse-title {
  font-weight: 600;
  color: #2c5aa0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.save-badge {
  margin-left: 8px;
}

/* Field Modification Indicator */
.config-item.field-modified {
  position: relative;
  padding-left: 10px;
  border-left: 3px solid #e6a23c;
  background-color: #fdf6ec;
  border-radius: 4px;
  padding: 15px;
}

/* Modified fields summary */
.modified-fields-summary {
  padding: 15px 20px;
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
  margin-bottom: 20px;
  border-radius: 4px;
}

.modified-fields-summary h4 {
  margin: 0;
  color: #e6a23c;
  font-size: 14px;
  font-weight: 600;
}

/* Dual Slider Styles */
.dual-slider-container {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.dual-slider-item {
  margin-bottom: 20px;
}

.dual-slider-item:last-of-type {
  margin-bottom: 15px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.slider-label {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.slider-value {
  font-weight: 700;
  font-size: 16px;
}

.dual-slider-sum {
  padding: 10px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  color: #f56c6c;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dual-slider-sum.sum-valid {
  background: #f0f9ff;
  border-color: #b3d8ff;
  color: #409eff;
}

.dual-slider-sum i {
  font-size: 16px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .header-actions {
    flex-direction: column;
  }

  .section-header-with-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
}
</style>
