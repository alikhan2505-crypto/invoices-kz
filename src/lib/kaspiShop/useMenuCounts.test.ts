import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The hook module keeps module-level state (cache, in-flight request,
// generation), so each test loads a fresh copy and mocks supabase + fetch.
const sessionMock = { user: { id: 'u1' }, access_token: 'tok' }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sessionMock } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_admin: true }, error: null }) }) }),
    }),
  },
}))

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('menu counts store (refreshMenuCounts)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dedupes parallel refreshes into one request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ orders: 5, refunds: 0, pendingProducts: 2, sessionExpired: false }))
    const mod = await import('./useMenuCounts')
    await Promise.all([mod.refreshMenuCounts(), mod.refreshMenuCounts(), mod.refreshMenuCounts()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/kaspi-shop/menu-counts')
  })

  it('does not refetch within 60 s, refetches after, and force always refetches', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ orders: 1, refunds: 1, pendingProducts: 1, sessionExpired: false }))
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const mod = await import('./useMenuCounts')
    await mod.refreshMenuCounts()
    now += 59_000
    await mod.refreshMenuCounts()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    now += 2_000
    await mod.refreshMenuCounts()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await mod.refreshMenuCounts(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps the previous number when a later response says null (unknown), clears it on a real 0', async () => {
    const mod = await import('./useMenuCounts')
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: 7, refunds: 2, pendingProducts: 4, sessionExpired: false }))
    await mod.refreshMenuCounts(true)
    expect(mod.getMenuCountsSnapshot()).toEqual({ orders: 7, refunds: 2, pendingProducts: 4 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: null, refunds: 0, pendingProducts: null, sessionExpired: false }))
    await mod.refreshMenuCounts(true)
    expect(mod.getMenuCountsSnapshot()).toEqual({ orders: 7, refunds: 0, pendingProducts: 4 })
  })

  it('wipes the counts only when the response says sessionExpired', async () => {
    const mod = await import('./useMenuCounts')
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: 7, refunds: 2, pendingProducts: 4, sessionExpired: false }))
    await mod.refreshMenuCounts(true)
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: 1, refunds: null, pendingProducts: null, sessionExpired: false }))
    await mod.refreshMenuCounts(true)
    expect(mod.getMenuCountsSnapshot()).toEqual({ orders: 1, refunds: 2, pendingProducts: 4 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: null, refunds: null, pendingProducts: null, sessionExpired: true }))
    await mod.refreshMenuCounts(true)
    expect(mod.getMenuCountsSnapshot()).toEqual({ orders: null, refunds: null, pendingProducts: null })
  })

  it('drops the result of a request that was in flight when the store was reset', async () => {
    const mod = await import('./useMenuCounts')
    // First request: slow, belongs to the "old" cabinet.
    let releaseOld!: (r: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { releaseOld = resolve }))
    const oldReq = mod.refreshMenuCounts(true)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Store connected/disconnected: reset + a new request for the "new" cabinet.
    mod.resetMenuCounts()
    fetchMock.mockResolvedValueOnce(jsonResponse({ orders: 3, refunds: 3, pendingProducts: 3, sessionExpired: false }))
    await mod.refreshMenuCounts(true)

    // The old response arrives last and must not overwrite anything.
    releaseOld(jsonResponse({ orders: 99, refunds: 99, pendingProducts: 99, sessionExpired: false }))
    await oldReq

    expect(mod.getMenuCountsSnapshot()).toEqual({ orders: 3, refunds: 3, pendingProducts: 3 })
    // A non-forced refresh right now must be a cache hit: fetchedAt belongs to the new request.
    await mod.refreshMenuCounts()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('makes no extra request after a 500 within the staleness window', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
    const mod = await import('./useMenuCounts')
    await mod.refreshMenuCounts()
    await mod.refreshMenuCounts()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
