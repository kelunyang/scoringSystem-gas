/**
 * @fileoverview D1 Database proxy for sudo (impersonation) mode.
 *
 * Wraps a D1Database so that, while an Observer or Teacher is viewing the app
 * as a student, nothing can write. This is the safety net behind the path
 * whitelist in middleware/auth.ts — the whitelist decides which endpoints may
 * run at all, this makes sure a stray write inside an allowed endpoint still
 * cannot land.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not guess at the statement's SQL by reading undocumented runtime
 *   properties. The SQL is handed to `prepare()`, so it is captured there and
 *   threaded through `bind()`. An earlier version probed `stmt.statement ??
 *   stmt.sql` and *allowed the call* when neither was a string, which made the
 *   guard silently fail open on any D1 version that named the field
 *   differently.
 * - It does not block only `.run()`. D1 executes whatever statement it holds
 *   through `.first()`, `.all()` and `.raw()` just as happily, so blocking one
 *   method left the wrapper looking like a guarantee while being bypassable by
 *   a one-word change at the call site.
 */

/**
 * Error thrown when a write is attempted in sudo mode.
 *
 * `index.ts` maps this to a 403 with code SUDO_NO_WRITE.
 */
export class SudoWriteBlockedError extends Error {
  constructor(operation: string) {
    super(`SUDO_NO_WRITE: Operation '${operation}' is not allowed in sudo mode (read-only)`);
    this.name = 'SudoWriteBlockedError';
  }
}

/**
 * Is this the sudo read-only rejection?
 *
 * Handlers catch broadly, notice this one, and re-throw it so `index.ts` can
 * turn it into a 403 rather than swallowing it as a generic failure. Fifteen
 * of them had hand-written the same three-way check, each with its own
 * optional-chaining habits; this is that check.
 *
 * `instanceof` alone is not enough: the error crosses module boundaries
 * (and a Durable Object boundary) where the class identity can differ, which
 * is why the name and the message prefix are also accepted.
 */
export function isSudoWriteBlocked(error: unknown): boolean {
  if (error instanceof SudoWriteBlockedError) return true;
  if (error instanceof Error && error.name === 'SudoWriteBlockedError') return true;
  return error instanceof Error && error.message.includes('SUDO_NO_WRITE');
}

/**
 * Statement prefixes that only read.
 *
 * A whitelist, so anything unrecognised counts as a write. `WITH` is included
 * because common table expressions are the usual shape of the reporting
 * queries this app runs — note that SQLite also allows `WITH ... DELETE`, which
 * is why {@link isReadOnlySql} additionally rejects any statement containing a
 * mutating keyword.
 */
const READ_ONLY_PREFIXES = ['select', 'with', 'explain', 'pragma'];

/** Keywords that mutate, matched anywhere in the statement as whole words. */
const MUTATING_KEYWORDS = /\b(insert|update|delete|replace|drop|alter|create|truncate|attach|detach|vacuum|reindex)\b/i;

/**
 * Whether a statement is safe to execute in sudo mode.
 *
 * Both conditions must hold: it starts with a reading keyword, and it contains
 * no mutating keyword anywhere. The second check is what stops
 * `WITH x AS (...) DELETE FROM ...` and any `SELECT` with a mutating CTE.
 *
 * @param sql - The statement text as passed to `prepare()`
 * @returns true when the statement only reads
 *
 * @example
 * isReadOnlySql('SELECT 1')                       // true
 * isReadOnlySql('WITH t AS (SELECT 1) SELECT * FROM t')  // true
 * isReadOnlySql('WITH t AS (SELECT 1) DELETE FROM users') // false
 * isReadOnlySql('UPDATE users SET x = 1')         // false
 */
export function isReadOnlySql(sql: string): boolean {
  const normalised = sql.trim().toLowerCase();
  if (!READ_ONLY_PREFIXES.some(prefix => normalised.startsWith(prefix))) {
    return false;
  }
  return !MUTATING_KEYWORDS.test(normalised);
}

/**
 * Wrap a prepared statement so that executing it is refused unless its SQL only reads.
 *
 * @param stmt - The statement returned by `prepare()` or `bind()`
 * @param sql - The SQL that produced it, captured at `prepare()` time
 */
function createSudoSafeStatement(stmt: D1PreparedStatement, sql: string): D1PreparedStatement {
  const readOnly = isReadOnlySql(sql);

  return new Proxy(stmt, {
    get(target, prop: keyof D1PreparedStatement) {
      const value = target[prop];

      // Every method that can execute the statement.
      if (prop === 'run' || prop === 'first' || prop === 'all' || prop === 'raw') {
        const method = prop;
        return (...args: unknown[]) => {
          if (!readOnly) {
            throw new SudoWriteBlockedError(`D1PreparedStatement.${method}()`);
          }
          return (target[method] as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      // bind() returns a fresh statement; carry the SQL through so the copy is
      // judged by the same rule rather than falling back to "unknown".
      if (prop === 'bind') {
        return (...args: unknown[]) => {
          const bound = (target.bind as (...a: unknown[]) => D1PreparedStatement)(...args);
          return createSudoSafeStatement(bound, sql);
        };
      }

      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    }
  });
}

/**
 * Wrap a D1Database so writes are refused.
 *
 * IMPORTANT for callers: assign the result to a per-request copy of the
 * environment (`(c as any).env = { ...c.env, DB: createSudoSafeDB(c.env.DB) }`),
 * never to `c.env.DB`. In Workers the `env` object is shared by every request
 * an isolate handles, so mutating a binding on it leaks into concurrent and
 * subsequent requests.
 *
 * @param db - The real D1 binding
 * @returns A proxy that reads normally and throws {@link SudoWriteBlockedError} on writes
 *
 * @example
 * (c as any).env = { ...c.env, DB: createSudoSafeDB(c.env.DB) };
 */
export function createSudoSafeDB(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop: keyof D1Database) {
      const value = target[prop];

      if (prop === 'prepare') {
        return (sql: string) => createSudoSafeStatement(target.prepare(sql), sql);
      }

      // batch() is how transactions are written here, and exec() runs raw SQL.
      // Neither is worth allowing read-only variants of in an impersonation view.
      if (prop === 'batch') {
        return () => { throw new SudoWriteBlockedError('D1Database.batch()'); };
      }
      if (prop === 'exec') {
        return () => { throw new SudoWriteBlockedError('D1Database.exec()'); };
      }

      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    }
  });
}
