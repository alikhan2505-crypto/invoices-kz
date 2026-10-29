import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./instagramPublishToken', () => ({ loadPublishToken: async () => 'IGAA-secret-token' }))

import { getMediaInsights } from './instagram'

// Токен Instagram в запросах чтения идёт заголовком Authorization, не в адресе:
// URL попадает в логи прокси и платформы.
describe('getMediaInsights: токен только в заголовке', () => {
  const calls: { url: string; headers?: Record<string, string> }[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> | undefined })
      return { ok: true, status: 200, json: async () => ({ data: [{ name: 'reach', values: [{ value: 7 }] }] }) }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('адрес без access_token, заголовок Bearer', async () => {
    await getMediaInsights('1789')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://graph.instagram.com/v21.0/1789/insights?metric=reach,likes,comments,saved,shares')
    expect(calls[0].url).not.toContain('IGAA-secret-token')
    expect(calls[0].headers?.Authorization).toBe('Bearer IGAA-secret-token')
  })
})
