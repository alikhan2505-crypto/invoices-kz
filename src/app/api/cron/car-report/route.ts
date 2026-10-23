import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFounderTelegram } from '@/lib/founderTelegram'
import { loadCarReportData } from '@/lib/visits/reportData'
import { buildCarReportText } from '@/lib/visits/report'
import { isMissingTableError } from '@/lib/visits/server'
import { isCronAuthorized } from '@/lib/cronAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Ежедневный отчёт «Машина/QR» основателю: 15:00 UTC = 20:00 в Алматы
// (vercel.json). Сколько людей пришло с наклейки на машине (точно — по
// utm_source=car с /car и /qr, вероятно — по оценке, см.
// src/lib/visits/classify.ts), сколько из них зарегистрировались, весь сайт
// и регистрации за день, сравнение со вчера и 7 дней.
//
// Один отчёт в сутки: перед отправкой день «захватывается» строкой в
// daily_reports (первичный ключ day+kind) — повтор крона видит захват и
// молчит. Если отправка не удалась, захват снимается, чтобы повтор дошёл.
//
// ?dry=1 (с тем же CRON_SECRET) — вернуть текст, ничего не отправляя.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await loadCarReportData(supabase, new Date())
  const text = buildCarReportText(data)

  if (new URL(request.url).searchParams.get('dry') === '1') {
    return NextResponse.json({ dry: true, day: data.day, text })
  }

  const KIND = 'car'
  let claimed = false
  const { error: claimError } = await supabase.from('daily_reports').insert({ day: data.day, kind: KIND })
  if (claimError) {
    if (claimError.code === '23505') return NextResponse.json({ ok: true, already: true, day: data.day })
    // До миграции захватить день негде — отправляем без защиты от повтора
    // (Vercel сам крон не повторяет). Иная ошибка — тоже отправляем: лучше
    // редкий дубль, чем молча пропавший отчёт.
    if (!isMissingTableError(claimError)) console.error('cron/car-report: claim failed:', claimError.message)
  } else {
    claimed = true
  }

  const sent = await sendFounderTelegram(text)
  if (!sent.ok) {
    console.error('cron/car-report: send failed:', sent.reason)
    if (claimed) await supabase.from('daily_reports').delete().eq('day', data.day).eq('kind', KIND)
    return NextResponse.json({ ok: false, error: 'send failed' }, { status: 502 })
  }
  if (claimed) await supabase.from('daily_reports').update({ sent_at: new Date().toISOString() }).eq('day', data.day).eq('kind', KIND)
  return NextResponse.json({ ok: true, day: data.day, tablesMissing: data.tablesMissing })
}
