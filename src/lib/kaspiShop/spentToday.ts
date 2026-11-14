// «Списано сегодня» на странице Демпинга (P16): сколько тенге бот взял с кошелька за календарный
// день по Алматы. Списания живут в единой wallet_ledger со знаком минус (5 ₸ за изменение цены,
// 5 ₸ за проверку ниши, тип kaspi_shop_check); пополнения и бонусы другого типа и сюда не попадают.
// Сбой чтения не должен ронять список товаров: возвращаем null, страница тогда строку не рисует.

import type { SupabaseClient } from '@supabase/supabase-js'

export const SPEND_LEDGER_TYPE = 'kaspi_shop_check'
const ALMATY_OFFSET_MS = 5 * 3_600_000 // Казахстан: единый UTC+5, без перехода на летнее время

/** Начало текущих суток по Алматы как момент UTC (ISO). */
export function almatyDayStartIso(now: number): string {
  const shifted = now + ALMATY_OFFSET_MS
  const startShifted = shifted - (((shifted % 86_400_000) + 86_400_000) % 86_400_000)
  return new Date(startShifted - ALMATY_OFFSET_MS).toISOString()
}

// Один день продавца: тысячи строк по 5 ₸ невозможны (баланс кончится раньше), но потолок выборки
// Supabase (1000) лучше знать: за ним сумма была бы занижена, и страница показала бы «не меньше».
const MAX_ROWS = 1000

export async function loadSpentTodayTenge(
  db: Pick<SupabaseClient, 'from'>,
  userId: string,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { data, error } = await db
      .from('wallet_ledger')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', SPEND_LEDGER_TYPE)
      .gte('created_at', almatyDayStartIso(now))
      .limit(MAX_ROWS)
    if (error) {
      console.error('spentToday: ledger read failed:', error.message)
      return null
    }
    // Списания хранятся отрицательными; на случай положительной записи берём модуль, как dailyDigest.
    return (data || []).reduce((sum: number, r: { amount?: unknown }) => sum + Math.abs(Number(r.amount) || 0), 0)
  } catch (err: any) {
    console.error('spentToday: ledger read threw:', err?.message)
    return null
  }
}
