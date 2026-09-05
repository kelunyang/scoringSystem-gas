/**
 * A D1 binding backed by a real in-memory SQLite database (`node:sqlite`).
 *
 * The regex-driven mock in ./d1-database.ts cannot express what the rate
 * limiter depends on — `INSERT ... ON CONFLICT DO UPDATE SET count = count +
 * excluded.count` — and a fake that always returns what the code expects would
 * test nothing. This runs the actual SQL, so upsert semantics, `RETURNING`,
 * and transaction behaviour in `batch()` are exercised for real.
 */

import { createRequire } from 'node:module';

/**
 * `node:sqlite` only exists on Node 22+ (package.json requires >=22), but pnpm
 * only WARNs on a version mismatch. A static import therefore threw at module
 * load on Node 20 and took three whole suites down with
 * "No such built-in module: node:sqlite" — the rate limiter, email budget and
 * change-email tests silently stopped running.
 *
 * Loading it lazily lets those suites report themselves as *skipped* on an old
 * Node instead of failing to load, which is visible rather than silent.
 */
const nodeRequire = createRequire(import.meta.url);

type DatabaseSyncCtor = new (path: string) => any;

/** The raw sqlite handle a test may reach for via `_raw`. */
export type RawSqlite = any;

let DatabaseSync: DatabaseSyncCtor | null = null;

/** Whether this Node build provides `node:sqlite`. Gate suites on it. */
export const hasNodeSqlite: boolean = (() => {
  try {
    DatabaseSync = nodeRequire('node:sqlite').DatabaseSync as DatabaseSyncCtor;
    return true;
  } catch {
    return false;
  }
})();

/** Message shown when a suite is skipped for lacking node:sqlite. */
export const NODE_SQLITE_SKIP_REASON =
  'requires node:sqlite (Node 22+); current Node is too old — run with Node 22 to exercise these';
import { readFileSync } from 'node:fs';

interface RunMeta {
  duration: number;
  changes: number;
  last_row_id: number;
  rows_read: number;
  rows_written: number;
  size_after: number;
  changed_db: boolean;
}

function meta(changes = 0, lastRowId = 0): RunMeta {
  return {
    duration: 0,
    changes,
    last_row_id: lastRowId,
    rows_read: 0,
    rows_written: changes,
    size_after: 0,
    changed_db: changes > 0
  };
}

/** SQLite rejects `undefined`; D1 treats a missing value as NULL. */
function normalise(values: unknown[]): unknown[] {
  return values.map(v => (v === undefined ? null : v));
}

/**
 * Wrap an in-memory SQLite database in the D1 interface.
 *
 * @param schemaSql - DDL to apply, e.g. the contents of a migration file
 * @returns A `D1Database` plus a `_raw` handle for direct assertions
 *
 * @example
 * const db = createSqliteD1(readFileSync('migrations/0006_...sql', 'utf-8'));
 */
export function createSqliteD1(schemaSql: string): D1Database & { _raw: RawSqlite } {
  if (!DatabaseSync) {
    throw new Error(`createSqliteD1 ${NODE_SQLITE_SKIP_REASON}`);
  }
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schemaSql);

  /** Serialises batch() calls, see the comment in batch() below. */
  let batchQueue: Promise<void> = Promise.resolve();

  function makeStatement(sql: string, bound: unknown[] = []): D1PreparedStatement {
    const statement = {
      bind(...values: unknown[]) {
        return makeStatement(sql, normalise(values));
      },

      async first<T = unknown>(column?: string): Promise<T | null> {
        const row = sqlite.prepare(sql).get(...(bound as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        return (column ? (row[column] as T) : (row as T));
      },

      async all<T = unknown>() {
        const rows = sqlite.prepare(sql).all(...(bound as never[])) as T[];
        return { results: rows, success: true, meta: meta() };
      },

      async run() {
        const result = sqlite.prepare(sql).run(...(bound as never[]));
        return {
          results: [],
          success: true,
          meta: meta(Number(result.changes), Number(result.lastInsertRowid))
        };
      },

      async raw<T = unknown>(): Promise<T[]> {
        const rows = sqlite.prepare(sql).all(...(bound as never[])) as Record<string, unknown>[];
        return rows.map(r => Object.values(r)) as T[];
      }
    };

    return statement as unknown as D1PreparedStatement;
  }

  const db = {
    prepare: (sql: string) => makeStatement(sql),

    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      // D1 runs a batch as one transaction, and serialises batches against
      // each other. node:sqlite is a single synchronous connection, so
      // overlapping batches would otherwise try to nest BEGIN — chain them.
      const run = async () => {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) {
            results.push(await (statement as unknown as { run(): Promise<unknown> }).run());
          }
          sqlite.exec('COMMIT');
          return results as D1Result<T>[];
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      };

      const queued = batchQueue.then(run, run);
      // Keep the chain alive even if this batch rejected.
      batchQueue = queued.then(() => undefined, () => undefined);
      return queued;
    },

    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },

    withSession() {
      throw new Error('withSession is not supported by the test D1 adapter');
    },

    dump() {
      throw new Error('dump is not supported by the test D1 adapter');
    },

    _raw: sqlite
  };

  return db as unknown as D1Database & { _raw: RawSqlite };
}

/**
 * Build a test D1 preloaded with a migration file.
 *
 * @param migrationPath - Path to a .sql migration, relative to the cwd
 */
export function createD1FromMigration(migrationPath: string) {
  return createSqliteD1(readFileSync(migrationPath, 'utf-8'));
}
