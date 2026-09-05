-- Initial migration placeholder
-- The actual schema creation is handled by the init-system endpoint
-- This file ensures Wrangler creates the local D1 database

-- Create a minimal table to initialize the database
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

-- Record this migration
INSERT INTO _migrations (name, applied_at) VALUES ('0001_initial', strftime('%s', 'now') * 1000);
