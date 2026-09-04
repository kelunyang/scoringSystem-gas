#!/usr/bin/env bash
# Regenerate tests/fixtures/email-cascade-schema.sql from the local D1 database.
#
# The base schema predates packages/backend/migrations/ and exists only inside
# the database, so the change-email cascade test reads it from there rather than
# from a hand-written copy that could silently drift from production.
#
# Run `pnpm dev:backend` at least once first, so .wrangler has a local D1.
set -euo pipefail

cd "$(dirname "$0")/.."

DB=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name '*.sqlite' \
  ! -name 'metadata.sqlite' | head -1)

if [ -z "$DB" ]; then
  echo "No local D1 database found under .wrangler/. Run 'pnpm dev:backend' first." >&2
  exit 1
fi

# Keep in sync with EMAIL_REFERENCES in src/handlers/admin/users.ts, plus users
# (the account itself), sys_logs (the audit entry the change writes), and the
# parent tables those reference - SQLite refuses an INSERT whose FK target table
# is missing, so an incomplete dump would fail at seed time rather than test
# anything.
TABLES=(
  users globalusergroups usergroups projectviewers transactions
  submissions rankingproposals proposalvotes submissionapprovalvotes
  commentrankingproposals teachercommentrankings teachersubmissionrankings
  settlementhistory commentsettlements stagesettlements
  comments reactions notifications aiservicecalls two_factor_codes
  announcements sys_logs
  # FK parents
  projects stages groups globalgroups
)

OUT=tests/fixtures/email-cascade-schema.sql

{
  echo "-- Schema for every table the change-email cascade touches."
  echo "--"
  echo "-- Dumped from the running D1 database: the base schema predates"
  echo "-- packages/backend/migrations/ and lives only in the deployed database, so this"
  echo "-- fixture is how the test gets real column names, real UNIQUE constraints and"
  echo "-- real indexes instead of a hand-written approximation that could drift."
  echo "--"
  echo "-- Regenerate: pnpm --filter @repo/backend dump:email-cascade-schema"
  echo ""
  for t in "${TABLES[@]}"; do
    echo "-- ${t} ------------------------------------------------------------"
    sqlite3 "$DB" "SELECT sql || ';' FROM sqlite_master WHERE type='table' AND tbl_name='$t' AND sql IS NOT NULL;"
    sqlite3 "$DB" "SELECT sql || ';' FROM sqlite_master WHERE type='index' AND tbl_name='$t' AND sql IS NOT NULL;"
    echo ""
  done
} > "$OUT"

echo "Wrote $OUT ($(grep -c 'CREATE TABLE' "$OUT") tables)"
