import { useEffect, useState } from 'react'
import type { DocQuotaTool } from '@/lib/toolQuota'

// Клиентская сторона квартального лимита Счёта, АВР и накладной
// (/api/tools/doc-quota, решение основателя 15.10.2026 — «как в КП»): по 3
// документа на IP в квартал, считает СЕРВЕР. Раньше счётчик жил в localStorage
// и обнулялся каждый день — его стирала одна кнопка «очистить данные сайта».
// Только для клиентских компонентов (хук useState/useEffect).

/** Лимит по умолчанию — пока сервер не ответил (совпадает с DOC_TOOL_QUARTER_LIMIT). */
export const DOC_QUOTA_DEFAULT_LIMIT = 3

export type DocQuota = { remaining: number; limit: number; resetsAt: string }

/** Ответ сервера → квота; null, если ответ не похож на квоту. */
export function parseDocQuota(data: unknown): DocQuota | null {
  const d = data as Partial<DocQuota> | null
  if (!d || typeof d.remaining !== 'number' || typeof d.resetsAt !== 'string') return null
  return {
    remaining: Math.max(0, d.remaining),
    limit: typeof d.limit === 'number' ? d.limit : DOC_QUOTA_DEFAULT_LIMIT,
    resetsAt: d.resetsAt,
  }
}

/**
 * Остаток на этот квартал при открытии страницы. null — ещё не пришёл (или
 * сервер не ответил): подсказку не рисуем, а кнопка всё равно спросит сервер.
 */
export function useDocQuota(tool: DocQuotaTool) {
  const [quota, setQuota] = useState<DocQuota | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/tools/doc-quota?tool=${tool}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setQuota(parseDocQuota(data)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tool])
  return [quota, setQuota] as const
}

export type DocClaim =
  | { kind: 'ok'; quota: DocQuota }
  | { kind: 'limit'; quota: DocQuota | null }
  | { kind: 'error' }

/** Занять один документ на сервере ДО генерации. 'error' — сеть/503: документ не делаем. */
export async function claimDocSlot(tool: DocQuotaTool): Promise<DocClaim> {
  try {
    const res = await fetch('/api/tools/doc-quota', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      const quota = parseDocQuota(data)
      return quota ? { kind: 'ok', quota } : { kind: 'error' }
    }
    if (res.status === 429 && (data as { error?: unknown } | null)?.error === 'limit') {
      return { kind: 'limit', quota: parseDocQuota(data) }
    }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
