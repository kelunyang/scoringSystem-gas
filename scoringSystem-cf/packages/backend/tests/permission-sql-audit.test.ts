/**
 * Guard: every query that reads a global permission must filter on both
 * isActive flags.
 *
 * `globalusergroups` says who is in a group; `globalgroups` holds the
 * permissions and its own isActive. A query that joins them to read
 * `globalPermissions` and checks only `gug.isActive` still grants everything a
 * *deactivated group* confers — deactivating the group does nothing.
 *
 * Three copies of this query had that shape (`projects/list.ts` checkSystemAdmin
 * had neither flag; `submissions/manage.ts` and `submissions/versions.ts` had
 * only the membership one), while `utils/permissions.ts` had always filtered on
 * both. Issue #005 counts 153 hand-written permission queries across the
 * handlers and notes the error rate was unknown; this pins the rule for the
 * class of query where getting it wrong grants access.
 *
 * A grep test rather than a behavioural one because the defect is a missing
 * clause: it produces no error, just a wider answer.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const SRC = resolve(__dirname, '../src')

/** Every .ts file under src/. */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

/** Template literals in a file, with the line each starts on. */
function templateLiterals(src: string): Array<{ sql: string; line: number }> {
  return [...src.matchAll(/`([^`]*)`/g)].map(m => ({
    sql: m[1],
    line: src.slice(0, m.index!).split('\n').length
  }))
}

describe('permission SQL', () => {
  const files = sourceFiles()

  it('finds the queries it is meant to check', () => {
    const total = files
      .flatMap(f => templateLiterals(readFileSync(f, 'utf-8')))
      .filter(({ sql }) => /FROM\s+globalusergroups/i.test(sql))
    expect(total.length).toBeGreaterThan(10)
  })

  it('filters on both isActive flags wherever it reads globalPermissions', () => {
    const offenders: string[] = []

    for (const file of files) {
      const src = readFileSync(file, 'utf-8')

      for (const { sql, line } of templateLiterals(src)) {
        // Only queries that both join the two tables and read the permissions
        // column can leak a deactivated group's rights.
        const joinsBoth = /FROM\s+globalusergroups/i.test(sql) && /JOIN\s+globalgroups/i.test(sql)
        const readsPermissions = /globalPermissions/i.test(sql)

        // A listing that also selects the group's own isActive is showing the
        // rows to a human, not deciding with them — admin/users.ts
        // getUserGlobalGroups lists deactivated groups on purpose.
        const surfacesGroupState = /\bisActive\s+AS\s+\w*IsActive/i.test(sql)

        if (!joinsBoth || !readsPermissions || surfacesGroupState) continue

        // Aliases vary across the codebase (`gug`/`gg`, `gu`/`g`, `ug`/`gg`),
        // so match on which table each alias was bound to rather than on the
        // alias spelling.
        const aliasOf = (table: string) =>
          new RegExp(`(?:FROM|JOIN)\\s+${table}\\s+(?:AS\\s+)?(\\w+)`, 'i').exec(sql)?.[1]

        const membershipAlias = aliasOf('globalusergroups')
        const groupAlias = aliasOf('globalgroups')

        const filtersOn = (alias: string | undefined) =>
          Boolean(alias) && new RegExp(`\\b${alias}\\.isActive\\s*=\\s*1`, 'i').test(sql)

        const membershipFiltered = filtersOn(membershipAlias)
        const groupFiltered = filtersOn(groupAlias)

        if (!membershipFiltered || !groupFiltered) {
          const missing = [
            membershipFiltered ? null : 'membership isActive',
            groupFiltered ? null : 'group isActive'
          ].filter(Boolean).join(' + ')
          offenders.push(`${relative(SRC, file)}:${line} (missing ${missing})`)
        }
      }
    }

    expect(offenders, `queries reading globalPermissions without both isActive filters:\n${offenders.join('\n')}`).toEqual([])
  })
})
