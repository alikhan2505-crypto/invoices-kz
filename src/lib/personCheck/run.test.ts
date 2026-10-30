import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BinLookupResult } from '@/lib/binLookup'
import type { EnforcementResult } from '@/lib/aisoip'
import { isPersonIin, runPersonCheck, type PersonCheckDeps } from './run'
import { canUsePersonCheck, PERSON_CHECK_ADMIN_ONLY } from './config'

const IIN = '900101300017'
const sb = {} as SupabaseClient
const ENF: EnforcementResult = { found: true, count: 2, activeCount: 1, totalAmount: 184300, earliestStart: '2024-03-01' }

function company(over: Partial<BinLookupResult> = {}): BinLookupResult {
  return {
    bin: IIN, name: 'ИП Пример', address: 'ул. Секретная 1', director: 'Иванов Иван', activity: '47.11',
    status: null, registeredAt: '2019-03-12', source: 'kgd',
    isVatPayer: false, vatRegisteredAt: null, isUnreliable: false, isLiquidating: false, totalArrear: 0, taxArrear: 0,
    unreliableCategories: [], taxRegimes: null, enforcement: ENF, rehabilitation: undefined,
    ...over,
  }
}

const deps = (over: Partial<PersonCheckDeps> = {}): PersonCheckDeps => ({
  lookup: vi.fn(async () => ({ found: false as const })),
  enforcement: vi.fn(async () => null),
  rnu: vi.fn(async () => null),
  ...over,
})

describe('isPersonIin', () => {
  it('принимает ИИН человека с верной контрольной цифрой', () => {
    expect(isPersonIin('900101300017')).toBe(true)
    expect(isPersonIin('850505300021')).toBe(true)
  })
  it('принимает рождённых после 2000 и 29 февраля', () => {
    expect(isPersonIin('050105500012')).toBe(true) // 7-я цифра 5: XXI век
    expect(isPersonIin('000101600018')).toBe(true) // 7-я цифра 6
    expect(isPersonIin('030229500013')).toBe(true) // 29 февраля
    expect(isPersonIin('991231300013')).toBe(true) // 31 декабря
  })
  it('отклоняет невозможные даты и 7-ю цифру больше 6, даже если контрольная цифра сошлась', () => {
    expect(isPersonIin('991301300003')).toBe(false) // месяц 13
    expect(isPersonIin('990132100005')).toBe(false) // день 32
    expect(isPersonIin('990431300018')).toBe(false) // 31 апреля
    expect(isPersonIin('050105700005')).toBe(false) // 7-я цифра 7
  })
  it('отклоняет БИН компании, опечатку и мусор', () => {
    expect(isPersonIin('040340001997')).toBe(false) // БИН: на 5-м месте 4
    expect(isPersonIin('900101300018')).toBe(false) // контрольная цифра не сходится
    expect(isPersonIin('90010130001')).toBe(false)
    expect(isPersonIin('9001013000170')).toBe(false)
    expect(isPersonIin('abcdefghijkl')).toBe(false)
    expect(isPersonIin('')).toBe(false)
  })
})

describe('runPersonCheck', () => {
  it('человек без ИП: «не ИП» и реестр должников спрашивается отдельно', async () => {
    const d = deps({ enforcement: vi.fn(async () => ENF) })
    const r = await runPersonCheck(sb, IIN, d)
    expect(r.entrepreneur).toEqual({ state: 'none' })
    expect(r.enforcement).toEqual(ENF)
    expect(d.enforcement).toHaveBeenCalledWith(IIN)
  })

  it('реестры не ответили: ИП «не удалось проверить», а не «нет»', async () => {
    const r = await runPersonCheck(sb, IIN, deps({ lookup: vi.fn(async () => ({ found: false as const, unavailable: true })) }))
    expect(r.entrepreneur).toEqual({ state: 'unknown' })
    expect(r.enforcement).toBeNull()
  })

  it('сбой реестра должников даёт null, а не «чисто»', async () => {
    const r = await runPersonCheck(sb, IIN, deps({ enforcement: vi.fn(async () => null) }))
    expect(r.enforcement).toBeNull()
  })

  it('чистый ответ реестра должников сохраняется как found:false', async () => {
    const clean: EnforcementResult = { found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null }
    const r = await runPersonCheck(sb, IIN, deps({ enforcement: vi.fn(async () => clean) }))
    expect(r.enforcement).toEqual(clean)
  })

  it('у ИП должники берутся из ответа lookup и второй запрос не нужен', async () => {
    const d = deps({ lookup: vi.fn(async () => ({ found: true as const, company: company() })) })
    const r = await runPersonCheck(sb, IIN, d)
    expect(r.enforcement).toEqual(ENF)
    expect(d.enforcement).not.toHaveBeenCalled()
    expect(r.entrepreneur.state).toBe('found')
  })

  it('наружу не уходят адрес, руководитель и ОКЭД ИП', async () => {
    const r = await runPersonCheck(sb, IIN, deps({ lookup: vi.fn(async () => ({ found: true as const, company: company() })) }))
    const json = JSON.stringify(r)
    expect(json).not.toContain('Секретная')
    expect(json).not.toContain('Иванов Иван')
    expect(json).not.toContain('47.11')
    expect(json).not.toContain('address')
    expect(json).not.toContain('director')
  })

  it('ИП нашёлся, но реестр должников не ответил: enforcement null', async () => {
    const r = await runPersonCheck(sb, IIN, deps({ lookup: vi.fn(async () => ({ found: true as const, company: company({ enforcement: null }) })) }))
    expect(r.enforcement).toBeNull()
  })
})

describe('РНУ госзакупок', () => {
  const LISTED = { found: true, count: 1 }
  const CLEAN = { found: false, count: 0 }

  it('не ИП: человек как участник и как учредитель спрашиваются отдельно', async () => {
    const rnu = vi.fn(async (_id: string, mode: string) => (mode === 'biin' ? CLEAN : LISTED))
    const r = await runPersonCheck(sb, IIN, deps({ rnu }))
    expect(r.rnu).toEqual({ supplier: CLEAN, related: LISTED })
    expect(rnu).toHaveBeenCalledWith(IIN, 'biin')
    expect(rnu).toHaveBeenCalledWith(IIN, 'head_biin')
  })

  it('сбой портала даёт null, а не «чисто»', async () => {
    const r = await runPersonCheck(sb, IIN, deps())
    expect(r.rnu).toEqual({ supplier: null, related: null })
  })

  it('у ИП «как участник» берётся из ответа lookup, «как учредитель» спрашивается отдельно', async () => {
    const rnu = vi.fn(async () => CLEAN)
    const d = deps({ rnu, lookup: vi.fn(async () => ({ found: true as const, company: company({ rnu: LISTED }) })) })
    const r = await runPersonCheck(sb, IIN, d)
    expect(r.rnu).toEqual({ supplier: LISTED, related: CLEAN })
    expect(rnu).toHaveBeenCalledTimes(1)
    expect(rnu).toHaveBeenCalledWith(IIN, 'head_biin')
  })

  it('ИП, но lookup не принёс rnu: supplier null, а не «чисто»', async () => {
    const r = await runPersonCheck(sb, IIN, deps({ lookup: vi.fn(async () => ({ found: true as const, company: company() })) }))
    expect(r.rnu.supplier).toBeNull()
  })
})

describe('админ-гейт', () => {
  it('пока гейт включён, доступ только у админа', () => {
    expect(PERSON_CHECK_ADMIN_ONLY).toBe(true)
    expect(canUsePersonCheck(true)).toBe(true)
    expect(canUsePersonCheck(false)).toBe(false)
    expect(canUsePersonCheck(null)).toBe(false)
    expect(canUsePersonCheck(undefined)).toBe(false)
  })
})
