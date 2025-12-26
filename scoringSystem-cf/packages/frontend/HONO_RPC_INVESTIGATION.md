# Hono RPC Type Inference Investigation

**Date**: 2025-12-01
**Goal**: Enable full RPC type inference for frontend-backend communication
**Result**: ❌ Not feasible with current architecture
**Final Error Count**: 89 RPC-related errors remain

---

## Problem Statement

The frontend uses Hono's RPC client (`hc<AppType>()`) to call backend APIs with type safety. However, full type inference is impossible due to fundamental conflicts between DOM and Cloudflare Workers type environments.

### What We Want

```typescript
// Frontend code with full type inference
const client = hc<AppType>(baseUrl);
const result = await client.projects.list.$get();
//                          ^^^^^^^^ ^^^^  ^^^^ All fully typed!
```

### Current Reality

```typescript
// Frontend must use any
export type AppType = any; // ← No type inference
const client = hc<AppType>(baseUrl); // ← Returns generic ClientRequest
// No autocomplete, no type checking on API calls
```

---

## Root Cause Analysis

### The Type Chain

For Hono RPC to work, TypeScript must resolve this type chain:

```
AppType
  ↓ (must be)
typeof app
  ↓ (evaluates to)
Hono<{ Bindings: Env }, Schema, BasePath>
  ↓ (contains)
Env interface with D1Database, KVNamespace, R2Bucket
  ↓ (requires)
@cloudflare/workers-types
  ↓ (conflicts with)
Frontend's lib: ["DOM"]
```

### Why It Fails

1. **Mutually Exclusive Environments**:
   - Frontend: `lib: ["DOM"]` for browser APIs (window, document, etc.)
   - Backend: `types: ["@cloudflare/workers-types"]` for Workers APIs
   - TypeScript cannot compile code targeting BOTH environments

2. **Deep Type Dependencies**:
   - `typeof app` returns `Hono<{ Bindings: Env }, ...>`
   - `Env` interface contains:
     ```typescript
     interface Env {
       DB: D1Database;           // ← Workers-only
       CONFIG: KVNamespace;      // ← Workers-only
       R2_BUCKET: R2Bucket;      // ← Workers-only
     }
     ```
   - These types are NOT available in DOM environment

3. **TypeScript's All-or-Nothing Type Resolution**:
   - TypeScript cannot perform "partial" type inference
   - To infer `typeof app`, it must resolve ALL referenced types
   - Cannot selectively ignore `Env` while keeping `Schema`

---

## Attempted Solutions

### ❌ Solution 1: Module Declaration

**Attempt**:
```typescript
declare module '@repo/backend' {
  import type { Hono } from 'hono';
  export const app: Hono<any, any, any>;
  export type AppType = typeof app;
}
```

**Why It Failed**:
- Module declarations create "phantom types" without real type information
- Hono's `Client<T>` type transformer needs REAL type structure
- Result: `ClientRequest<{ [Method: $${Lowercase<string>}]: Endpoint }>` (generic, no routes)

### ❌ Solution 2: Type Erasure with Declaration Files

**Attempt**:
1. Generate backend declaration files: `tsc --declaration --emitDeclarationOnly`
2. Point frontend to `.d.ts` files instead of source
3. Enable `skipLibCheck` to ignore type errors in declarations
4. Import types from declaration files

**Why It Failed**:
- Even `.d.ts` files contain references to Workers types
- `skipLibCheck` only applies to `node_modules`, not project references
- Declaration files still require full type resolution for `typeof app`
- Example from `backend/dist/src/types.d.ts`:
  ```typescript
  export interface Env {
    DB: D1Database;  // ← Still here!
  }
  ```

### ❌ Solution 3: Hono's Client<T> Type Transformer

**Discovery**:
Hono provides a `Client<T>` type that extracts routes while ignoring Bindings:
```typescript
// From hono/dist/types/client/types.d.ts
export type Client<T> = T extends HonoBase<any, infer S, any>
  //                                        ^^^ Ignores Env!
  ? PathToChain<S> : never;
```

**Attempt**:
```typescript
import type { Client } from 'hono/dist/types/client/types';
import type { app } from '@repo/backend';
export type AppType = Client<typeof app>;
```

**Why It Failed**:
- Importing `app` from backend STILL requires compiling backend code
- Backend code contains Workers types that cannot compile in DOM environment
- The `Client<T>` transformation happens AFTER type resolution
- You can't transform types you can't import

### ❌ Solution 4: Direct Import with @ts-ignore

**Attempt**:
```typescript
// @ts-ignore - Suppress Workers errors
import type { app } from '@repo/backend';
export type AppType = Client<typeof app>;
```

**Why It Failed**:
- `@ts-ignore` only suppresses the NEXT line's errors
- Does not suppress errors in imported module's dependencies
- Backend's Workers types still cause compilation failure

---

## Why This Is An Architectural Problem

### The Design Flaw

Hono's `typeof app` intentionally includes the `Env` generic parameter to provide type safety for backend code:

```typescript
const app = new Hono<{ Bindings: Env }>();
app.get('/test', (c) => {
  c.env.DB.prepare('...');  // ← Fully typed!
});
```

This is GREAT for backend development, but it **leaks infrastructure details into the API contract**.

### Separation of Concerns Violation

The frontend shouldn't need to know about:
- Database implementation (D1, PostgreSQL, etc.)
- Cache implementation (KV, Redis, etc.)
- Storage implementation (R2, S3, etc.)

But Hono's type system forces the frontend to know about ALL of these because they're part of `typeof app`.

---

## Current Workaround

### Using `any` with Runtime Safety

```typescript
// backend.d.ts
export type AppType = any;  // ← Give up on type inference

// Runtime safety maintained through:
// 1. Zod validation on backend
// 2. Manual type definitions on frontend
// 3. TanStack Query for data fetching
```

### Benefits Still Achieved

✅ **Backend type safety**: Backend has FULL type safety (0 errors)
✅ **Shared types**: Entity types shared via `@repo/shared`
✅ **Zod schemas**: Shared validation ensures consistency
✅ **Manual frontend types**: Strong typing where needed
✅ **Runtime validation**: All requests validated by Zod

### Trade-offs

❌ **No autocomplete** for API calls
❌ **No compile-time** route checking
❌ **Manual maintenance** of frontend API types

---

## Future Solutions

These would require significant architecture changes:

### 1. Code Generation
Generate frontend types from backend routes at build time:
```bash
$ hono-codegen --input backend/src/index.ts --output frontend/src/types/api.ts
```
- ✅ Full type safety without cross-environment imports
- ❌ Requires custom build tooling
- ❌ Generated code maintenance

### 2. Environment-Agnostic Bindings Layer
Abstract Workers types behind interfaces:
```typescript
// Instead of:
interface Env { DB: D1Database }

// Use:
interface Env { DB: DatabaseInterface }
interface DatabaseInterface { query: (...) => Promise<any> }
```
- ✅ Frontend can import interface types
- ❌ Requires refactoring entire backend
- ❌ Loses Workers-specific type benefits

### 3. Migrate to tRPC or OpenAPI
Use frameworks with better cross-environment support:
- **tRPC**: Generates client types automatically, no environment conflicts
- **OpenAPI**: Generate types from schema, environment-agnostic
- ❌ Requires complete rewrite
- ❌ Loses Hono's simplicity

### 4. Separate Type-Only Package
Create `@repo/api-types` with pure TypeScript interfaces:
```
packages/
├── backend/          # Hono + Workers
├── frontend/         # Vue + DOM
└── api-types/        # Pure TS interfaces (no runtime code)
```
- ✅ No environment conflicts
- ❌ Manual maintenance of type/implementation sync
- ❌ Loses `typeof` inference benefits

---

## Recommendation

**For this project**: Keep using `any` with the current runtime safety measures.

**Reasoning**:
1. The monorepo structure still provides major benefits (shared types, Zod schemas)
2. Backend has full type safety where it matters most
3. Frontend type safety is achieved through manual definitions and TanStack Query
4. The effort to implement code generation or refactor to environment-agnostic bindings outweighs the benefits for this project size

**If you really need RPC type inference**:
Consider tRPC for your next project. It's designed specifically to solve this problem and has no environment conflicts.

---

## Technical Lessons Learned

1. **TypeScript's type system is all-or-nothing**: You cannot partially resolve types or selectively ignore parts of a type chain

2. **`typeof` crosses the compilation boundary**: Using `typeof` on imported code requires compiling that code's dependencies

3. **Declaration files are not magic**: `.d.ts` files still reference all their type dependencies

4. **`skipLibCheck` has limited scope**: Only applies to `node_modules`, not project references

5. **Framework type design matters**: Hono's `Env` generic parameter is great for server-side, but problematic for client-side type inference in monorepos

6. **Environment types are exclusive**: Cannot mix DOM and Workers types in same compilation unit

---

## Error Statistics

- **Starting point (previous session)**: 114 errors
- **After fixing non-RPC errors**: 89 errors (25 fixed)
- **All remaining 89 errors**: RPC type inference failures
- **Pattern**: `Property 'xxx' does not exist on type 'ClientRequest<...>'`

### Examples of Remaining Errors

```
src/components/GlobalAuthModal.vue(160,45): error TS2339: Property 'info' does not exist on type 'ClientRequest<...>'.
src/components/WalletNew.vue(1040,49): error TS2339: Property 'list' does not exist on type 'ClientRequest<...>'.
src/components/admin/SystemLogs.vue(512,48): error TS2339: Property 'system' does not exist on type 'ClientRequest<...>'.
```

All of these are because `AppType = any` causes `hc<AppType>()` to return a generic `ClientRequest` with no route-specific properties.

---

## Conclusion

Full Hono RPC type inference in a Cloudflare Workers + Vue monorepo is **fundamentally impossible** due to DOM vs Workers type environment conflicts. This is not a bug or configuration issue - it's an architectural limitation of combining these specific technologies.

The workaround (using `any`) is not ideal but is pragmatic given the project constraints. Runtime type safety is maintained through Zod validation and manual type definitions.

For future projects requiring full-stack type safety across different runtime environments, consider:
- **tRPC** (best for Node.js backends)
- **OpenAPI + codegen** (best for polyglot environments)
- **Environment-agnostic frameworks** (avoid runtime-specific types in API contracts)
