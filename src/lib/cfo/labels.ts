import type { AccountKind, Activity, ArticleKind, CfoAccount, CfoArticle, CfoOperation, Direction, PnlGroup } from './types'

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = { bank: 'Банковский счёт', card: 'Карта', cash: 'Наличные', deposit: 'Депозит' }
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
