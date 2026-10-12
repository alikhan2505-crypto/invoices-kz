import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { normalizeEmail, looksLikeEmail, verdictFromStatus } from '@/lib/emailDeliverability'
import { unsubToken } from '@/lib/welcomeDrip'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// Welcome-цепочка: три коротких письма новым аккаунтам на 1-й, 3-й и 7-й день.
//
// Три жёстких предохранителя, в порядке важности:
//  1. LAUNCH: пишем только зарегистрированным ПОСЛЕ запуска фичи — 44 старых
//     аккаунта не получают внезапную «цепочку» задним числом.
//  2. Suppression-проверка Resend перед каждым письмом (та же, что спасает
//     magic-link: см. src/lib/emailDeliverability.ts) — в подавленный адрес
//     не шлём и не портим репутацию домена.
//  3. email_optout: ссылка «отписаться» в каждом письме, после неё цепочка
//     останавливается навсегда.
const LAUNCH = '2026-10-12T00:00:00Z'

type Step = { n: number; afterDays: number; subject: string; html: (unsub: string) => string }

const wrap = (body: string, unsub: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:30px auto;background:#fff;border:1px solid #e0e0e0;">
  <div style="background:#1C2056;padding:20px 32px;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">INVOICES<span style="color:#A99EF0;">.KZ</span></span>
  </div>
  <div style="padding:28px 32px;font-size:14px;color:#333;line-height:1.6;">${body}</div>
  <div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;">
    Это письмо пришло, потому что вы зарегистрировались на invoices.kz.
    Ответ на это письмо попадёт прямо к нам.
    <a href="${unsub}" style="color:#999;">Отписаться от таких писем</a>
  </div>
</div></body></html>`

const STEPS: Step[] = [
  {
    n: 1,
    afterDays: 1,
    subject: 'Ваш первый счёт — за минуту',
    html: unsub => wrap(`
      <p style="margin:0 0 12px;">Здравствуйте! Это Алихан, основатель invoices.kz.</p>
      <p style="margin:0 0 12px;">Спасибо, что зарегистрировались. Самое полезное, что можно сделать за минуту, —
      выставить первый счёт: реквизиты подставятся по БИН, подпись и печать уже внутри PDF, отправка клиенту
      в WhatsApp одной кнопкой.</p>
      <p style="margin:0 0 16px;"><a href="https://invoices.kz/create?utm_source=drip&utm_campaign=d1"
        style="display:inline-block;background:#5B4CE0;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Выставить счёт</a></p>
      <p style="margin:0;">Если что-то не получается — просто ответьте на это письмо, я читаю ответы сам.</p>
    `, unsub),
  },
  {
    n: 2,
    afterDays: 3,
    subject: 'Бесплатные инструменты: проверка контрагента и не только',
    html: unsub => wrap(`
      <p style="margin:0 0 12px;">Короткое письмо о том, что в invoices.kz бесплатно даже без тарифа:</p>
      <p style="margin:0 0 8px;">• <a href="https://invoices.kz/tools/kontragent?utm_source=drip&utm_campaign=d3" style="color:#5B4CE0;">Проверка контрагента по БИН</a> — неблагонадёжность, ликвидация, долги по налогам и НДС по данным КГД;</p>
      <p style="margin:0 0 8px;">• <a href="https://invoices.kz/tools/margin?utm_source=drip&utm_campaign=d3" style="color:#5B4CE0;">Калькулятор маржи Kaspi</a> — сколько реально остаётся с продажи;</p>
      <p style="margin:0 0 12px;">• <a href="https://invoices.kz/tools/waybills?utm_source=drip&utm_campaign=d3" style="color:#5B4CE0;">Склейка накладных Kaspi</a> — в один PDF для печати.</p>
      <p style="margin:0;">А к счетам можно подключить оплату Kaspi — клиент платит по QR прямо со счёта.</p>
    `, unsub),
  },
  {
    n: 3,
    afterDays: 7,
    subject: 'Чего вам не хватило?',
    html: unsub => wrap(`
      <p style="margin:0 0 12px;">Прошла неделя с регистрации. Кроме счетов, в invoices.kz есть
      ИИ-агент для переписки с клиентами в WhatsApp и Instagram, бот демпинга цен для Kaspi Магазина
      и учёт финансов.</p>
      <p style="margin:0 0 12px;">Но интереснее другое: если вы зашли, посмотрели и чего-то не нашли —
      ответьте одним предложением, чего не хватило. Я читаю каждый ответ и чиню быстро.</p>
      <p style="margin:0;">— Алихан, invoices.kz</p>
    `, unsub),
  },
]

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Кандидаты: свежие аккаунты после запуска фичи, не отписавшиеся.
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, created_at, email_optout')
    .gte('created_at', LAUNCH)
    .eq('email_optout', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (profiles ?? []).map(p => p.id)
  const sentRows = ids.length
    ? (await supabase.from('email_drips').select('user_id, step').in('user_id', ids)).data ?? []
    : []
  const sentSet = new Set(sentRows.map(r => `${r.user_id}|${r.step}`))

  let sent = 0, skipped = 0
  for (const p of profiles ?? []) {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86_400_000
    for (const step of STEPS) {
      // Окно в двое суток: позже — поезд ушёл, «догоняющие» письма недельной
      // давности выглядят как спам.
      if (ageDays < step.afterDays || ageDays > step.afterDays + 2) continue
      if (sentSet.has(`${p.id}|${step.n}`)) continue
      const email = normalizeEmail(p.email)
      if (!looksLikeEmail(email)) { skipped++; continue }

      // Suppression: в подавленный адрес не шлём. Недоступность проверки —
      // не повод молчать (unknown == шлём), как и у magic-link.
      try {
        const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          signal: AbortSignal.timeout(8000),
        })
        if (verdictFromStatus(res.status) === 'undeliverable') { skipped++; continue }
      } catch { /* unknown → продолжаем */ }

      const unsub = `https://invoices.kz/api/email/unsubscribe?u=${p.id}&t=${unsubToken(p.id)}`
      try {
        await resend.emails.send({
          from: 'Алихан, invoices.kz <mail@invoices.kz>',
          to: email,
          subject: step.subject,
          html: step.html(unsub),
          headers: { 'List-Unsubscribe': `<${unsub}>` },
        })
        // Запись до возможного повтора крона: дважды одно письмо хуже,
        // чем потерянная строка при падении после send.
        await supabase.from('email_drips').insert({ user_id: p.id, step: step.n })
        sent++
      } catch (e) {
        console.error('cron/welcome-drip: send failed for', p.id, 'step', step.n, ':', e instanceof Error ? e.message : e)
      }
    }
  }
  return NextResponse.json({ success: true, sent, skipped })
}
