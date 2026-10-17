import type { ArticleKind, CfoAccount, CfoArticle, CfoOperation, Direction, OpStatus, PnlGroup } from './types'
import { isIsoDate } from './dates'
import { MAX_AMOUNT_TIYN, TOO_LARGE_AMOUNT } from './money'

export type OperationDraft = {
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  paidOn: string
  accruedOn: string
  status: OpStatus
}

export type RecurrenceDraft = {
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
}

export type ValidationContext = { accounts: CfoAccount[]; articles: CfoArticle[]; today: string }

const beforeStart = (a: CfoAccount) => `Дата раньше начала учёта по счёту «${a.name}» (${a.openingDate})`

export function validateOperation(d: OperationDraft, ctx: ValidationContext): string | null {
  if (!Number.isInteger(d.amount) || d.amount <= 0) return 'Укажите сумму больше нуля'
  if (d.amount > MAX_AMOUNT_TIYN) return TOO_LARGE_AMOUNT
  if (!isIsoDate(d.paidOn)) return 'Укажите дату оплаты'
  if (!isIsoDate(d.accruedOn)) return 'Укажите дату начисления'
  if (d.status === 'actual' && d.paidOn > ctx.today) return 'Будущая дата — отметьте операцию как плановую'

  const account = ctx.accounts.find((a) => a.id === d.accountId)
  if (!account) return 'Выберите счёт'

  if (d.direction === 'transfer') {
    if (d.articleId) return 'У перевода между счетами нет статьи'
    const to = ctx.accounts.find((a) => a.id === d.toAccountId)
    if (!to) return 'Выберите счёт, на который переводите'
    if (to.id === account.id) return 'Счета перевода должны быть разными'
    if (d.status === 'actual' && d.paidOn < account.openingDate) return beforeStart(account)
    if (d.status === 'actual' && d.paidOn < to.openingDate) return beforeStart(to)
    return null
  }

  if (d.toAccountId) return 'Счёт получателя бывает только у перевода'
  const article = ctx.articles.find((a) => a.id === d.articleId)
  if (!article) return 'Выберите статью'
  if (d.direction === 'in' && article.kind !== 'income') return 'Для прихода нужна статья дохода'
  if (d.direction === 'out' && article.kind !== 'expense') return 'Для расхода нужна статья расхода'
  if (d.status === 'actual' && d.paidOn < account.openingDate) return beforeStart(account)
  return null
}

export function validateRecurrence(r: RecurrenceDraft, ctx: ValidationContext): string | null {
  if (!Number.isInteger(r.dayOfMonth) || r.dayOfMonth < 1 || r.dayOfMonth > 31) return 'День месяца — от 1 до 31'
  if (r.endsOn !== null && (!isIsoDate(r.endsOn) || r.endsOn < r.startsOn)) return 'Дата окончания должна быть не раньше даты начала'
  return validateOperation({ ...r, paidOn: r.startsOn, accruedOn: r.startsOn, status: 'planned' }, ctx)
}

// Сумма в клетке плана и в формах — не больше того, что принимает numeric(14,2) в базе.
export function validateAmount(tiyn: number): string | null {
  if (!Number.isInteger(tiyn) || tiyn < 0) return 'Укажите сумму'
  if (tiyn > MAX_AMOUNT_TIYN) return TOO_LARGE_AMOUNT
  return null
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Дубли считаем только среди действующих: архивная «Зарплата» не мешает завести новую.
export function validateArticle(
  a: { id?: string; name: string; kind: ArticleKind; pnlGroup: PnlGroup | null },
  existing: Pick<CfoArticle, 'id' | 'name' | 'archived'>[] = [],
): string | null {
  if (!a.name.trim()) return 'Укажите название статьи'
  if (a.pnlGroup === 'revenue' && a.kind !== 'income') return 'Выручка бывает только у статьи дохода'
  if ((a.pnlGroup === 'cogs' || a.pnlGroup === 'opex' || a.pnlGroup === 'tax') && a.kind !== 'expense') {
    return 'Себестоимость, операционные расходы и налоги — только у статьи расхода'
  }
  if (existing.some((x) => !x.archived && x.id !== a.id && sameName(x.name, a.name))) return 'Статья с таким названием уже есть'
  return null
}

export function validateAccount(
  a: { id?: string; name: string; openingBalance: number; openingDate: string },
  existing: Pick<CfoAccount, 'id' | 'name' | 'archived'>[] = [],
): string | null {
  if (!a.name.trim()) return 'Укажите название'
  if (!Number.isInteger(a.openingBalance) || Math.abs(a.openingBalance) > MAX_AMOUNT_TIYN) return TOO_LARGE_AMOUNT
  if (!isIsoDate(a.openingDate)) return 'Укажите дату начала учёта'
  if (existing.some((x) => !x.archived && x.id !== a.id && sameName(x.name, a.name))) return 'Счёт с таким названием уже есть'
  return null
}

// Сдвинуть начало учёта позже уже проведённых операций нельзя: они молча
// выпали бы из остатков.
export function openingDateConflict(accountId: string, openingDate: string, operations: CfoOperation[]): string | null {
  const earlier = operations
    .filter((o) => o.status === 'actual' && o.paidOn < openingDate && (o.accountId === accountId || o.toAccountId === accountId))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn))[0]
  return earlier ? `По счёту есть операции раньше этой даты (${earlier.paidOn})` : null
}
