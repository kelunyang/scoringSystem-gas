-- Migration: Remove lastLoginTime column from users table
-- Date: 2025-01-27
-- Purpose: Remove redundant lastLoginTime field (login times tracked in sys_logs)

-- Drop lastLoginTime column
-- Note: SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Step 1: Create new users table without lastLoginTime
CREATE TABLE IF NOT EXISTS users_new (
  userId TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  userEmail TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  registrationTime INTEGER,
  lastActivityTime INTEGER,
  status TEXT DEFAULT 'active',
  preferences TEXT DEFAULT '{}',
  avatarSeed TEXT,
  avatarStyle TEXT DEFAULT 'avataaars',
  avatarOptions TEXT DEFAULT '{}',
  lockUntil INTEGER DEFAULT NULL,
  lockReason TEXT DEFAULT NULL,
  lockCount INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Step 2: Copy data from old table to new table (excluding lastLoginTime)
INSERT INTO users_new (
  userId, password, userEmail, displayName,
  registrationTime, lastActivityTime, status,
  preferences, avatarSeed, avatarStyle, avatarOptions,
  lockUntil, lockReason, lockCount,
  createdAt, updatedAt
)
SELECT
  userId, password, userEmail, displayName,
  registrationTime, lastActivityTime, status,
  preferences, avatarSeed, avatarStyle, avatarOptions,
  lockUntil, lockReason, lockCount,
  createdAt, updatedAt
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(userEmail);

-- Migration complete
-- lastLoginTime data preserved in sys_logs (action='login_success')
