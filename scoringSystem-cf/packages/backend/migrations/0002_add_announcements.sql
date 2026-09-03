-- Migration: Add announcements table for system-wide announcements
-- Created: 2026-01-13

-- 公告表 - 用於登入頁面顯示系統公告
CREATE TABLE IF NOT EXISTS announcements (
  announcementId TEXT PRIMARY KEY,

  -- 公告內容
  title TEXT NOT NULL,
  content TEXT NOT NULL,               -- Markdown content

  -- 時間範圍
  startTime INTEGER NOT NULL,          -- Unix timestamp (ms) - 公告開始顯示時間
  endTime INTEGER NOT NULL,            -- Unix timestamp (ms) - 公告結束顯示時間

  -- 公告類型 (影響顯示優先級和圖示)
  type TEXT NOT NULL DEFAULT 'info',   -- 'info' | 'warning' | 'success' | 'error'

  -- 創建者資訊
  createdBy TEXT NOT NULL,             -- userEmail

  -- 時間戳
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER,

  -- 軟刪除標記
  isActive INTEGER DEFAULT 1
);

-- 索引：查詢有效期內的公告
CREATE INDEX IF NOT EXISTS idx_announcements_time ON announcements(startTime, endTime, isActive);

-- 索引：按創建時間排序
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(createdAt DESC);

-- 索引：按類型篩選
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type, isActive);
