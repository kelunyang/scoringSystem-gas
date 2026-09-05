/**
 * Tests for the sudo read-only D1 proxy, against a real SQLite database.
 *
 * A mock that returns whatever the proxy expects would prove nothing here —
 * the question is whether a write actually reaches the database, so the tests
 * assert on the stored rows, not on call counts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../mocks/d1-sqlite'
import { createSudoSafeDB, SudoWriteBlockedError, isReadOnlySql } from '../../src/utils/sudo-db-proxy'

if (!hasNodeSqlite) {
  console.warn(`[skip] sudo-db-proxy.test.ts: ${NODE_SQLITE_SKIP_REASON}`)
}

const SCHEMA = `
  CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
  INSERT INTO notes (id, body) VALUES (1, 'original');
`

describe('isReadOnlySql', () => {
  it('accepts plain reads', () => {
    expect(isReadOnlySql('SELECT * FROM notes')).toBe(true)
    expect(isReadOnlySql('  select 1  ')).toBe(true)
    expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(true)
    expect(isReadOnlySql('PRAGMA table_info(notes)')).toBe(true)
  })

  it('accepts a read-only CTE', () => {
    expect(isReadOnlySql('WITH t AS (SELECT 1 AS n) SELECT n FROM t')).toBe(true)
  })

  it('rejects every mutating statement', () => {
    for (const sql of [
      'INSERT INTO notes (body) VALUES (?)',
      'UPDATE notes SET body = ?',
      'DELETE FROM notes',
      'REPLACE INTO notes VALUES (1, ?)',
      'DROP TABLE notes',
      'ALTER TABLE notes ADD COLUMN x TEXT',
      'CREATE TABLE t (a INT)'
    ]) {
      expect(isReadOnlySql(sql), sql).toBe(false)
    }
  })

  it('rejects a CTE that mutates — the case a prefix check alone would miss', () => {
    // SQLite allows WITH ... DELETE. Checking only the leading keyword would
    // let this through as a "read".
    expect(isReadOnlySql('WITH doomed AS (SELECT id FROM notes) DELETE FROM notes')).toBe(false)
  })

  it('treats anything unrecognised as a write', () => {
    expect(isReadOnlySql('')).toBe(false)
    expect(isReadOnlySql('BEGIN')).toBe(false)
    expect(isReadOnlySql('VACUUM')).toBe(false)
  })
})

describe.skipIf(!hasNodeSqlite)('createSudoSafeDB against a real database', () => {
  let real: D1Database
  let safe: D1Database

  beforeEach(() => {
    real = createSqliteD1(SCHEMA)
    safe = createSudoSafeDB(real)
  })

  const bodyOf = async (id: number) =>
    (await real.prepare('SELECT body FROM notes WHERE id = ?').bind(id).first<{ body: string }>())?.body

  it('lets reads through and returns real rows', async () => {
    const row = await safe.prepare('SELECT body FROM notes WHERE id = ?').bind(1).first<{ body: string }>()
    expect(row?.body).toBe('original')

    const all = await safe.prepare('SELECT * FROM notes').all()
    expect(all.results).toHaveLength(1)
  })

  it('blocks .run() and the row is unchanged', async () => {
    const stmt = safe.prepare('UPDATE notes SET body = ? WHERE id = ?').bind('hacked', 1)
    expect(() => stmt.run()).toThrow(SudoWriteBlockedError)
    expect(await bodyOf(1)).toBe('original')
  })

  it('blocks .first() on a write — the hole that existed when only .run() was guarded', async () => {
    const stmt = safe.prepare('UPDATE notes SET body = ? WHERE id = ?').bind('hacked', 1)
    expect(() => stmt.first()).toThrow(SudoWriteBlockedError)
    expect(await bodyOf(1)).toBe('original')
  })

  it('blocks .all() on a write', async () => {
    const stmt = safe.prepare('DELETE FROM notes').bind()
    expect(() => stmt.all()).toThrow(SudoWriteBlockedError)
    expect(await bodyOf(1)).toBe('original')
  })

  it('blocks .raw() on a write', async () => {
    const stmt = safe.prepare('INSERT INTO notes (body) VALUES (?)').bind('new')
    expect(() => stmt.raw()).toThrow(SudoWriteBlockedError)
    const count = await real.prepare('SELECT COUNT(*) AS n FROM notes').first<{ n: number }>()
    expect(count?.n).toBe(1)
  })

  it('blocks a write reached through repeated bind() calls', async () => {
    // bind() returns a new statement; the SQL must travel with it or the copy
    // would be judged "unknown" and let through.
    const stmt = safe.prepare('UPDATE notes SET body = ? WHERE id = ?').bind('a', 1).bind('b', 1)
    expect(() => stmt.run()).toThrow(SudoWriteBlockedError)
    expect(await bodyOf(1)).toBe('original')
  })

  it('blocks batch() and exec()', () => {
    expect(() => safe.batch([])).toThrow(SudoWriteBlockedError)
    expect(() => safe.exec('UPDATE notes SET body = "x"')).toThrow(SudoWriteBlockedError)
  })

  it('does not disturb the underlying binding — the real DB still writes', async () => {
    // The proxy must wrap, not mutate. If it replaced anything on `real`, the
    // unwrapped handle would stop working too.
    await real.prepare('UPDATE notes SET body = ? WHERE id = ?').bind('written', 1).run()
    expect(await bodyOf(1)).toBe('written')
  })
})
