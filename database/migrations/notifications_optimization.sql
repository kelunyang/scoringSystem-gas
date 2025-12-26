-- ============================================
-- notifications 表結構優化遷移腳本
-- 執行日期: 2025-01-27
-- 用途: 為 notifications 添加專用實體欄位，替代多態 relatedEntityId
-- ============================================

BEGIN TRANSACTION;

-- 1. 新增專用實體欄位
ALTER TABLE notifications ADD COLUMN submissionId TEXT;
ALTER TABLE notifications ADD COLUMN groupId TEXT;
ALTER TABLE notifications ADD COLUMN transactionId TEXT;
ALTER TABLE notifications ADD COLUMN settlementId TEXT;
ALTER TABLE notifications ADD COLUMN rankingProposalId TEXT;

-- 2. 新增索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_notifications_submission
ON notifications(submissionId, createdTime DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_group
ON notifications(groupId, createdTime DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_transaction
ON notifications(transactionId, createdTime DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_settlement
ON notifications(settlementId, createdTime DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_project_user
ON notifications(projectId, targetUserEmail, createdTime DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_stage_user
ON notifications(stageId, targetUserEmail, createdTime DESC);

-- 3. 驗證變更
PRAGMA table_info(notifications);

-- 4. 檢查現有數據
SELECT
  COUNT(*) as total_notifications,
  COUNT(submissionId) as notifications_with_submission,
  COUNT(groupId) as notifications_with_group,
  COUNT(transactionId) as notifications_with_transaction
FROM notifications;

-- 5. 顯示欄位信息
SELECT
  '新欄位已成功添加:' as status,
  'submissionId, groupId, transactionId, settlementId, rankingProposalId' as new_fields;

COMMIT;

-- ============================================
-- 預期結果:
-- - notifications 表新增 5 個專用實體欄位
-- - 新增 6 個索引以提升查詢效能
-- - 現有數據保持不變（新欄位為 NULL）
-- - relatedEntityId 欄位保留（向後兼容）
-- ============================================

-- 使用說明:
-- 1. 在 Cloudflare D1 控制台或使用 wrangler d1 execute 執行此腳本
-- 2. 執行後，所有新的通知記錄將使用專用欄位
-- 3. 舊的通知記錄保持不變，新欄位為 NULL
-- 4. 可以使用以下查詢驗證:
--    SELECT * FROM notifications ORDER BY createdTime DESC LIMIT 10;
