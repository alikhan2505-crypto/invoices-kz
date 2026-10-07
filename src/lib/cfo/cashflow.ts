// БДДС: фактические поступления и выплаты по месяцу оплаты, по видам
// деятельности, с остатками на начало и конец месяца (по всем счетам).
import type { Activity, CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'
import { addDays, firstDay, lastDay, monthKey } from './dates'
import { totalBalanceAt } from './balances'

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

const ACTIVITY_LABEL: Record<Activity, string> = {
  operating: 'Операционная деятельность',
  investing: 'Инвестиционная деятельность',
  financing: 'Финансовая деятельность',
}

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
}): CashflowRow[] {
  const { accounts, articles, operations, plan, months } = input
  if (months.length === 0) return []
  const actual = operations.filter((o) => o.status === 'actual')
  const monthSet = new Set(months)
  const cells = new Map(articles.map((a) => [a.id, zero(months)]))

  for (const op of actual) {
    if (op.direction === 'transfer' || !op.articleId) continue
    const m = monthKey(op.paidOn)
    const c = cells.get(op.articleId)
    if (!c || !monthSet.has(m)) continue
    c[m].fact += op.amount
  }
  for (const p of plan) {
    const c = cells.get(p.articleId)
    if (!c || !monthSet.has(p.month)) continue
    c[p.month].plan += p.amount
  }

  const hasData = (id: string) => months.some((m) => cells.get(id)![m].fact !== 0 || cells.get(id)![m].plan !== 0)
  const visible = articles.filter((a) => !a.archived || hasData(a.id)).sort(bySort)

  const opening: Record<string, FlowCell> = {}
  const closing: Record<string, FlowCell> = {}
  for (const m of months) {
    // Счёт, у которого начало учёта попало в этот месяц, вносит свой стартовый остаток в
    // остаток на начало: иначе «начало + поток» не сходилось бы с «концом» в первый месяц.
    const joining = accounts
      .filter((a) => a.openingDate >= firstDay(m) && a.openingDate <= lastDay(m))
      .reduce((s, a) => s + a.openingBalance, 0)
    opening[m] = { plan: null, fact: totalBalanceAt(accounts, actual, addDays(firstDay(m), -1)) + joining }
    closing[m] = { plan: null, fact: totalBalanceAt(accounts, actual, lastDay(m)) }
  }

  const rows: CashflowRow[] = [{
    key: 'b:opening', label: 'Остаток на начало', type: 'balance', activity: null, cells: opening,
    // За период: остаток на начало первого месяца плюс стартовые остатки счетов,
    // открытых позже внутри периода, чтобы «Итого» тоже сходилось.
    total: { plan: null, fact: opening[months[0]].fact + accounts
      .filter((a) => a.openingDate > lastDay(months[0]) && a.openingDate <= lastDay(months[months.length - 1]))
      .reduce((s, a) => s + a.openingBalance, 0) },
  }]

  const nets: Grid[] = []
  for (const act of ACTIVITY_ORDER) {
    const ins = visible.filter((a) => a.activity === act && a.kind === 'income')
    const outs = visible.filter((a) => a.activity === act && a.kind === 'expense')
    if (ins.length === 0 && outs.length === 0) continue
    const inCells = combine(months, ins.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    const outCells = combine(months, outs.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    const net = combine(months, [{ cells: inCells, sign: 1 }, { cells: outCells, sign: -1 }])
    nets.push(net)
    rows.push({ key: `act:${act}`, label: ACTIVITY_LABEL[act], type: 'activity', activity: act, cells: net, total: total(net) })
    if (ins.length > 0) {
      rows.push({ key: `s:${act}:in`, label: 'Поступления', type: 'section', activity: act, cells: inCells, total: total(inCells) })
      for (const a of ins) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
    }
    if (outs.length > 0) {
      rows.push({ key: `s:${act}:out`, label: 'Выплаты', type: 'section', activity: act, cells: outCells, total: total(outCells) })
      for (const a of outs) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
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
