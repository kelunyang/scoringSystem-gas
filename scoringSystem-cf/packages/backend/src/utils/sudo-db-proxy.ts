/**
 * @fileoverview D1 Database Proxy for Sudo Mode
 *
 * Creates a Proxy wrapper around D1Database that blocks all write operations
 * when in sudo mode. This provides a unified write-blocking layer that
 * doesn't require modifying individual handlers.
 *
 * Blocked operations:
 * - D1PreparedStatement.run() - INSERT, UPDATE, DELETE
 * - D1Database.batch() - Batch operations
 * - D1Database.exec() - Raw SQL execution
 *
 * Allowed operations:
 * - D1PreparedStatement.first() - SELECT single row
 * - D1PreparedStatement.all() - SELECT multiple rows
 * - D1PreparedStatement.raw() - Raw SELECT results
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
 * Create a sudo-safe D1PreparedStatement proxy
 * Blocks .run() but allows .first(), .all(), .raw()
 */
function createSudoSafeStatement(stmt: D1PreparedStatement): D1PreparedStatement {
  return new Proxy(stmt, {
    get(target, prop: keyof D1PreparedStatement) {
      const value = target[prop];

      // Block .run() - this is used for INSERT, UPDATE, DELETE
      if (prop === 'run') {
        return () => {
          throw new SudoWriteBlockedError('D1PreparedStatement.run()');
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

/**
 * Check if a request is in sudo mode based on headers
 */
export function isSudoRequest(request: Request): { isSudo: boolean; sudoAs?: string; projectId?: string } {
  const sudoAs = request.headers.get('X-Sudo-As');
  const projectId = request.headers.get('X-Sudo-Project');

  if (sudoAs && projectId) {
    return { isSudo: true, sudoAs, projectId };
  }

  return { isSudo: false };
}
