/**
 * @fileoverview fetchWithAuth 的錯誤要帶出後端的 message 與 code
 *
 * 舊寫法把 throw 放在解析 JSON 的 try 裡，被同一個 catch 接走，
 * 所有 4xx 都變成 "API request failed with status 400"——管理員只看到
 * 「API 400」，分不出是驗證失敗還是帳號根本沒被鎖。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ApiRequestError, fetchWithAuth } from '../api-helpers'

function mockFetch(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } }))
  )
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('預期要拋錯，結果沒有')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithAuth 錯誤處理', () => {
  it('4xx 時帶出後端的 message、code 與狀態碼', async () => {
    mockFetch(400, JSON.stringify({
      success: false,
      error: { code: 'USER_NOT_LOCKED', message: 'User is not currently locked' }
    }))

    const error = await catchError(fetchWithAuth('/api/admin/users/unlock', { body: {} }))

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      message: 'User is not currently locked',
      code: 'USER_NOT_LOCKED',
      status: 400
    })
  })

  it('回應不是 JSON 時退回狀態碼訊息', async () => {
    mockFetch(502, '<html>Bad Gateway</html>', 'text/html')

    const error = await catchError(fetchWithAuth('/api/anything'))

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      message: 'API request failed with status 502',
      code: undefined,
      status: 502
    })
  })

  it('2xx 照常回傳 JSON', async () => {
    mockFetch(200, JSON.stringify({ success: true, data: 1 }))

    await expect(fetchWithAuth('/api/anything')).resolves.toEqual({ success: true, data: 1 })
  })
})
