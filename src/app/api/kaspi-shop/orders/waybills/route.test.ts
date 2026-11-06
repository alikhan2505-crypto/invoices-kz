import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'

const { getUser, loadConnection, fetchWaybillPdfs } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), fetchWaybillPdfs: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: (...a: unknown[]) => loadConnection(...a) }))
vi.mock('@/lib/kaspiShop/waybills', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/waybills')>('@/lib/kaspiShop/waybills')
  return { ...actual, fetchWaybillPdfs: (...a: unknown[]) => fetchWaybillPdfs(...a) }
})

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/kaspi-shop/orders/waybills', {
    method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

async function label(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 600])
  page.drawRectangle({ x: 0, y: 0, width: 400, height: 600, color: rgb(0, 0, 0) })
  return Buffer.from(await doc.save())
}

describe('POST /api/kaspi-shop/orders/waybills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('rejects an empty-string code (it used to match the first file in the archive) without touching Kaspi', async () => {
    const res = await POST(req({ orderCodes: [''], format: 'a4' }))
    expect(res.status).toBe(400)
    expect(fetchWaybillPdfs).not.toHaveBeenCalled()
  })

  it('rejects non-string elements and oversized lists', async () => {
    expect((await POST(req({ orderCodes: [123], format: 'a4' }))).status).toBe(400)
    expect((await POST(req({ orderCodes: Array.from({ length: 500 }, (_, i) => `c${i}`), format: 'a4' }))).status).toBe(400)
    expect(fetchWaybillPdfs).not.toHaveBeenCalled()
  })

  it('when no waybill is ready it names ALL requested orders, not just the first', async () => {
    fetchWaybillPdfs.mockResolvedValue({ pdfs: [], missing: ['1', '2', '3'] })
    const res = await POST(req({ orderCodes: ['1', '2', '3'], format: 'a4' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('1, 2, 3')
    expect(body.missing).toEqual(['1', '2', '3'])
  })

  it('prints the ready waybills and lists the missing ones in a header instead of failing everything', async () => {
    fetchWaybillPdfs.mockResolvedValue({ pdfs: [await label()], missing: ['2'] })
    const res = await POST(req({ orderCodes: ['1', '2'], format: 'a6' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-missing-orders')).toBe('2')
  })

  it('no missing header when every waybill is ready', async () => {
    fetchWaybillPdfs.mockResolvedValue({ pdfs: [await label()], missing: [] })
    const res = await POST(req({ orderCodes: ['1'], format: 'a4' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-missing-orders')).toBeNull()
  })
})
