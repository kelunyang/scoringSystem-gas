/**
 * Backend type declarations for Hono RPC Client
 *
 * `AppType` 直接取自 backend 建置出來的型別宣告
 * （`packages/backend/dist/src/index.d.ts`，由 `tsc --build` 產生）。
 *
 * 這件事之所以以前做不到，不是因為 monorepo 設定或 .d.ts 會遺失 route
 * schema，而是因為 backend 的路由是用獨立述句註冊的：
 *
 *     const app = new Hono();
 *     app.route('/api/auth', authRouter);   // ← 回傳值被丟掉
 *
 * Hono 的 RPC 型別靠串接時累積在回傳值型別上，寫成述句時
 * `typeof app` 永遠是 `Hono<Env, BlankSchema, "/">`。2026-09-06 把
 * 22 個 router 共 267 個註冊全部改成串接式之後，schema 就出現了。
 * 完整脈絡見 plan/issue.md #011。
 *
 * **注意**：frontend 的 type-check 依賴 backend 先建置。
 * 根目錄的 `pnpm type-check` 會先跑 `tsc --build`（含 backend），
 * 單獨跑 frontend 時請先 `pnpm --filter @repo/backend build`。
 */

export type { AppType } from '@repo/backend';
