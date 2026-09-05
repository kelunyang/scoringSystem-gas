/**
 * @fileoverview 倒數計時 composable（以 VueUse 的 useIntervalFn 實作）
 * 由 useIntervalFn 負責 unmount 時的清理，不必自己管 setInterval/clearInterval。
 */

import { ref, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import type { Ref, ComputedRef } from 'vue';

export interface UseVerificationTimerReturn {
  timeLeft: Ref<number>;
  isActive: ComputedRef<boolean>;
  progressPercentage: ComputedRef<number>;
  start: (duration: number) => void;
  reset: () => void;
}

/**
 * 倒數計時器
 *
 * @param onComplete - 倒數歸零時觸發的回調（與歸零同一個 tick，不會延遲一秒）
 * @returns 計時狀態與控制方法
 *
 * @example
 * const { timeLeft, isActive, start, reset } = useVerificationTimer(() => {
 *   console.log('倒數結束');
 * });
 * start(60);
 */
export function useVerificationTimer(onComplete?: () => void): UseVerificationTimerReturn {
  const timeLeft = ref(0);
  const totalDuration = ref(0);

  const { pause, resume, isActive: intervalActive } = useIntervalFn(
    () => {
      timeLeft.value--;

      // 歸零的當下就停錶並回報，避免多空轉一秒——
      // 那一秒內 isActive 已是 false（按鈕解禁）但 interval 還活著，
      // 使用者若在此時再次點擊，舊的 tick 會補送一次 complete。
      if (timeLeft.value <= 0) {
        timeLeft.value = 0;
        pause();
        onComplete?.();
      }
    },
    1000,
    { immediate: false }
  );

  const isActive = computed(() => timeLeft.value > 0 && intervalActive.value);

  /** 進度百分比：已經過的時間占比（0% → 100%） */
  const progressPercentage = computed(() => {
    if (totalDuration.value === 0) return 0;
    const elapsed = totalDuration.value - timeLeft.value;
    return Math.min(100, (elapsed / totalDuration.value) * 100);
  });

  function start(duration: number) {
    if (duration <= 0) {
      throw new Error('Timer duration must be positive');
    }

    totalDuration.value = duration;
    timeLeft.value = duration;
    resume();
  }

  function reset() {
    pause();
    totalDuration.value = 0;
    timeLeft.value = 0;
  }

  return {
    timeLeft,
    isActive,
    progressPercentage,
    start,
    reset
  };
}
