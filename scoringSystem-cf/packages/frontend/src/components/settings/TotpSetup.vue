<template>
  <div class="totp-setup">
    <!-- Status: Not enabled -->
    <div v-if="!totpEnabled && step === 'idle'" class="totp-status">
      <div class="status-info">
        <i class="fas fa-shield-alt status-icon status-icon--off"></i>
        <div>
          <p class="status-text">驗證器 App 尚未啟用</p>
          <p class="status-hint">啟用後可使用 Google Authenticator 等 App 進行兩階段驗證</p>
        </div>
      </div>
      <el-button type="primary" @click="startSetup" :loading="initLoading">
        <i class="fas fa-plus-circle"></i> 啟用驗證器
      </el-button>
    </div>

    <!-- Status: Enabled -->
    <div v-else-if="totpEnabled && step === 'idle'" class="totp-status">
      <div class="status-info">
        <i class="fas fa-shield-alt status-icon status-icon--on"></i>
        <div>
          <p class="status-text">驗證器 App 已啟用</p>
          <p class="status-hint">
            剩餘備用碼：<strong>{{ recoveryCodesRemaining }}</strong> 組
            <span v-if="recoveryCodesRemaining <= 2" class="low-warning">（建議重新產生）</span>
          </p>
        </div>
      </div>
      <div class="action-buttons">
        <el-button size="small" @click="showRegenerateDialog = true">
          <i class="fas fa-sync-alt"></i> 重新產生備用碼
        </el-button>
        <el-button size="small" type="danger" @click="showDisableDrawer = true">
          <i class="fas fa-times-circle"></i> 停用
        </el-button>
      </div>
    </div>

    <!-- Step 1: Show QR Code -->
    <div v-if="step === 'scan'" class="setup-step">
      <h4>步驟 1：掃描 QR Code</h4>
      <p class="step-hint">請使用 Google Authenticator 或其他 TOTP App 掃描以下 QR Code</p>

      <div class="qr-container">
        <canvas ref="qrCanvas"></canvas>
      </div>

      <div class="secret-display">
        <p class="secret-label">或手動輸入密鑰：</p>
        <div class="secret-value">
          <code>{{ setupSecret }}</code>
          <el-button size="small" text @click="copySecret">
            <i class="fas fa-copy"></i>
          </el-button>
        </div>
      </div>

      <div class="step-actions">
        <el-button @click="cancelSetup">取消</el-button>
        <el-button type="primary" @click="step = 'verify'">
          下一步：輸入驗證碼 <i class="fas fa-arrow-right"></i>
        </el-button>
      </div>
    </div>

    <!-- Step 2: Verify code -->
    <div v-if="step === 'verify'" class="setup-step">
      <h4>步驟 2：輸入驗證碼</h4>
      <p class="step-hint">請輸入驗證器 App 顯示的 6 位數驗證碼</p>

      <div class="verify-input">
        <el-input
          v-model="verifyCode"
          maxlength="6"
          placeholder="000000"
          class="totp-code-input"
          @keyup.enter="confirmSetup"
        />
      </div>

      <div v-if="verifyError" class="verify-error">
        <i class="fas fa-exclamation-circle"></i> {{ verifyError }}
      </div>

      <div class="step-actions">
        <el-button @click="step = 'scan'">
          <i class="fas fa-arrow-left"></i> 上一步
        </el-button>
        <el-button
          type="primary"
          :loading="verifyLoading"
          :disabled="verifyCode.length !== 6"
          @click="confirmSetup"
        >
          確認啟用
        </el-button>
      </div>
    </div>

    <!-- Step 3: Show recovery codes -->
    <div v-if="step === 'recovery'" class="setup-step">
      <h4>備用碼</h4>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
      >
        請妥善保存以下備用碼。當您無法使用驗證器 App 時，可以使用備用碼登入。每組備用碼只能使用一次。
      </el-alert>

      <div class="recovery-codes">
        <div
          v-for="(code, index) in recoveryCodes"
          :key="index"
          class="recovery-code-item"
        >
          <code>{{ code }}</code>
        </div>
      </div>

      <div class="step-actions">
        <el-button @click="copyRecoveryCodes">
          <i class="fas fa-copy"></i> 複製全部
        </el-button>
        <el-button type="primary" @click="finishSetup">
          我已保存備用碼
        </el-button>
      </div>
    </div>

    <!-- Disable Drawer -->
    <el-drawer
      v-model="showDisableDrawer"
      title="停用驗證器"
      direction="ttb"
      size="100%"
      class="drawer-maroon"
      :close-on-click-modal="false"
    >
      <div class="drawer-content">
        <el-alert type="error" :closable="false" show-icon style="margin-bottom: 20px;">
          <template #title>危險操作</template>
          停用驗證器後將改回電子郵件驗證碼登入，帳號安全性將降低。
        </el-alert>

        <el-form label-position="top">
          <el-form-item label="請輸入密碼確認身份">
            <el-input
              v-model="disablePassword"
              type="password"
              placeholder="輸入密碼"
              show-password
            />
          </el-form-item>

          <el-form-item label="請輸入 DISABLE 確認停用">
            <el-input
              v-model="disableConfirmText"
              placeholder="輸入 DISABLE"
              @keyup.enter="confirmDisable"
            />
          </el-form-item>
        </el-form>

        <div v-if="disableError" class="drawer-error">
          <i class="fas fa-exclamation-circle"></i> {{ disableError }}
        </div>
      </div>

      <template #footer>
        <div class="drawer-actions">
          <el-button @click="showDisableDrawer = false">取消</el-button>
          <el-button
            type="danger"
            :loading="disableLoading"
            :disabled="disableConfirmText !== 'DISABLE'"
            @click="confirmDisable"
          >
            確認停用驗證器
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Regenerate Dialog -->
    <el-dialog
      v-model="showRegenerateDialog"
      title="重新產生備用碼"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-alert type="warning" :closable="false" show-icon>
        重新產生將使所有現有備用碼失效。
      </el-alert>
      <div style="margin-top: 12px;">
        <p>請輸入密碼確認：</p>
        <el-input
          v-model="regeneratePassword"
          type="password"
          placeholder="輸入密碼"
          show-password
          @keyup.enter="confirmRegenerate"
        />
      </div>
      <div v-if="regenerateError" class="dialog-error">
        <i class="fas fa-exclamation-circle"></i> {{ regenerateError }}
      </div>
      <template #footer>
        <el-button @click="showRegenerateDialog = false">取消</el-button>
        <el-button type="primary" :loading="regenerateLoading" @click="confirmRegenerate">
          確認重新產生
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { ElMessage } from 'element-plus';
import QRCode from 'qrcode';
import { rpcClient } from '@/utils/rpc-client';
import type {
  TotpSetupInitResponse,
  TotpSetupVerifyResponse,
  TotpStatusResponse,
  TotpRegenerateCodesResponse
} from '@/types/auth';

// Emits
const emit = defineEmits<{
  'setup-complete': [];
}>();

// State
const totpEnabled = ref(false);
const recoveryCodesRemaining = ref(0);
const step = ref<'idle' | 'scan' | 'verify' | 'recovery'>('idle');

// Setup state
const setupSecret = ref('');
const setupOtpauthUri = ref('');
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const verifyCode = ref('');
const verifyError = ref('');
const verifyLoading = ref(false);
const initLoading = ref(false);
const recoveryCodes = ref<string[]>([]);

// Disable state
const showDisableDrawer = ref(false);
const disablePassword = ref('');
const disableConfirmText = ref('');
const disableError = ref('');
const disableLoading = ref(false);

// Regenerate state
const showRegenerateDialog = ref(false);
const regeneratePassword = ref('');
const regenerateError = ref('');
const regenerateLoading = ref(false);

/**
 * Fetch TOTP status on mount
 */
onMounted(async () => {
  await fetchStatus();
});

async function fetchStatus() {
  try {
    const httpResponse = await (rpcClient.api.auth as any).totp.status.$get();
    const response = await httpResponse.json();
    if (response.success) {
      const data = response.data as TotpStatusResponse;
      totpEnabled.value = data.totpEnabled;
      recoveryCodesRemaining.value = data.recoveryCodesRemaining;
    }
  } catch {
    // Silently fail — status will show default
  }
}

/**
 * Start TOTP setup — generate secret and show QR
 */
async function startSetup() {
  initLoading.value = true;
  try {
    const httpResponse = await (rpcClient.api.auth as any).totp['setup-init'].$post();
    const response = await httpResponse.json();
    if (response.success) {
      const data = response.data as TotpSetupInitResponse;
      setupSecret.value = data.secret;
      setupOtpauthUri.value = data.otpauthUri;
      step.value = 'scan';
      // Render QR code after DOM update
      await nextTick();
      renderQR();
    } else {
      ElMessage.error(response.error?.message || '無法初始化 TOTP 設定');
    }
  } catch {
    ElMessage.error('無法初始化 TOTP 設定');
  } finally {
    initLoading.value = false;
  }
}

// Re-render QR when canvas becomes available
watch(qrCanvas, (canvas) => {
  if (canvas && setupOtpauthUri.value) {
    renderQR();
  }
});

function renderQR() {
  if (!qrCanvas.value || !setupOtpauthUri.value) return;
  QRCode.toCanvas(qrCanvas.value, setupOtpauthUri.value, {
    width: 200,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' }
  });
}

function copySecret() {
  navigator.clipboard.writeText(setupSecret.value);
  ElMessage.success('密鑰已複製');
}

function cancelSetup() {
  step.value = 'idle';
  setupSecret.value = '';
  setupOtpauthUri.value = '';
  verifyCode.value = '';
  verifyError.value = '';
}

/**
 * Verify TOTP code and finalize setup
 */
async function confirmSetup() {
  if (verifyCode.value.length !== 6) return;

  verifyLoading.value = true;
  verifyError.value = '';

  try {
    const httpResponse = await (rpcClient.api.auth as any).totp['setup-verify'].$post({
      json: { code: verifyCode.value }
    });
    const response = await httpResponse.json();

    if (response.success) {
      const data = response.data as TotpSetupVerifyResponse;
      recoveryCodes.value = data.recoveryCodes;
      totpEnabled.value = true;
      step.value = 'recovery';
      ElMessage.success('驗證器已成功啟用！');
    } else {
      verifyError.value = response.error?.message || '驗證碼錯誤';
    }
  } catch {
    verifyError.value = '驗證失敗，請重試';
  } finally {
    verifyLoading.value = false;
  }
}

function copyRecoveryCodes() {
  const text = recoveryCodes.value.join('\n');
  navigator.clipboard.writeText(text);
  ElMessage.success('備用碼已複製');
}

function finishSetup() {
  step.value = 'idle';
  recoveryCodes.value = [];
  verifyCode.value = '';
  fetchStatus(); // Refresh status
  emit('setup-complete');
}

/**
 * Disable TOTP
 */
async function confirmDisable() {
  if (!disablePassword.value) {
    disableError.value = '請輸入密碼';
    return;
  }

  if (disableConfirmText.value !== 'DISABLE') {
    disableError.value = '請輸入 DISABLE 確認';
    return;
  }

  disableLoading.value = true;
  disableError.value = '';

  try {
    const httpResponse = await (rpcClient.api.auth as any).totp.disable.$post({
      json: { password: disablePassword.value }
    });
    const response = await httpResponse.json();

    if (response.success) {
      totpEnabled.value = false;
      recoveryCodesRemaining.value = 0;
      showDisableDrawer.value = false;
      disablePassword.value = '';
      disableConfirmText.value = '';
      ElMessage.success('驗證器已停用');
    } else {
      disableError.value = response.error?.message || '停用失敗';
    }
  } catch {
    disableError.value = '停用失敗，請重試';
  } finally {
    disableLoading.value = false;
  }
}

/**
 * Regenerate recovery codes
 */
async function confirmRegenerate() {
  if (!regeneratePassword.value) {
    regenerateError.value = '請輸入密碼';
    return;
  }

  regenerateLoading.value = true;
  regenerateError.value = '';

  try {
    const httpResponse = await (rpcClient.api.auth as any).totp['recovery-codes'].regenerate.$post({
      json: { password: regeneratePassword.value }
    });
    const response = await httpResponse.json();

    if (response.success) {
      const data = response.data as TotpRegenerateCodesResponse;
      recoveryCodes.value = data.recoveryCodes;
      showRegenerateDialog.value = false;
      regeneratePassword.value = '';
      step.value = 'recovery';
      ElMessage.success('備用碼已重新產生');
    } else {
      regenerateError.value = response.error?.message || '重新產生失敗';
    }
  } catch {
    regenerateError.value = '重新產生失敗，請重試';
  } finally {
    regenerateLoading.value = false;
  }
}
</script>

<style scoped>
.totp-setup {
  padding: 8px 0;
}

.totp-status {
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

.low-warning {
  color: #dc3545;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

/* Setup steps */
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

.qr-container {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 16px;
}

.qr-container canvas {
  border-radius: 4px;
}

.secret-display {
  text-align: center;
  margin-bottom: 16px;
}

.secret-label {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 4px;
}

.secret-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.secret-value code {
  font-size: 14px;
  font-family: monospace;
  letter-spacing: 2px;
  background: #f1f5f9;
  padding: 6px 12px;
  border-radius: 4px;
  color: #334155;
  user-select: all;
}

.verify-input {
  max-width: 200px;
  margin: 0 auto 16px;
}

.totp-code-input :deep(.el-input__inner) {
  text-align: center;
  font-size: 24px;
  font-family: monospace;
  letter-spacing: 8px;
}

.verify-error {
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

/* Recovery codes */
.recovery-codes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 16px 0;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
}

.recovery-code-item {
  text-align: center;
}

.recovery-code-item code {
  font-size: 14px;
  font-family: monospace;
  letter-spacing: 2px;
  color: #334155;
  background: white;
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  display: inline-block;
}

/* Dialog error */
.dialog-error {
  margin-top: 8px;
  color: #dc3545;
  font-size: 13px;
}

/* Drawer styles */
.drawer-content {
  padding: 20px;
  max-width: 500px;
  margin: 0 auto;
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
