-- ============================================
-- sys_logs 表結構優化遷移腳本
-- 執行日期: 2025-01-27
-- 用途: 為 sys_logs 添加實體追蹤欄位，支援通知系統
-- ============================================

BEGIN TRANSACTION;

-- 1. 新增欄位
ALTER TABLE sys_logs ADD COLUMN projectId TEXT;
ALTER TABLE sys_logs ADD COLUMN entityType TEXT;
ALTER TABLE sys_logs ADD COLUMN entityId TEXT;
ALTER TABLE sys_logs ADD COLUMN relatedEntities TEXT;

-- 2. 新增索引
CREATE INDEX IF NOT EXISTS idx_sys_logs_project
ON sys_logs(projectId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_sys_logs_entity
ON sys_logs(entityType, entityId);

CREATE INDEX IF NOT EXISTS idx_sys_logs_project_entity
ON sys_logs(projectId, entityType, createdAt DESC);

-- 3. 驗證變更
PRAGMA table_info(sys_logs);

-- 4. 檢查現有數據
SELECT
  COUNT(*) as total_logs,
  COUNT(projectId) as logs_with_project,
  COUNT(entityType) as logs_with_entity
FROM sys_logs;

-- 5. 顯示欄位信息
SELECT
  '新欄位已成功添加:' as status,
  'projectId, entityType, entityId, relatedEntities' as new_fields;

COMMIT;

-- ============================================
-- 預期結果:
-- - sys_logs 表新增 4 個欄位 (projectId, entityType, entityId, relatedEntities)
-- - 新增 3 個索引
-- - 現有數據保持不變（新欄位為 NULL）
-- - total_logs 顯示總日誌數
-- - logs_with_project 和 logs_with_entity 為 0（因為是新欄位）
-- ============================================

-- 使用說明:
-- 1. 在 Cloudflare D1 控制台或使用 wrangler d1 execute 執行此腳本
-- 2. 執行後，所有新的日誌記錄將自動填充這些欄位
-- 3. 舊的日誌記錄保持不變，新欄位為 NULL
-- 4. 可以使用以下查詢驗證:
--    SELECT * FROM sys_logs ORDER BY createdAt DESC LIMIT 10;
