import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchInstagramUserHandle } from './instagramProfile'

const okJson = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response

afterEach(() => { vi.unstubAllGlobals() })

describe('fetchInstagramUserHandle', () => {
  it('returns the username and sends the token in a header, not in the URL', async () => {
    const fetchMock = vi.fn(async () => okJson({ username: ' aigerim.kz ', name: 'Айгерим' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchInstagramUserHandle('17841400000000001', 'TOKEN')).toBe('aigerim.kz')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.instagram.com/v21.0/17841400000000001?fields=name,username')
    expect(url).not.toContain('TOKEN')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
  })

  it('falls back to the profile name when there is no username', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'Айгерим' })))
    expect(await fetchInstagramUserHandle('17841400000000001', 'T')).toBe('Айгерим')
  })

  it('returns null on a Graph error, a thrown fetch, an empty profile or a bad id, and never calls the network for a bad id', async () => {
    const fetchMock = vi.fn(async () => okJson({ error: { message: 'no permission' } }, false))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchInstagramUserHandle('17841400000000001', 'T')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    expect(await fetchInstagramUserHandle('17841400000000001', 'T')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => okJson({})))
    expect(await fetchInstagramUserHandle('17841400000000001', 'T')).toBeNull()
    const never = vi.fn()
    vi.stubGlobal('fetch', never)
    expect(await fetchInstagramUserHandle('../../me', 'T')).toBeNull()
    expect(await fetchInstagramUserHandle('17841400000000001', '')).toBeNull()
    expect(never).not.toHaveBeenCalled()
  })

  it('caps a very long name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'я'.repeat(300) })))
    expect((await fetchInstagramUserHandle('17841400000000001', 'T'))?.length).toBe(80)
  })
})
