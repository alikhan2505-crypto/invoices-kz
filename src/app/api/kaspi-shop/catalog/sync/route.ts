import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { importCatalogProducts } from '@/lib/kaspiShop/finalizeConnection'

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

// On-demand catalog re-import for the ACTIVE store -- the same dedup-safe
// import finalizeConnection runs at connect time, without a fresh phone/SMS
// login. Origin (2026-08-21): a product restored to sale after connect-time
// import was invisible in Демпинг until a full reconnect.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })
  if (!connection.sessionCookies) return NextResponse.json({ error: 'Сессия кабинета Kaspi не активна — переподключитесь' }, { status: 400 })

  const result = await importCatalogProducts(connection.id, user.id, connection.sessionCookies, connection.merchantId)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true }, { status: 502 })
  }
  // Раньше любой сбой Kaspi давал {ok:true, imported:0} и экран писал «Каталог обновлён: 0».
  // Теперь неполный импорт (ответ Kaspi оборвался, часть товаров не записана) это 502 с цифрами.
  if (!result.complete) {
    const done = result.imported > 0
      ? `Обновлено ${result.imported}${result.total > 0 ? ` из ${result.total}` : ''} товар(ов), остальные не обновлены`
      : 'Каталог не обновлён'
    return NextResponse.json({
      error: `${done}${result.error ? ` (${result.error})` : ''}. Повторите через минуту.`,
      imported: result.imported,
      total: result.total,
      partial: true,
    }, { status: 502 })
  }
  return NextResponse.json({ ok: true, imported: result.imported, total: result.total, pointCitiesPartial: result.pointCitiesPartial })
}
