import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem, CfoRecurrence } from './types'
import { addDays, addMonths, monthKey, monthRange } from './dates'
import { cashBalanceAt, debtAt, loanIds } from './balances'
import { buildPnl, type Cell } from './pnl'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from './calendar'
import { LOAN_PAYMENTS_LABEL, type CfoMode } from './mode'

export const RUNWAY_WINDOW_DAYS = 90
export const UPCOMING_DAYS = 7

export type Breakeven = { kind: 'ok'; value: number } | { kind: 'no-revenue' } | { kind: 'unreachable' }

export type Dashboard = {
  month: string
  revenue: Cell
  grossMarginPct: number | null
  netProfit: Cell
  cashNow: number
  debt: number // сумма остатков кредитных счетов (0, если их нет; долг — отрицательное число)
  runwayDays: number | null
  runwayWindowDays: number // по выплатам за сколько дней считался запас: min(90, сколько дней ведётся учёт)
  breakeven: Breakeven
  monthly: { month: string; income: number; expense: number }[]
  expenseStructure: { articleId: string; name: string; amount: number }[]
  upcoming: CfoOperation[]
  firstGap: string | null
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// Сколько дней покрывают данные: от самого раннего начала учёта по счёту или
// самой ранней фактической операции до сегодня включительно, не больше окна.
// На 17 днях учёта делить расходы на 90 дней нельзя — запас выходил в 5 раз больше.
export function runwayWindow(accounts: Pick<CfoAccount, 'openingDate'>[], actual: Pick<CfoOperation, 'paidOn'>[], today: string): number {
  const starts = [...accounts.map((a) => a.openingDate), ...actual.map((o) => o.paidOn)].filter((d) => d <= today)
  if (starts.length === 0) return 1
  const first = starts.reduce((a, b) => (a < b ? a : b))
  return Math.max(1, Math.min(RUNWAY_WINDOW_DAYS, daysBetween(first, today) + 1))
}

export function buildDashboard(input: {
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[] // можно передавать forecastOperations(): виртуальные плановые строки влияют только на календарь
  recurrences: CfoRecurrence[]
  plan: CfoPlanItem[]
  month: string
  today: string
  mode?: CfoMode
}): Dashboard {
  const { accounts, articles, operations, recurrences, plan, month, today, mode } = input
  const family = mode === 'family'
  const loans = loanIds(accounts)

  const pnl = buildPnl({ articles, operations, plan, months: [month], mode, loanAccountIds: loans })
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
  const cashNow = cashBalanceAt(accounts, actual, today)
  const debt = loans.size > 0 ? debtAt(accounts, actual, today) : 0
  const runwayWindowDays = runwayWindow(accounts, actual, today)
  const windowStart = addDays(today, -(runwayWindowDays - 1))
  // Выплаты деньгами: расходы с некредитных счетов и платежи по кредитам (переводы на кредитный счёт).
  const outflow = actual
    .filter((o) => o.paidOn >= windowStart && o.paidOn <= today)
    .filter((o) => (o.direction === 'out' && !loans.has(o.accountId)) || (o.direction === 'transfer' && !!o.toAccountId && loans.has(o.toAccountId) && !loans.has(o.accountId)))
    .reduce((s, o) => s + o.amount, 0)
  // Целочисленно, чтобы деление на «средний день» не давало 59,999…
  const runwayDays = outflow === 0 ? null : cashNow <= 0 ? 0 : Math.floor((cashNow * runwayWindowDays) / outflow)

  const pnlArticles = new Map(articles.filter((a) => a.pnlGroup !== null).map((a) => [a.id, a]))
  const months = monthRange(addMonths(month, -11), month)
  const index = new Map(months.map((m, i) => [m, i]))
  const monthly = months.map((m) => ({ month: m, income: 0, expense: 0 }))
  const structure = new Map<string, number>()
  const LOAN_KEY = 'loan-payments'
  for (const op of actual) {
    const m = monthKey(op.accruedOn)
    const i = index.get(m)
    // Семья: платёж по кредиту — трата (как в «Доходах и расходах»).
    if (op.direction === 'transfer') {
      if (family && op.toAccountId && loans.has(op.toAccountId) && !loans.has(op.accountId)) {
        if (i !== undefined) monthly[i].expense += op.amount
        if (m === month) structure.set(LOAN_KEY, (structure.get(LOAN_KEY) ?? 0) + op.amount)
      }
      continue
    }
    if (!op.articleId || !pnlArticles.has(op.articleId)) continue
    if (i !== undefined) {
      if (op.direction === 'in') monthly[i].income += op.amount
      else monthly[i].expense += op.amount
    }
    if (m === month && op.direction === 'out') structure.set(op.articleId, (structure.get(op.articleId) ?? 0) + op.amount)
  }
  const expenseStructure = [...structure]
    .map(([articleId, amount]) => ({ articleId, name: articleId === LOAN_KEY ? LOAN_PAYMENTS_LABEL : pnlArticles.get(articleId)!.name, amount }))
    .sort((a, b) => b.amount - a.amount)

  const calendar = buildCalendar({ accounts, operations, recurrences, today, from: today, to: addDays(today, CALENDAR_HORIZON_DAYS - 1) })
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1)
  const upcoming = calendar.days
    .filter((d) => d.date <= upcomingEnd)
    .flatMap((d) => d.items.filter((o) => o.status === 'planned'))

  return { month, revenue, grossMarginPct, netProfit, cashNow, debt, runwayDays, runwayWindowDays, breakeven, monthly, expenseStructure, upcoming, firstGap: calendar.firstGap }
}
