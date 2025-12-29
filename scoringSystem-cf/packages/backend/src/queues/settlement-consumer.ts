// ============================================
// Settlement Queue Consumer
// ============================================

import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../types';
import type { ApiResponse, SettlementResponseData } from '@repo/shared';
import { SettlementQueueMessageSchema } from './types';
import { settleStage } from '../handlers/scoring/settlement';
import { notifySettlementFailed } from './notification-producer';

/**
 * Settlement Queue Consumer
 * Processes settlement tasks from the SETTLEMENT_QUEUE
 *
 * 關鍵設計：
 * 1. Idempotency Check: 從 settlementtasks 表檢查任務狀態，防止重複執行
 * 2. Atomic Settlement: 調用 settleStage() 執行原子性結算
 * 3. Progress Tracking: 更新 settlementtasks 表狀態（processing → completed/failed）
 * 4. Error Handling: 失敗時通知管理員，記錄錯誤訊息
 */
export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    console.log(`[Settlement Consumer] Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      try {
        // Validate message schema
        const parsedMessage = SettlementQueueMessageSchema.parse(message.body);
        console.log(`[Settlement Consumer] Processing settlement task ${parsedMessage.taskId}`);

        // ============================================
        // STEP 1: IDEMPOTENCY CHECK (防止重複執行)
        // ============================================
        const task = await env.DB.prepare(`
          SELECT taskId, status, settlementId FROM settlementtasks
          WHERE taskId = ?
        `).bind(parsedMessage.taskId).first();

        if (!task) {
          console.error(`[Settlement Consumer] Task ${parsedMessage.taskId} not found in database`);
          message.ack(); // ACK to avoid infinite retries
          continue;
        }

        const currentStatus = task.status as string;

        // 如果任務已完成或正在處理中，跳過
        if (currentStatus === 'completed') {
          console.log(`[Settlement Consumer] Task ${parsedMessage.taskId} already completed, skipping`);
          message.ack();
          continue;
        }

        if (currentStatus === 'processing') {
          console.log(`[Settlement Consumer] Task ${parsedMessage.taskId} is being processed by another worker, retrying...`);
          message.retry(); // 可能是並發執行，重試
          continue;
        }

        // ============================================
        // STEP 2: 原子性鎖定任務狀態 (OPTIMISTIC LOCKING)
        // ============================================
        const now = Date.now();
        const lockResult = await env.DB.prepare(`
          UPDATE settlementtasks
          SET status = 'processing', startedAt = ?, updatedAt = ?
          WHERE taskId = ? AND status = 'pending'
        `).bind(now, now, parsedMessage.taskId).run();

        // 檢查是否成功鎖定
        if (lockResult.meta.changes === 0) {
          console.log(`[Settlement Consumer] Failed to acquire lock for task ${parsedMessage.taskId}, another worker may have claimed it`);
          message.retry();
          continue;
        }

        console.log(`[Settlement Consumer] Lock acquired for task ${parsedMessage.taskId}, starting settlement...`);

        // ============================================
        // STEP 3: 執行結算
        // ============================================
        try {
          const settlementResponse = await settleStage(
            env,
            parsedMessage.operatorEmail,
            parsedMessage.projectId,
            parsedMessage.stageId,
            parsedMessage.force || false
          );

          // 檢查 settleStage 回應
          const responseBody = await settlementResponse.json() as ApiResponse<SettlementResponseData>;

          if (!responseBody.success) {
            throw new Error(responseBody.error || 'Settlement failed');
          }

          const settlementId = responseBody.data?.settlementId;

          // ============================================
          // STEP 4: 標記任務完成
          // ============================================
          const completedAt = Date.now();
          await env.DB.prepare(`
            UPDATE settlementtasks
            SET status = 'completed', completedAt = ?, updatedAt = ?, settlementId = ?
            WHERE taskId = ?
          `).bind(completedAt, completedAt, settlementId, parsedMessage.taskId).run();

          console.log(`[Settlement Consumer] Task ${parsedMessage.taskId} completed successfully, settlementId: ${settlementId}`);

          // ACK message
          message.ack();

        } catch (settlementError) {
          // ============================================
          // STEP 5: 結算失敗處理
          // ============================================
          const errorMessage = settlementError instanceof Error
            ? settlementError.message
            : 'Unknown settlement error';

          console.error(`[Settlement Consumer] Settlement failed for task ${parsedMessage.taskId}:`, errorMessage);

          // 更新任務狀態為 failed
          const failedAt = Date.now();
          await env.DB.prepare(`
            UPDATE settlementtasks
            SET status = 'failed', completedAt = ?, updatedAt = ?, error = ?
            WHERE taskId = ?
          `).bind(failedAt, failedAt, errorMessage, parsedMessage.taskId).run();

          // 通知管理員結算失敗
          try {
            // 查詢專案管理員郵箱
            const adminsResult = await env.DB.prepare(`
              SELECT DISTINCT u.userEmail
              FROM usergroups ug
              JOIN users u ON ug.userEmail = u.userEmail
              WHERE ug.projectId = ? AND ug.level IN (0, 1) AND ug.isActive = 1
            `).bind(parsedMessage.projectId).all();

            const adminEmails = adminsResult.results?.map(r => r.userEmail as string) || [];

            if (adminEmails.length > 0) {
              await notifySettlementFailed(
                env,
                adminEmails,
                '', // settlementId (沒有成功創建)
                parsedMessage.projectId,
                parsedMessage.stageId,
                errorMessage
              );
            }
          } catch (notificationError) {
            console.error('[Settlement Consumer] Failed to send failure notification:', notificationError);
          }

          // ACK message (不重試，已記錄失敗)
          message.ack();
        }

      } catch (error) {
        console.error('[Settlement Consumer] Error processing message:', error);

        // 對於非業務錯誤（如數據庫連接失敗），重試
        if (error instanceof Error && error.message.includes('database')) {
          message.retry();
          console.log('[Settlement Consumer] Message will be retried due to database error');
        } else {
          // Validation errors 或其他錯誤，ACK
          message.ack();
          console.log('[Settlement Consumer] Message ACKed despite error');
        }
      }
    }

    console.log(`[Settlement Consumer] Batch processing complete`);
  },
};
