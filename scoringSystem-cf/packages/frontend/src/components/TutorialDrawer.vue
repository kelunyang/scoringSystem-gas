<template>
  <el-drawer
    v-model="localVisible"
    :title="tutorialContent.title"
    direction="btt"
    size="100%"
    class="drawer-tutorial"
    @close="handleClose"
  >
    <div class="drawer-body">
      <!-- Tutorial Description -->
      <div class="tutorial-description">
        <p>{{ tutorialContent.description }}</p>
      </div>

      <!-- Tutorial Steps -->
      <div class="tutorial-steps">
        <div
          v-for="(step, index) in tutorialContent.steps"
          :key="index"
          class="tutorial-step"
        >
          <div class="step-icon">
            <i :class="step.icon"></i>
          </div>
          <div class="step-content">
            <h4>{{ step.title }}</h4>
            <p>{{ step.content }}</p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button type="primary" @click="handleClose">
          <i class="fas fa-check"></i>
          了解了，開始使用
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import {
  getUserPreferences,
  setUserPreference,
  type UserPrefs
} from '@/utils/userPreferences';
import {
  tutorialContentMap,
  type TutorialPage
} from '@/utils/tutorialContent';

// ============================================================================
// Props
// ============================================================================

interface Props {
  page: TutorialPage;
}

const props = defineProps<Props>();

// ============================================================================
// Composables
// ============================================================================

const { userId } = useAuth();

// ============================================================================
// State
// ============================================================================

const localVisible = ref(false);

// ============================================================================
// Computed
// ============================================================================

/**
 * 獲取當前頁面的教學內容
 */
const tutorialContent = computed(() => {
  return tutorialContentMap[props.page];
});

/**
 * 獲取當前頁面對應的 preference key
 */
const preferenceKey = computed((): keyof UserPrefs => {
  const keyMap: Record<TutorialPage, keyof UserPrefs> = {
    dashboard: 'tutorialDashboardCompleted',
    wallet: 'tutorialWalletCompleted',
    projectDetail: 'tutorialProjectDetailCompleted'
  };
  return keyMap[props.page];
});

// ============================================================================
// Methods
// ============================================================================

/**
 * 檢查是否應該顯示教學 Drawer（只在首次訪問時顯示）
 */
function checkShouldShow(): void {
  if (!userId.value) return;

  const prefs = getUserPreferences(userId.value);
  const isTutorialCompleted = prefs[preferenceKey.value] as boolean | undefined;

  if (!isTutorialCompleted) {
    // 首次訪問：顯示教學
    localVisible.value = true;
  }
  // 教學已完成：不顯示 Drawer
}

/**
 * 處理 Drawer 關閉
 */
function handleClose(): void {
  if (!userId.value) return;

  // 標記教學為已完成
  setUserPreference(userId.value, preferenceKey.value, true);

  // 關閉 Drawer
  localVisible.value = false;
}

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * 監聽 userId 變化
 */
watch(
  userId,
  (newUserId) => {
    if (newUserId) {
      checkShouldShow();
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
// ============================================================================
// Tutorial Description
// ============================================================================

.tutorial-description {
  padding: 20px 25px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border-radius: 8px;
  margin: 0 20px 20px 20px;

  p {
    margin: 0;
    font-size: 16px;
    line-height: 1.6;
    color: #2c3e50;
    font-weight: 500;
  }
}

// ============================================================================
// Tutorial Steps
// ============================================================================

.tutorial-steps {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.tutorial-step {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: #fafbfc;
  border-radius: 8px;
  border-left: 4px solid #667eea;
  transition: all 0.3s ease;

  &:hover {
    background: #f5f7fa;
    border-left-color: #764ba2;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  }

  .step-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    color: white;
    font-size: 20px;
  }

  .step-content {
    flex: 1;

    h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: #2c3e50;
    }

    p {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: #5a6c7d;
    }
  }
}


// ============================================================================
// Responsive Design
// ============================================================================

@media (max-width: 768px) {
  .tutorial-description {
    margin: 0 16px 16px 16px;
    padding: 16px 20px;

    p {
      font-size: 15px;
    }
  }

  .tutorial-steps {
    padding: 0 16px;
    gap: 12px;
    margin-bottom: 16px;
  }

  .tutorial-step {
    padding: 16px;

    .step-icon {
      width: 40px;
      height: 40px;
      font-size: 18px;
    }

    .step-content {
      h4 {
        font-size: 15px;
      }

      p {
        font-size: 13px;
      }
    }
  }
}
</style>
