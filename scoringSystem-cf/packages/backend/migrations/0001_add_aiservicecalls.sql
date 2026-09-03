-- Migration: Add aiservicecalls table for AI ranking service
-- Created: 2025-12-30

-- AI 服務呼叫記錄表（支援未來擴展更多 AI 服務）
CREATE TABLE IF NOT EXISTS aiservicecalls (
  callId TEXT PRIMARY KEY,

  -- 關聯
  projectId TEXT NOT NULL,
  stageId TEXT,                          -- 可選，有些 AI 服務可能是專案層級
  userEmail TEXT NOT NULL,               -- 請求者

  -- AI 服務類型（可擴展）
  serviceType TEXT NOT NULL,             -- 'ranking_direct', 'ranking_bt', 'ranking_multi_agent', 'summary', 'translation' 等
  rankingType TEXT,                      -- 'submission' | 'comment'（僅排名服務用）

  -- Provider 資訊
  providerId TEXT NOT NULL,
  providerName TEXT NOT NULL,
  model TEXT NOT NULL,

  -- 請求內容
  itemCount INTEGER,                     -- 處理項目數（排名用）
  customPrompt TEXT,                     -- 用戶自訂 prompt

  -- 結果
  status TEXT NOT NULL,                  -- 'pending', 'processing', 'success', 'failed', 'timeout'
  result TEXT,                           -- JSON: 排名結果或其他服務結果
  reason TEXT,                           -- AI 的解釋/思考過程
  thinkingProcess TEXT,                  -- DeepSeek 等的 reasoning_content
  errorMessage TEXT,                     -- 錯誤訊息

  -- BT 模式專用
  btComparisons TEXT,                    -- JSON: 所有配對比較結果 [{itemA, itemB, winner, reason}]
  btStrengthParams TEXT,                 -- JSON: 能力值 {itemId: strength}

  -- Multi-Agent 模式專用
  parentCallId TEXT,                     -- 關聯主請求（Multi-Agent 的子請求用）
  debateRound INTEGER,                   -- 辯論輪次 (1 或 2)
  debateChanged INTEGER,                 -- Round 2 是否改變立場 (0 or 1)
  debateCritique TEXT,                   -- Round 2 對其他排名的評論

  -- Token 使用量（成本追蹤）
  requestTokens INTEGER,
  responseTokens INTEGER,
  totalTokens INTEGER,

  -- 效能
  responseTimeMs INTEGER,

  -- 時間戳
  createdAt INTEGER NOT NULL,
  completedAt INTEGER,                   -- 完成時間（用於計算耗時）

  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (stageId) REFERENCES stages(stageId),
  FOREIGN KEY (parentCallId) REFERENCES aiservicecalls(callId)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_project ON aiservicecalls(projectId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_stage ON aiservicecalls(stageId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_user ON aiservicecalls(userEmail, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_service ON aiservicecalls(serviceType, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_status ON aiservicecalls(status, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_aiservicecalls_parent ON aiservicecalls(parentCallId);
