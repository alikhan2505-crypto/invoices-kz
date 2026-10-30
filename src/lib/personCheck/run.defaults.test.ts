import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const h = vi.hoisted(() => ({ lookup: vi.fn(), enforcement: vi.fn(), rnu: vi.fn() }))
vi.mock('@/lib/binLookupServer', () => ({ performBinLookup: h.lookup }))
vi.mock('@/lib/binExtraChecks', () => ({ fetchEnforcement: h.enforcement }))
vi.mock('@/lib/goszakupRnu', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/goszakupRnu')>()), fetchRnu: h.rnu }))

import { runPersonCheck } from './run'

const sb = {} as SupabaseClient
const IIN = '900101300017'

beforeEach(() => { h.lookup.mockReset(); h.enforcement.mockReset(); h.rnu.mockReset(); h.rnu.mockResolvedValue(null) })

// Подключение по умолчанию (без подставных зависимостей): без extras:true
// performBinLookup не читает реестр должников, и строка тихо стала бы «не проверено».
describe('runPersonCheck: боевое подключение', () => {
  it('поиск ИП просит extras, чтобы получить реестр должников', async () => {
    h.lookup.mockResolvedValue({ found: false })
    h.enforcement.mockResolvedValue(null)
    await runPersonCheck(sb, IIN)
    expect(h.lookup).toHaveBeenCalledWith(sb, IIN, { extras: true, rnu: true })
  })

  it('не ИП: реестр должников спрашивается отдельно по тому же ИИН', async () => {
    h.lookup.mockResolvedValue({ found: false })
    h.enforcement.mockResolvedValue({ found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null })
    const r = await runPersonCheck(sb, IIN)
    expect(h.enforcement).toHaveBeenCalledWith(IIN)
    expect(r.enforcement?.found).toBe(false)
  })

  it('РНУ: «как учредитель» спрашивается по head_biin, «как участник» по biin', async () => {
    h.lookup.mockResolvedValue({ found: false })
    h.enforcement.mockResolvedValue(null)
    await runPersonCheck(sb, IIN)
    expect(h.rnu).toHaveBeenCalledWith(IIN, 'head_biin')
    expect(h.rnu).toHaveBeenCalledWith(IIN, 'biin')
  })

  it('ИП с живым ответом: отдельный запрос не нужен', async () => {
    h.lookup.mockResolvedValue({
      found: true,
      company: {
        bin: IIN, name: 'ИП Пример', address: null, director: null, activity: null, status: null, registeredAt: null, source: 'kgd',
        isVatPayer: null, vatRegisteredAt: null, isUnreliable: false, isLiquidating: false, totalArrear: 0, taxArrear: 0,
        unreliableCategories: [], taxRegimes: null,
        enforcement: { found: true, count: 1, activeCount: 1, totalAmount: 10, earliestStart: null },
      },
    })
    const r = await runPersonCheck(sb, IIN)
    expect(h.enforcement).not.toHaveBeenCalled()
    expect(r.enforcement?.found).toBe(true)
  })
})
