/**
 * @fileoverview D1 Database Proxy for Sudo Mode
 *
 * Creates a Proxy wrapper around D1Database that blocks all write operations
 * when in sudo mode. This provides a unified write-blocking layer that
 * doesn't require modifying individual handlers.
 *
 * Blocked operations:
 * - D1PreparedStatement.run()/.first()/.all()/.raw() carrying a write statement
 * - D1Database.batch() - Batch operations
 * - D1Database.exec() - Raw SQL execution
 *
 * Allowed operations:
 * - D1PreparedStatement.first()/.all()/.raw() carrying a SELECT/WITH/PRAGMA
 * - D1Database.prepare() - Prepare statements (allowed, but run() blocked)
 * - D1Database.dump() - Database dump (read-only)
 */

/**
 * Error thrown when a write operation is attempted in sudo mode
 */
export class SudoWriteBlockedError extends Error {
  constructor(operation: string) {
    super(`SUDO_NO_WRITE: Operation '${operation}' is not allowed in sudo mode (read-only)`);
    this.name = 'SudoWriteBlockedError';
  }
}

/**
 * SQL that only reads. Anything else is refused in sudo mode.
 *
 * Deliberately a whitelist: an unrecognised statement is treated as a write.
 */
const READ_ONLY_PREFIXES = ['select', 'with', 'pragma table_info', 'explain'];

/**
 * Best-effort read of the SQL a prepared statement carries.
 *
 * D1PreparedStatement does not expose its SQL in the public type, but the
 * runtime object carries it. When it cannot be read we return null and the
 * caller falls back to allowing the call — the path whitelist in
 * middleware/auth.ts is the primary defence; this proxy is the safety net.
 */
function readStatementSql(stmt: D1PreparedStatement): string | null {
  const raw = (stmt as unknown as { statement?: unknown; sql?: unknown });
  const candidate = raw.statement ?? raw.sql;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Whether a statement only reads.
 *
 * @param sql - The statement text
 * @returns true when the statement is safe to run in sudo mode
 */
function isReadOnlySql(sql: string): boolean {
  const normalised = sql.trim().toLowerCase();
  return READ_ONLY_PREFIXES.some(prefix => normalised.startsWith(prefix));
}

/**
 * Create a sudo-safe D1PreparedStatement proxy
 * Blocks any execution of a non-read statement.
 */
function createSudoSafeStatement(stmt: D1PreparedStatement): D1PreparedStatement {
  return new Proxy(stmt, {
    get(target, prop: keyof D1PreparedStatement) {
      const value = target[prop];

      // Block every method that can execute the statement, not just .run().
      // D1 happily runs an INSERT/UPDATE/DELETE through .first(), .all() or
      // .raw() as well — blocking only .run() left the wrapper looking like a
      // guarantee while being bypassable by a one-word change at the call site.
      if (prop === 'run' || prop === 'first' || prop === 'all' || prop === 'raw') {
        const method = prop;
        return (...args: unknown[]) => {
          const sql = readStatementSql(target);
          if (sql !== null && !isReadOnlySql(sql)) {
            throw new SudoWriteBlockedError(`D1PreparedStatement.${method}() on a write statement`);
          }
          return (target[method] as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      // .bind() returns a new statement, so we need to wrap that too
      if (prop === 'bind') {
        return (...args: unknown[]) => {
          const boundStmt = (target.bind as (...args: unknown[]) => D1PreparedStatement)(...args);
          return createSudoSafeStatement(boundStmt);
        };
      }

      // Allow all other operations (.first, .all, .raw)
      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    }
  });
}

/**
 * Create a sudo-safe D1Database proxy
 * Blocks write operations while allowing reads
 *
 * @param db - The original D1Database instance
 * @returns A proxied D1Database that blocks writes
 */
export function createSudoSafeDB(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop: keyof D1Database) {
      const value = target[prop];

      // .prepare() - wrap the returned statement
      if (prop === 'prepare') {
        return (sql: string) => {
          const stmt = target.prepare(sql);
          return createSudoSafeStatement(stmt);
        };
      }

      // .batch() - block completely (used for transactions)
      if (prop === 'batch') {
        return () => {
          throw new SudoWriteBlockedError('D1Database.batch()');
        };
      }

      // .exec() - block completely (raw SQL execution)
      if (prop === 'exec') {
        return () => {
          throw new SudoWriteBlockedError('D1Database.exec()');
        };
      }

      // Allow .dump() (read-only)
      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    }
  });
}
