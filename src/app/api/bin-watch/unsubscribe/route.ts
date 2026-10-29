import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyBinWatchUnsub } from '@/lib/binWatch/email'
import { BIN_WATCH_MAIL_EVENT } from '@/lib/binWatch/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// «Не получать такие письма» из письма о слежении за БИН. Выключает ТОЛЬКО это
// событие (notification_prefs.bin_watch_changed.email = false), не welcome-
// цепочку и не служебные письма о счетах: поэтому отдельный маршрут и отдельная
// подпись (binWatchUnsubToken), а не /api/email/unsubscribe. Список слежения не
// трогается: включить письма обратно можно в /profile/notifications.

function verifiedUserId(req: NextRequest): string | null {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  return verifyBinWatchUnsub(u, t) ? u : null
}

async function turnOff(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('set_notification_pref', {
    p_user: userId, p_event: BIN_WATCH_MAIL_EVENT, p_channel: 'email', p_value: false,
  })
  return !error
}

// Кнопка отписки почтового клиента (RFC 8058): POST на тот же URL.
export async function POST(req: NextRequest) {
  const u = verifiedUserId(req)
  if (!u) return new NextResponse('Invalid link', { status: 400 })
  if (!(await turnOff(u))) return new NextResponse('Try again later', { status: 500 })
  return new NextResponse(null, { status: 200 })
}

export async function GET(req: NextRequest) {
  const u = verifiedUserId(req)
  if (!u) return new NextResponse('Ссылка недействительна', { status: 400 })
  if (!(await turnOff(u))) return new NextResponse('Не получилось, попробуйте позже', { status: 500 })
  return new NextResponse(
    `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Отписка - invoices.kz</title>
<body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:80px auto;background:#fff;border:1px solid #e0e0e0;padding:32px;text-align:center;">
  <div style="font-size:18px;font-weight:bold;color:#1C2056;margin-bottom:10px;">Готово: письма о слежении за БИН больше не придут</div>
  <div style="font-size:14px;color:#333;">Список слежения остался как был, а включить письма обратно можно в настройках уведомлений.</div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
