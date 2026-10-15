import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { STEPS, INSTANT_STEP, instantWindow, isEmailConfirmed, sendDrip } from '@/lib/welcomeDrip'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// Письмо 1 welcome-цепочки (приветствие + бонусы профиля): через
// INSTANT_AFTER_MINUTES после регистрации. Зовётся pg_cron + pg_net раз в
// 5 минут (см. welcome_instant_email.sql), поэтому фактическая задержка —
// от 10 до ~15 минут.
//
// Секрета у эндпоинта сознательно нет, как и у /api/hooks/new-signup: на вход он
// ничего не принимает, а каждый профиль получает письмо ровно один раз —
// ограничители:
//  1. LAUNCH, email_optout, удалённые и админские аккаунты — не пишем;
//  2. окно: аккаунту от 10 минут до 24 часов. Старше — «догонять» не пишем;
//  3. только подтверждённый адрес: profiles создаётся уже при запросе
//     magic-link. Неподтверждённого не трогаем (без claim) — если человек
//     подтвердит адрес в пределах окна, письмо уйдёт следующим тиком;
//  4. claim по email_drips (PK user_id+step) ДО отправки: два одновременных вызова
//     не пошлют письмо дважды. Сбой отправки — строку откатываем, следующий тик
//     попробует снова (пока аккаунт в окне); повтор письма, которое Resend
//     на деле принял, гасит ключ идемпотентности в sendDrip.
export async function POST() {
  const step = STEPS.find(s => s.n === INSTANT_STEP)!
  const { newerThan, olderThan } = instantWindow()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, created_at, trial_expires_at')
    .gte('created_at', newerThan)
    .lte('created_at', olderThan)
    .eq('email_optout', false)
    .is('deleted_at', null)
    // Админам бонус за профиль не начисляется — письмо про него было бы неправдой.
    .not('is_admin', 'is', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Кому приветствие уже ушло — не дёргаем для них auth каждые 5 минут.
  // Сбой этого чтения не опасен: claim ниже всё равно не даст дубля.
  const ids = (profiles ?? []).map(p => p.id)
  const { data: done } = ids.length
    ? await supabase.from('email_drips').select('user_id').eq('step', step.n).in('user_id', ids)
    : { data: [] }
  const already = new Set((done ?? []).map(r => r.user_id))

  let sent = 0, skipped = 0
  for (const p of profiles ?? []) {
    if (already.has(p.id)) continue
    if (!(await isEmailConfirmed(supabase, p.id))) { skipped++; continue }
    const { error: claimError } = await supabase
      .from('email_drips')
      .insert({ user_id: p.id, step: step.n })
    if (claimError) continue // уже отправлено (PK) или параллельный вызов успел раньше

    try {
      if (await sendDrip(resend, p, step)) sent++
      else skipped++ // адрес негодный или подавлен: строку оставляем, чтобы не проверять его каждые 5 минут
    } catch (e) {
      await supabase.from('email_drips').delete().eq('user_id', p.id).eq('step', step.n)
      console.error('hooks/welcome-instant: send failed for', p.id, ':', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: true, sent, skipped })
}
