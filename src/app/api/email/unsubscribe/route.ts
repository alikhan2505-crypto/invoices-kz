import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { unsubToken } from '@/lib/welcomeDrip'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Отписка от welcome-цепочки по подписанной ссылке из письма. GET, потому
// что по ссылке из почтового клиента приходят именно GET'ом; действие
// идемпотентное и безвредное (только выключает письма).
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  const expected = u ? unsubToken(u) : ''
  const ok =
    !!u && !!t && t.length === expected.length &&
    timingSafeEqual(Buffer.from(t), Buffer.from(expected))
  if (!ok) return new NextResponse('Ссылка недействительна', { status: 400 })

  const { error } = await supabase.from('profiles').update({ email_optout: true }).eq('id', u)
  if (error) return new NextResponse('Не получилось, попробуйте позже', { status: 500 })

  return new NextResponse(
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Отписка — invoices.kz</title>
<body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:80px auto;background:#fff;border:1px solid #e0e0e0;padding:32px;text-align:center;">
  <div style="font-size:18px;font-weight:bold;color:#1C2056;margin-bottom:10px;">Готово — больше таких писем не будет</div>
  <div style="font-size:14px;color:#333;">Служебные письма о ваших счетах (оплаты, напоминания) приходят как раньше.</div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
