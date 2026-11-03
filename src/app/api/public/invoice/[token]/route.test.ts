import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  selects: [] as { table: string; cols: string }[],
  rows: {} as Record<string, any>,
  // Ошибка базы по таблице: { invoices: { message: '...' } }.
  errors: {} as Record<string, { message: string }>,
  updates: [] as any[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      let isUpdate = false
      const b: any = {
        select(cols: string) { h.selects.push({ table, cols }); return b },
        update(p: any) { isUpdate = true; h.updates.push({ table, p }); return b },
        eq() { return b },
        maybeSingle: async () => ({ data: h.errors[table] ? null : h.rows[table] ?? null, error: h.errors[table] ?? null }),
        then: (res: any, rej: any) => Promise.resolve({ data: null, error: null, isUpdate }).then(res, rej),
      }
      return b
    },
  }),
}))

import { NextRequest } from 'next/server'
import { GET } from './route'

const params = (token: string) => ({ params: Promise.resolve({ token }) })
const call = () => GET(new NextRequest('http://localhost/api/public/invoice/tok'), params('tok'))
const future = new Date(Date.now() + 10 * 86400_000).toISOString()

beforeEach(() => {
  h.selects = []
  h.updates = []
  h.errors = {}
  h.rows = {
    invoices: {
      id: 'i1', number: '7', status: 'sent', amount: 1000, created_at: '2026-10-01', due_date: null,
      client_name: 'Клиент', client_bin: '', client_email: 'c@x.kz', client_address: '', contract_number: null,
      contract_date: null, services: [], note: null, knp: '710', vat_type: 'vat_16', user_id: 'u1', bank_id: 'b1',
    },
    profiles: {
      company_name: 'ТОО', bin_iin: '1', address: 'a', phone: 'p', director_name: 'd', signature_url: '', stamp_url: '', vat_type: 'vat_16',
      kaspi_pay_link: null, halyk_pay_link: null, website: null, social_links: [],
      plan: 'pro', plan_expires_at: future, bonus_expires_at: null, trial_expires_at: null, is_admin: false,
      email: 'seller@secret.kz',
    },
    bank_accounts: { bank_name: 'Halyk', iik: 'KZ1', bik: 'HSBKKZKX', kbe: '19' },
  }
})

describe('GET /api/public/invoice/[token]', () => {
  it('never uses select(*) and leaks no owner/plan fields', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.selects.length).toBeGreaterThanOrEqual(3)
    for (const s of h.selects) expect(s.cols).not.toContain('*')

    const text = JSON.stringify(await res.clone().json())
    for (const secret of ['user_id', 'bank_id', 'seller@secret.kz', 'plan_expires_at', 'is_admin', 'trial_expires_at']) {
      expect(text).not.toContain(secret)
    }
  })

  it('still returns everything the payer page renders', async () => {
    const body = await (await call()).json()
    expect(body.invoice).toMatchObject({ id: 'i1', number: '7', amount: 1000, client_name: 'Клиент' })
    expect(body.invoice.status).toBe('viewed') // sent -> viewed on first open
    // КНП и режим НДС нужны PDF клиента; режим продавца — запасной вариант для старых счетов без своего.
    expect(body.invoice).toMatchObject({ knp: '710', vat_type: 'vat_16' })
    expect(body.profile).toMatchObject({ company_name: 'ТОО', bin_iin: '1', director_name: 'd', vat_type: 'vat_16' })
    expect(body.bank).toEqual({ bank_name: 'Halyk', iik: 'KZ1', bik: 'HSBKKZKX', kbe: '19' })
    expect(body.showWatermark).toBe(false)
  })

  it('keeps the watermark for a seller without an active plan', async () => {
    h.rows.profiles = { ...h.rows.profiles, plan: 'free', plan_expires_at: null }
    expect((await (await call()).json()).showWatermark).toBe(true)
  })

  it('сбой базы: 500 lookup_failed, текст ошибки (таблица, колонки) анониму не отдаётся', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.errors.invoices = { message: 'permission denied for table invoices' }
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"lookup_failed"}')
  })
})
