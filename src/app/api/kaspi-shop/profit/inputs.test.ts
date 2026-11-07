import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Ввод себестоимости, комиссии и расходов (аудит K34): запятая и пробелы разбираются,
// NaN, пришедший с клиента как null, больше не «очищает» значение, мусор это 400.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const rec = vi.hoisted(() => ({
  upserts: [] as Array<{ table: string; row: any }>,
  updates: [] as Array<{ table: string; payload: any }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      const b: any = {
        upsert: (row: any) => { rec.upserts.push({ table, row }); return Promise.resolve({ error: null }) },
        update: (payload: any) => { rec.updates.push({ table, payload }); return b },
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: { id: 'c1' }, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: async () => ({ id: 'c1' }) }))

import { PATCH as cogsPATCH } from './cogs/route'
import { PATCH as commissionPATCH } from './commission/route'
import { PATCH as adSpendPATCH } from './ad-spend/route'

const patch = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  handler(new NextRequest('http://localhost/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  }))

beforeEach(() => { rec.upserts = []; rec.updates = [] })

describe('PATCH /profit/cogs', () => {
  it('«1250,50» сохраняется как 1250.5 (раньше NaN уходил как null и стирал значение)', async () => {
    const res = await patch(cogsPATCH, { kaspiMasterSku: 'M1', cogsAmount: '1250,50' })
    expect(res.status).toBe(200)
    expect(rec.upserts[0].row.cogs_amount).toBe(1250.5)
  })

  it('явный null осознанно очищает себестоимость', async () => {
    const res = await patch(cogsPATCH, { kaspiMasterSku: 'M1', cogsAmount: null })
    expect(res.status).toBe(200)
    expect(rec.upserts[0].row.cogs_amount).toBeNull()
  })

  it('нечисловое, пустое и отрицательное это 400 и ничего не пишется', async () => {
    for (const bad of ['abc', '', -5, '1.2.3', {}]) {
      const res = await patch(cogsPATCH, { kaspiMasterSku: 'M1', cogsAmount: bad })
      expect(res.status).toBe(400)
    }
    expect(rec.upserts).toHaveLength(0)
    expect(rec.updates).toHaveLength(0)
  })

  it('поле cogsAmount не передано: 400, а не очистка', async () => {
    const res = await patch(cogsPATCH, { kaspiMasterSku: 'M1' })
    expect(res.status).toBe(400)
    expect(rec.upserts).toHaveLength(0)
  })
})

describe('PATCH /profit/commission', () => {
  it('«12,5» сохраняется как 12.5', async () => {
    const res = await patch(commissionPATCH, { commissionRatePercent: '12,5' })
    expect(res.status).toBe(200)
    expect(rec.updates[0].payload).toEqual({ commission_rate_percent: 12.5 })
  })

  it('явный null сбрасывает ставку', async () => {
    const res = await patch(commissionPATCH, { commissionRatePercent: null })
    expect(res.status).toBe(200)
    expect(rec.updates[0].payload).toEqual({ commission_rate_percent: null })
  })

  it('мусор и значения вне 0..100 это 400, ставка не сбрасывается', async () => {
    for (const bad of ['abc', '', 101, -1, '150', undefined]) {
      const res = await patch(commissionPATCH, { commissionRatePercent: bad })
      expect(res.status).toBe(400)
    }
    expect(rec.updates).toHaveLength(0)
  })
})

describe('PATCH /profit/ad-spend', () => {
  it('сумма с пробелом и запятой разбирается', async () => {
    const res = await patch(adSpendPATCH, { days: 30, amount: '12 500,5', otherAmount: '1 000' })
    expect(res.status).toBe(200)
    expect(rec.upserts[0].row).toMatchObject({ days: 30, amount: 12500.5, other_amount: 1000 })
  })

  it('нечисловая сумма это 400, а не тихий ноль', async () => {
    for (const body of [{ days: 30, amount: 'abc' }, { days: 30, amount: '' }, { days: 30, amount: 100, otherAmount: 'x' }, { days: 30, amount: -1 }, { days: 5, amount: 1 }]) {
      const res = await patch(adSpendPATCH, body)
      expect(res.status).toBe(400)
    }
    expect(rec.upserts).toHaveLength(0)
  })

  it('otherAmount можно не передавать: это 0', async () => {
    const res = await patch(adSpendPATCH, { days: 7, amount: 500 })
    expect(res.status).toBe(200)
    expect(rec.upserts[0].row.other_amount).toBe(0)
  })
})
