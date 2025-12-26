<template>
  <button
    :class="buttonClasses"
    :disabled="isTimerActive || loading || disabled"
    :style="computedButtonStyle"
    @click="handleClick"
  >
    <!-- Slot 優先，如果有 slot 則使用 slot -->
    <slot
      v-if="hasSlot"
      :is-active="isTimerActive"
      :time-left="timeLeft"
      :progress-percentage="displayProgressPercentage"
      :loading="loading"
      :disabled="disabled"
      :theme-color="props.themeColor"
      :contrast-color="contrastTextColor"
    />

    <!-- 智能文字模式：mix-blend-mode 自動對比（僅在倒數中啟用）-->
    <template v-else-if="enableSmartText && isTimerActive">
      <span class="blend-text">
        <i v-if="icon" :class="['fa', icon]"></i>
        {{ buttonText }}
      </span>
    </template>

    <!-- 預設模式：向後兼容 + 動態文字對比色 -->
    <template v-else>
      <div v-if="loading" class="spinner"></div>
      <span :style="isTimerActive ? { color: contrastTextColor } : {}">
        <i v-if="icon" :class="['fa', icon]"></i>
        {{ buttonText }}
      </span>
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, useSlots } from 'vue';
import { useVerificationTimer } from '../../composables/auth/useVerificationTimer';
import { getContrastColorHex } from '@/utils/color';

interface Props {
  label?: string;             // 按鈕文字（如 "重新發送驗證碼"）- 使用 slot 時可選
  duration?: number;          // 倒數秒數（預設 60）
  loading?: boolean;          // 外部 loading 狀態
  disabled?: boolean;         // 外部禁用狀態
  autoStart?: boolean;        // 是否自動啟動倒數（預設 false）
  icon?: string;              // FontAwesome 圖標類名（預設無）
  type?: 'primary' | 'secondary' | 'link';  // 按鈕類型（預設 primary）
  size?: 'normal' | 'small';                // 按鈕尺寸（預設 normal）
  fullWidth?: boolean;                      // 是否 100% 寬度（預設 true）
  plain?: boolean;                          // 是否使用 plain 樣式（預設 false）
  showSeconds?: boolean;                    // 是否顯示倒數秒數（預設 true）
  themeColor?: string;                      // 主題色（邊框 + 進度 + 未填充文字）
  enableSmartText?: boolean;                // 啟用智能文字渐变（預設 false）
  flipAt?: 'start' | 'end';                 // 翻轉觸發時機：start=0%, end=100%（預設 end）
  externalProgress?: number;                // 外部控制的進度百分比（0-100），用於 disabled 模式
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  duration: 60,
  loading: false,
  disabled: false,
  autoStart: false,
  icon: '',
  type: 'primary',
  size: 'normal',
  fullWidth: true,
  plain: false,
  showSeconds: true,
  themeColor: '#800000',
  enableSmartText: false,
  flipAt: 'end'
});

const emit = defineEmits<{
  click: [];
  complete: [];  // 倒數完成事件
}>();

// 檢測是否有 slot
const slots = useSlots();
const hasSlot = computed(() => !!slots.default);

// 使用倒數計時器，並傳入 complete 回調
const { timeLeft, isActive: isTimerActive, progressPercentage, start, stop, reset } = useVerificationTimer(() => {
  // 倒數結束時觸發 complete 事件
  emit('complete');
});

// 計算填充區域的對比文字顏色（WCAG 算法）
const contrastTextColor = computed(() => {
  return props.themeColor ? getContrastColorHex(props.themeColor) : '#ffffff';
});

// 計算顯示用的進度百分比（支持外部控制）
const displayProgressPercentage = computed(() => {
  // 如果按鈕 disabled 且提供了外部進度，使用外部進度
  if (props.disabled && props.externalProgress !== undefined) {
    return props.externalProgress;
  }
  // 否則使用內部倒數計時器的進度
  return progressPercentage.value;
});

// 判斷是否應觸發翻轉動畫
const shouldFlip = computed(() => {
  if (!props.disabled) return false;

  if (props.flipAt === 'start') {
    return progressPercentage.value === 0;
  } else {
    return progressPercentage.value === 100;
  }
});

// 計算按鈕 class
const buttonClasses = computed(() => [
  'countdown-btn',
  `countdown-btn--${props.type}`,
  `countdown-btn--${props.size}`,
  {
    'full-width': props.fullWidth,
    'is-counting': isTimerActive.value,
    'plain': props.plain,
    'should-flip': shouldFlip.value  // 翻轉動畫 class
  }
]);

// 計算進度條背景樣式
const progressBarStyle = computed(() => {
  if (!isTimerActive.value) return {};

  // 優先使用 themeColor，否則根據 type 決定
  let progressColor = props.themeColor || '#EEE';
  let bgColor = props.themeColor ? '#ffffff' : 'transparent';  // 有主题色时用白色背景

  // 如果沒有自訂 themeColor，使用原有邏輯
  if (!props.themeColor) {
    progressColor = '#EEE';
    bgColor = '#ffffff';

    if (props.type === 'secondary') {
      progressColor = '#E5E7EB';
      bgColor = '#ffffff';
    } else if (props.type === 'link') {
      progressColor = '#F3F4F6';
      bgColor = 'transparent';
    }
  }

  // 正向进度：与文字渐变同步，红色代表已过时间
  const progress = displayProgressPercentage.value;

  return {
    background: `linear-gradient(to right, ${progressColor} 0%, ${progressColor} ${progress}%, ${bgColor} ${progress}%, ${bgColor} 100%)`
  };
});

// 合併樣式：進度條 + 邊框顏色
const computedButtonStyle = computed(() => {
  const styles: any = {
    ...progressBarStyle.value
  };

  // 自訂邊框顏色
  if (props.themeColor) {
    styles.borderColor = props.themeColor;
    styles.backgroundColor = '#ffffff';  // 确保未填充区域有白色背景，让深红色文字可见
  }

  return styles;
});

// 計算按鈕文字
const buttonText = computed(() => {
  if (isTimerActive.value && props.showSeconds) {
    return `${props.label} (${timeLeft.value}s)`;
  }
  return props.label;
});

// 處理點擊事件
function handleClick() {
  if (!isTimerActive.value && !props.loading && !props.disabled) {
    emit('click');
    start(props.duration);
  }
}

// 暴露方法供父組件調用
function startCountdown(customDuration?: number) {
  start(customDuration || props.duration);
}

function stopCountdown() {
  stop();
}

function resetCountdown() {
  reset();
}

defineExpose({
  startCountdown,
  stopCountdown,
  resetCountdown
});

// 自動啟動（如果設定）
onMounted(() => {
  if (props.autoStart) {
    start(props.duration);
  }
});
</script>

<style scoped>
/* ===== 基礎樣式 - 與 LoginForm 一致 ===== */
.countdown-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}

/* 全寬模式 */
.countdown-btn.full-width {
  width: 100%;
}

/* ===== 按鈕類型 ===== */

/* Primary 類型 - 深紅色邊框 + 白色背景 */
.countdown-btn--primary {
  background-color: var(--countdown-btn-bg, #ffffff);
  color: var(--countdown-btn-text, #800000);
  border: 2px solid var(--countdown-btn-border, #800000);
}

.countdown-btn--primary:hover:not(:disabled) {
  border-color: var(--countdown-btn-hover-border, #660000);
  color: #660000;
}

/* Secondary 類型 - 灰藍色邊框 + 白色背景 */
.countdown-btn--secondary {
  background-color: #ffffff;
  color: #64748b;
  border: 2px solid #64748b;
}

.countdown-btn--secondary:hover:not(:disabled) {
  border-color: #475569;
  color: #475569;
}

/* ===== Plain 樣式變體 ===== */
/* 類似 Element Plus plain button */
.countdown-btn.plain {
  background-color: #ffffff;
  border-width: 1px;
}

.countdown-btn--primary.plain {
  border-color: #DCDFE6;
  background-color: #ffffff;
}

.countdown-btn--primary.plain:hover:not(:disabled) {
  background-color: #ecf5ff;
  border-color: #c6e2ff;
  color: #409eff;
}

.countdown-btn--secondary.plain {
  border-color: #DCDFE6;
  background-color: #ffffff;
}

.countdown-btn--secondary.plain:hover:not(:disabled) {
  background-color: #f4f4f5;
  border-color: #c8c9cc;
  color: #606266;
}

/* Link 類型 - 文字按鈕（無邊框）*/
.countdown-btn--link {
  background: none;
  color: #800000;
  padding: 8px 16px;
  border: none;
}

.countdown-btn--link:hover:not(:disabled) {
  color: #660000;
  text-decoration: underline;
}

/* ===== 按鈕尺寸 ===== */

/* Normal 尺寸（預設）*/
.countdown-btn--normal {
  padding: 12px 24px;
  font-size: 14px;
}

/* Small 尺寸 */
.countdown-btn--small {
  padding: 8px 16px;
  font-size: 13px;
}

/* Link 類型的 small 尺寸調整 */
.countdown-btn--link.countdown-btn--small {
  padding: 6px 12px;
}

/* ===== 狀態樣式 ===== */

/* Disabled 狀態 */
.countdown-btn:disabled {
  cursor: not-allowed;
}

/* 倒數中狀態（可選的額外樣式） */
.countdown-btn.is-counting {
  /* 可以添加特殊效果，例如脈衝動畫 */
}

/* ===== 圖標和 Spinner ===== */

.countdown-btn i {
  margin-right: 0; /* gap 已處理間距 */
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(128, 0, 0, 0.3);
  border-top-color: #800000;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Primary 類型的 spinner */
.countdown-btn--primary .spinner {
  border-color: rgba(128, 0, 0, 0.3);
  border-top-color: #800000;
}

/* Secondary 類型的 spinner */
.countdown-btn--secondary .spinner {
  border-color: rgba(100, 116, 139, 0.3);
  border-top-color: #64748b;
}

/* Link 類型的 spinner */
.countdown-btn--link .spinner {
  border-color: rgba(128, 0, 0, 0.3);
  border-top-color: #800000;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 智能文字混合模式（mix-blend-mode 方案）===== */
.blend-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  mix-blend-mode: difference;
}

/* ===== Y 軸翻轉動畫（翻頁鐘效果）===== */
.countdown-btn.should-flip {
  animation: flip-y-twice 1.4s ease-in-out;
}

@keyframes flip-y-twice {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(720deg);  /* 上下翻轉 2 圈 */
  }
}

/* 優化翻轉時的透視效果 */
.countdown-btn {
  transform-style: preserve-3d;
  backface-visibility: visible;
}
</style>
