// Последнее изменение цены ботом по каждому товару (для строки на карточке Демпинга, P13).
// Берём из журнала проверок: строки action='updated' редкие (одна на реальное изменение), под них
// есть частичный индекс (kaspi_price_checks_last_change_idx). Сбой чтения не должен ронять список
// товаров: карточка просто не покажет «цена изменена».

import type { SupabaseClient } from '@supabase/supabase-js'

export type LastPriceChange = { at: string; from: number | null; to: number | null }

// Идентификаторы идут в адрес запроса: 100 штук ~ 3.7 КБ, любой прокси такое пропускает.
const CHUNK = 100
const ROWS_PER_CHUNK = 1000

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export async function loadLastPriceChanges(
  db: Pick<SupabaseClient, 'from'>,
  productIds: string[],
): Promise<Map<string, LastPriceChange>> {
  const out = new Map<string, LastPriceChange>()
  const chunks: string[][] = []
  for (let i = 0; i < productIds.length; i += CHUNK) chunks.push(productIds.slice(i, i + CHUNK))

  const results = await Promise.all(chunks.map(async ids => {
    try {
      const { data, error } = await db
        .from('kaspi_shop_price_checks')
        .select('tracked_product_id, checked_at, own_price_before, own_price_after')
        .eq('action', 'updated')
        .in('tracked_product_id', ids)
        .order('checked_at', { ascending: false })
        .limit(ROWS_PER_CHUNK)
      if (error) return []
      return (data || []) as Array<Record<string, unknown>>
    } catch {
      return []
    }
  }))

  for (const rows of results) {
    for (const r of rows) {
      const id = r.tracked_product_id
      const at = r.checked_at
      if (typeof id !== 'string' || typeof at !== 'string') continue
      const t = Date.parse(at)
      if (!Number.isFinite(t)) continue
      const prev = out.get(id)
      if (prev && Date.parse(prev.at) >= t) continue
      out.set(id, { at, from: num(r.own_price_before), to: num(r.own_price_after) })
    }
  }
  return out
}
