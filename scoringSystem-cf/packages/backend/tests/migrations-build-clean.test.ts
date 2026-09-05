/**
 * Guard: the migrations must build a working database from nothing, in order.
 *
 * They could not. Two numbering series had grown in parallel and collided on
 * 0001/0003/0004/0005/0006, so filename order — which is the order
 * `wrangler d1 migrations apply` uses — put `0001_add_aiservicecalls` and
 * `0003_add_totp_support` (both `ALTER TABLE users`) *before* the migration
 * that creates the users table. A clean `migrations apply` aborted on the first
 * ALTER, and nobody noticed because the running databases had been built by
 * hand instead.
 *
 * This runs the whole sequence against a fresh in-memory SQLite. It fails the
 * moment a new migration lands out of order, depends on a table created later,
 * or is simply invalid SQL.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from './mocks/d1-sqlite'

if (!hasNodeSqlite) {
  console.warn(`[skip] migrations-build-clean.test.ts: ${NODE_SQLITE_SKIP_REASON}`)
}

const MIGRATIONS = resolve(__dirname, '../migrations')

/** Migration files in the order wrangler applies them: by filename. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
}

describe.skipIf(!hasNodeSqlite)('migrations build a clean database', () => {
  it('has a strictly increasing, gap-free numbering', () => {
    // Duplicate prefixes are what let the two series interleave. A gap is
    // harmless to wrangler but usually means a file was deleted without
    // deciding what to do about the recorded name, so flag it too.
    const numbers = migrationFiles().map(f => Number(f.slice(0, 4)))

    expect(new Set(numbers).size, `duplicate prefixes: ${migrationFiles().join(', ')}`)
      .toBe(numbers.length)
    expect(numbers).toEqual([...Array(numbers.length)].map((_, i) => i + 1))
  })

  it('applies cleanly in filename order and produces the expected schema', () => {
    const files = migrationFiles()
    expect(files.length).toBeGreaterThan(5)

    // createSqliteD1 takes the schema as one script; concatenating in order is
    // exactly what applying them in sequence does.
    const combined = files
      .map(f => `-- ${f}\n${readFileSync(join(MIGRATIONS, f), 'utf-8')}`)
      .join('\n')

    const db = createSqliteD1(combined) as unknown as { _raw: any }

    const objects = db._raw
      .prepare(`SELECT type, name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ type: string; name: string }>

    const tables = objects.filter(o => o.type === 'table').map(o => o.name)
    const views = objects.filter(o => o.type === 'view').map(o => o.name)

    // The tables every later migration and most handlers depend on.
    for (const required of [
      'users', 'projects', 'stages', 'groups', 'usergroups', 'projectviewers',
      'globalgroups', 'globalusergroups', 'submissions', 'transactions',
      'comments', 'invitation_codes', 'sys_logs',
      // Added by migrations after the initial schema — their presence is what
      // proves the later files ran, not just the first one.
      'passkey_credentials', 'rate_limit_counters', 'totp_recovery_codes'
    ]) {
      expect(tables, `missing table: ${required}`).toContain(required)
    }

    for (const required of [
      'stages_with_status', 'submissions_with_status',
      'rankingproposals_with_status', 'invitation_codes_with_status'
    ]) {
      expect(views, `missing view: ${required}`).toContain(required)
    }
  })

  it('ends with every column the current handlers read', () => {
    const combined = migrationFiles()
      .map(f => readFileSync(join(MIGRATIONS, f), 'utf-8'))
      .join('\n')

    const db = createSqliteD1(combined) as unknown as { _raw: any }
    const columnsOf = (table: string) =>
      (db._raw.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as Array<{ name: string }>)
        .map(c => c.name)

    // One column from each migration that came after the initial schema, so a
    // dropped or reordered file shows up here rather than in production.
    expect(columnsOf('users')).toEqual(expect.arrayContaining([
      'totpSecret', 'passkeyEnabled', 'passwordChangedAt'
    ]))
    expect(columnsOf('two_factor_codes')).toEqual(expect.arrayContaining([
      'context', 'passwordVerified'
    ]))
    expect(columnsOf('stages')).toContain('pausedTime')
    expect(columnsOf('projects')).toContain('maxVoteResetCount')
    expect(columnsOf('rankingproposals')).toContain('withdrawnReason')
  })
})
