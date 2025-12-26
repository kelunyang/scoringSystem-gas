-- Migration: Add account lock fields to users table
-- Date: 2025-01-27
-- Purpose: Enable temporary account locking and progressive lockout for 2FA security

-- Add lock-related fields to users table
ALTER TABLE users ADD COLUMN lockUntil INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN lockReason TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN lockCount INTEGER DEFAULT 0;

-- Fields explanation:
-- lockUntil: Timestamp when temporary lock expires (NULL = no lock)
-- lockReason: Reason for lock (e.g., '2fa_failures', 'admin_action')
-- lockCount: Number of times account has been locked (used for progressive lockout)

-- Usage examples:
-- Temporary lock (15 minutes): lockUntil = NOW + 900000, lockCount = 1
-- Temporary lock (1 hour): lockUntil = NOW + 3600000, lockCount = 2
-- Permanent disable: status = 'disabled', lockUntil = NULL

-- Auto-unlock logic:
-- If lockUntil <= current_timestamp, the account is automatically unlocked during login
-- The login handler will clear lockUntil and lockReason fields
