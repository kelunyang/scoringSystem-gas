/**
 * @fileoverview Verification timer composable using VueUse
 * Replaces manual setInterval/clearInterval management to prevent memory leaks
 * Addresses Evan You's criticism: "Manual timer management in 2025? What is this, JavaScript from 1995?"
 */

import { ref, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import type { Ref, ComputedRef } from 'vue';

export interface UseVerificationTimerReturn {
  timeLeft: Ref<number>;
  isActive: ComputedRef<boolean>;
  progressPercentage: ComputedRef<number>;
  start: (duration: number) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Composable for countdown timers used in verification flows
 *
 * Features:
 * - Automatic cleanup on component unmount (prevents memory leaks)
 * - VueUse integration for better lifecycle management
 * - Simple API: start/stop/reset
 * - Optional completion callback
 *
 * @param onComplete - Optional callback to trigger when countdown reaches 0
 * @returns Timer state and controls
 *
 * @example
 * // In TwoFactorStep.vue
 * const { timeLeft, isActive, start, reset } = useVerificationTimer(() => {
 *   console.log('Countdown complete!');
 * });
 *
 * // Start 60-second countdown
 * function sendVerificationCode() {
 *   // ... send code logic
 *   start(60);
 * }
 *
 * // Display remaining time
 * <p v-if="isActive">重新發送驗證碼 ({{ timeLeft }}s)</p>
 * <button v-else @click="sendVerificationCode">發送驗證碼</button>
 */
export function useVerificationTimer(onComplete?: () => void): UseVerificationTimerReturn {
  const timeLeft = ref(0);
  const totalDuration = ref(0);

  // Use VueUse's useIntervalFn for automatic cleanup
  const { pause, resume, isActive: intervalActive } = useIntervalFn(
    () => {
      if (timeLeft.value > 0) {
        timeLeft.value--;
      } else {
        pause();
        // 倒數結束時觸發回調
        if (onComplete) {
          onComplete();
        }
      }
    },
    1000,
    { immediate: false }
  );

  const isActive = computed(() => timeLeft.value > 0 && intervalActive.value);

  // Calculate progress percentage (0% → 100% as time counts down)
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

  function stop() {
    pause();
    totalDuration.value = 0;
    timeLeft.value = 0;
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
    stop,
    reset
  };
}
