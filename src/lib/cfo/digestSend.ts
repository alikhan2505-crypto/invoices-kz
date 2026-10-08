// Серверная часть утренней сводки: читает кабинет владельца service-role
// клиентом (только для своего user_id — строки фильтруются явно, RLS тут не
// работает) и шлёт текст в его Telegram через бот уведомлений.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { loadWorkspace } from './data'
import { almatyToday, buildDigest } from './digest'
import { addMonths, monthKey } from './dates'
import { buildMonthlyReport } from './monthlyReport'

export type DigestResult = 'sent' | 'no_company' | 'no_telegram' | 'no_accounts'

export async function sendCfoDigest(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<DigestResult> {
  const [{ data: company, error: companyError }, { data: profile, error: profileError }] = await Promise.all([
    db.from('cfo_companies').select('id').eq('user_id', userId).maybeSingle(),
    db.from('profiles').select('telegram_chat_id').eq('id', userId).single(),
  ])
  if (companyError) throw new Error(companyError.message)
  if (profileError) throw new Error(profileError.message)
  if (!company) return 'no_company'
  if (!profile?.telegram_chat_id) return 'no_telegram'
  const ws = await loadWorkspace(company.id, userId, db)
  if (ws.accounts.length === 0) return 'no_accounts'
  const today = almatyToday(now)
  // 1-го числа сначала итоги прошлого месяца, потом обычная утренняя сводка.
  if (today.endsWith('-01')) await sendTelegramNotification(profile.telegram_chat_id, buildMonthlyReport(ws, addMonths(monthKey(today), -1)))
  await sendTelegramNotification(profile.telegram_chat_id, buildDigest(ws, today))
  return 'sent'
}
