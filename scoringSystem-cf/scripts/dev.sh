#!/bin/bash

# Development server startup script
# Automatically kills processes on ports 8787 and 5173 before starting
#
# Usage:
#   ./dev.sh              - Normal dev startup
#   ./dev.sh :sync-remote - Sync remote D1 to local before starting

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/packages/backend"

# Check for :sync-remote argument
SYNC_REMOTE=false
for arg in "$@"; do
  if [ "$arg" = ":sync-remote" ]; then
    SYNC_REMOTE=true
  fi
done

# Sync remote D1 and KV to local if requested
if [ "$SYNC_REMOTE" = true ]; then
  echo "🔪 Killing any existing wrangler processes..."
  pkill -f wrangler 2>/dev/null || true
  sleep 1

  cd "$BACKEND_DIR"

  # ===== Sync D1 Database =====
  echo "🔄 Syncing remote D1 database to local..."

  TEMP_SQL="/tmp/remote-d1-backup-$(date +%Y%m%d%H%M%S).sql"

  # Export remote D1
  echo "📥 Exporting remote D1..."
  if ! wrangler d1 export scoring-system-db --remote --output "$TEMP_SQL"; then
    echo "❌ Failed to export remote D1"
    exit 1
  fi

  echo "📦 Exported to $TEMP_SQL ($(du -h "$TEMP_SQL" | cut -f1))"

  # Filter out large log tables (eventlogs, sys_logs) to reduce size
  # Note: wrangler exports use quoted table names like INSERT INTO "eventlogs"
  echo "🔧 Filtering out log tables (eventlogs, sys_logs)..."
  FILTERED_SQL="/tmp/remote-d1-filtered-$(date +%Y%m%d%H%M%S).sql"
  grep -v 'INSERT INTO "eventlogs"' "$TEMP_SQL" | grep -v 'INSERT INTO "sys_logs"' > "$FILTERED_SQL"
  echo "📦 Filtered SQL: $(du -h "$FILTERED_SQL" | cut -f1) (was $(du -h "$TEMP_SQL" | cut -f1))"
  rm -f "$TEMP_SQL"
  TEMP_SQL="$FILTERED_SQL"

  # Clear ALL local wrangler state (D1, KV, DO, etc.)
  echo "🗑️  Clearing all local wrangler state..."
  rm -rf "$BACKEND_DIR/.wrangler/state/"

  # Import to local D1 using sqlite3 directly (bypasses wrangler batch bug)
  echo "📤 Importing to local D1..."

  # First, run a simple wrangler command to initialize the local D1 structure
  wrangler d1 execute scoring-system-db --local --command="SELECT 1" 2>/dev/null || true

  # Find the SQLite file
  LOCAL_DB=$(find "$BACKEND_DIR/.wrangler/state/v3/d1" -name "*.sqlite" 2>/dev/null | head -1)

  if [ -z "$LOCAL_DB" ]; then
    echo "❌ Could not find local D1 SQLite file"
    exit 1
  fi

  echo "📂 Found local DB: $LOCAL_DB"

  # Import using sqlite3 directly
  if ! sqlite3 "$LOCAL_DB" < "$TEMP_SQL"; then
    echo "❌ Failed to import to local D1"
    exit 1
  fi

  # Cleanup temp file
  rm -f "$TEMP_SQL"
  echo "✅ Remote D1 synced to local successfully!"

  # ===== Sync KV Namespaces =====
  echo ""
  echo "🔄 Syncing remote KV namespaces to local..."

  # Read KV_NAMESPACE_ID from .dev.vars
  DEV_VARS_FILE="$BACKEND_DIR/.dev.vars"
  KV_NAMESPACE_ID=""
  if [ -f "$DEV_VARS_FILE" ]; then
    KV_NAMESPACE_ID=$(grep '^KV_NAMESPACE_ID=' "$DEV_VARS_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi

  if [ -z "$KV_NAMESPACE_ID" ]; then
    echo "⚠️  KV_NAMESPACE_ID not found in .dev.vars, skipping KV sync"
  else
    # List all keys from remote KV
    echo "📋 Listing remote KV keys..."
    KEYS_JSON=$(wrangler kv key list --namespace-id="$KV_NAMESPACE_ID" --remote 2>/dev/null)

    if [ -n "$KEYS_JSON" ] && [ "$KEYS_JSON" != "[]" ]; then
      # Extract key names and sync each one
      KEYS=$(echo "$KEYS_JSON" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g')

      KEY_COUNT=$(echo "$KEYS" | wc -l)
      echo "📦 Found $KEY_COUNT keys to sync"

      for KEY in $KEYS; do
        echo "  ⬇️  Syncing: $KEY"
        # Get value from remote
        VALUE=$(wrangler kv key get "$KEY" --namespace-id="$KV_NAMESPACE_ID" --remote 2>/dev/null)
        # Put to local
        if [ -n "$VALUE" ]; then
          echo "$VALUE" | wrangler kv key put "$KEY" --namespace-id="$KV_NAMESPACE_ID" --local 2>/dev/null
        fi
      done

      echo "✅ Remote KV synced to local successfully!"
    else
      echo "ℹ️  No KV keys found in remote (or empty namespace)"
    fi
  fi

  echo ""
  cd "$PROJECT_ROOT"
fi

echo "🔍 Checking for processes on ports 8787 and 5173..."

# Kill backend (wrangler on port 8787)
BACKEND_PID=$(lsof -ti:8787 2>/dev/null)
if [ -n "$BACKEND_PID" ]; then
  echo "🔪 Killing backend process on port 8787 (PID: $BACKEND_PID)"
  kill -9 $BACKEND_PID 2>/dev/null
  sleep 1
fi

# Kill frontend (vite on port 5173)
FRONTEND_PID=$(lsof -ti:5173 2>/dev/null)
if [ -n "$FRONTEND_PID" ]; then
  echo "🔪 Killing frontend process on port 5173 (PID: $FRONTEND_PID)"
  kill -9 $FRONTEND_PID 2>/dev/null
  sleep 1
fi

echo "✅ Ports cleared, starting development servers..."
echo ""

# Start both frontend and backend in parallel
pnpm --parallel --filter "!@repo/shared" dev
