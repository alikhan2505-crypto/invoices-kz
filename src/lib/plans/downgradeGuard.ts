// Запрет «обратной» покупки: пока у человека действует Про, купить Базовый нельзя.
// computePlanActivation считает срок другого тарифа от «сейчас», поэтому такая покупка
// молча заменяла Про на Базовый, и оплаченные дни Про сгорали (аудит 02.11.2026, п. 1.3).
// Интерфейс /upgrade кнопку Базового при активном Про и так не показывает: это защита
// на сервере от прямого вызова API и от устаревшей открытой вкладки.

import { createClient } from '@supabase/supabase-js'
import { parseDbTimestamp } from '@/lib/plan'

export interface PlanState {
  plan?: string | null
  plan_expires_at?: string | null
}

/** Чистое правило: покупка Базового при ещё не истёкшем Про. */
export function isDowngradeBlocked(profile: PlanState | null | undefined, purchasePlan: string, now: Date = new Date()): boolean {
  if (purchasePlan !== 'basic' || profile?.plan !== 'pro') return false
  const expiry = parseDbTimestamp(profile.plan_expires_at)
  return !!expiry && expiry > now
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Запрещена ли пользователю эта покупка. Не прочитался профиль -- не блокируем: платёжный путь
 * из-за сбоя чтения закрывать нельзя (клиент не сможет заплатить), а Про при этом сразу не пропадёт.
 */
export async function isPlanDowngradeBlockedFor(userId: string, purchasePlan: string): Promise<boolean> {
  if (purchasePlan !== 'basic') return false
  const { data, error } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', userId).maybeSingle()
  if (error) {
    console.error('Downgrade guard: profile read failed, allowing the purchase:', error.message)
    return false
  }
  return isDowngradeBlocked(data as PlanState | null, purchasePlan)
}
