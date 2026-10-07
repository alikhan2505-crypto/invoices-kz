// Доменные типы CFO-кабинета. Все суммы — целые тиыны, даты — 'YYYY-MM-DD',
// месяцы — 'YYYY-MM'.

export type Direction = 'in' | 'out' | 'transfer'
export type OpStatus = 'actual' | 'planned'
export type ArticleKind = 'income' | 'expense'
export type Activity = 'operating' | 'investing' | 'financing'
export type PnlGroup = 'revenue' | 'cogs' | 'opex' | 'finance' | 'tax'
export type AccountKind = 'bank' | 'cash' | 'card' | 'deposit'

export type CfoAccount = {
  id: string
  name: string
  kind: AccountKind
  openingBalance: number
  openingDate: string
  archived: boolean
  sort: number
}

export type CfoArticle = {
  id: string
  name: string
  kind: ArticleKind
  activity: Activity
  pnlGroup: PnlGroup | null
  archived: boolean
  sort: number
}

export type CfoOperation = {
  id: string
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  counterparty: string | null
  comment: string | null
  paidOn: string
  accruedOn: string
  status: OpStatus
  recurrenceId: string | null
  recurrenceDate: string | null
  invoiceId?: string | null // приход, проведённый из оплаченного счёта invoices.kz
}

// Счёт invoices.kz в том виде, что нужен кабинету: ожидаемые и проведённые поступления.
export type InvoiceLite = {
  id: string
  number: string
  amount: number // тиыны
  status: string
  dueDate: string | null
  createdOn: string
  paidOn: string | null // дата из журнала статусов, если есть
  clientName: string | null
}

export type CfoRecurrence = {
  id: string
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  counterparty: string | null
  comment: string | null
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
}

export type CfoPlanItem = {
  articleId: string
  month: string
  amount: number
}
