/**
 * Backend type declarations for Hono RPC Client
 *
 * CURRENT STATUS: Using any as workaround
 *
 * The root issue is that Hono's RPC type inference requires `typeof app`,
 * but the app type includes Cloudflare Workers bindings (D1Database, KVNamespace, etc.)
 * which cannot compile in a DOM environment.
 *
 * Attempted solutions:
 * 1. Module declaration - Failed: No real type info for Client<T> to transform
 * 2. Direct import with @ts-ignore - Failed: Can't selectively ignore Workers types
 * 3. Declaration files - Failed: .d.ts still contains Workers type references
 *
 * Runtime type safety is maintained through:
 * - Zod validation on backend
 * - TanStack Query for data fetching
 * - Manual type definitions where needed
 */

export type AppType = any;
