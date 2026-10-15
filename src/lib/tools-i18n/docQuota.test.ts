import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimDocSlot, parseDocQuota } from './docQuota'

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => { vi.unstubAllGlobals() })

describe('parseDocQuota', () => {
  it('reads the server quota and rejects anything else', () => {
    expect(parseDocQuota({ remaining: 2, limit: 3, resetsAt: '2027-01-01' })).toEqual({ remaining: 2, limit: 3, resetsAt: '2027-01-01' })
    expect(parseDocQuota({ remaining: 1, resetsAt: '2027-01-01' })).toEqual({ remaining: 1, limit: 3, resetsAt: '2027-01-01' })
    expect(parseDocQuota({ remaining: -1, limit: 3, resetsAt: '2027-01-01' })?.remaining).toBe(0)
    expect(parseDocQuota({ error: 'unavailable' })).toBeNull()
    expect(parseDocQuota(null)).toBeNull()
  })
})

describe('claimDocSlot', () => {
  it('posts the tool and returns the new quota on success', async () => {
    const fetchMock = vi.fn(() => json(200, { ok: true, remaining: 1, limit: 3, resetsAt: '2027-01-01' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await claimDocSlot('avr')).toEqual({ kind: 'ok', quota: { remaining: 1, limit: 3, resetsAt: '2027-01-01' } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/tools/doc-quota')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ tool: 'avr' })
  })

  it('reports the quarter limit on 429 limit', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(429, { error: 'limit', remaining: 0, limit: 3, resetsAt: '2027-01-01' })))
    expect(await claimDocSlot('schet')).toEqual({ kind: 'limit', quota: { remaining: 0, limit: 3, resetsAt: '2027-01-01' } })
  })

  it('treats 503, other errors and network failures as "do not generate"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(503, { error: 'unavailable' })))
    expect(await claimDocSlot('nakladnaya')).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', vi.fn(() => json(429, { error: 'rate_limited' })))
    expect(await claimDocSlot('nakladnaya')).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await claimDocSlot('nakladnaya')).toEqual({ kind: 'error' })
  })
})
