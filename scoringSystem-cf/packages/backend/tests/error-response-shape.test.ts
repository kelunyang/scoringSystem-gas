/**
 * Guard: every error response body has the same shape.
 *
 * The API emitted two incompatible error shapes:
 *
 *   handlers, via errorResponse()   { success: false, error: { code, message } }
 *   router permission guards        { success: false, error: '訊息', errorCode: 'CODE' }
 *
 * 112 router sites used the second. Neither side of the frontend could be
 * right about both: `response.error?.message` silently yields undefined for a
 * guard rejection (the real reason for a 403 is dropped, the user sees
 * 「未知錯誤」), while `'失敗：' + response.error` yields
 * 「失敗：[object Object]」 for a handler rejection. Ten user-facing sites had
 * the second bug; two composables had already grown defensive
 * `response.error?.code || response.errorCode` reads instead of fixing it.
 *
 * A shape this split cannot be typed honestly, which is what blocked the
 * `any` cleanup in types/api.ts — hence pinning it here.
 *
 * Grep tests rather than behavioural ones: the defect is a response body
 * written by hand instead of by the helper, which throws no error and passes
 * every existing test.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE } from '../src/utils/response'

const SRC = resolve(__dirname, '../src')

/** Every .ts file under src/. */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

/**
 * `return c.json({ ... }, <status>)` blocks that carry `success: false`,
 * with the literal error string and error code they name.
 */
function handWrittenErrorBodies(src: string): Array<{
  line: number
  status: number
  code: string | null
  message: string
}> {
  const found: Array<{ line: number; status: number; code: string | null; message: string }> = []

  for (const m of src.matchAll(/return c\.json\(\s*\{(.{0,800}?)\}\s*,\s*(\d+)\s*\)\s*;/gs)) {
    const body = m[1]
    if (!body.includes('success: false')) continue

    // `error:` 後面第一個非空白字元是 `{` 才是正確形狀。
    // 只比對單引號字串會漏掉樣板字串（`...`）、三元運算式、
    // 以及 `error: someVariable`——2026-09-06 就是這樣漏掉 13 處。
    const errorValue = body.match(/error:\s*([\s\S]{0,60})/)
    if (!errorValue) continue
    if (errorValue[1].trimStart().startsWith('{')) continue

    const code = body.match(/(?:errorCode|code):\s*'([^']*)'/)
    found.push({
      line: src.slice(0, m.index!).split('\n').length,
      status: Number(m[2]),
      code: code ? code[1] : null,
      message: errorValue[1].split('\n')[0].trim()
    })
  }

  return found
}

describe('API 錯誤回應形狀', () => {
  const files = sourceFiles()

  it('每個錯誤回應的 error 都是 { code, message } 物件，不是字串', () => {
    const offenders = files.flatMap(file =>
      handWrittenErrorBodies(readFileSync(file, 'utf-8')).map(
        ({ line, code, message }) =>
          `${relative(SRC, file)}:${line} error: '${message}' (${code ?? 'no code'})`
      )
    )

    expect(offenders).toEqual([])
  })

  it('getHttpStatus 認得每一個實際被使用的錯誤碼', () => {
    // getHttpStatus falls back to 500 for codes it does not know, so an
    // unlisted code silently turns a 400, a 403 or a 404 into a 500. Every
    // code the codebase passes to errorResponse() must be in the table —
    // membership, not the resulting status, is the thing to check: 500 is
    // both the fallback and a legitimate answer, so comparing statuses
    // cannot tell a deliberate 500 from a forgotten entry.
    const used = new Set<string>()

    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      for (const m of src.matchAll(/errorResponse\(\s*'([A-Z_]+)'/g)) used.add(m[1])
      for (const m of src.matchAll(/ERROR_CODES\.([A-Z_]+)/g)) used.add(m[1])
    }

    expect(used.size).toBeGreaterThan(20)

    const unmapped = [...used].filter(code => !(code in HTTP_STATUS_BY_ERROR_CODE)).sort()

    expect(unmapped).toEqual([])
  })

  it('每個 ERROR_CODES 常數都在狀態表裡', () => {
    const missing = Object.values(ERROR_CODES)
      .filter(code => !(code in HTTP_STATUS_BY_ERROR_CODE))
      .sort()

    expect(missing).toEqual([])
  })
})
