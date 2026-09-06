/**
 * Guard: every auth route that accepts a Turnstile token must verify it.
 *
 * `/auth/login-verify-password` — the login endpoint — declared
 * `turnstileToken` in its schema, the login form rendered a real widget, the
 * browser solved it and sent the token, and the handler then dropped it on the
 * floor. Five routes were in that state while Turnstile was switched on in
 * production, so the bot protection was decorative on exactly the paths that
 * needed it.
 *
 * The failure mode is silent: adding a route with a Turnstile-bearing schema
 * and forgetting the check looks identical to a protected one from the outside.
 * This test reads the router source and fails when the two drift apart.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROUTER = resolve(__dirname, '../src/router/auth.ts')
const SCHEMAS = resolve(__dirname, '../../shared/src/schemas/auth.ts')

/** Schemas that carry a Turnstile token, read from the shared schema source. */
function schemasWithTurnstile(): Set<string> {
  const src = readFileSync(SCHEMAS, 'utf-8')
  const found = new Set<string>()
  const re = /export const (\w+Schema)\s*=\s*z\.object\(\{([\s\S]*?)\n\}\);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    if (m[2].includes('TurnstileTokenSchema')) found.add(m[1])
  }
  return found
}

/** Every auth route, with the schema it validates and whether it verifies. */
function authRoutes(): Array<{ path: string; schema: string; verifies: boolean }> {
  const src = readFileSync(ROUTER, 'utf-8')
  // 路由是串接式的（`  .post(`），不是 `authRouter.post(`——
  // Hono 的 RPC 型別推導要求鏈式註冊，見 issue.md #011。
  const starts = [...src.matchAll(/^\s*\.(?:post|get)\(\s*\n?\s*'([^']+)'/gm)]

  return starts.flatMap((m, i) => {
    const from = m.index! + m[0].length
    const to = i + 1 < starts.length ? starts[i + 1].index! : src.length
    const body = src.slice(from, to)

    const schema = body.match(/zValidator\('json',\s*(\w+)/)?.[1]
    if (!schema) return []

    return [{
      path: m[1],
      schema,
      verifies: body.includes('verifyTurnstileMiddleware')
    }]
  })
}

describe('Turnstile coverage', () => {
  it('finds the schemas and routes it is meant to check', () => {
    // If the parsing breaks, the assertions below would pass vacuously.
    expect(schemasWithTurnstile().size).toBeGreaterThan(0)
    expect(authRoutes().length).toBeGreaterThan(0)
  })

  it('verifies the token on every route whose schema accepts one', () => {
    const turnstileSchemas = schemasWithTurnstile()

    const unverified = authRoutes()
      .filter(r => turnstileSchemas.has(r.schema) && !r.verifies)
      .map(r => `${r.path} (${r.schema})`)

    expect(
      unverified,
      `these routes accept a Turnstile token but never verify it: ${unverified.join(', ')}`
    ).toEqual([])
  })
})
