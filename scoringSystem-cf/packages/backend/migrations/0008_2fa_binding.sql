-- Migration: bind a verification code to its purpose and to a password proof
--
-- `two_factor_codes` recorded only "this email has a live code". It did not
-- record what the code was for, so `verifyTwoFactorCode` picked the newest
-- unused row regardless of context: a password-reset code satisfied the login
-- 2FA check and vice versa. It also did not record whether a password had been
-- verified before the code was issued, which is what let `/auth/resend-2fa`
-- (no password required) mint a code that `/auth/login-verify-2fa` accepted.
--
-- Existing rows default to the login context with no password proof, which is
-- the safe reading: an in-flight code from before this migration can still be
-- used for login, but only alongside a pre-auth token.

ALTER TABLE two_factor_codes ADD COLUMN context TEXT NOT NULL DEFAULT 'login';
ALTER TABLE two_factor_codes ADD COLUMN passwordVerified INTEGER NOT NULL DEFAULT 0;

-- verifyTwoFactorCode now filters on (userEmail, context, isUsed, expiresAt)
CREATE INDEX IF NOT EXISTS idx_two_factor_codes_lookup
  ON two_factor_codes(userEmail, context, isUsed, expiresAt);

-- Index that only ever existed in the duplicate passkey migration (see
-- migrations/README.md); folded in here so it is not lost.
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_lastused
  ON passkey_credentials(lastUsedAt DESC);
