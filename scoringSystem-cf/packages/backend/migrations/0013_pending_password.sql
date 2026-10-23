-- Migration: self-service password reset parks the new password beside the old
--
-- Forgot-password used to be three steps (email → mailed code → pick the
-- projects you never joined). It is now one: type your email, get a new
-- password in your inbox. The mailbox is the proof of identity.
--
-- Overwriting `password` the moment someone submits an address would let
-- anyone who knows a classmate's email kill that classmate's password. So the
-- new password waits here instead. Login accepts either one; the first
-- successful login with the pending one promotes it into `password` and
-- clears these columns. Unused, it simply expires.
--
-- pendingPassword            PBKDF2 hash, same format as `password`
-- pendingPasswordExpiresAt   milliseconds since epoch

ALTER TABLE users ADD COLUMN pendingPassword TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN pendingPasswordExpiresAt INTEGER DEFAULT NULL;
