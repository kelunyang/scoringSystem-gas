-- Migration: Rate limit counters (D1-backed, strongly consistent)
--
-- Replaces the KV-based email rate limiting, which could never be correct:
-- KV allows roughly one write per second to the same key and its reads are
-- eventually consistent, so a shared counter hit by 40 simultaneous logins
-- (one class starting) would silently undercount. D1 serialises writes and a
-- single-statement upsert is atomic, so the same burst is counted exactly.
--
-- Two kinds of row share this table:
--   kind='window'   fixed-window counter; bucketKey carries the window start,
--                   so an expired window is simply a row nobody reads again.
--   kind='cooldown' minimum-interval guard; `lastAt` is the value checked,
--                   which avoids the boundary double-hit a 60s fixed window
--                   would allow (two mails one second apart across a window
--                   edge).

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucketKey TEXT PRIMARY KEY,
  scope     TEXT NOT NULL,
  kind      TEXT NOT NULL,
  identity  TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  lastAt    INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);

-- Sweeping expired buckets is a range delete over this index.
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expiresAt
  ON rate_limit_counters(expiresAt);

-- Admin views ("who is being throttled right now") filter by scope.
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_scope
  ON rate_limit_counters(scope, identity);
