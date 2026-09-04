import { NextRequest, NextResponse } from 'next/server'
import { buildWaybillsPdf } from '@/lib/kaspiShop/waybills'

// PUBLIC, unauthenticated, and deliberately does NOT touch Kaspi at all --
// the seller downloads their own накладные from their own cabinet and
// uploads the PDFs here. That's what makes this usable as a free no-signup
// tool (competitor research 2026-09-04: AlemData runs exactly this as a
// lead-gen utility, and we already had the merging code behind a Pro-plan
// gate). The authenticated version at /api/kaspi-shop/orders/waybills is
// unchanged and still fetches from Kaspi directly.
//
// Nothing is persisted: files are merged in memory and streamed back.

const MAX_FILES = 30
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 30 * 1024 * 1024

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 10
// Best-effort only: serverless instances are ephemeral and there may be
// several at once, so this throttles the common case rather than being a
// real guarantee. Good enough for a free tool whose worst case is CPU on a
// PDF merge -- deliberately not a DB table, since the whole point of this
// endpoint is that it writes nothing.
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_LIMIT
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Слишком много запросов подряд. Попробуйте через несколько минут.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать файлы' }, { status: 400 })
  }

  const format = form.get('format') === 'a6' ? 'a6' : 'a4'
  const files = form.getAll('files').filter((f): f is File => f instanceof File)

  if (files.length === 0) return NextResponse.json({ error: 'Добавьте хотя бы один PDF' }, { status: 400 })
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `За раз можно склеить не больше ${MAX_FILES} файлов` }, { status: 400 })
  }

  let total = 0
  const buffers: Buffer[] = []
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `Файл «${file.name}» больше 5 МБ` }, { status: 400 })
    }
    total += file.size
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'Суммарный размер файлов больше 30 МБ' }, { status: 400 })
    }
    buffers.push(Buffer.from(await file.arrayBuffer()))
  }

  try {
    const merged = await buildWaybillsPdf(buffers, format)
    return new NextResponse(new Uint8Array(merged), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="waybills-${format}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    // pdf-lib throws on anything that isn't a readable PDF -- the common
    // real cause is someone uploading a ZIP straight from Kaspi instead of
    // unpacking it first, so say that rather than echoing the raw error.
    console.error('tools/waybills: merge failed:', e.message)
    return NextResponse.json({
      error: 'Не удалось прочитать один из файлов. Убедитесь, что загружаете именно PDF-накладные (а не ZIP-архив из Kaspi — его сначала нужно распаковать).',
    }, { status: 400 })
  }
}
