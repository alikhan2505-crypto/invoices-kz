import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { fetchWaybillPdf, mergeWaybillPdfs } from '@/lib/kaspiShop/waybills'

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

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const orderCodes: string[] = body?.orderCodes
  if (!Array.isArray(orderCodes) || orderCodes.length === 0) {
    return NextResponse.json({ error: 'orderCodes обязателен и не должен быть пустым' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const pdfs: Buffer[] = []
  for (const orderCode of orderCodes) {
    try {
      pdfs.push(await fetchWaybillPdf(connection.sessionCookies, orderCode))
    } catch (err: any) {
      return NextResponse.json({ error: `Не удалось получить накладную для заказа ${orderCode}: ${err.message}` }, { status: 502 })
    }
  }

  const merged = await mergeWaybillPdfs(pdfs)
  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="nakladnye.pdf"' },
  })
}
