<template>
  <button
    :class="buttonClasses"
    :style="buttonStyle"
    :disabled="isCounting || loading || disabled"
    @click="handleClick"
    @animationend="isFlipping = false"
  >
    <!-- 有 slot 時完全交給使用端渲染 -->
    <slot
      v-if="hasSlot"
      :is-active="isCounting"
      :time-left="timeLeft"
      :progress-percentage="displayProgress"
      :loading="loading"
      :disabled="disabled"
    />

    <template v-else>
      <span v-if="loading" class="spinner"></span>
      <!-- 倒數中改用 blend-text，讓文字在填充區與白底區都保持對比 -->
      <span :class="{ 'blend-text': isCounting }">
        <i v-if="icon" :class="['fa', icon]"></i>
        {{ buttonText }}
      </span>
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, watch, useSlots } from 'vue';
import type { CSSProperties } from 'vue';
import { useVerificationTimer } from '../../composables/auth/useVerificationTimer';

export interface Props {
  /** 按鈕文字（使用 slot 時不需要） */
  label?: string;
  /** 倒數秒數 */
  duration?: number;
  /** 外部 loading 狀態 */
  loading?: boolean;
  /** 外部禁用狀態 */
  disabled?: boolean;
  /** 掛載後（或此值轉為 true 時）自動開始倒數 */
  autoStart?: boolean;
  /** FontAwesome 圖標類名 */
  icon?: string;
  size?: 'normal' | 'small';
  /** 是否 100% 寬度 */
  fullWidth?: boolean;
  /** 細邊框樣式 */
  plain?: boolean;
  /** 主題色（進度 0% 時的邊框、文字、填充色） */
  themeColor?: string;
  /**
   * 進度 100% 時的填充色。填充會隨進度由 themeColor 漸變到這個顏色，
   * 用來讓「快到期」在視覺上有溫度變化；不給就維持單色填充。
   */
  progressColor?: string;
  /** 倒數結束或外部進度達 100% 時播放翻轉動畫 */
  flip?: boolean;
  /**
   * 點擊後是否自動開始倒數。
   * 由父層掌握送出成功與否時請設為 false，否則送出失敗也會把使用者鎖住。
   */
  startOnClick?: boolean;
  /** 外部控制的進度百分比（0-100），僅在 disabled 時生效 */
  externalProgress?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  duration: 60,
  loading: false,
  disabled: false,
  autoStart: false,
  icon: '',
  size: 'normal',
  fullWidth: true,
  plain: false,
  themeColor: '#800000',
  flip: false,
  startOnClick: true
});

const emit = defineEmits<{
  click: [];
  /** 倒數歸零 */
  complete: [];
}>();

const slots = useSlots();
const hasSlot = computed(() => !!slots.default);

const isFlipping = ref(false);

const {
  timeLeft,
  isActive: isCounting,
  progressPercentage,
  start,
  reset
} = useVerificationTimer(() => {
  if (props.flip) isFlipping.value = true;
  emit('complete');
});

/**
 * 進度來源：按鈕被父層 disabled 且有給外部進度時（例如初次載入）用外部進度，
 * 其餘時間用內部計時器。填充與翻轉動畫都只看這個值。
 */
const displayProgress = computed(() => {
  if (props.disabled && props.externalProgress !== undefined) {
    return props.externalProgress;
  }
  return isCounting.value ? progressPercentage.value : 0;
});

// 外部進度跑滿時也翻一次（內部倒數結束的翻轉由 complete 回調負責）
watch(displayProgress, (now, before) => {
  if (props.flip && now >= 100 && before < 100) {
    isFlipping.value = true;
  }
});

// autoStart 可能在掛載之後才轉為 true（例如等初次載入結束），所以用 watch 而非 onMounted
watch(
  () => props.autoStart,
  (on) => {
    if (on && !isCounting.value) start(props.duration);
  },
  { immediate: true }
);

const buttonClasses = computed(() => [
  'countdown-btn',
  `countdown-btn--${props.size}`,
  {
    'full-width': props.fullWidth,
    plain: props.plain,
    'is-flipping': isFlipping.value
  }
]);

const buttonStyle = computed<CSSProperties>(() => ({
  '--countdown-color': props.themeColor,
  // 沒指定漸變終點就混自己，等於不變色
  '--countdown-progress-color': props.progressColor || props.themeColor,
  '--countdown-progress': `${displayProgress.value}%`
} as CSSProperties));

const buttonText = computed(() =>
  isCounting.value ? `${props.label} (${timeLeft.value}s)` : props.label
);

function handleClick() {
  if (isCounting.value || props.loading || props.disabled) return;

  emit('click');
  if (props.startOnClick) start(props.duration);
}

function startCountdown(customDuration?: number) {
  start(customDuration || props.duration);
}

function resetCountdown() {
  reset();
}

defineExpose({
  startCountdown,
  resetCountdown
});
</script>

<!--
  樣式一律放在全域的 styles/_countdown-button.scss：
  slot 內容是在使用端的 scope 編譯的，scoped 樣式套不進去。
-->
