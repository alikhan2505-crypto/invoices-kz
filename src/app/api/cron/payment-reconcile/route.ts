import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFounderTelegram } from '@/lib/founderTelegram'
import { isCronAuthorized } from '@/lib/cronAuth'
import { almatyDay } from '@/lib/visits/almatyDay'
import { isMissingTableError } from '@/lib/visits/server'
import { buildHeartbeatText, buildReconcileText, findUnappliedPayments, isHeartbeatDay } from '@/lib/paymentReconcile'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Ночная сверка «оплачено, но не применено» (аудит 02.11.2026, пункт 1.2).
// Правила и окно проверки: src/lib/paymentReconcile.ts. Только читает базу и
// пишет основателю в Telegram. При чистой сверке молчит, кроме одной строки
// «сверка жива» по понедельникам: иначе «крон не запустился» (сменился
// CRON_SECRET, пропала запись в vercel.json) выглядел бы как «всё чисто».
// Крон Vercel Hobby срабатывает в любую минуту назначенного часа, поэтому
// стоит в 06:xx UTC, когда kaspi-poll (04:xx) уже закончил: платёж, который тот
// применяет прямо сейчас, не принимается за потерянный.
//
// Один отчёт каждого вида в сутки: день «захватывается» строкой daily_reports
// (kind 'payment-reconcile' / 'payment-reconcile-ok'), как у cron/funnel-daily;
// при сбое отправки захват снимается, чтобы повтор дошёл.
//
// ?dry=1 (с тем же CRON_SECRET) — вернуть находки и текст, ничего не отправляя.
export const maxDuration = 60

const KIND_ALERT = 'payment-reconcile'
const KIND_HEARTBEAT = 'payment-reconcile-ok'

async function deliver(kind: string, text: string, now: Date): Promise<'sent' | 'already' | 'failed'> {
  const day = almatyDay(now).day
  let claimed = false
  const { error: claimError } = await supabase.from('daily_reports').insert({ day, kind })
  if (claimError) {
    if (claimError.code === '23505') return 'already'
    if (!isMissingTableError(claimError)) console.error('cron/payment-reconcile: claim failed:', claimError.message)
  } else {
    claimed = true
  }

  const sent = await sendFounderTelegram(text)
  if (!sent.ok) {
    console.error('cron/payment-reconcile: send failed:', sent.reason)
    if (claimed) await supabase.from('daily_reports').delete().eq('day', day).eq('kind', kind)
    return 'failed'
  }
  if (claimed) await supabase.from('daily_reports').update({ sent_at: new Date().toISOString() }).eq('day', day).eq('kind', kind)
  return 'sent'
}

async function run(request: Request) {
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const now = new Date()

  const result = await findUnappliedPayments(supabase, now)
  const alert = buildReconcileText(result, now)
  const counts = { findings: result.findings.length, errors: result.errors.length, checked: result.checked }
  if (result.errors.length) console.error('cron/payment-reconcile: check incomplete:', result.errors.join(' | '))
  if (result.findings.length) console.error('cron/payment-reconcile: unapplied payments:', JSON.stringify(result.findings.map(f => ({ kind: f.kind, id: f.id }))))

  const heartbeat = !alert && isHeartbeatDay(now) ? buildHeartbeatText(result.checked, now) : null
  const text = alert ?? heartbeat

  if (dry) return NextResponse.json({ dry: true, ...counts, findings: result.findings, errors: result.errors, text })
  if (!text) return NextResponse.json({ ok: true, ...counts })

  const outcome = await deliver(alert ? KIND_ALERT : KIND_HEARTBEAT, text, now)
  if (outcome === 'failed') return NextResponse.json({ ok: false, error: 'send failed', ...counts }, { status: 502 })
  if (outcome === 'already') return NextResponse.json({ ok: true, already: true, ...counts })
  return NextResponse.json({ ok: true, sent: true, heartbeat: !alert, ...counts })
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return await run(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('cron/payment-reconcile: failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
