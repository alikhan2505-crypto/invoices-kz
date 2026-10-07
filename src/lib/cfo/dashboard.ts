import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem, CfoRecurrence } from './types'
import { addDays, addMonths, monthKey, monthRange } from './dates'
import { totalBalanceAt } from './balances'
import { buildPnl, type Cell } from './pnl'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from './calendar'

export const RUNWAY_WINDOW_DAYS = 90
export const UPCOMING_DAYS = 7

export type Breakeven = { kind: 'ok'; value: number } | { kind: 'no-revenue' } | { kind: 'unreachable' }

export type Dashboard = {
  month: string
  revenue: Cell
  grossMarginPct: number | null
  netProfit: Cell
  cashNow: number
  runwayDays: number | null
  breakeven: Breakeven
  monthly: { month: string; income: number; expense: number }[]
  expenseStructure: { articleId: string; name: string; amount: number }[]
  upcoming: CfoOperation[]
  firstGap: string | null
}

export function buildDashboard(input: {
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  plan: CfoPlanItem[]
  month: string
  today: string
}): Dashboard {
  const { accounts, articles, operations, recurrences, plan, month, today } = input

  const pnl = buildPnl({ articles, operations, plan, months: [month] })
  const rowTotal = (key: string): Cell => pnl.find((r) => r.key === key)?.total ?? { plan: 0, fact: 0 }
  const revenue = rowTotal('g:revenue')
  const cogs = rowTotal('g:cogs')
  const opex = rowTotal('g:opex')
  const netProfit = rowTotal('t:net')

  const grossMarginPct = revenue.fact > 0 ? ((revenue.fact - cogs.fact) / revenue.fact) * 100 : null
  // Упрощение v1: все операционные расходы считаются постоянными.
  let breakeven: Breakeven
  if (revenue.fact <= 0) {
    breakeven = { kind: 'no-revenue' }
  } else {
    const ratio = (revenue.fact - cogs.fact) / revenue.fact
    breakeven = ratio <= 0 ? { kind: 'unreachable' } : { kind: 'ok', value: Math.round(opex.fact / ratio) }
  }

  const actual = operations.filter((o) => o.status === 'actual')
  const cashNow = totalBalanceAt(accounts, actual, today)
  const windowStart = addDays(today, -(RUNWAY_WINDOW_DAYS - 1))
  const outflow = actual
    .filter((o) => o.direction === 'out' && o.paidOn >= windowStart && o.paidOn <= today)
    .reduce((s, o) => s + o.amount, 0)
  // Целочисленно, чтобы деление на «средний день» не давало 59,999…
  const runwayDays = outflow === 0 ? null : cashNow <= 0 ? 0 : Math.floor((cashNow * RUNWAY_WINDOW_DAYS) / outflow)

  const pnlArticles = new Map(articles.filter((a) => a.pnlGroup !== null).map((a) => [a.id, a]))
  const months = monthRange(addMonths(month, -11), month)
  const index = new Map(months.map((m, i) => [m, i]))
  const monthly = months.map((m) => ({ month: m, income: 0, expense: 0 }))
  const structure = new Map<string, number>()
  for (const op of actual) {
    if (op.direction === 'transfer' || !op.articleId || !pnlArticles.has(op.articleId)) continue
    const m = monthKey(op.accruedOn)
    const i = index.get(m)
    if (i !== undefined) {
      if (op.direction === 'in') monthly[i].income += op.amount
      else monthly[i].expense += op.amount
    }
    if (m === month && op.direction === 'out') structure.set(op.articleId, (structure.get(op.articleId) ?? 0) + op.amount)
  }
  const expenseStructure = [...structure]
    .map(([articleId, amount]) => ({ articleId, name: pnlArticles.get(articleId)!.name, amount }))
    .sort((a, b) => b.amount - a.amount)

  const calendar = buildCalendar({ accounts, operations, recurrences, today, from: today, to: addDays(today, CALENDAR_HORIZON_DAYS - 1) })
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1)
  const upcoming = calendar.days
    .filter((d) => d.date <= upcomingEnd)
    .flatMap((d) => d.items.filter((o) => o.status === 'planned'))

  return { month, revenue, grossMarginPct, netProfit, cashNow, runwayDays, breakeven, monthly, expenseStructure, upcoming, firstGap: calendar.firstGap }
}
