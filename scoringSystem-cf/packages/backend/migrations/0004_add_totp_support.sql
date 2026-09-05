-- Migration: Add TOTP (Google Authenticator) support
-- This migration adds TOTP-related columns to users table and creates recovery codes table

-- Add TOTP columns to users table
ALTER TABLE users ADD COLUMN totpSecret TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN totpEnabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN totpEnabledAt INTEGER DEFAULT NULL;

-- Create TOTP recovery codes table
CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  codeId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  isUsed INTEGER DEFAULT 0,
  usedAt INTEGER DEFAULT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_totp_recovery_codes_userId ON totp_recovery_codes(userId);
CREATE INDEX IF NOT EXISTS idx_totp_recovery_codes_userId_unused ON totp_recovery_codes(userId, isUsed) WHERE isUsed = 0;
