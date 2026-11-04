import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { LAUNCH, getAuthIdentity, pickDailyStep, sendDrip, type SentDrip, type SetupState } from '@/lib/welcomeDrip'
import { isCronAuthorized } from '@/lib/cronAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// Welcome-цепочка, дневная часть: письма через сутки, на 3-й и на 7-й день
// (расписание и номера шагов — в src/lib/welcomeDrip.ts). Письмо «через сутки»
// зависит от кабинета: нет реквизитов или банка — шаг 5 (мастер на дашборде),
// иначе шаг 4 (что ещё умеет invoices.kz). Письмо 1 уходит
// через 10 минут после регистрации — это /api/hooks/welcome-instant, не здесь.
//
// Предохранители, в порядке важности:
//  1. LAUNCH: пишем только зарегистрированным ПОСЛЕ запуска фичи — 44 старых
//     аккаунта не получают внезапную «цепочку» задним числом.
//  2. Suppression-проверка Resend перед каждым письмом (та же, что спасает
//     magic-link: см. src/lib/emailDeliverability.ts) — в подавленный адрес
//     не шлём и не портим репутацию домена. Неподтверждённый адрес (magic-link
//     запросили, но не открыли) — тоже не шлём.
//  3. email_optout: ссылка «отписаться» в каждом письме, после неё цепочка
//     останавливается навсегда. Удалённые и админские аккаунты — не пишем.
//  4. Не больше одного письма за прогон и не чаще раза в MIN_GAP_HOURS
//     (pickDailyStep), claim строки email_drips до отправки — повторный
//     вызов крона не пошлёт письмо дважды. Для писем-альтернатив (4/5)
//     claim дополнительно сверяется с базой: уйти может только одно из них.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Дневные шаги кончаются к 9-му дню (окно шага 7-го дня — [7, 9)), поэтому
  // старше 10 дней аккаунты не нужны. Так выборки профилей, email_drips и
  // bank_accounts ниже не растут со временем и не упираются в лимит строк
  // PostgREST (1000), который молча обрезал бы ответ.
  const since = new Date(Math.max(new Date(LAUNCH).getTime(), Date.now() - 10 * 86_400_000)).toISOString()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, created_at, trial_expires_at, company_name, bin_iin')
    .gte('created_at', since)
    .eq('email_optout', false)
    .is('deleted_at', null)
    .not('is_admin', 'is', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (profiles ?? []).map(p => p.id)
  const { data: sentRows, error: sentError } = ids.length
    ? await supabase.from('email_drips').select('user_id, step, sent_at').in('user_id', ids)
    : { data: [], error: null }
  // Не знаем, что уже отправлено, — не шлём ничего: дубль хуже пропуска.
  if (sentError) return NextResponse.json({ error: sentError.message }, { status: 500 })
  const sentBy = new Map<string, SentDrip[]>()
  for (const r of sentRows ?? []) {
    const list = sentBy.get(r.user_id) ?? []
    list.push({ step: r.step, sent_at: r.sent_at })
    sentBy.set(r.user_id, list)
  }

  // Готовность к счёту для письма «через сутки» (шаг 5 вместо шага 4). Не
  // удалось узнать про банки — состояние неизвестно, шлём прежнее письмо 4.
  const { data: bankRows, error: bankError } = ids.length
    ? await supabase.from('bank_accounts').select('user_id').in('user_id', ids)
    : { data: [], error: null }
  const withBank = new Set((bankRows ?? []).map(r => r.user_id))
  const setupOf = (p: { id: string; company_name: string | null; bin_iin: string | null }): SetupState | undefined =>
    bankError ? undefined : { requisites: !!p.company_name?.trim() && !!p.bin_iin?.trim(), bank: withBank.has(p.id) }

  let sent = 0, skipped = 0
  for (const p of profiles ?? []) {
    const setup = setupOf(p)
    const step = pickDailyStep(p.created_at, sentBy.get(p.id) ?? [], Date.now(), setup)
    if (!step) continue
    // Получатель — адрес из auth.users (profiles.email пользователь пишет сам),
    // запасной profiles.email — только если у подтверждённого аккаунта auth
    // не вернул адрес.
    const identity = await getAuthIdentity(supabase, p.id)
    if (!identity.confirmed) { skipped++; continue }
    const recipient = { id: p.id, created_at: p.created_at, trial_expires_at: p.trial_expires_at, email: identity.email ?? p.email, setup }

    const { error: claimError } = await supabase
      .from('email_drips')
      .insert({ user_id: p.id, step: step.n })
    if (claimError) continue // параллельный прогон успел раньше

    // Шаги-альтернативы (4 и 5) — разные строки PK, поэтому claim сам их не
    // разводит: два наложившихся прогона могли бы взять по одной. После своего
    // claim проверяем по базе, нет ли уже другой альтернативы; есть или не
    // удалось проверить — снимаем свой claim. Из двух прогонов, вставивших
    // строки, хотя бы второй увидит первую, так что оба письма уйти не могут.
    if (step.excludes?.length) {
      const { data: rival, error: rivalError } = await supabase
        .from('email_drips').select('step').eq('user_id', p.id).in('step', step.excludes)
      if (rivalError || (rival ?? []).length > 0) {
        await supabase.from('email_drips').delete().eq('user_id', p.id).eq('step', step.n)
        skipped++
        continue
      }
    }

    try {
      if (await sendDrip(resend, recipient, step)) sent++
      else {
        // Адрес подавлен или негодный: снимаем claim, завтра проверим снова.
        await supabase.from('email_drips').delete().eq('user_id', p.id).eq('step', step.n)
        skipped++
      }
    } catch (e) {
      await supabase.from('email_drips').delete().eq('user_id', p.id).eq('step', step.n)
      console.error('cron/welcome-drip: send failed for', p.id, 'step', step.n, ':', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ success: true, sent, skipped })
}
