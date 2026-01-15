<template>
  <div class="project-selection-step">
    <!-- Turnstile CAPTCHA -->
    <TurnstileWidget
      ref="turnstileRef"
      @success="handleTurnstileSuccess"
      @error="handleTurnstileError"
      @expired="handleTurnstileExpired"
    />

    <div v-if="projects.length > 0" class="form-group">
      <label for="resetProjects">請勾選你「沒有參加過」的專案</label>
      <el-select
        id="resetProjects"
        v-model="selectedProjectIds"
        multiple
        placeholder="選擇你沒參加過的所有專案"
        style="width: 100%;"
        :disabled="allParticipated || loading"
      >
        <el-option
          v-for="project in projects"
          :key="project.projectId"
          :label="project.projectName"
          :value="project.projectId"
        />
      </el-select>
      <div class="field-hint">
        提示：請仔細辨認哪些專案你「沒有」參加過，全部選對才能重設密碼
      </div>
    </div>

    <div class="form-group">
      <el-checkbox
        v-model="allParticipated"
        @change="handleAllParticipatedChange"
        :disabled="loading"
      >
        我都參加過了（顯示的專案我全部都有參加）
      </el-checkbox>
    </div>

    <div class="form-actions">
      <button
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="!canSubmit || loading || !turnstileToken"
      >
        <div v-if="loading" class="spinner"></div>
        {{ loading ? '發送中...' : '送出重設連結' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import TurnstileWidget from '../TurnstileWidget.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';
import type { Project } from '../../types/auth';

// Props
export interface Props {
  projects: Project[];
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// Emits
const emit = defineEmits<{
  submit: [{ selectedProjectIds: string[]; allParticipated: boolean; turnstileToken: string }];
}>();

// Form data
const selectedProjectIds = ref<string[]>([]);
const allParticipated = ref(false);

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired } = useTurnstile();

const canSubmit = computed(() => {
  return (allParticipated.value || selectedProjectIds.value.length > 0) && !props.loading;
});

function handleTurnstileSuccess(token: string) {
  onVerify(token);
}

function handleTurnstileError() {
  onError();
}

function handleTurnstileExpired() {
  onExpired();
}

function handleAllParticipatedChange(checked: any) {
  const boolChecked = !!checked
  if (checked) {
    // Clear project selection when checking "all participated"
    selectedProjectIds.value = [];
  }
}

function handleSubmit() {
  if (!canSubmit.value || !turnstileToken.value) return;

  emit('submit', {
    selectedProjectIds: selectedProjectIds.value,
    allParticipated: allParticipated.value,
    turnstileToken: turnstileToken.value
  });
}
</script>

<style scoped>
.project-selection-step {
  margin-top: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.field-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.form-actions {
  margin-top: 24px;
}

.btn {
  width: 100%;
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
}

.btn-primary {
  background: linear-gradient(135deg, #E17055 0%, #D35400 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(225, 112, 85, 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
