// БДДС: фактические поступления и выплаты по месяцу оплаты, по видам
// деятельности, с остатками на начало и конец месяца (по всем счетам, кроме
// кредитных). Переводы между своими счетами — не поток; переводы на кредитный
// счёт и с него — поток по финансовой деятельности («Платежи по кредитам» /
// «Получено по кредиту»); приход/расход, проведённый прямо по кредитному счёту, —
// не деньги и в поток не входит. Иначе «начало + поток = конец» не сходилось бы.
import type { Activity, CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'
import { addDays, firstDay, lastDay, monthKey } from './dates'
import { cashAccounts, cashBalanceAt, loanIds } from './balances'
import { ACTIVITY_SECTION_BY_MODE, LOAN_PAYMENTS_LABEL, LOAN_RECEIVED_LABEL, type CfoMode } from './mode'

export type FlowCell = { plan: number | null; fact: number }
export type CashflowRow = {
  key: string
  label: string
  type: 'balance' | 'activity' | 'section' | 'article' | 'total'
  activity: Activity | null
  cells: Record<string, FlowCell>
  total: FlowCell
}

export const ACTIVITY_ORDER: Activity[] = ['operating', 'investing', 'financing']
export const LOAN_PAYMENTS_KEY = 'a:loan-payments'
export const LOAN_RECEIVED_KEY = 'a:loan-received'

type Grid = Record<string, { plan: number; fact: number }>

function zero(months: string[]): Grid {
  const out: Grid = {}
  for (const m of months) out[m] = { plan: 0, fact: 0 }
  return out
}

function combine(months: string[], parts: { cells: Grid; sign: 1 | -1 }[]): Grid {
  const out = zero(months)
  for (const m of months) {
    for (const p of parts) {
      out[m].plan += p.sign * p.cells[m].plan
      out[m].fact += p.sign * p.cells[m].fact
    }
  }
  return out
}

function total(cells: Grid): FlowCell {
  return Object.values(cells).reduce<FlowCell>((s, c) => ({ plan: (s.plan ?? 0) + c.plan, fact: s.fact + c.fact }), { plan: 0, fact: 0 })
}

const bySort = (a: CfoArticle, b: CfoArticle) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

export function buildCashflow(input: {
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  plan: CfoPlanItem[]
  months: string[]
  mode?: CfoMode
}): CashflowRow[] {
  const { accounts, articles, operations, plan, months } = input
  if (months.length === 0) return []
  const actual = operations.filter((o) => o.status === 'actual')
  const monthSet = new Set(months)
  const cells = new Map(articles.map((a) => [a.id, zero(months)]))
  const loans = loanIds(accounts)
  const loanOut = zero(months)
  const loanIn = zero(months)

  for (const op of actual) {
    const m = monthKey(op.paidOn)
    if (!monthSet.has(m)) continue
    if (op.direction === 'transfer') {
      const fromLoan = loans.has(op.accountId)
      const toLoan = !!op.toAccountId && loans.has(op.toAccountId)
      if (toLoan && !fromLoan) loanOut[m].fact += op.amount
      if (fromLoan && !toLoan) loanIn[m].fact += op.amount
      continue
    }
    // Начисление прямо на кредитном счёте (проценты, комиссия банка по ипотеке)
    // меняет долг, а не деньги — в поток не идёт, иначе «начало + поток ≠ конец».
    if (loans.has(op.accountId)) continue
    if (!op.articleId) continue
    const c = cells.get(op.articleId)
    if (!c) continue
    c[m].fact += op.amount
  }
  for (const p of plan) {
    const c = cells.get(p.articleId)
    if (!c || !monthSet.has(p.month)) continue
    c[p.month].plan += p.amount
  }

  const hasData = (g: Grid) => months.some((m) => g[m].fact !== 0 || g[m].plan !== 0)
  const visible = articles.filter((a) => !a.archived || hasData(cells.get(a.id)!)).sort(bySort)
  const cash = cashAccounts(accounts)

  const opening: Record<string, FlowCell> = {}
  const closing: Record<string, FlowCell> = {}
  for (const m of months) {
    // Счёт, у которого начало учёта попало в этот месяц, вносит свой стартовый остаток в
    // остаток на начало: иначе «начало + поток» не сходилось бы с «концом» в первый месяц.
    const joining = cash
      .filter((a) => a.openingDate >= firstDay(m) && a.openingDate <= lastDay(m))
      .reduce((s, a) => s + a.openingBalance, 0)
    opening[m] = { plan: null, fact: cashBalanceAt(accounts, actual, addDays(firstDay(m), -1)) + joining }
    closing[m] = { plan: null, fact: cashBalanceAt(accounts, actual, lastDay(m)) }
  }

  const rows: CashflowRow[] = [{
    key: 'b:opening', label: 'Остаток на начало', type: 'balance', activity: null, cells: opening,
    // За период: остаток на начало первого месяца плюс стартовые остатки счетов,
    // открытых позже внутри периода, чтобы «Итого» тоже сходилось.
    total: { plan: null, fact: opening[months[0]].fact + cash
      .filter((a) => a.openingDate > lastDay(months[0]) && a.openingDate <= lastDay(months[months.length - 1]))
      .reduce((s, a) => s + a.openingBalance, 0) },
  }]

  const sectionLabel = ACTIVITY_SECTION_BY_MODE[input.mode === 'family' ? 'family' : 'business']
  const nets: Grid[] = []
  for (const act of ACTIVITY_ORDER) {
    const ins = visible.filter((a) => a.activity === act && a.kind === 'income')
    const outs = visible.filter((a) => a.activity === act && a.kind === 'expense')
    const extraIn = act === 'financing' && hasData(loanIn)
    const extraOut = act === 'financing' && hasData(loanOut)
    if (ins.length === 0 && outs.length === 0 && !extraIn && !extraOut) continue
    const inParts = ins.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const }))
    const outParts = outs.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const }))
    if (extraIn) inParts.push({ cells: loanIn, sign: 1 })
    if (extraOut) outParts.push({ cells: loanOut, sign: 1 })
    const inCells = combine(months, inParts)
    const outCells = combine(months, outParts)
    const net = combine(months, [{ cells: inCells, sign: 1 }, { cells: outCells, sign: -1 }])
    nets.push(net)
    rows.push({ key: `act:${act}`, label: sectionLabel[act], type: 'activity', activity: act, cells: net, total: total(net) })
    if (ins.length > 0 || extraIn) {
      rows.push({ key: `s:${act}:in`, label: 'Поступления', type: 'section', activity: act, cells: inCells, total: total(inCells) })
      for (const a of ins) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
      if (extraIn) rows.push({ key: LOAN_RECEIVED_KEY, label: LOAN_RECEIVED_LABEL, type: 'article', activity: act, cells: loanIn, total: total(loanIn) })
    }
    if (outs.length > 0 || extraOut) {
      rows.push({ key: `s:${act}:out`, label: 'Выплаты', type: 'section', activity: act, cells: outCells, total: total(outCells) })
      for (const a of outs) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
      if (extraOut) rows.push({ key: LOAN_PAYMENTS_KEY, label: LOAN_PAYMENTS_LABEL, type: 'article', activity: act, cells: loanOut, total: total(loanOut) })
    }
  }

  const netflow = combine(months, nets.map((n) => ({ cells: n, sign: 1 as const })))
  rows.push({ key: 't:netflow', label: 'Чистый денежный поток', type: 'total', activity: null, cells: netflow, total: total(netflow) })
  rows.push({
    key: 'b:closing', label: 'Остаток на конец', type: 'balance', activity: null, cells: closing,
    total: { plan: null, fact: closing[months[months.length - 1]].fact },
  })
  return rows
}
