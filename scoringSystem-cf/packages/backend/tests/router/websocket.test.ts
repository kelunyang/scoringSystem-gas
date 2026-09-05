/**
 * Auth boundary tests for the WebSocket upgrade endpoint.
 *
 * `packages/security-tests/tests/test_websocket.py` was supposed to cover this
 * and never did: it connected to `/ws/notifications`, which does not exist, so
 * every connection 404'd and the suite reported "skipped" rather than
 * "failing". Those tests also wrap each attempt in `pytest.skip(...)` on
 * failure, so they cannot go red even with the path fixed.
 *
 * These run in-process against the real router, so they can actually fail.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import websocketRouter from '../../src/router/websocket'
import { generateToken } from '../../src/handlers/auth/jwt'
import type { Env } from '../../src/types'

const SECRET = 'test-jwt-secret-value-long-enough'

/** Records which Durable Object id the router asked for. */
function envWithHubSpy() {
  const requested: string[] = []

  const env = {
    JWT_SECRET: SECRET,
    NOTIFICATION_HUB: {
      idFromName(name: string) {
        requested.push(name)
        return { toString: () => `do-${name}` }
      },
      get() {
        return {
          // A real hub answers 101 Switching Protocols, but the Response
          // constructor rejects any status outside 200-599, so the stub uses a
          // distinguishable 200 to mean "the router handed the connection over".
          fetch: async () => new Response('handed-to-hub', { status: 200 })
        }
      }
    }
  } as unknown as Env

  return { env, requested }
}

describe('GET /ws — the upgrade endpoint', () => {
  let app: Hono<{ Bindings: Env }>
  let env: Env
  let requested: string[]

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>()
    app.route('/ws', websocketRouter)
    const spy = envWithHubSpy()
    env = spy.env
    requested = spy.requested
  })

  const upgrade = (headers: Record<string, string> = {}, query = '') =>
    app.request(`/ws${query}`, { headers: { Upgrade: 'websocket', ...headers } }, env)

  it('refuses a plain GET that is not an upgrade', async () => {
    const res = await app.request('/ws', {}, env)
    expect(res.status).toBe(426)
    expect((await res.json() as any).error.code).toBe('NOT_WEBSOCKET')
  })

  it('refuses an upgrade with no token', async () => {
    const res = await upgrade()
    expect(res.status).toBe(401)
    expect((await res.json() as any).error.code).toBe('NO_TOKEN')
  })

  it('refuses a token signed with a different secret', async () => {
    const foreign = await generateToken('usr_1', 'a@example.invalid', 'a-completely-different-secret')
    const res = await upgrade({}, `?token=${foreign}`)
    expect(res.status).toBe(401)
    expect((await res.json() as any).error.code).toBe('AUTH_FAILED')
  })

  it('refuses a malformed token', async () => {
    const res = await upgrade({}, '?token=not.a.jwt')
    expect(res.status).toBe(401)
  })

  it('refuses an expired token', async () => {
    // generateToken takes a lifetime in ms; a negative one is already past.
    const expired = await generateToken('usr_1', 'a@example.invalid', SECRET, -60_000)
    const res = await upgrade({}, `?token=${expired}`)
    expect(res.status).toBe(401)
    expect((await res.json() as any).error.code).toBe('AUTH_FAILED')
  })

  it('accepts a valid token from the query string', async () => {
    // The browser WebSocket API cannot set headers, so the query parameter is
    // the only option here — unlike the REST endpoints, where it was removed.
    const token = await generateToken('usr_valid', 'a@example.invalid', SECRET)
    const res = await upgrade({}, `?token=${token}`)
    expect(await res.text()).toBe('handed-to-hub')
  })

  it('accepts a valid token from the Authorization header', async () => {
    const token = await generateToken('usr_valid', 'a@example.invalid', SECRET)
    const res = await upgrade({ Authorization: `Bearer ${token}` })
    expect(await res.text()).toBe('handed-to-hub')
  })

  it('routes the connection to the hub belonging to the token owner', async () => {
    // The isolation guarantee: a session reaches its own user's Durable Object
    // and no one else's, chosen from the verified payload rather than any
    // client-supplied field.
    const token = await generateToken('usr_alice', 'alice@example.invalid', SECRET)
    await upgrade({}, `?token=${token}`)
    expect(requested).toEqual(['usr_alice'])
  })

  it('cannot be pointed at another user by adding a userId parameter', async () => {
    const token = await generateToken('usr_alice', 'alice@example.invalid', SECRET)
    await upgrade({}, `?token=${token}&userId=usr_bob`)
    expect(requested).toEqual(['usr_alice'])
  })
})

describe('GET /ws/status', () => {
  it('reports service health without requiring a token', async () => {
    const app = new Hono<{ Bindings: Env }>()
    app.route('/ws', websocketRouter)

    const res = await app.request('/ws/status', {}, envWithHubSpy().env)
    expect(res.status).toBe(200)
    expect((await res.json() as any).success).toBe(true)
  })
})
