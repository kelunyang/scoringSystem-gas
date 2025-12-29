/**
 * Backend type declarations for Hono RPC Client
 *
 * CURRENT STATUS: Using `any` as workaround
 *
 * ROOT CAUSE: Hono's RPC type inference requires `typeof app` which captures
 * all route definitions through method chaining (app.route(), app.get(), etc.).
 * However, when TypeScript emits declaration files (.d.ts), this type information
 * is lost - the app type becomes `Hono<{ Bindings: Env }, BlankSchema, "/">`.
 *
 * ATTEMPTED SOLUTIONS:
 * 1. Direct import from backend - TypeScript tries to compile entire backend tree
 * 2. TypeScript Project References - Declaration files lose route schema information
 * 3. @cloudflare/workers-types in frontend - Helps with bindings but not route types
 *
 * ALTERNATIVE APPROACHES (require architecture changes):
 * - @hono/zod-openapi: Define routes with Zod schemas that can be shared
 * - Manual typed API wrappers: Define typed functions for each endpoint
 *
 * Runtime type safety is maintained through:
 * - Zod validation on backend (all inputs validated)
 * - TanStack Query for data fetching (handles response states)
 * - Manual type definitions in composables where needed
 */

export type AppType = any;
