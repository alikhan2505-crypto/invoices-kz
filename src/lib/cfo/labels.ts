import type { AccountKind, Activity, ArticleKind, CfoAccount, CfoArticle, CfoOperation, Direction, PnlGroup } from './types'

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = { bank: 'Банковский счёт', card: 'Карта', cash: 'Наличные', deposit: 'Депозит', loan: 'Кредит / ипотека' }
// Вид «кредит» появляется в формах только после миграции cfo_account_loan.sql
// (расширяет check-ограничение kind в базе). Пока она не применена, вставка
// такого счёта упала бы на ограничении — поэтому пункт спрятан. После
// применения миграции переключить на true.
export const LOAN_KIND_ENABLED = false
export const SELECTABLE_ACCOUNT_KINDS: AccountKind[] = (Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).filter((k) => LOAN_KIND_ENABLED || k !== 'loan')
export const ARTICLE_KIND_LABEL: Record<ArticleKind, string> = { income: 'Доход', expense: 'Расход' }
export const ACTIVITY_LABEL: Record<Activity, string> = { operating: 'Операционная', investing: 'Инвестиционная', financing: 'Финансовая' }
export const PNL_GROUP_LABEL: Record<PnlGroup, string> = {
  revenue: 'Выручка',
  cogs: 'Себестоимость',
  opex: 'Операционные расходы',
  finance: 'Прочие доходы и расходы',
  tax: 'Налоги',
}
export const DIRECTION_LABEL: Record<Direction, string> = { in: 'Приход', out: 'Расход', transfer: 'Перевод' }

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTH_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function shortMonth(month: string): string {
  return MONTH_SHORT[Number(month.slice(5, 7)) - 1]
}

export function monthTitle(month: string): string {
  return `${MONTH_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
}

export function accountName(id: string | null, accounts: CfoAccount[]): string {
  return accounts.find((a) => a.id === id)?.name ?? '—'
}

export function opTitle(op: Pick<CfoOperation, 'direction' | 'accountId' | 'toAccountId' | 'articleId'>, accounts: CfoAccount[], articles: CfoArticle[]): string {
  if (op.direction === 'transfer') return `Перевод: ${accountName(op.accountId, accounts)} → ${accountName(op.toAccountId, accounts)}`
  return articles.find((a) => a.id === op.articleId)?.name ?? 'Без статьи'
}

// Склонение по числу: plural(1, 'операция', 'операции', 'операций') → «операция».
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n)
  const m10 = abs % 10
  const m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
export const opsCount = (n: number) => `${n} ${plural(n, 'операция', 'операции', 'операций')}`
export const daysCount = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`
