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

  it('logs the Graph status and error code (never the token or the id) when the lookup is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: { code: 10, type: 'OAuthException', message: 'Permission denied for TOKEN123' } }, false)))
    expect(await fetchInstagramUserHandle('17841400000000001', 'TOKEN123')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls[0].join(' ')
    expect(logged).toContain('10')
    expect(logged).toContain('OAuthException')
    expect(logged).not.toContain('TOKEN123')
    expect(logged).not.toContain('17841400000000001')
    warn.mockRestore()
  })

  it('caps a very long name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'я'.repeat(300) })))
    expect((await fetchInstagramUserHandle('17841400000000001', 'T'))?.length).toBe(80)
  })
})
