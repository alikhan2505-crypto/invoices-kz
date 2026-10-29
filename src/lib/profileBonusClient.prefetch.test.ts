import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}))
vi.mock('@/lib/walletSignal', () => ({ notifyWalletChanged: () => {} }))


const STATUS = { available: true, amount: 100, blocks: {} }

describe('опережающий запрос статуса бонуса', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let prefetchProfileBonusStatus: () => void
  let takeProfileBonusStatus: () => Promise<unknown>
  beforeEach(async () => {
    // Состояние модуля (запись опережающего запроса) не должно переходить из теста в тест.
    vi.resetModules()
    ;({ prefetchProfileBonusStatus, takeProfileBonusStatus } = await import('./profileBonusClient'))
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => STATUS }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('prefetch + take: один запрос на оба вызова', async () => {
    prefetchProfileBonusStatus()
    const r = await takeProfileBonusStatus()
    expect(r).toEqual(STATUS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('повторный prefetch до take не плодит запросы', async () => {
    prefetchProfileBonusStatus()
    prefetchProfileBonusStatus()
    await takeProfileBonusStatus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('два take в одном тике (двойной запуск эффекта в dev) делят один запрос', async () => {
    prefetchProfileBonusStatus()
    await Promise.all([takeProfileBonusStatus(), takeProfileBonusStatus()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('после тика запись забрана: следующий заход за свежими данными идёт новым запросом', async () => {
    prefetchProfileBonusStatus()
    await takeProfileBonusStatus()
    await vi.advanceTimersByTimeAsync(0)
    await takeProfileBonusStatus()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('без prefetch take сам делает запрос', async () => {
    await takeProfileBonusStatus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('устаревший prefetch (старше 30 с) не используется', async () => {
    prefetchProfileBonusStatus()
    vi.advanceTimersByTime(31_000)
    await takeProfileBonusStatus()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
