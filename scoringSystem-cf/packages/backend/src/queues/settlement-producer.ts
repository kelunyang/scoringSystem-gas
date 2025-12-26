// ============================================
// Settlement Queue Producer
// ============================================

import type { Env } from '../types';
import type { SettlementQueueMessage } from './types';
import { generateId } from '../utils/id-generator';

/**
 * 推送階段結算任務到 Queue
 *
 * @param env Environment bindings
 * @param operatorEmail 操作者郵箱
 * @param projectId 專案 ID
 * @param stageId 階段 ID
 * @param force 是否強制結算（跳過 validation 警告）
 * @returns taskId - 用於前端追蹤結算進度
 */
export async function queueSettleStage(
  env: Env,
  operatorEmail: string,
  projectId: string,
  stageId: string,
  force: boolean = false
): Promise<string> {
  const taskId = generateId('task');
  const timestamp = Date.now();

  // 創建 settlementtasks 記錄 (狀態: pending)
  await env.DB.prepare(`
    INSERT INTO settlementtasks (
      taskId, projectId, stageId, operatorEmail, status,
      createdAt, updatedAt, force
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    taskId,
    projectId,
    stageId,
    operatorEmail,
    'pending',
    timestamp,
    timestamp,
    force ? 1 : 0
  ).run();

  // 推送到 Queue
  const message: SettlementQueueMessage = {
    type: 'settle_stage',
    taskId,
    operatorEmail,
    projectId,
    stageId,
    timestamp,
    force,
  };

  await env.SETTLEMENT_QUEUE.send(message);

  console.log(`[Settlement Queue] Queued settlement task ${taskId} for stage ${stageId} (force: ${force})`);

  return taskId;
}

/**
 * 檢查結算任務狀態
 */
export async function getSettlementTaskStatus(
  env: Env,
  taskId: string
): Promise<{
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  settlementId?: string;
} | null> {
  const task = await env.DB.prepare(`
    SELECT * FROM settlementtasks WHERE taskId = ?
  `).bind(taskId).first();

  if (!task) {
    return null;
  }

  return {
    taskId: task.taskId as string,
    status: task.status as 'pending' | 'processing' | 'completed' | 'failed',
    createdAt: task.createdAt as number,
    updatedAt: task.updatedAt as number,
    startedAt: task.startedAt as number | undefined,
    completedAt: task.completedAt as number | undefined,
    error: task.error as string | undefined,
    settlementId: task.settlementId as string | undefined,
  };
}
