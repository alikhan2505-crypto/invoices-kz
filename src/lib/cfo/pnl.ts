// БДР: фактические приходы/расходы по месяцу начисления, только статьи с pnlGroup,
// против сетки плана. Каскад: выручка − себестоимость = валовая − опер. расходы =
// операционная ± прочие − налоги = чистая прибыль.
// В семейном режиме группировка считается здесь же (reportPnlGroup): все доходы —
// «Доходы», все траты — «Расходы», итог один — «Сбережено». Хранимые группы статей
// при этом не меняются, поэтому возврат в бизнес показывает прежний каскад.
import type { CfoArticle, CfoOperation, CfoPlanItem, PnlGroup } from './types'
import { monthKey } from './dates'
import { LOAN_PAYMENTS_LABEL, PNL_GROUP_LABEL_BY_MODE, reportPnlGroup, type CfoMode } from './mode'

export type Cell = { plan: number; fact: number }
export type PnlRow = {
  key: string
  label: string
  type: 'group' | 'article' | 'total'
  group: PnlGroup | null
  cells: Record<string, Cell>
  total: Cell
}

export const PNL_GROUP_ORDER: PnlGroup[] = ['revenue', 'cogs', 'opex', 'finance', 'tax']
const FAMILY_GROUP_ORDER: PnlGroup[] = ['revenue', 'opex']
export const LOAN_PAYMENTS_KEY = 'a:loan-payments'

function emptyCells(months: string[]): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const m of months) out[m] = { plan: 0, fact: 0 }
  return out
}

function sumTotal(cells: Record<string, Cell>): Cell {
  return Object.values(cells).reduce((s, c) => ({ plan: s.plan + c.plan, fact: s.fact + c.fact }), { plan: 0, fact: 0 })
}

function combine(months: string[], parts: { cells: Record<string, Cell>; sign: 1 | -1 }[]): Record<string, Cell> {
  const out = emptyCells(months)
  for (const m of months) {
    for (const p of parts) {
      out[m].plan += p.sign * p.cells[m].plan
      out[m].fact += p.sign * p.cells[m].fact
    }
  }
  return out
}

// В группе «прочие» расход идёт с минусом, чтобы группа сальдировала доходы и
// расходы; остальные группы — величины, итоги вычитают их сами.
function signed(group: PnlGroup, kind: CfoArticle['kind'], amount: number): number {
  return group === 'finance' && kind === 'expense' ? -amount : amount
}

const bySort = (a: CfoArticle, b: CfoArticle) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

export function buildPnl(input: {
  articles: CfoArticle[]
  operations: CfoOperation[]
  plan: CfoPlanItem[]
  months: string[]
  mode?: CfoMode
  // Кредитные счета: в семейном режиме перевод с карты на кредит — это трата
  // («Платежи по кредитам» в расходах). В бизнесе погашение тела — не расход.
  loanAccountIds?: Set<string>
}): PnlRow[] {
  const { articles, operations, plan, months, mode } = input
  const family = mode === 'family'
  const monthSet = new Set(months)
  const groupOf = new Map<string, PnlGroup>()
  for (const a of articles) {
    const g = reportPnlGroup(a, mode)
    if (g !== null) groupOf.set(a.id, g)
  }
  const pnlArticles = articles.filter((a) => groupOf.has(a.id))
  const byId = new Map(pnlArticles.map((a) => [a.id, a]))
  const cells = new Map(pnlArticles.map((a) => [a.id, emptyCells(months)]))
  const loans = family ? input.loanAccountIds ?? new Set<string>() : new Set<string>()
  const loanCells = emptyCells(months)

  for (const op of operations) {
    if (op.status !== 'actual') continue
    const m = monthKey(op.accruedOn)
    if (!monthSet.has(m)) continue
    if (op.direction === 'transfer') {
      if (op.toAccountId && loans.has(op.toAccountId) && !loans.has(op.accountId)) loanCells[m].fact += op.amount
      continue
    }
    if (!op.articleId) continue
    const a = byId.get(op.articleId)
    if (!a) continue
    cells.get(a.id)![m].fact += signed(groupOf.get(a.id)!, a.kind, op.amount)
  }
  for (const p of plan) {
    const a = byId.get(p.articleId)
    if (!a || !monthSet.has(p.month)) continue
    cells.get(a.id)![p.month].plan += signed(groupOf.get(a.id)!, a.kind, p.amount)
  }

  const hasData = (c: Record<string, Cell>) => Object.values(c).some((x) => x.plan !== 0 || x.fact !== 0)
  const groupCells = {} as Record<PnlGroup, Record<string, Cell>>
  const rows: PnlRow[] = []
  const labels = PNL_GROUP_LABEL_BY_MODE[family ? 'family' : 'business']
  const pushTotal = (key: string, label: string, c: Record<string, Cell>) =>
    rows.push({ key: `t:${key}`, label, type: 'total', group: null, cells: c, total: sumTotal(c) })

  for (const g of family ? FAMILY_GROUP_ORDER : PNL_GROUP_ORDER) {
    const members = pnlArticles.filter((a) => groupOf.get(a.id) === g && (!a.archived || hasData(cells.get(a.id)!))).sort(bySort)
    const parts = members.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const }))
    const withLoans = g === 'opex' && loans.size > 0 && hasData(loanCells)
    if (withLoans) parts.push({ cells: loanCells, sign: 1 })
    groupCells[g] = combine(months, parts)
    rows.push({ key: `g:${g}`, label: labels[g], type: 'group', group: g, cells: groupCells[g], total: sumTotal(groupCells[g]) })
    for (const a of members) {
      rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', group: g, cells: cells.get(a.id)!, total: sumTotal(cells.get(a.id)!) })
    }
    if (withLoans) rows.push({ key: LOAN_PAYMENTS_KEY, label: LOAN_PAYMENTS_LABEL, type: 'article', group: g, cells: loanCells, total: sumTotal(loanCells) })
    if (!family && g === 'cogs') {
      pushTotal('gross', 'Валовая прибыль', combine(months, [{ cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }]))
    }
    if (!family && g === 'opex') {
      pushTotal('operating', 'Операционная прибыль', combine(months, [
        { cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }, { cells: groupCells.opex, sign: -1 },
      ]))
    }
  }
  if (family) {
    pushTotal('net', 'Сбережено', combine(months, [{ cells: groupCells.revenue, sign: 1 }, { cells: groupCells.opex, sign: -1 }]))
    return rows
  }
  pushTotal('net', 'Чистая прибыль', combine(months, [
    { cells: groupCells.revenue, sign: 1 },
    { cells: groupCells.cogs, sign: -1 },
    { cells: groupCells.opex, sign: -1 },
    { cells: groupCells.finance, sign: 1 },
    { cells: groupCells.tax, sign: -1 },
  ]))
  return rows
}
