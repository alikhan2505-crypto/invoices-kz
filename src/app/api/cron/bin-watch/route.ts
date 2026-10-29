import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { isCronAuthorized } from '@/lib/cronAuth'
import { performBinLookup } from '@/lib/binLookupServer'
import { getAuthIdentity } from '@/lib/welcomeDrip'
import { loadNotifyProfile } from '@/lib/notificationPrefsServer'
import { BIN_WATCH_CACHE_TTL_MS } from '@/lib/binWatch/config'
import { runBinWatch, type MailProfile } from '@/lib/binWatch/run'
import { sendBinWatchMail } from '@/lib/binWatch/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ЛИТЕРАЛ, не импорт: Next 16 читает segment config статически и на импортированном
// идентификаторе валит `next build` (Unknown identifier). Должен совпадать с
// BIN_WATCH_MAX_DURATION_S в config.ts (route.test.ts это проверяет).
export const maxDuration = 300

// Слежение за БИН (решение основателя 29.10.2026): раз в сутки перепроверяет БИН
// из списков пользователей и шлёт ОДНО письмо владельцу, если результат
// ухудшился. 02:30 UTC = 07:30 в Алматы, после суточной выгрузки реабилитации
// (02:00 UTC, kgd-rehabilitation), чтобы её признак был свежим. Логика, предохранители
// и порядок - src/lib/binWatch/run.ts. До применения supabase/migrations/bin_watch.sql
// крон ничего не делает и отвечает reason: table_missing. Пока включён админ-гейт
// (BIN_WATCH_ADMIN_ONLY), строки не-админов не обрабатываются и писем им нет.
// Защита та же, что у остальных /api/cron/*: CRON_SECRET. В ответе и логах только
// числа: ни БИН, ни названий, ни адресов.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const summary = await runBinWatch({
    supabase,
    lookup: bin => performBinLookup(supabase, bin, { extras: true, cacheTtlMs: BIN_WATCH_CACHE_TTL_MS }),
    // Колонки тарифа нужны для лимита строк владельца (binWatchLimit).
    loadProfile: id => loadNotifyProfile<{ deleted_at: string | null; is_admin: boolean | null }>(supabase, id, 'deleted_at, is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at') as Promise<MailProfile | null>,
    resolveIdentity: id => getAuthIdentity(supabase, id),
    sendMail: (to, items, day) => sendBinWatchMail(resend, to, items, day),
  })
  console.log('bin-watch:', JSON.stringify(summary))
  // До миграции это штатное «пока выключено», не сбой крона.
  if (!summary.ok && summary.reason === 'table_missing') return NextResponse.json(summary)
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 })
}
