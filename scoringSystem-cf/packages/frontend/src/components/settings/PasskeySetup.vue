<template>
  <div class="passkey-setup">
    <!-- Browser not supported -->
    <div v-if="!isSupported" class="passkey-status">
      <div class="status-info">
        <i class="fas fa-fingerprint status-icon status-icon--off"></i>
        <div>
          <p class="status-text">您的瀏覽器不支援 Passkey</p>
          <p class="status-hint">請使用 Chrome、Safari 或其他支援 WebAuthn 的瀏覽器</p>
        </div>
      </div>
    </div>

    <!-- Status: No passkeys -->
    <div v-else-if="!hasPasskeys && !registering" class="passkey-status">
      <div class="status-info">
        <i class="fas fa-fingerprint status-icon status-icon--off"></i>
        <div>
          <p class="status-text">Passkey 尚未設定</p>
          <p class="status-hint">使用指紋、Face ID 或安全金鑰進行快速登入</p>
        </div>
      </div>
      <el-button type="primary" @click="startRegistration" :loading="loading">
        <i class="fas fa-plus-circle"></i> 新增 Passkey
      </el-button>
    </div>

    <!-- Status: Has passkeys -->
    <div v-else-if="hasPasskeys && !registering" class="passkey-enabled">
      <div class="status-header">
        <div class="status-info">
          <i class="fas fa-fingerprint status-icon status-icon--on"></i>
          <div>
            <p class="status-text">Passkey 已啟用</p>
            <p class="status-hint">已註冊 {{ status?.credentialCount || 0 }} 個裝置</p>
          </div>
        </div>
        <el-button size="small" @click="startRegistration" :loading="loading">
          <i class="fas fa-plus"></i> 新增裝置
        </el-button>
      </div>

      <!-- Passkey list -->
      <div class="passkey-list">
        <div
          v-for="credential in status?.credentials || []"
          :key="credential.credentialId"
          class="passkey-item"
        >
          <div class="passkey-info">
            <i class="fas fa-key passkey-icon"></i>
            <div>
              <p class="passkey-name">{{ credential.deviceName }}</p>
              <p class="passkey-meta">
                <span v-if="credential.lastUsedAt">
                  最後使用：{{ formatDate(credential.lastUsedAt) }}
                </span>
                <span v-else>
                  建立於：{{ formatDate(credential.createdAt) }}
                </span>
                <span v-if="credential.backedUp" class="backed-up-badge">
                  <i class="fas fa-cloud"></i> 已同步
                </span>
              </p>
            </div>
          </div>
          <div class="passkey-actions">
            <el-button size="small" text @click="openRenameDialog(credential)">
              <i class="fas fa-edit"></i>
            </el-button>
            <el-button size="small" text type="danger" @click="openDeleteDrawer(credential)">
              <i class="fas fa-trash"></i>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Registration step -->
    <div v-if="registering" class="setup-step">
      <h4>新增 Passkey</h4>
      <p class="step-hint">請按照瀏覽器提示完成 Passkey 註冊</p>

      <div class="device-name-input">
        <el-input
          v-model="deviceName"
          placeholder="裝置名稱（例如：我的 iPhone）"
          maxlength="50"
        >
          <template #prepend>
            <i class="fas fa-mobile-alt"></i>
          </template>
        </el-input>
      </div>

      <div v-if="errorMessage" class="register-error">
        <i class="fas fa-exclamation-circle"></i> {{ errorMessage }}
      </div>

      <div class="step-actions">
        <el-button @click="cancelRegistration">取消</el-button>
        <el-button
          type="primary"
          :loading="loading"
          @click="confirmRegistration"
        >
          <i class="fas fa-fingerprint"></i> 開始註冊
        </el-button>
      </div>
    </div>

    <!-- Rename Dialog -->
    <el-dialog
      v-model="showRenameDialog"
      title="重新命名 Passkey"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-input
        v-model="newDeviceName"
        placeholder="輸入新名稱"
        maxlength="50"
        @keyup.enter="confirmRename"
      />
      <div v-if="renameError" class="dialog-error">
        <i class="fas fa-exclamation-circle"></i> {{ renameError }}
      </div>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" :loading="renameLoading" @click="confirmRename">
          確認
        </el-button>
      </template>
    </el-dialog>

    <!-- Delete Drawer -->
    <el-drawer
      v-model="showDeleteDrawer"
      title="刪除 Passkey"
      direction="ttb"
      size="100%"
      class="drawer-maroon"
      :close-on-click-modal="false"
    >
      <div class="drawer-content">
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 20px;">
          <template #title>確定要刪除此 Passkey？</template>
          刪除後將無法使用此裝置的 Passkey 登入。
        </el-alert>

        <div class="delete-target">
          <i class="fas fa-key"></i>
          <span>{{ selectedCredential?.deviceName }}</span>
        </div>

        <el-form label-position="top">
          <el-form-item label="請輸入密碼確認身份">
            <el-input
              v-model="deletePassword"
              type="password"
              placeholder="輸入密碼"
              show-password
              @keyup.enter="confirmDelete"
            />
          </el-form-item>
        </el-form>

        <div v-if="deleteError" class="drawer-error">
          <i class="fas fa-exclamation-circle"></i> {{ deleteError }}
        </div>
      </div>

      <template #footer>
        <div class="drawer-actions">
          <el-button @click="showDeleteDrawer = false">取消</el-button>
          <el-button
            type="danger"
            :loading="deleteLoading"
            :disabled="!deletePassword"
            @click="confirmDelete"
          >
            確認刪除
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { usePasskey, type PasskeyCredential } from '@/composables/auth/usePasskey';

// Emits
const emit = defineEmits<{
  'setup-complete': [];
}>();

const {
  loading,
  errorMessage,
  isSupported,
  status,
  fetchStatus,
  registerPasskey,
  renamePasskey,
  deletePasskey
} = usePasskey();

// State
const registering = ref(false);
const deviceName = ref('');

// Rename state
const showRenameDialog = ref(false);
const selectedCredential = ref<PasskeyCredential | null>(null);
const newDeviceName = ref('');
const renameError = ref('');
const renameLoading = ref(false);

// Delete state
const showDeleteDrawer = ref(false);
const deletePassword = ref('');
const deleteError = ref('');
const deleteLoading = ref(false);

// Computed
const hasPasskeys = computed(() => (status.value?.credentialCount || 0) > 0);

// Fetch status on mount
onMounted(async () => {
  if (isSupported.value) {
    await fetchStatus();
  }
});

// Registration methods
function startRegistration() {
  registering.value = true;
  deviceName.value = '';
}

function cancelRegistration() {
  registering.value = false;
  deviceName.value = '';
}

async function confirmRegistration() {
  const success = await registerPasskey(deviceName.value || undefined);
  if (success) {
    registering.value = false;
    deviceName.value = '';
    ElMessage.success('Passkey 已成功新增！');
    emit('setup-complete');
  }
}

// Rename methods
function openRenameDialog(credential: PasskeyCredential) {
  selectedCredential.value = credential;
  newDeviceName.value = credential.deviceName;
  renameError.value = '';
  showRenameDialog.value = true;
}

async function confirmRename() {
  if (!newDeviceName.value.trim()) {
    renameError.value = '請輸入名稱';
    return;
  }

  if (!selectedCredential.value) return;

  renameLoading.value = true;
  renameError.value = '';

  const success = await renamePasskey(selectedCredential.value.credentialId, newDeviceName.value.trim());

  renameLoading.value = false;

  if (success) {
    showRenameDialog.value = false;
    ElMessage.success('已重新命名');
  } else {
    renameError.value = errorMessage.value || '重新命名失敗';
  }
}

// Delete methods
function openDeleteDrawer(credential: PasskeyCredential) {
  selectedCredential.value = credential;
  deletePassword.value = '';
  deleteError.value = '';
  showDeleteDrawer.value = true;
}

async function confirmDelete() {
  if (!deletePassword.value) {
    deleteError.value = '請輸入密碼';
    return;
  }

  if (!selectedCredential.value) return;

  deleteLoading.value = true;
  deleteError.value = '';

  const success = await deletePasskey(selectedCredential.value.credentialId, deletePassword.value);

  deleteLoading.value = false;

  if (success) {
    showDeleteDrawer.value = false;
    deletePassword.value = '';
    ElMessage.success('Passkey 已刪除');
  } else {
    deleteError.value = errorMessage.value || '刪除失敗';
  }
}

// Helper functions
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
</script>

<style scoped>
.passkey-setup {
  padding: 8px 0;
}

.passkey-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.passkey-enabled {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-icon {
  font-size: 28px;
}

.status-icon--on {
  color: #198754;
}

.status-icon--off {
  color: #94a3b8;
}

.status-text {
  margin: 0;
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
}

.status-hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}

/* Passkey list */
.passkey-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.passkey-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.passkey-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.passkey-icon {
  font-size: 20px;
  color: #0ea5e9;
}

.passkey-name {
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  color: #2c3e50;
}

.passkey-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 8px;
}

.backed-up-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 4px;
  font-size: 11px;
}

.passkey-actions {
  display: flex;
  gap: 4px;
}

/* Setup step */
.setup-step {
  padding: 16px 0;
}

.setup-step h4 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #2c3e50;
}

.step-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #64748b;
}

.device-name-input {
  max-width: 400px;
  margin-bottom: 16px;
}

.register-error {
  text-align: center;
  color: #dc3545;
  font-size: 13px;
  margin-bottom: 12px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

/* Dialog error */
.dialog-error {
  margin-top: 8px;
  color: #dc3545;
  font-size: 13px;
}

/* Delete drawer */
.drawer-content {
  padding: 20px;
  max-width: 500px;
  margin: 0 auto;
}

.delete-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 20px;
  font-weight: 500;
  color: #2c3e50;
}

.delete-target i {
  font-size: 20px;
  color: #0ea5e9;
}

.drawer-error {
  margin-top: 16px;
  padding: 12px;
  background: #fef2f2;
  border-radius: 6px;
  color: #dc3545;
  font-size: 13px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}
</style>
