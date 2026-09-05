-- Migration: let a password change revoke the sessions issued before it
--
-- JWTs are bearer tokens: once signed they are valid until `exp` and nothing
-- can call them back. Changing a password therefore did not log anyone out,
-- and the sliding expiration in middleware/auth.ts (re-issue once a token is
-- past half its life) meant a stolen token used every 12 hours never expired
-- at all. The reset flow's own TODO proposed exactly this column.
--
-- Stored in milliseconds like every other timestamp in this schema, but
-- truncated to whole seconds by the writers: JWT `iat` only has second
-- resolution, so a token minted in the same second as the change must not be
-- read as older than it.
--
-- NULL means "never changed since this migration" and imposes no restriction,
-- so existing sessions survive the deployment.

ALTER TABLE users ADD COLUMN passwordChangedAt INTEGER DEFAULT NULL;
