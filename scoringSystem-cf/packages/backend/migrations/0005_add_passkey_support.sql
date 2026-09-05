-- Migration: Add Passkey (WebAuthn) support
-- Adds passkey-related columns to users table and creates passkey credentials table

-- Add passkey columns to users table
ALTER TABLE users ADD COLUMN passkeyEnabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN passkeyEnabledAt INTEGER DEFAULT NULL;

-- Create passkey credentials table
CREATE TABLE IF NOT EXISTS passkey_credentials (
  credentialId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  credentialPublicKey TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  deviceName TEXT,
  transports TEXT NOT NULL,
  aaguid TEXT,
  backedUp INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  lastUsedAt INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_userId ON passkey_credentials(userId);
