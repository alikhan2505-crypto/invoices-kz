// БДР: фактические приходы/расходы по месяцу начисления, только статьи с pnlGroup,
// против сетки плана. Каскад: выручка − себестоимость = валовая − опер. расходы =
// операционная ± прочие − налоги = чистая прибыль.
import type { CfoArticle, CfoOperation, CfoPlanItem, PnlGroup } from './types'
import { monthKey } from './dates'

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

const GROUP_LABEL: Record<PnlGroup, string> = {
  revenue: 'Выручка',
  cogs: 'Себестоимость',
  opex: 'Операционные расходы',
  finance: 'Прочие доходы и расходы',
  tax: 'Налоги',
}

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
function signed(article: CfoArticle, amount: number): number {
  return article.pnlGroup === 'finance' && article.kind === 'expense' ? -amount : amount
}

const bySort = (a: CfoArticle, b: CfoArticle) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

export function buildPnl(input: { articles: CfoArticle[]; operations: CfoOperation[]; plan: CfoPlanItem[]; months: string[] }): PnlRow[] {
  const { articles, operations, plan, months } = input
  const monthSet = new Set(months)
  const pnlArticles = articles.filter((a) => a.pnlGroup !== null)
  const byId = new Map(pnlArticles.map((a) => [a.id, a]))
  const cells = new Map(pnlArticles.map((a) => [a.id, emptyCells(months)]))

  for (const op of operations) {
    if (op.status !== 'actual' || op.direction === 'transfer' || !op.articleId) continue
    const a = byId.get(op.articleId)
    const m = monthKey(op.accruedOn)
    if (!a || !monthSet.has(m)) continue
    cells.get(a.id)![m].fact += signed(a, op.amount)
  }
  for (const p of plan) {
    const a = byId.get(p.articleId)
    if (!a || !monthSet.has(p.month)) continue
    cells.get(a.id)![p.month].plan += signed(a, p.amount)
  }

  const hasData = (id: string) => Object.values(cells.get(id)!).some((c) => c.plan !== 0 || c.fact !== 0)
  const groupCells = {} as Record<PnlGroup, Record<string, Cell>>
  const rows: PnlRow[] = []
  const pushTotal = (key: string, label: string, c: Record<string, Cell>) =>
    rows.push({ key: `t:${key}`, label, type: 'total', group: null, cells: c, total: sumTotal(c) })

  for (const g of PNL_GROUP_ORDER) {
    const members = pnlArticles.filter((a) => a.pnlGroup === g && (!a.archived || hasData(a.id))).sort(bySort)
    groupCells[g] = combine(months, members.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    rows.push({ key: `g:${g}`, label: GROUP_LABEL[g], type: 'group', group: g, cells: groupCells[g], total: sumTotal(groupCells[g]) })
    for (const a of members) {
      rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', group: g, cells: cells.get(a.id)!, total: sumTotal(cells.get(a.id)!) })
    }
    if (g === 'cogs') {
      pushTotal('gross', 'Валовая прибыль', combine(months, [{ cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }]))
    }
    if (g === 'opex') {
      pushTotal('operating', 'Операционная прибыль', combine(months, [
        { cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }, { cells: groupCells.opex, sign: -1 },
      ]))
    }
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
