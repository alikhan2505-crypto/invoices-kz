import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { fetchWaybillPdfs, buildWaybillsPdf, normalizeOrderCodes, type WaybillFormat } from '@/lib/kaspiShop/waybills'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Скачивание всего архива накладных мерчанта плюс сборка PDF не укладываются в 15 секунд по умолчанию.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const normalized = normalizeOrderCodes(body?.orderCodes)
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 })
  const orderCodes = normalized.codes
  const format: WaybillFormat = body?.format
  if (format !== 'a4' && format !== 'a6') {
    return NextResponse.json({ error: "format обязателен и должен быть 'a4' или 'a6'" }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  let pdfs: Buffer[]
  let missing: string[]
  try {
    const fetched = await fetchWaybillPdfs(connection.sessionCookies, connection.merchantId, orderCodes)
    pdfs = fetched.pdfs
    missing = fetched.missing
  } catch (err: any) {
    return NextResponse.json({ error: `Не удалось получить накладную: ${err.message}` }, { status: 502 })
  }
  // Ни одной накладной: говорим про ВСЕ заказы сразу, а не про первый попавшийся.
  if (pdfs.length === 0) {
    return NextResponse.json({
      error: `Накладных для выбранных заказов ещё нет (${missing.join(', ')}). Они появляются в течение 5 минут после «Я упаковал».`,
      missing,
    }, { status: 502 })
  }

  let merged: Buffer
  try {
    merged = await buildWaybillsPdf(pdfs, format)
  } catch (err: any) {
    return NextResponse.json({ error: `Не удалось собрать PDF накладных: ${err.message}` }, { status: 500 })
  }
  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="nakladnye_${format}.pdf"`,
      // Часть накладных ещё не готова: файл собран из готовых, остальные перечислены, страница скажет об этом.
      ...(missing.length > 0 ? { 'x-missing-orders': missing.join(',') } : {}),
    },
  })
}
