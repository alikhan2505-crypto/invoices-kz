import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PRINT_ORDER_IP_HOURLY_LIMIT, PRINT_ORDER_PHONE_DAILY_LIMIT, PRINT_ORDER_ATTEMPT_IP_HOURLY_LIMIT } from '@/lib/printShop/rateLimit'

// Всё тяжёлое подменено: настоящий supabase, диск и геометрия не нужны —
// проверяем порядок проверок и поведение лимитов.
const h = vi.hoisted(() => ({
  rows: {} as Record<string, number>,
  counterOpts: {} as { failRead?: boolean },
  inserts: [] as any[],
  insertError: false,
  geometry: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@supabase/supabase-js', async () => {
  const { fakeCounters: mk } = await import('@/lib/printShop/__testutils__/fakeCounters')
  return {
    createClient: () => {
      return {
        from: (table: string) => {
          if (table === 'print_orders') {
            return {
              insert: (row: any) => ({
                select: () => ({
                  single: async () => {
                    if (h.insertError) return { data: null, error: { message: 'insert failed' } }
                    h.inserts.push(row)
                    return { data: { id: 'order-1' }, error: null }
                  },
                }),
              }),
            }
          }
          return (mk(h.rows, h.counterOpts) as any).from(table)
        },
      }
    },
  }
})
vi.mock('node:fs/promises', () => ({ readFile: h.readFile, default: { readFile: h.readFile } }))
vi.mock('opentype.js', () => ({ parse: () => ({ charToGlyphIndex: () => 1 }) }))
vi.mock('@/lib/printShop/keychainGeometry', () => ({ buildKeychainGeometries: h.geometry }))

import { POST } from './route'

let ipSeq = 0
function req(body: unknown, opts: { ip?: string; raw?: string } = {}) {
  return new NextRequest('http://localhost/api/print/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': opts.ip ?? `203.0.113.${++ipSeq}` },
    body: opts.raw ?? JSON.stringify(body),
  })
}

const valid = (over: Record<string, unknown> = {}) => ({
  text: 'Аня', font: 'pt-sans', size: 'M', ringAtEnd: false, ringSize: 'M',
  baseColor: 'белый', textColor: 'чёрный', customerName: 'Аня', customerPhone: '+7 707 123 45 67', note: '',
  ...over,
})

beforeEach(() => {
  for (const k of Object.keys(h.rows)) delete h.rows[k]
  h.counterOpts = {}
  h.inserts.length = 0
  h.insertError = false
  h.geometry.mockReset()
  h.readFile.mockReset()
  h.readFile.mockResolvedValue(Buffer.alloc(16))
  ipSeq = 0
})

describe('POST /api/print/orders — happy path', () => {
  it('creates the order and returns orderId', async () => {
    const res = await POST(req(valid()))
    expect(res.status).toBe(200)
    expect((await res.json()).orderId).toBe('order-1')
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0]).toMatchObject({ text: 'Аня', size: 'M', price: 3500, customer_phone: '77071234567' })
    expect(h.geometry).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/print/orders — cheap validation runs before any CPU work or counter', () => {
  it.each([
    ['unknown font', valid({ font: 'comic-sans' }), 'Неизвестный шрифт'],
    ['unknown size', valid({ size: 'XL' }), 'Неизвестный размер'],
    ['unknown colour', valid({ baseColor: 'розовый' }), 'Неизвестный цвет'],
    ['text over 20 chars', valid({ text: 'a'.repeat(21) }), 'до 20 символов'],
    ['control chars in text', valid({ text: 'ab\ncd' }), 'до 20 символов'],
    ['no phone', valid({ customerPhone: '12' }), 'телефон'],
  ])('rejects %s with 400 and touches neither fonts, geometry nor counters', async (_n, body, msg) => {
    const res = await POST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(msg)
    expect(h.readFile).not.toHaveBeenCalled()
    expect(h.geometry).not.toHaveBeenCalled()
    expect(Object.keys(h.rows)).toHaveLength(0)
  })

  it('rejects an oversized body with 413 before parsing it', async () => {
    const res = await POST(req(null, { raw: JSON.stringify({ note: 'x'.repeat(9000) }) }))
    expect(res.status).toBe(413)
    expect(h.geometry).not.toHaveBeenCalled()
  })

  it('clamps an over-long customer name instead of storing it whole', async () => {
    await POST(req(valid({ customerName: 'Я'.repeat(500) })))
    expect(h.inserts[0].customer_name).toHaveLength(100)
  })
})

describe('POST /api/print/orders — limits', () => {
  it(`allows ${PRINT_ORDER_IP_HOURLY_LIMIT} orders per IP per hour, the next gets 429 and never builds geometry`, async () => {
    const ip = '198.51.100.9'
    for (let i = 0; i < PRINT_ORDER_IP_HOURLY_LIMIT; i++) {
      // другой телефон каждый раз, чтобы упереться именно в лимит IP
      const res = await POST(req(valid({ customerPhone: `+7 707 000 00 0${i}` }), { ip }))
      expect(res.status).toBe(200)
    }
    h.geometry.mockClear()
    const blocked = await POST(req(valid({ customerPhone: '+7 707 999 99 99' }), { ip }))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
    expect(h.geometry).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(PRINT_ORDER_IP_HOURLY_LIMIT)
    // другой адрес не затронут
    const other = await POST(req(valid({ customerPhone: '+7 707 999 99 99' }), { ip: '198.51.100.10' }))
    expect(other.status).toBe(200)
  })

  it(`allows ${PRINT_ORDER_PHONE_DAILY_LIMIT} orders per phone per day even from different IPs`, async () => {
    for (let i = 0; i < PRINT_ORDER_PHONE_DAILY_LIMIT; i++) {
      expect((await POST(req(valid()))).status).toBe(200)
    }
    h.geometry.mockClear()
    const blocked = await POST(req(valid()))
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toContain('номера')
    expect(h.geometry).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(PRINT_ORDER_PHONE_DAILY_LIMIT)
  })

  it('a failed insert gives the slots back, so it does not burn the buyer’s limit', async () => {
    h.insertError = true
    const ip = '198.51.100.20'
    for (let i = 0; i < PRINT_ORDER_IP_HOURLY_LIMIT + 2; i++) {
      expect((await POST(req(valid(), { ip }))).status).toBe(500)
    }
    h.insertError = false
    expect((await POST(req(valid(), { ip }))).status).toBe(200)
  })

  it('caps attempts that reach the geometry build, even when the build itself keeps failing', async () => {
    h.geometry.mockImplementation(() => { throw new Error('no glyph outlines') })
    const ip = '198.51.100.30'
    for (let i = 0; i < PRINT_ORDER_ATTEMPT_IP_HOURLY_LIMIT; i++) {
      expect((await POST(req(valid({ customerPhone: `+7 707 111 ${String(i).padStart(2, '0')} 00` }), { ip }))).status).toBe(400)
    }
    h.geometry.mockClear()
    const blocked = await POST(req(valid(), { ip }))
    expect(blocked.status).toBe(429)
    expect(h.geometry).not.toHaveBeenCalled()
  })

  it('fails closed (503) when the counter cannot be read', async () => {
    h.counterOpts = { failRead: true }
    const res = await POST(req(valid()))
    expect(res.status).toBe(503)
    expect(h.geometry).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })
})
