<template>
  <div class="pin-code-wrapper" :style="{ '--theme-color': themeColor }">
    <div class="pin-code-input">
      <div
        v-for="groupIndex in groupCount"
        :key="groupIndex"
        class="pin-group"
      >
        <div
          v-for="i in groupSize"
          :key="getDigitIndex(groupIndex, i)"
          class="pin-cell"
          :class="{ 'has-value': digits[getDigitIndex(groupIndex, i)] }"
          :data-order="getDigitIndex(groupIndex, i) + 1"
          :style="{ '--index': getDigitIndex(groupIndex, i) }"
        >
          <input
            :ref="el => inputRefs[getDigitIndex(groupIndex, i)] = el as HTMLInputElement | null"
            :value="digits[getDigitIndex(groupIndex, i)]"
            type="text"
            maxlength="1"
            class="pin-digit"
            :class="{ 'has-value': digits[getDigitIndex(groupIndex, i)] }"
            :disabled="disabled"
            @input="handleInput(getDigitIndex(groupIndex, i), $event)"
            @keydown="handleKeydown(getDigitIndex(groupIndex, i), $event)"
            @paste="handlePaste"
          />
        </div>
        <span v-if="groupIndex < groupCount" class="pin-separator" aria-hidden="true">-</span>
      </div>
    </div>
    <p class="pin-hint">數字為輸入順序提示，請依序輸入驗證碼</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';

// Props
export interface Props {
  length?: number;
  modelValue?: string;
  disabled?: boolean;
  themeColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  length: 6,
  modelValue: '',
  disabled: false,
  themeColor: '#800000'
});

// Expose themeColor for template
const themeColor = computed(() => props.themeColor);

// Emits
const emit = defineEmits<{
  'update:modelValue': [string];
  'complete': [string];
}>();

// State
const digits = ref<string[]>(Array(props.length).fill(''));
const inputRefs = ref<(HTMLInputElement | null)[]>([]);

// Grouping constants (4 digits per group for XXXX-XXXX-XXXX format)
const groupSize = 4;
const groupCount = computed(() => Math.ceil(props.length / groupSize));

/**
 * Calculate the actual digit index from group and position
 * groupIndex is 1-based (from v-for), i is 1-based (from v-for)
 */
function getDigitIndex(groupIndex: number, i: number): number {
  return (groupIndex - 1) * groupSize + (i - 1);
}

// Initialize from modelValue
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    const chars = newValue.split('').slice(0, props.length);
    digits.value = [...chars, ...Array(props.length - chars.length).fill('')];
  } else {
    digits.value = Array(props.length).fill('');
  }
}, { immediate: true });

/**
 * Handle input in a digit box
 */
function handleInput(index: number, event: Event) {
  const target = event.target as HTMLInputElement;
  let value = target.value;

  // Allow all printable ASCII characters (deception strategy)
  // Frontend appears to accept any character, but backend only validates specific set
  value = value.replace(/[^\x20-\x7E]/g, '').toUpperCase();

  if (value.length > 1) {
    // If user pastes multiple characters, take only the first one
    value = value[0];
  }

  digits.value[index] = value;

  // Emit the current value
  const code = digits.value.join('');
  emit('update:modelValue', code);

  // Move to next input if character entered
  if (value && index < props.length - 1) {
    const nextInput = inputRefs.value[index + 1];
    nextInput?.focus();
  }

  // Check if complete
  if (code.length === props.length && !code.includes('')) {
    emit('complete', code);
  }
}

/**
 * Handle keydown events
 */
function handleKeydown(index: number, event: KeyboardEvent) {
  // Handle backspace
  if (event.key === 'Backspace') {
    if (!digits.value[index] && index > 0) {
      // If current box is empty, go to previous box
      const prevInput = inputRefs.value[index - 1];
      prevInput?.focus();
    } else {
      // Clear current box
      digits.value[index] = '';
      emit('update:modelValue', digits.value.join(''));
    }
  }

  // Handle left arrow
  if (event.key === 'ArrowLeft' && index > 0) {
    const prevInput = inputRefs.value[index - 1];
    prevInput?.focus();
  }

  // Handle right arrow
  if (event.key === 'ArrowRight' && index < props.length - 1) {
    const nextInput = inputRefs.value[index + 1];
    nextInput?.focus();
  }
}

/**
 * Handle paste event
 */
function handlePaste(event: ClipboardEvent) {
  event.preventDefault();

  const pasteData = event.clipboardData?.getData('text') || '';
  // Allow all printable ASCII (deception strategy)
  // Remove hyphens (they are just format separators) and trim to expected length
  const cleaned = pasteData
    .replace(/[^\x20-\x7E]/g, '')  // Remove non-ASCII
    .replace(/-/g, '')              // Remove hyphens (format separators)
    .toUpperCase()
    .slice(0, props.length);

  if (cleaned) {
    const chars = cleaned.split('');
    digits.value = [...chars, ...Array(props.length - chars.length).fill('')];

    const code = digits.value.join('');
    emit('update:modelValue', code);

    // Focus the next empty box or last box
    const nextEmptyIndex = digits.value.findIndex(d => !d);
    const focusIndex = nextEmptyIndex === -1 ? props.length - 1 : nextEmptyIndex;
    inputRefs.value[focusIndex]?.focus();

    // Check if complete
    if (code.length === props.length && !code.includes('')) {
      emit('complete', code);
    }
  }
}

// Focus first input on mount
onMounted(() => {
  inputRefs.value[0]?.focus();
});

// Expose methods
defineExpose({
  focus() {
    inputRefs.value[0]?.focus();
  },
  clear() {
    digits.value = Array(props.length).fill('');
    emit('update:modelValue', '');
    inputRefs.value[0]?.focus();
  }
});
</script>

<style scoped>
.pin-code-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pin-code-input {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin: 20px 0;
}

.pin-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.pin-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pin-cell {
  position: relative;
}

.pin-cell::before {
  content: attr(data-order);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.5);
  font-size: 24px;
  font-weight: bold;
  color: var(--theme-color, #800000);
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  animation: popIn 0.4s ease-out forwards;
  animation-delay: calc(var(--index) * 0.15s);
}

.pin-cell.has-value::before {
  display: none;
}

@keyframes popIn {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
  }
  60% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(1);
  }
}

.pin-separator {
  font-size: 24px;
  font-weight: bold;
  color: #94a3b8;
  margin: 0 4px;
  user-select: none;
}

.pin-digit {
  width: 44px;
  height: 52px;
  font-size: 22px;
  font-weight: 600;
  font-family: 'Courier New', Courier, monospace;
  text-align: center;
  border: 2px solid #dcdfe6;
  border-radius: 8px;
  background: white;
  color: #2c3e50;
  transition: all 0.3s;
  caret-color: #800000;
}

.pin-digit:focus {
  outline: none;
  border-color: #800000;
  box-shadow: 0 0 0 3px rgba(128, 0, 0, 0.1);
}

.pin-digit.has-value {
  border-color: #800000;
  background-color: #fff5f5;
}

.pin-digit:disabled {
  background-color: #f5f7fa;
  cursor: not-allowed;
  opacity: 0.6;
}

/* Wide screen: single row with separators */
@media (min-width: 600px) {
  .pin-code-input {
    flex-wrap: nowrap;
  }

  .pin-digit {
    width: 40px;
    height: 48px;
    font-size: 20px;
  }

  .pin-group {
    gap: 4px;
  }
}

/* Narrow screen: 3 rows, hide separators */
@media (max-width: 599px) {
  .pin-code-input {
    flex-direction: column;
    gap: 12px;
  }

  .pin-separator {
    display: none;
  }

  .pin-group {
    gap: 8px;
  }

  .pin-digit {
    width: 52px;
    height: 60px;
    font-size: 24px;
  }
}

/* Extra small mobile */
@media (max-width: 320px) {
  .pin-digit {
    width: 44px;
    height: 52px;
    font-size: 20px;
  }

  .pin-group {
    gap: 6px;
  }
}
</style>
