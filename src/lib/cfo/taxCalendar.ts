// Налоговый календарь РК: превращает «какие налоги я плачу и примерно сколько»
// в плановые платежи кабинета. Сроки — по Налоговому кодексу 2026:
//   • налоги и взносы с зарплаты (ИПН, СН, ОПВ, ОПВР, СО, ВОСМС, ООСМС) и
//     взносы ИП за себя — до 25 числа следующего месяца (ежемесячный повтор);
//   • СНР на основе упрощённой декларации (910) — до 25 августа за I полугодие
//     и до 25 февраля за II;
//   • НДС — до 25 числа второго месяца после квартала (25.02, 25.05, 25.08, 25.11).
import type { Workspace } from './data'
import type { OperationDraft, RecurrenceDraft } from './validate'
import type { CfoArticle } from './types'

export type TaxKind = 'payroll' | 'self' | 'simplified' | 'vat'

export const TAX_LABEL: Record<TaxKind, string> = {
  payroll: 'Налоги и взносы с зарплаты',
  self: 'Взносы ИП за себя',
  simplified: 'Налог по упрощёнке (910)',
  vat: 'НДС',
}

export const TAX_DUE: Record<TaxKind, string> = {
  payroll: 'каждый месяц до 25 числа',
  self: 'каждый месяц до 25 числа',
  simplified: 'до 25 августа и 25 февраля',
  vat: 'до 25 февраля, мая, августа и ноября',
}

// По этой метке в комментарии узнаём, что налог уже заведён, — второй раз не добавляем.
export const taxMark = (k: TaxKind) => `Налоговый календарь: ${TAX_LABEL[k]}`

const ARTICLE_PREFIX: Record<TaxKind, string> = {
  payroll: 'налоги и взносы с зарплаты',
  self: 'налоги и взносы с зарплаты',
  simplified: 'налог на доход',
  vat: 'ндс',
}

export function taxArticle(kind: TaxKind, articles: CfoArticle[]): CfoArticle | null {
  return articles.find((a) => !a.archived && a.kind === 'expense' && a.name.toLowerCase().startsWith(ARTICLE_PREFIX[kind])) ?? null
}

export function alreadyAdded(ws: Workspace): Set<TaxKind> {
  const comments = [...ws.recurrences.map((r) => r.comment), ...ws.operations.filter((o) => o.status === 'planned').map((o) => o.comment)]
  return new Set((Object.keys(TAX_LABEL) as TaxKind[]).filter((k) => comments.includes(taxMark(k))))
}

function nextDates(today: string, monthDays: string[], count: number): string[] {
  const year = Number(today.slice(0, 4))
  const all: string[] = []
  for (let y = year; y <= year + 2; y++) for (const md of monthDays) all.push(`${y}-${md}`)
  return all.filter((d) => d >= today).sort().slice(0, count)
}
export const simplifiedDates = (today: string) => nextDates(today, ['02-25', '08-25'], 2)
export const vatDates = (today: string) => nextDates(today, ['02-25', '05-25', '08-25', '11-25'], 4)

// Подсказка суммы для 910: ставка от фактических поступлений по статьям доходов
// (кроме финансовых — кредиты и вложения собственника не доход) с начала полугодия.
export function simplifiedEstimate(ws: Workspace, today: string, ratePct = 4): number {
  const halfStart = `${today.slice(0, 4)}-${today.slice(5, 7) <= '06' ? '01' : '07'}-01`
  const incomeIds = new Set(ws.articles.filter((a) => a.kind === 'income' && a.activity !== 'financing').map((a) => a.id))
  const income = ws.operations
    .filter((o) => o.status === 'actual' && o.direction === 'in' && o.articleId && incomeIds.has(o.articleId) && o.paidOn >= halfStart && o.paidOn <= today)
    .reduce((s, o) => s + o.amount, 0)
  return Math.round((income * ratePct) / 100)
}

export type TaxPlan = {
  recurrences: (RecurrenceDraft & { counterparty: string | null; comment: string })[]
  operations: (OperationDraft & { counterparty: string | null; comment: string })[]
}

export function planTaxes(input: { amounts: Partial<Record<TaxKind, number>>; accountId: string; articles: CfoArticle[]; today: string }): TaxPlan {
  const { amounts, accountId, articles, today } = input
  const plan: TaxPlan = { recurrences: [], operations: [] }
  const common = { direction: 'out' as const, accountId, toAccountId: null, counterparty: 'Бюджет РК' }
  for (const kind of ['payroll', 'self'] as const) {
    const amount = amounts[kind]
    const article = taxArticle(kind, articles)
    if (!amount || !article) continue
    plan.recurrences.push({ ...common, amount, articleId: article.id, dayOfMonth: 25, startsOn: today, endsOn: null, comment: taxMark(kind) })
  }
  const once: [TaxKind, string[]][] = [['simplified', simplifiedDates(today)], ['vat', vatDates(today)]]
  for (const [kind, dates] of once) {
    const amount = amounts[kind]
    const article = taxArticle(kind, articles)
    if (!amount || !article) continue
    for (const d of dates) plan.operations.push({ ...common, amount, articleId: article.id, paidOn: d, accruedOn: d, status: 'planned', comment: taxMark(kind) })
  }
  return plan
}
