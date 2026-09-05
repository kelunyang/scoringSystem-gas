-- Migration 0004: Fix invitation unique index bug
-- Date: 2025-12-25
-- Issue: Expired invitations blocked new invitation creation for same email
--
-- Root Cause:
-- The partial unique index idx_invitation_active_email uses the table's
-- deprecated 'status' column (which is never updated after creation).
-- The VIEW invitation_codes_with_status calculates real status from timestamps,
-- but the index still sees expired invitations as status='active'.
--
-- Solution:
-- Drop the outdated index. The pre-check in getActiveInvitationByEmail()
-- already correctly validates using the VIEW with expiryTime > currentTime.

DROP INDEX IF EXISTS idx_invitation_active_email;
