import { describe, it, expect, vi, beforeEach } from 'vitest'

// Движок демпинга: деньги, цена и список «пора проверять» (аудит Kaspi
// 06.11.2026, K4-K10, K19-K21, K43, K44). База и Kaspi подменены: настоящих
// запросов нет.
//
// Правило основателя 07.11.2026: проверка БЕСПЛАТНА, 5 ₸ списывается только за
// изменение цены, которое дошло до Kaspi, один раз за товар за цикл.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})

const h = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  failSelectTable: null as string | null,
  insertFailure: null as null | ((table: string, row: any) => { message: string; code?: string } | null),
  pushCalls: [] as any[],
  pushResult: { success: true } as any,
  pushThrows: false,
  balances: {} as Record<string, number>,
  balanceThrows: false,
  debits: [] as any[],
  debitThrows: false,
  accessDenied: new Set<string>(),
  notifyProfileCalls: 0,
  markExpiredCalls: [] as string[],
  markExpiredThrows: false,
  lowBalanceNotified: [] as string[][],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
      let payload: any = {}
      let newestFirst = false
      let limitN: number | null = null
      const filters: Array<(r: any) => boolean> = []
      const rows = () => (h.tables[table] ||= [])
      const embed = (r: any) => {
        if (table === 'kaspi_shop_tracked_products') {
          return { ...r, kaspi_shop_connections: (h.tables.kaspi_shop_connections || []).find(c => c.id === r.connection_id) ?? null }
        }
        return { ...r }
      }
      const run = (mode: 'many' | 'single' | 'maybeSingle') => {
        if (op === 'insert') {
          const failure = h.insertFailure?.(table, payload)
          if (failure) return { data: null, error: failure }
          if (Array.isArray(payload)) rows().push(...payload.map(r => ({ ...r })))
          else rows().push({ ...payload })
          return { data: null, error: null }
        }
        if (op === 'select' && h.failSelectTable === table) return { data: null, error: { message: 'boom' } }
        let hit = rows().filter(r => filters.every(f => f(r)))
        if (newestFirst) hit = [...hit].reverse()
        if (limitN !== null) hit = hit.slice(0, limitN)
        if (op === 'update') for (const r of hit) Object.assign(r, payload)
        if (op === 'delete') h.tables[table] = rows().filter(r => !hit.includes(r))
        const out = hit.map(embed)
        if (mode === 'many') return { data: out, error: null }
        if (mode === 'single' && out.length === 0) return { data: null, error: { message: 'no rows' } }
        return { data: out[0] ?? null, error: null }
      }
      const b: any = {
        select() { return b },
        update(p: any) { op = 'update'; payload = p; return b },
        insert(p: any) { op = 'insert'; payload = p; return b },
        delete() { op = 'delete'; return b },
        eq(c: string, v: any) { filters.push(r => r[c] === v); return b },
        in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return b },
        gte(c: string, v: any) { filters.push(r => r[c] !== undefined && r[c] !== null && r[c] >= v); return b },
        or() { return b },
        order(_c: string, o?: { ascending?: boolean }) { newestFirst = o?.ascending === false; return b },
        limit(n: number) { limitN = n; return b },
        maybeSingle: () => Promise.resolve(run('maybeSingle')),
        single: () => Promise.resolve(run('single')),
        then: (res: any, rej: any) => Promise.resolve(run('many')).then(res, rej),
      }
      return b
    },
  }),
}))

vi.mock('./wallet', () => ({
  KASPI_SHOP_CREDIT_PRICE_TENGE: 5,
  getKaspiShopWalletBalance: async (userId: string) => {
    if (h.balanceThrows) throw new Error('balance down')
    return h.balances[userId] ?? 0
  },
  debitKaspiShopWallet: async (userId: string, credits: number, note: string) => {
    if (h.debitThrows) throw new Error('insufficient funds')
    h.debits.push({ userId, credits, note })
    return 0
  },
}))
vi.mock('./connection', () => ({
  getKey: () => Buffer.alloc(32),
  // Настоящий markSessionExpired пишет статус и шлёт продавцу уведомление; здесь только статус и журнал вызовов.
  markSessionExpired: async (connectionId: string) => {
    h.markExpiredCalls.push(connectionId)
    if (h.markExpiredThrows) throw new Error('markSessionExpired failed')
    const c = (h.tables.kaspi_shop_connections || []).find(x => x.id === connectionId)
    if (c) c.session_status = 'session_expired'
  },
}))
vi.mock('@/lib/kaspiPay/crypto', () => ({ decryptAtRest: () => Buffer.from('cookie=1') }))
vi.mock('./cabinetPricePush', () => ({
  pushOfferState: async (params: any) => {
    h.pushCalls.push(params)
    if (h.pushThrows) throw new Error('socket hang up')
    return h.pushResult
  },
}))
vi.mock('./cabinetApi', () => ({ fetchOfferDetails: async () => null }))
vi.mock('./planGate', () => ({
  ownerHasKaspiShopAccess: async (userId: string) => !h.accessDenied.has(userId),
  loadOwnerPlanProfiles: async (ids: (string | null)[]) => new Map(ids.filter(Boolean).map(id => [id as string, { ok: !h.accessDenied.has(id as string) }])),
  filterByOwnerAccess: (items: any[], ownerOf: (i: any) => string | null, profiles: Map<string, any>) =>
    items.filter(i => profiles.get(ownerOf(i) as string)?.ok),
}))
// Настоящее уведомление пишет в базу счётчик и колокольчик; здесь только журнал вызовов.
vi.mock('./lowBalanceNotice', () => ({
  notifyLowBalanceOwners: async (_supabase: unknown, userIds: string[]) => { h.lowBalanceNotified.push([...userIds]) },
}))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: async () => true }))
vi.mock('@/lib/notificationPrefsServer', () => ({ isMissingSchemaError: () => false, loadNotifyProfile: async () => { h.notifyProfileCalls += 1; return null } }))

import { applyPriceCheckResult, getDueTrackedProducts, isSessionActive } from './checkCycle'

function seed(overrides: { product?: Record<string, any>; connection?: Record<string, any>; cityRows?: any[] } = {}) {
  h.tables = {
    kaspi_shop_tracked_products: [{
      id: 'p1', user_id: 'u1', connection_id: 'c1', enabled: true, available_for_sale: true,
      own_current_price: 1000, floor_price: 500, undercut_step: 100, max_price: null, demping_strategy: 'undercut_leader',
      kaspi_sku: '111_222', kaspi_master_sku: '111', product_name: 'Тест', store_id: 'PP1',
      excluded_merchant_ids: [], excluded_city_codes: [], no_competitor_streak: 0, held_at_floor: false,
      last_checked_at: null, check_frequency_minutes: 15, point_city_codes: [],
      ...overrides.product,
    }],
    kaspi_shop_connections: [{
      id: 'c1', user_id: 'u1', paused: false, merchant_id: 'M1', session_cookies: 'enc', session_status: 'active', tracked_city_codes: [],
      ...overrides.connection,
    }],
    kaspi_shop_product_city_prices: overrides.cityRows ?? [
      { tracked_product_id: 'p1', city_code: '750000000', own_current_price: 1000, no_competitor_streak: 0 },
    ],
    kaspi_shop_price_checks: [],
    kaspi_shop_point_stocks: [],
    profiles: [{ id: 'u1', kaspi_wallet_balance: 100 }],
  }
  h.balances = { u1: 100 }
}

const product = () => h.tables.kaspi_shop_tracked_products[0]
const checks = () => h.tables.kaspi_shop_price_checks
const legacyOffer = (price: number) => ({ competitorOffers: [{ merchantId: 'X', price }] })

beforeEach(() => {
  h.failSelectTable = null
  h.insertFailure = null
  h.pushCalls = []
  h.pushResult = { success: true }
  h.pushThrows = false
  h.balanceThrows = false
  h.debits = []
  h.debitThrows = false
  h.accessDenied = new Set()
  h.notifyProfileCalls = 0
  h.markExpiredCalls = []
  h.markExpiredThrows = false
  h.lowBalanceNotified = []
  seed()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isSessionActive', () => {
  it('only a dead status stops the bot; an empty status of an old row counts as active', () => {
    expect(isSessionActive('active')).toBe(true)
    expect(isSessionActive(null)).toBe(true)
    expect(isSessionActive(undefined)).toBe(true)
    expect(isSessionActive('session_expired')).toBe(false)
  })
})

describe('getDueTrackedProducts', () => {
  function seedDue(extra: Array<{ product?: Record<string, any>; connection?: Record<string, any>; balance?: number }>) {
    h.tables = { kaspi_shop_tracked_products: [], kaspi_shop_connections: [], profiles: [] }
    extra.forEach((e, i) => {
      const uid = `u${i}`
      h.tables.kaspi_shop_connections.push({ id: `c${i}`, user_id: uid, paused: false, session_status: 'active', tracked_city_codes: [], ...e.connection })
      h.tables.kaspi_shop_tracked_products.push({
        id: `p${i}`, user_id: uid, connection_id: `c${i}`, kaspi_sku: `s${i}`, kaspi_master_sku: `m${i}`, enabled: true, available_for_sale: true,
        last_checked_at: null, check_frequency_minutes: 15, excluded_city_codes: [], point_city_codes: [], ...e.product,
      })
      h.tables.profiles.push({ id: uid, kaspi_wallet_balance: e.balance ?? 100 })
    })
  }

  it('returns a due, funded product with an active session', async () => {
    seedDue([{}])
    const due = await getDueTrackedProducts()
    expect(due.map(d => d.id)).toEqual(['p0'])
    expect(due[0].kaspiMasterSku).toBe('m0')
  })

  it('throws when the due query fails instead of answering an empty list (K8)', async () => {
    seedDue([{}])
    h.failSelectTable = 'kaspi_shop_tracked_products'
    await expect(getDueTrackedProducts()).rejects.toThrow(/due tracked products lookup failed/)
  })

  it('throws when the balances read fails', async () => {
    seedDue([{}])
    h.failSelectTable = 'profiles'
    await expect(getDueTrackedProducts()).rejects.toThrow(/wallet balances lookup failed/)
  })

  it('leaves out an expired session (K4/K20/K43)', async () => {
    seedDue([{ connection: { session_status: 'session_expired' } }, {}])
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p1'])
  })

  it('treats a null session status as active', async () => {
    seedDue([{ connection: { session_status: null } }])
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p0'])
  })

  it('leaves out a paused connection', async () => {
    seedDue([{ connection: { paused: true } }, {}])
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p1'])
  })

  it('leaves out a product taken off sale (K21), keeps null as on sale', async () => {
    seedDue([{ product: { available_for_sale: false } }, { product: { available_for_sale: null } }])
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p1'])
  })

  it('leaves out an owner whose wallet is below the 5 tenge fee, keeps exactly 5 (K10/K44)', async () => {
    seedDue([{ balance: 4 }, { balance: 5 }, { balance: 0 }])
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p1'])
  })

  it('an owner below 5 tenge is told once per run; funded owners and owners failing other gates are not', async () => {
    // u0: баланс 4 (должен получить уведомление), u1: баланс 5 (не получает), u2: баланс 0, но сессия мертва
    // (товар отсеян раньше, бот его всё равно не проверил бы), u3: баланс 0, но товар снят с продажи.
    seedDue([
      { balance: 4 },
      { balance: 5 },
      { balance: 0, connection: { session_status: 'session_expired' } },
      { balance: 0, product: { available_for_sale: false } },
    ])
    const due = await getDueTrackedProducts()
    expect(due.map(d => d.id)).toEqual(['p1'])
    expect(h.lowBalanceNotified).toEqual([['u0']])
  })

  it('no owner below 5 tenge: the notice code is not even called', async () => {
    seedDue([{ balance: 100 }, { balance: 5 }])
    await getDueTrackedProducts()
    expect(h.lowBalanceNotified).toEqual([])
  })

  it('an owner without Kaspi Bot access (lapsed Pro) is not told about the balance', async () => {
    seedDue([{ balance: 0 }, { balance: 100 }])
    h.accessDenied.add('u0')
    await getDueTrackedProducts()
    expect(h.lowBalanceNotified).toEqual([])
  })

  it('leaves out an owner without Kaspi Bot access', async () => {
    seedDue([{}, {}])
    h.accessDenied.add('u0')
    expect((await getDueTrackedProducts()).map(d => d.id)).toEqual(['p1'])
  })

  it('leaves out a product whose check is not due yet', async () => {
    seedDue([{ product: { last_checked_at: new Date().toISOString() } }])
    expect(await getDueTrackedProducts()).toEqual([])
  })
})

describe('applyPriceCheckResult: проверка бесплатна, 5 ₸ только за изменение цены, дошедшее до Kaspi', () => {
  it('charges 5 tenge (1 credit) once for a price change that reached Kaspi; the reason names the change', async () => {
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.debits).toHaveLength(1)
    expect(h.debits[0].credits).toBe(1)
    expect(h.debits[0].note).toBe('Изменение цены: Тест 1000 → 800 ₸')
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1, own_price_before: 1000, own_price_after: 800 })
  })

  it('a check that finds nothing to change is FREE: no push, no debit, credit_cost 0', async () => {
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'no_change', credit_cost: 0 })
    // но сама проверка состоялась: время проверки сдвинуто
    expect(product().last_checked_at).toBeTruthy()
  })

  it('a competitor-less check with nothing to change is free too', async () => {
    await applyPriceCheckResult('p1', { competitorOffers: [] }, null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0].credit_cost).toBe(0)
  })

  it('held at the floor WITHOUT a push (already at the floor and in sync) is free', async () => {
    seed({
      product: { own_current_price: 500, floor_price: 500 },
      cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 500, no_competitor_streak: 0 }],
    })
    await applyPriceCheckResult('p1', legacyOffer(400), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'held_at_floor', credit_cost: 0 })
    expect(product().held_at_floor).toBe(true)
  })

  it('does not charge on a Kaspi fetch error (K5), logs an error row and moves last_checked_at', async () => {
    await applyPriceCheckResult('p1', null, 'HTTP 429')
    expect(h.debits).toHaveLength(0)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0, error_message: 'HTTP 429' })
    expect(product().last_checked_at).toBeTruthy()
    expect(product().own_current_price).toBe(1000)
  })

  it('does not charge when the response carries no offers at all and no error', async () => {
    await applyPriceCheckResult('p1', null, null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0 })
    expect(product().no_competitor_streak).toBe(0)
  })

  it('does not charge when the per-city response has no cities', async () => {
    await applyPriceCheckResult('p1', { perCityOffers: {} }, null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0 })
  })

  it.each([
    ['dead session', { connection: { session_status: 'session_expired' } }],
    ['missing cookies', { connection: { session_cookies: null } }],
    ['paused connection', { connection: { paused: true } }],
    ['product off sale', { product: { available_for_sale: false } }],
    ['disabled product', { product: { enabled: false } }],
  ])('%s: no writes, no push, no charge, no history row (K4/K20/K43)', async (_name, overrides) => {
    seed(overrides as any)
    const before = JSON.stringify(h.tables)
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.debits).toHaveLength(0)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()).toHaveLength(0)
    expect(JSON.stringify(h.tables)).toBe(before)
  })

  it('wallet below the fee: nothing is touched and nothing is charged', async () => {
    h.balances = { u1: 4 }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.debits).toHaveLength(0)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
  })

  it('wallet read failure skips the cycle without throwing', async () => {
    h.balanceThrows = true
    await expect(applyPriceCheckResult('p1', legacyOffer(900), null)).resolves.toBeUndefined()
    expect(h.debits).toHaveLength(0)
    expect(h.pushCalls).toHaveLength(0)
  })

  it('a product with no floor price never reprices and is never charged', async () => {
    seed({ product: { floor_price: 0 } })
    await applyPriceCheckResult('p1', legacyOffer(1), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0 })
  })

  it('a debit that fails AFTER a successful push: the change stays, credit_cost 0, the failure is logged', async () => {
    h.debitThrows = true
    await expect(applyPriceCheckResult('p1', legacyOffer(900), null)).resolves.toBeUndefined()
    expect(h.pushCalls).toHaveLength(1)
    expect(product().own_current_price).toBe(800)
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(800)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 0, own_price_after: 800 })
    expect((console.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('price change reached Kaspi but wallet debit failed'))).toBe(true)
  })

  it('a debit failure on a free check is never even attempted', async () => {
    h.debitThrows = true
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'no_change', credit_cost: 0 })
  })
})

describe('applyPriceCheckResult: a price is recorded only after Kaspi accepted it (legacy branch, K9/K19)', () => {
  it('failed push keeps the old price, records push_failed with the error and does not charge', async () => {
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 500: boom' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)

    expect(product().own_current_price).toBe(1000)
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(1000)
    expect(h.tables.kaspi_shop_product_city_prices[0].last_pushed_at).toBeUndefined()
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'push_failed', credit_cost: 0, own_price_before: 1000, own_price_after: 1000 })
    expect(checks()[0].error_message).toContain('HTTP 500: boom')
    expect(checks()[0].error_message).toContain('800')
    expect(h.debits).toHaveLength(0)
    expect(product().last_checked_at).toBeTruthy()
  })

  it('the next cycle sees the same decision again and retries; success then records updated', async () => {
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(1)

    h.pushResult = { success: true }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(2)
    expect(product().own_current_price).toBe(800)
    expect(h.tables.kaspi_shop_product_city_prices[0]).toMatchObject({ own_current_price: 800 })
    expect(checks().map(c => c.action)).toEqual(['push_failed', 'updated'])
    expect(h.debits).toHaveLength(1)
  })

  it('a push that throws is a push_failed, not a crash', async () => {
    h.pushThrows = true
    await expect(applyPriceCheckResult('p1', legacyOffer(900), null)).resolves.toBeUndefined()
    expect(product().own_current_price).toBe(1000)
    expect(checks()[0].action).toBe('push_failed')
    expect(h.debits).toHaveLength(0)
  })

  it('a push answered with session_expired marks the session and is a push_failed', async () => {
    h.pushResult = { success: false, reason: 'session_expired', message: 'HTTP 401' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.tables.kaspi_shop_connections[0].session_status).toBe('session_expired')
    expect(product().own_current_price).toBe(1000)
    expect(checks()[0].action).toBe('push_failed')
    // Продавца предупреждает markSessionExpired (Telegram + колокольчик), а не только запись статуса.
    expect(h.markExpiredCalls).toEqual(['c1'])
  })

  it('a failing markSessionExpired does not crash the cycle: still a push_failed, free', async () => {
    h.pushResult = { success: false, reason: 'session_expired', message: 'HTTP 401' }
    h.markExpiredThrows = true
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.markExpiredCalls).toEqual(['c1'])
    expect(checks()[0].action).toBe('push_failed')
    expect(h.debits).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
  })

  it('a push that hit the 250 per 30 min budget is a push_failed (price kept)', async () => {
    // 250 recent confirmed pushes of this connection's products exhaust the budget.
    const recent = new Date().toISOString()
    h.tables.kaspi_shop_product_city_prices.push(
      ...Array.from({ length: 250 }, (_, i) => ({ tracked_product_id: 'p1', city_code: `x${i}`, own_current_price: 1, last_pushed_at: recent })),
    )
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
    expect(checks()[0].action).toBe('push_failed')
    expect(checks()[0].error_message).toContain('rate limit budget')
  })

  it('a price that moves only because the floor binds (held_at_floor) is pushed too', async () => {
    await applyPriceCheckResult('p1', legacyOffer(400), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 500 }])
    expect(product().own_current_price).toBe(500)
    // цена реально сменилась на Kaspi (1000 -> 500, пол): это изменение цены, оно платное
    expect(checks()[0]).toMatchObject({ action: 'held_at_floor', credit_cost: 1 })
    expect(h.debits).toHaveLength(1)
  })

  it('a held_at_floor price whose push failed keeps the old price and is free', async () => {
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 503' }
    await applyPriceCheckResult('p1', legacyOffer(400), null)
    expect(product().own_current_price).toBe(1000)
    expect(checks()[0].action).toBe('push_failed')
    expect(h.debits).toHaveLength(0)
  })

  it('respects maxPrice end to end: a competitor above the ceiling is pushed at the ceiling', async () => {
    seed({ product: { max_price: 20000, own_current_price: 15000, floor_price: 5000 }, cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 15000, no_competitor_streak: 0 }] })
    await applyPriceCheckResult('p1', legacyOffer(50000), null)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 20000 }])
    expect(product().own_current_price).toBe(20000)
  })
})

describe('applyPriceCheckResult: legacy branch heals desynced products (engine2, item 1)', () => {
  it('own price 950, city row and Kaspi at 1000, decision 950: pushes, fixes the city row, charges once', async () => {
    seed({ product: { own_current_price: 950 }, cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 1000, no_competitor_streak: 0 }] })
    await applyPriceCheckResult('p1', legacyOffer(1050), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 950 }])
    expect(h.tables.kaspi_shop_product_city_prices[0]).toMatchObject({ own_current_price: 950 })
    expect(h.tables.kaspi_shop_product_city_prices[0].last_pushed_at).toBeTruthy()
    expect(product().own_current_price).toBe(950)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1, own_price_before: 950, own_price_after: 950 })
    expect(h.debits).toHaveLength(1)
  })

  it('the cycle after the heal is a plain no_change: no second push, and it is free (only the heal push was charged)', async () => {
    seed({ product: { own_current_price: 950 }, cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 1000, no_competitor_streak: 0 }] })
    await applyPriceCheckResult('p1', legacyOffer(1050), null)
    await applyPriceCheckResult('p1', legacyOffer(1050), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(checks().map(c => c.action)).toEqual(['updated', 'no_change'])
    expect(checks().map(c => c.credit_cost)).toEqual([1, 0])
    expect(h.debits).toHaveLength(1)
  })

  it('a failed heal push keeps everything, is push_failed and free; the next cycle retries and heals', async () => {
    seed({ product: { own_current_price: 950 }, cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 1000, no_competitor_streak: 0 }] })
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 502' }
    await applyPriceCheckResult('p1', legacyOffer(1050), null)
    expect(checks()[0]).toMatchObject({ action: 'push_failed', credit_cost: 0 })
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(1000)
    expect(h.debits).toHaveLength(0)
    h.pushResult = { success: true }
    await applyPriceCheckResult('p1', legacyOffer(1050), null)
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(950)
    expect(h.debits).toHaveLength(1)
  })

  it('one stale city among synced ones triggers a push that carries every city', async () => {
    seed({
      product: { own_current_price: 1000 },
      cityRows: [
        { tracked_product_id: 'p1', city_code: 'A', own_current_price: 1000, no_competitor_streak: 0 },
        { tracked_product_id: 'p1', city_code: 'B', own_current_price: 1200, no_competitor_streak: 0 },
      ],
    })
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: 'A', value: 1000 }, { cityId: 'B', value: 1000 }])
  })

  it('everything in sync and nothing to change: still no push', async () => {
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'no_change', credit_cost: 0 })
    expect(h.debits).toHaveLength(0)
  })

  it('several cities pushed in ONE upload: exactly one charge for the product (not one per city)', async () => {
    seed({
      product: { own_current_price: 1000 },
      cityRows: [
        { tracked_product_id: 'p1', city_code: 'A', own_current_price: 1000, no_competitor_streak: 0 },
        { tracked_product_id: 'p1', city_code: 'B', own_current_price: 1000, no_competitor_streak: 0 },
        { tracked_product_id: 'p1', city_code: 'C', own_current_price: 1000, no_competitor_streak: 0 },
      ],
    })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toHaveLength(3)
    expect(h.debits).toHaveLength(1)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1 })
  })
})

describe('applyPriceCheckResult: legacy product without city rows (engine2, item 2)', () => {
  it('no rows and no known point cities: ONE error row, no push, no price written, no charge, last_checked_at moves', async () => {
    seed({ cityRows: [] })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
    expect(product().last_checked_at).toBeTruthy()
    expect(h.tables.kaspi_shop_product_city_prices).toHaveLength(0)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0, own_price_before: 1000, own_price_after: 1000 })
    expect(checks()[0].error_message).toContain('Обновить каталог')
  })

  it('the same skip on the next cycles does not write a row every time (was one push_failed row per cycle)', async () => {
    seed({ cityRows: [] })
    for (let i = 0; i < 5; i++) await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(checks()).toHaveLength(1)
    expect(h.debits).toHaveLength(0)
    expect(checks().some(c => c.action === 'push_failed')).toBe(false)
  })

  it('a competitor-less cycle with no rows is the same skip, not a charged no_change', async () => {
    seed({ cityRows: [] })
    await applyPriceCheckResult('p1', { competitorOffers: [] }, null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0].action).toBe('error')
  })

  it('no rows but known point cities: rows are created from them, the price is pushed and recorded', async () => {
    seed({ product: { point_city_codes: ['750000000', '710000000'] }, cityRows: [] })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    const rows = h.tables.kaspi_shop_product_city_prices
    expect(rows.map(r => r.city_code).sort()).toEqual(['710000000', '750000000'])
    expect(h.pushCalls).toHaveLength(1)
    expect([...h.pushCalls[0].cityPrices].sort((a: any, b: any) => a.cityId.localeCompare(b.cityId))).toEqual([{ cityId: '710000000', value: 800 }, { cityId: '750000000', value: 800 }])
    expect(rows.every(r => r.own_current_price === 800 && r.last_pushed_at)).toBe(true)
    expect(product().own_current_price).toBe(800)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1 })
    expect(h.debits).toHaveLength(1) // два города, одна отправка, одно списание
  })

  it('push failed right after creating the rows: the created rows are removed, so nothing looks confirmed and nothing is charged', async () => {
    seed({ product: { point_city_codes: ['750000000', '710000000'] }, cityRows: [] })
    h.pushResult = { success: false, reason: 'error', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.tables.kaspi_shop_product_city_prices).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'push_failed', credit_cost: 0 })
    expect(h.debits).toHaveLength(0)
    expect(product().own_current_price).toBe(1000)
  })

  it('the next cycle after that failure creates the rows again and pushes, even when the decided price equals the product price', async () => {
    seed({ product: { point_city_codes: ['750000000'] }, cityRows: [] })
    h.pushResult = { success: false, reason: 'error', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', legacyOffer(1100), null) // решение = 1000 = цена товара
    expect(h.tables.kaspi_shop_product_city_prices).toHaveLength(0)
    h.pushResult = { success: true }
    h.pushCalls = []
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 1000 }])
    const rows = h.tables.kaspi_shop_product_city_prices
    expect(rows).toHaveLength(1)
    expect(rows[0].last_pushed_at).toBeTruthy()
    expect(h.debits).toHaveLength(1)
  })

  it('push failure with PRE-EXISTING city rows leaves those rows alone', async () => {
    seed()
    h.pushResult = { success: false, reason: 'error', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.tables.kaspi_shop_product_city_prices).toHaveLength(1)
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(1000)
  })

  it('failing to create the city rows is its own message, not the «Обновить каталог» one, free and unpushed', async () => {
    seed({ product: { point_city_codes: ['750000000'] }, cityRows: [] })
    h.insertFailure = table => (table === 'kaspi_shop_product_city_prices' ? { message: 'insert failed' } : null)
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0].action).toBe('error')
    expect(checks()[0].error_message).toContain('Не удалось подготовить цены по городам')
    expect(checks()[0].error_message).toContain('повторим на следующей проверке')
    expect(checks()[0].error_message).not.toContain('Обновить каталог')
  })

  it('created rows are pushed even when the decided price equals the product price (Kaspi side is unknown)', async () => {
    seed({ product: { point_city_codes: ['750000000'] }, cityRows: [] })
    await applyPriceCheckResult('p1', legacyOffer(1100), null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 1000 }])
  })

  it('excluded point cities get rows but are not pushed', async () => {
    seed({ product: { point_city_codes: ['750000000', '710000000'], excluded_city_codes: ['710000000'] }, cityRows: [] })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: '750000000', value: 800 }])
  })

  it('every city excluded: a distinct skip with its own text, no charge', async () => {
    seed({ product: { excluded_city_codes: ['750000000'] } })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0].action).toBe('error')
    expect(checks()[0].error_message).toContain('исключены')
  })

  it('a different later error is still logged (the dedupe only collapses an identical last row)', async () => {
    seed({ cityRows: [] })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    await applyPriceCheckResult('p1', null, 'HTTP 429')
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(checks()).toHaveLength(3)
  })
})

describe('applyPriceCheckResult: a push_failed cycle does not claim the floor (engine2, item 3)', () => {
  const perCityFloor = { perCityOffers: { '750000000': [{ merchantId: 'X', price: 900 }] } }

  it('legacy: floor binds, push refused: held_at_floor stays false, no floor alert', async () => {
    seed({ product: { floor_price: 950 } })
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 503' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(checks()[0].action).toBe('push_failed')
    expect(product().held_at_floor).toBe(false)
    expect(h.notifyProfileCalls).toBe(0)
  })

  it('per-city: floor binds, push refused: held_at_floor stays false, no floor alert', async () => {
    seed({ product: { floor_price: 950 } })
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 503' }
    await applyPriceCheckResult('p1', perCityFloor, null)
    expect(checks()[0].action).toBe('push_failed')
    expect(product().held_at_floor).toBe(false)
    expect(h.notifyProfileCalls).toBe(0)
  })

  it('a previously true held_at_floor is not overwritten by a failed push either', async () => {
    seed({ product: { floor_price: 950, held_at_floor: true } })
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 503' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(product().held_at_floor).toBe(true)
  })

  it('legacy: when the push succeeds the floor is recorded and the alert path runs', async () => {
    seed({ product: { floor_price: 950 } })
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(checks()[0].action).toBe('held_at_floor')
    expect(product().held_at_floor).toBe(true)
    expect(h.notifyProfileCalls).toBe(1)
  })

  it('per-city: when the push succeeds the floor is recorded and the alert path runs', async () => {
    seed({ product: { floor_price: 950 } })
    await applyPriceCheckResult('p1', perCityFloor, null)
    expect(product().held_at_floor).toBe(true)
    expect(h.notifyProfileCalls).toBe(1)
  })
})

describe('applyPriceCheckResult: per-city branch', () => {
  const perCity = (price: number) => ({ perCityOffers: { '750000000': [{ merchantId: 'X', price }] } })

  it('success: city row and product price move, action updated, one charge', async () => {
    await applyPriceCheckResult('p1', perCity(900), null)
    expect(h.tables.kaspi_shop_product_city_prices[0]).toMatchObject({ own_current_price: 800 })
    expect(product().own_current_price).toBe(800)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1 })
    expect(h.debits).toHaveLength(1)
    expect(h.debits[0].note).toBe('Изменение цены: Тест 1000 → 800 ₸')
  })

  it('failed push: old city and product price kept, push_failed, error kept, no charge', async () => {
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 429' }
    await applyPriceCheckResult('p1', perCity(900), null)
    expect(h.tables.kaspi_shop_product_city_prices[0].own_current_price).toBe(1000)
    expect(product().own_current_price).toBe(1000)
    // observations are still recorded
    expect(product().last_competitor_price).toBe(900)
    expect(product().last_checked_at).toBeTruthy()
    expect(checks()[0]).toMatchObject({ action: 'push_failed', credit_cost: 0, own_price_after: 1000 })
    expect(checks()[0].error_message).toContain('HTTP 429')
    expect(h.debits).toHaveLength(0)
  })

  it('no price change in any city: nothing pushed, no_change, FREE', async () => {
    await applyPriceCheckResult('p1', perCity(1100), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'no_change', credit_cost: 0 })
    expect(h.debits).toHaveLength(0)
  })

  it('held at the floor in every city and nothing to push: free', async () => {
    seed({
      product: { own_current_price: 950, floor_price: 950 },
      cityRows: [{ tracked_product_id: 'p1', city_code: '750000000', own_current_price: 950, no_competitor_streak: 0 }],
    })
    await applyPriceCheckResult('p1', perCity(900), null)
    expect(h.pushCalls).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'held_at_floor', credit_cost: 0 })
    expect(h.debits).toHaveLength(0)
  })

  it('three cities change in one upload: ONE debit for the product, one history row', async () => {
    seed({
      product: { own_current_price: 1000 },
      cityRows: ['A', 'B', 'C'].map(code => ({ tracked_product_id: 'p1', city_code: code, own_current_price: 1000, no_competitor_streak: 0 })),
    })
    await applyPriceCheckResult('p1', { perCityOffers: { A: [{ merchantId: 'X', price: 900 }], B: [{ merchantId: 'X', price: 900 }], C: [{ merchantId: 'X', price: 900 }] } }, null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toHaveLength(3)
    expect(h.debits).toHaveLength(1)
    expect(h.debits[0].credits).toBe(1)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1 })
  })

  it('the lowest price did not move, but one city did and was pushed: that is an update and it is charged once', async () => {
    seed({
      product: { own_current_price: 1000 },
      cityRows: [
        { tracked_product_id: 'p1', city_code: 'A', own_current_price: 1000, no_competitor_streak: 0 },
        { tracked_product_id: 'p1', city_code: 'B', own_current_price: 1200, no_competitor_streak: 0 },
      ],
    })
    await applyPriceCheckResult('p1', { perCityOffers: { A: [{ merchantId: 'X', price: 1100 }], B: [{ merchantId: 'X', price: 1500 }] } }, null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.pushCalls[0].cityPrices).toEqual([{ cityId: 'B', value: 1400 }])
    expect(checks()[0]).toMatchObject({ action: 'updated', credit_cost: 1 })
    expect(h.debits).toHaveLength(1)
  })

  it('one push failed: nothing is charged and there is one failed row', async () => {
    seed({
      product: { own_current_price: 1000 },
      cityRows: ['A', 'B'].map(code => ({ tracked_product_id: 'p1', city_code: code, own_current_price: 1000, no_competitor_streak: 0 })),
    })
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', { perCityOffers: { A: [{ merchantId: 'X', price: 900 }], B: [{ merchantId: 'X', price: 900 }] } }, null)
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'push_failed', credit_cost: 0 })
  })

  it('fetch error: no charge, error row', async () => {
    await applyPriceCheckResult('p1', null, 'HTTP 403')
    expect(h.debits).toHaveLength(0)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0 })
  })
})

describe('applyPriceCheckResult: history row before the migration', () => {
  it('falls back to action error with the same text when the CHECK does not know push_failed yet', async () => {
    h.insertFailure = (_table, row) => (row.action === 'push_failed' ? { message: 'new row violates check constraint "kaspi_shop_price_checks_action_check"', code: '23514' } : null)
    h.pushResult = { success: false, reason: 'other', message: 'HTTP 500' }
    await applyPriceCheckResult('p1', legacyOffer(900), null)
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ action: 'error', credit_cost: 0 })
    expect(checks()[0].error_message).toContain('HTTP 500')
    expect(product().own_current_price).toBe(1000)
  })
})

describe('applyPriceCheckResult: per-city branch, city without a row (review 07.11)', () => {
  it('creates the row after a successful push, so the next identical check is free', async () => {
    seed({ cityRows: [] })
    const offers = { perCityOffers: { A: [{ merchantId: 'X', price: 900 }] } }
    await applyPriceCheckResult('p1', offers, null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.debits).toHaveLength(1)
    expect(h.tables.kaspi_shop_product_city_prices).toHaveLength(1)
    expect(h.tables.kaspi_shop_product_city_prices[0]).toMatchObject({ city_code: 'A', own_current_price: 800 })
    await applyPriceCheckResult('p1', offers, null)
    await applyPriceCheckResult('p1', offers, null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.debits).toHaveLength(1)
    expect(checks().map((c: any) => c.action)).toEqual(['updated', 'no_change', 'no_change'])
  })

  it('a second city without a row is created too, the first one stays untouched', async () => {
    seed({ cityRows: [{ tracked_product_id: 'p1', city_code: 'A', own_current_price: 800, no_competitor_streak: 0 }] })
    const offers = { perCityOffers: { A: [{ merchantId: 'X', price: 900 }], B: [{ merchantId: 'X', price: 900 }] } }
    await applyPriceCheckResult('p1', offers, null)
    await applyPriceCheckResult('p1', offers, null)
    expect(h.pushCalls).toHaveLength(1)
    expect(h.debits).toHaveLength(1)
    expect(h.tables.kaspi_shop_product_city_prices.map((r: any) => r.city_code).sort()).toEqual(['A', 'B'])
  })
})
