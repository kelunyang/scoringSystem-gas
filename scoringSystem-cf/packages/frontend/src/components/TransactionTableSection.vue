<template>
  <div class="transactions-container" v-loading="loading" element-loading-text="載入交易記錄中...">
    <table class="transactions-table">
      <thead>
        <tr>
          <th class="expand-col"></th>
          <th>時間</th>
          <th v-if="showUserColumn">使用者</th>
          <th>金額</th>
          <th>類型</th>
          <th>階段</th>
          <th>關聯內容</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="transaction in filteredTransactions" :key="transaction.transactionId">
          <!-- Main Transaction Row -->
          <tr class="transaction-row" :class="{ 'expanded': isExpanded(transaction.transactionId) }" @click="handleToggle(transaction)">
            <td class="expand-icon-cell">
              <i class="fas expand-icon" :class="isExpanded(transaction.transactionId) ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"></i>
            </td>
            <td>{{ formatTime(transaction.timestamp) }}</td>
            <td v-if="showUserColumn" class="user-cell">{{ transaction.displayName || transaction.userEmail }}</td>
            <td class="points" :class="{ positive: (transaction.points ?? 0) > 0, negative: (transaction.points ?? 0) < 0 }">
              {{ (transaction.points ?? 0) > 0 ? '+' : '' }}{{ transaction.points ?? 0 }}
            </td>
            <td>
              <span class="transaction-type" :class="transaction.transactionType">
                {{ getTransactionTypeText(transaction.transactionType) }}
              </span>
            </td>
            <td>{{ transaction.stageName || (transaction.stageId ? `階段${transaction.stageId}` : '未分類') }}</td>
            <td class="related-content" @click.stop>
              <el-dropdown
                v-if="transaction.settlementId"
                trigger="click"
                @command="(cmd: string) => $emit('settlement-command', cmd, transaction)"
              >
                <button class="btn-sm btn-info">
                  <i class="fas fa-coins"></i>
                  查看獎金分配
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="report">
                      <i class="fas fa-file-alt"></i> 互評獎金分配
                    </el-dropdown-item>
                    <el-dropdown-item command="comment">
                      <i class="fas fa-comments"></i> 評論獎金分配
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <button
                v-if="canManageWallets && !checkTransactionReversed(transaction)"
                class="btn-sm btn-danger"
                :disabled="isReversing(transaction.transactionId)"
                @click.stop="$emit('open-reversal', transaction)"
              >
                <i :class="isReversing(transaction.transactionId) ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                {{ isReversing(transaction.transactionId) ? '撤銷中...' : '撤銷' }}
              </button>
            </td>
          </tr>

          <!-- Expanded Details Row -->
          <tr v-if="isExpanded(transaction.transactionId)" class="transaction-details">
            <td :colspan="showUserColumn ? 8 : 7">
              <div class="details-container" v-loading="isLoadingDetails(transaction.transactionId)" element-loading-text="載入詳情中...">
                <!-- Transaction Description -->
                <div v-if="transaction.description" class="detail-section">
                  <h4><i class="fas fa-file-text"></i> 交易說明</h4>
                  <div class="detail-content">
                    <div class="description-content">{{ transaction.description }}</div>
                  </div>
                </div>

                <!-- Related Submission -->
                <div v-if="transaction.relatedSubmissionId" class="detail-section">
                  <h4><i class="fas fa-file-alt"></i> 相關成果</h4>
                  <div v-if="getTransactionDetails(transaction.transactionId)?.submission" class="detail-content">
                    <div class="submission-content" v-html="sanitizeHtml(getTransactionDetails(transaction.transactionId)!.submission!.contentMarkdown || getTransactionDetails(transaction.transactionId)!.submission!.content)"></div>
                    <div class="detail-meta">
                      <span v-if="getTransactionDetails(transaction.transactionId)?.submission?.submitTime" class="meta-time">
                        <i class="fas fa-clock"></i>
                        提交時間: {{ formatTime(getTransactionDetails(transaction.transactionId)!.submission!.submitTime!) }}
                      </span>
                      <span v-if="getTransactionDetails(transaction.transactionId)?.submission?.submitterEmail" class="meta-author">
                        <i class="fas fa-user"></i>
                        提交者: {{ getTransactionDetails(transaction.transactionId)!.submission!.submitterEmail }}
                      </span>
                    </div>
                  </div>
                  <div v-else-if="getTransactionDetails(transaction.transactionId)?.submissionError" class="detail-error">
                    無法載入成果內容：{{ getTransactionDetails(transaction.transactionId)!.submissionError }}
                  </div>
                  <div v-else class="detail-loading">
                    正在載入成果內容...
                  </div>
                </div>

                <!-- Related Comment -->
                <div v-if="transaction.relatedCommentId" class="detail-section">
                  <h4><i class="fas fa-comment"></i> 相關評論</h4>
                  <div v-if="getTransactionDetails(transaction.transactionId)?.comment" class="detail-content">
                    <div class="comment-content" v-html="sanitizeHtml(getTransactionDetails(transaction.transactionId)!.comment!.content)"></div>
                    <div class="detail-meta">
                      <span v-if="getTransactionDetails(transaction.transactionId)?.comment?.createdTime" class="meta-time">
                        <i class="fas fa-clock"></i>
                        發布時間: {{ formatTime(getTransactionDetails(transaction.transactionId)!.comment!.createdTime!) }}
                      </span>
                      <span v-if="getTransactionDetails(transaction.transactionId)?.comment?.authorEmail" class="meta-author">
                        <i class="fas fa-user"></i>
                        作者: {{ getTransactionDetails(transaction.transactionId)!.comment!.authorEmail }}
                      </span>
                    </div>
                  </div>
                  <div v-else-if="getTransactionDetails(transaction.transactionId)?.commentError" class="detail-error">
                    無法載入評論內容：{{ getTransactionDetails(transaction.transactionId)!.commentError }}
                  </div>
                  <div v-else class="detail-loading">
                    正在載入評論內容...
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <EmptyState
      v-if="filteredTransactions.length === 0 && !loading"
      :icons="['fa-coins', 'fa-receipt']"
      parent-icon="fa-wallet"
      title="沒有找到符合條件的交易記錄"
      :compact="true"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Transaction Table Section Component
 * 交易表格組件 - 從 WalletNew.vue 提取
 *
 * 單一職責：顯示交易記錄表格和可展開的詳情
 */

import type { Transaction } from '@repo/shared'
import EmptyState from '@/components/shared/EmptyState.vue'
import { formatTime, getTransactionTypeText } from '@/utils/walletHelpers'
import { sanitizeHtml } from '@/utils/sanitize'

interface TransactionDetail {
  submission?: {
    content: string
    contentMarkdown?: string
    submitTime?: number
    submitterEmail?: string
  }
  submissionError?: string
  comment?: {
    content: string
    createdTime?: number
    authorEmail?: string
  }
  commentError?: string
}

interface Props {
  filteredTransactions: Transaction[]
  showUserColumn: boolean
  canManageWallets: boolean
  loading: boolean

  // Functions passed from parent composables
  isExpanded: (transactionId: string) => boolean
  isLoadingDetails: (transactionId: string) => boolean
  getTransactionDetails: (transactionId: string) => TransactionDetail | undefined
  checkTransactionReversed: (transaction: Transaction) => boolean
  isReversing: (transactionId: string) => boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-transaction', transaction: Transaction): void
  (e: 'open-reversal', transaction: Transaction): void
  (e: 'settlement-command', command: string, transaction: Transaction): void
}>()

/**
 * 切換交易展開狀態
 */
function handleToggle(transaction: Transaction) {
  emit('toggle-transaction', transaction)
}
</script>

<style scoped>
/* Transactions container */
.transactions-container {
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

/* Transactions table */
.transactions-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.transactions-table th,
.transactions-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e1e8ed;
}

.transactions-table th {
  background: #000;
  font-weight: 600;
  color: white;
}

/* Expand icon column */
.expand-col {
  width: 40px;
  text-align: center;
}

.expand-icon-cell {
  width: 40px;
  text-align: center;
  vertical-align: middle;
  padding: 8px 4px !important;
}

.expand-icon {
  color: #666;
  font-size: 14px;
  transition: transform 0.2s, color 0.2s;
}

.transaction-row {
  cursor: pointer;
  transition: background-color 0.2s;
}

.transaction-row:hover .expand-icon {
  color: #409eff;
}

.transaction-row.expanded .expand-icon {
  color: #409eff;
}

.transaction-row:hover {
  background: #f8f9fa;
}

.transaction-row.expanded {
  background: #e8f4fd;
}

.user-cell {
  font-weight: 500;
  color: #495057;
}

.points {
  font-weight: 600;
  font-size: 15px;
}

.points.positive {
  color: #67c23a;
}

.points.negative {
  color: #f56c6c;
}

.transaction-type {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #e9ecef;
  color: #495057;
  font-weight: 500;
}

.related-content {
  white-space: nowrap;
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover {
  background: #138496;
}

.btn-danger {
  background: #f56c6c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #f45454;
}

.btn-danger:disabled {
  background: #a8abb2;
  cursor: not-allowed;
  opacity: 0.6;
}

.transaction-details {
  background: #f8f9fa;
}

.transaction-details td {
  padding: 0;
}

.details-container {
  padding: 20px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  margin: 0 0 10px 0;
  color: #2c3e50;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-section h4 i {
  color: #409eff;
}

.detail-content {
  background: white;
  border-radius: 4px;
  padding: 15px;
  border-left: 4px solid #409eff;
}

.description-content,
.submission-content,
.comment-content {
  line-height: 1.6;
  word-wrap: break-word;
  white-space: pre-wrap;
  color: #2c3e50;
}

.detail-meta {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #666;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e1e8ed;
}

.meta-time,
.meta-author {
  display: flex;
  align-items: center;
  gap: 5px;
}

.detail-loading,
.detail-error {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
  color: #666;
  font-style: italic;
}

.detail-error {
  color: #f56c6c;
  background: #fef0f0;
}
</style>
