// Лимиты по статьям = план расходов на месяц из сетки плана. Факт считается
// по начислению (как в БДР), чтобы цифры совпадали с отчётом.
import type { Workspace } from './data'
import { monthKey } from './dates'

export const WARN_SHARE = 0.9

export type LimitRow = { articleId: string; name: string; plan: number; fact: number; share: number; level: 'ok' | 'warn' | 'over' }

export function monthLimits(ws: Workspace, month: string): LimitRow[] {
  const expense = new Map(ws.articles.filter((a) => a.kind === 'expense').map((a) => [a.id, a]))
  const fact = new Map<string, number>()
  for (const o of ws.operations) {
    if (o.status !== 'actual' || o.direction !== 'out' || !o.articleId || monthKey(o.accruedOn) !== month) continue
    fact.set(o.articleId, (fact.get(o.articleId) ?? 0) + o.amount)
  }
  return ws.plan
    .filter((p) => p.month === month && p.amount > 0 && expense.has(p.articleId))
    .map((p) => {
      const f = fact.get(p.articleId) ?? 0
      const share = f / p.amount
      return { articleId: p.articleId, name: expense.get(p.articleId)!.name, plan: p.amount, fact: f, share, level: (share > 1 ? 'over' : share >= WARN_SHARE ? 'warn' : 'ok') as LimitRow['level'] }
    })
    .sort((a, b) => b.share - a.share)
}
