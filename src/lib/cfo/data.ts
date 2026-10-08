// Чтение и запись CFO-кабинета из браузера. Доступ ограничен RLS «только свои
// строки»; суммы в БД — numeric(14,2) в тенге, здесь переводятся в тиыны.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toDbAmount, toTiyn } from './money'
import type { AccountKind, Activity, ArticleKind, CfoAccount, CfoArticle, CfoOperation, CfoPlanItem, CfoRecurrence, Direction, InvoiceLite, OpStatus, PnlGroup } from './types'
import type { OperationDraft, RecurrenceDraft } from './validate'
import type { ImportDraft } from './statementImport'
import { buildDemo } from './demo'

export type Workspace = {
  userId: string
  companyId: string
  companyName: string
  telegramDigest: boolean
  countInvoices: boolean
  hasDemo?: boolean // в кабинете лежит «пример» — показываем плашку «очистить»
  invoices: InvoiceLite[]
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  plan: CfoPlanItem[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const PAGE_SIZE = 1000

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// PostgREST отдаёт не больше 1000 строк за раз — длинный журнал читаем страницами.
async function selectAll(db: SupabaseClient, table: string, columns: string, companyId: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq('company_id', companyId)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    check(error)
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

const mapAccount = (r: Row): CfoAccount => ({
  id: r.id, name: r.name, kind: r.kind as AccountKind, openingBalance: toTiyn(r.opening_balance),
  openingDate: r.opening_date, archived: r.archived, sort: r.sort,
})
const mapArticle = (r: Row): CfoArticle => ({
  id: r.id, name: r.name, kind: r.kind as ArticleKind, activity: r.activity as Activity,
  pnlGroup: (r.pnl_group ?? null) as PnlGroup | null, archived: r.archived, sort: r.sort,
})
const mapOperation = (r: Row): CfoOperation => ({
  id: r.id, direction: r.direction as Direction, amount: toTiyn(r.amount), accountId: r.account_id,
  toAccountId: r.to_account_id ?? null, articleId: r.article_id ?? null, counterparty: r.counterparty ?? null,
  comment: r.comment ?? null, paidOn: r.paid_on, accruedOn: r.accrued_on, status: r.status as OpStatus,
  recurrenceId: r.recurrence_id ?? null, recurrenceDate: r.recurrence_date ?? null, invoiceId: r.invoice_id ?? null,
})
const mapRecurrence = (r: Row): CfoRecurrence => ({
  id: r.id, direction: r.direction as Direction, amount: toTiyn(r.amount), accountId: r.account_id,
  toAccountId: r.to_account_id ?? null, articleId: r.article_id ?? null, counterparty: r.counterparty ?? null,
  comment: r.comment ?? null, dayOfMonth: r.day_of_month, startsOn: r.starts_on, endsOn: r.ends_on ?? null,
})
const mapPlan = (r: Row): CfoPlanItem => ({ articleId: r.article_id, month: String(r.month).slice(0, 7), amount: toTiyn(r.amount) })

// Счета invoices.kz владельца за последние полгода (кроме отменённых) — для
// ожидаемых поступлений и проведения оплат. user_id фильтруется явно: на сервере
// (утренняя сводка) RLS нет.
const INVOICE_WINDOW_DAYS = 183
async function loadInvoices(db: SupabaseClient, userId: string): Promise<InvoiceLite[]> {
  const since = new Date(Date.now() - INVOICE_WINDOW_DAYS * 86400000).toISOString()
  const { data, error } = await db
    .from('invoices')
    .select('id, number, amount, status, due_date, created_at, client_name')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)
  check(error)
  const rows = (data ?? []) as Row[]
  const paidIds = rows.filter((r) => r.status === 'paid').map((r) => r.id as string)
  const paidOn = new Map<string, string>()
  if (paidIds.length > 0) {
    const { data: logs } = await db.from('invoice_logs').select('invoice_id, created_at').eq('status', 'paid').in('invoice_id', paidIds)
    for (const l of (logs ?? []) as Row[]) paidOn.set(l.invoice_id, almatyDate(l.created_at))
  }
  return rows.map((r) => ({
    id: r.id, number: String(r.number ?? ''), amount: toTiyn(r.amount ?? 0), status: r.status,
    dueDate: r.due_date ?? null, createdOn: String(r.created_at).slice(0, 10), paidOn: paidOn.get(r.id) ?? null,
    clientName: r.client_name ?? null,
  }))
}
const almatyDate = (ts: string) => new Date(new Date(ts).getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10)

export async function bootstrapWorkspace(): Promise<string> {
  const { data, error } = await supabase.rpc('cfo_bootstrap')
  check(error)
  return data as string
}

// db — клиент браузера (RLS) по умолчанию; серверная рассылка передаёт service-role клиент.
export async function loadWorkspace(companyId: string, userId: string, db: SupabaseClient = supabase): Promise<Workspace> {
  const [company, accounts, articles, operations, recurrences, plan, invoices] = await Promise.all([
    db.from('cfo_companies').select('name, telegram_digest, count_invoices').eq('id', companyId).single(),
    selectAll(db, 'cfo_accounts', 'id, name, kind, opening_balance, opening_date, archived, sort, is_demo', companyId),
    selectAll(db, 'cfo_articles', 'id, name, kind, activity, pnl_group, archived, sort', companyId),
    selectAll(db, 'cfo_operations', 'id, direction, amount, account_id, to_account_id, article_id, counterparty, comment, paid_on, accrued_on, status, recurrence_id, recurrence_date, invoice_id', companyId),
    selectAll(db, 'cfo_recurrences', 'id, direction, amount, account_id, to_account_id, article_id, counterparty, comment, day_of_month, starts_on, ends_on', companyId),
    selectAll(db, 'cfo_plan_items', 'id, article_id, month, amount', companyId),
    loadInvoices(db, userId),
  ])
  check(company.error)
  return {
    userId,
    companyId,
    companyName: (company.data as Row).name,
    telegramDigest: (company.data as Row).telegram_digest === true,
    countInvoices: (company.data as Row).count_invoices !== false,
    hasDemo: accounts.some((r) => r.is_demo === true),
    invoices,
    accounts: accounts.map(mapAccount).sort(bySort),
    articles: articles.map(mapArticle).sort(bySort),
    operations: operations.map(mapOperation).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    recurrences: recurrences.map(mapRecurrence),
    plan: plan.map(mapPlan),
  }
}

const owned = (ws: Workspace) => ({ user_id: ws.userId, company_id: ws.companyId })

// «Посмотреть на примере»: всё пишется с is_demo = true и потом целиком удаляется.
export async function loadDemo(ws: Workspace, today: string): Promise<void> {
  const demo = buildDemo(today, ws.articles, () => crypto.randomUUID())
  if (!demo) throw new Error('Не нашли стартовые статьи — пример собирается на них. Верните их из архива в настройках.')
  const mark = { ...owned(ws), is_demo: true }
  const base = Math.max(0, ...ws.accounts.map((x) => x.sort))
  check((await supabase.from('cfo_accounts').insert(demo.accounts.map((a, i) => ({ ...mark, id: a.id, name: a.name, kind: a.kind, opening_balance: toDbAmount(a.openingBalance), opening_date: a.openingDate, sort: base + (i + 1) * 10 })))).error)
  check((await supabase.from('cfo_operations').insert(demo.operations.map((o) => ({ ...mark, direction: o.direction, amount: toDbAmount(o.amount), account_id: o.accountId, article_id: o.articleId, counterparty: o.counterparty, paid_on: o.paidOn, accrued_on: o.paidOn, status: o.status })))).error)
  check((await supabase.from('cfo_recurrences').insert(demo.recurrences.map((r) => ({ ...mark, direction: r.direction, amount: toDbAmount(r.amount), account_id: r.accountId, article_id: r.articleId, counterparty: r.counterparty, day_of_month: r.dayOfMonth, starts_on: r.startsOn })))).error)
  // Клетки плана, которые человек уже заполнил, не трогаем: иначе «очистить пример» удалил бы и их.
  const taken = new Set(ws.plan.map((p) => `${p.articleId}|${p.month}`))
  const freePlan = demo.plan.filter((p) => !taken.has(`${p.articleId}|${p.month}`))
  if (freePlan.length > 0) check((await supabase.from('cfo_plan_items').insert(freePlan.map((p) => ({ ...mark, article_id: p.articleId, month: `${p.month}-01`, amount: toDbAmount(p.amount) })))).error)
}

export async function clearDemo(ws: Workspace): Promise<void> {
  const { data: demoAccounts, error } = await supabase.from('cfo_accounts').select('id').eq('company_id', ws.companyId).eq('is_demo', true)
  check(error)
  const ids = (demoAccounts ?? []).map((a) => a.id as string)
  // Сначала всё, что ссылается на счета примера (в т.ч. операции, внесённые поверх него), потом сами счета.
  check((await supabase.from('cfo_operations').delete().eq('company_id', ws.companyId).eq('is_demo', true)).error)
  check((await supabase.from('cfo_recurrences').delete().eq('company_id', ws.companyId).eq('is_demo', true)).error)
  check((await supabase.from('cfo_plan_items').delete().eq('company_id', ws.companyId).eq('is_demo', true)).error)
  if (ids.length > 0) {
    const list = `(${ids.join(',')})`
    check((await supabase.from('cfo_operations').delete().eq('company_id', ws.companyId).or(`account_id.in.${list},to_account_id.in.${list}`)).error)
    check((await supabase.from('cfo_recurrences').delete().eq('company_id', ws.companyId).or(`account_id.in.${list},to_account_id.in.${list}`)).error)
    check((await supabase.from('cfo_accounts').delete().in('id', ids)).error)
  }
}

export async function setCountInvoices(ws: Workspace, on: boolean): Promise<void> {
  const { error } = await supabase.from('cfo_companies').update({ count_invoices: on }).eq('id', ws.companyId)
  check(error)
}

// Оплаченный счёт → фактический приход. Уникальный индекс (user_id, invoice_id) не
// даёт провести один счёт дважды, даже из двух вкладок.
export async function postInvoices(ws: Workspace, list: { invoice: InvoiceLite; accountId: string; articleId: string; paidOn: string }[]): Promise<void> {
  const rows = list.map(({ invoice, accountId, articleId, paidOn }) => ({
    ...owned(ws), direction: 'in', amount: toDbAmount(invoice.amount), account_id: accountId, article_id: articleId,
    counterparty: invoice.clientName, comment: `Счёт №${invoice.number}`, paid_on: paidOn, accrued_on: paidOn, status: 'actual', invoice_id: invoice.id,
  }))
  const { error } = await supabase.from('cfo_operations').insert(rows)
  check(error)
}

export async function setTelegramDigest(ws: Workspace, on: boolean): Promise<void> {
  const { error } = await supabase.from('cfo_companies').update({ telegram_digest: on }).eq('id', ws.companyId)
  check(error)
}

export async function saveCompanyName(ws: Workspace, name: string): Promise<void> {
  const { error } = await supabase.from('cfo_companies').update({ name }).eq('id', ws.companyId)
  check(error)
}

export async function saveAccount(ws: Workspace, a: { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }): Promise<void> {
  const row = { name: a.name, kind: a.kind, opening_balance: toDbAmount(a.openingBalance), opening_date: a.openingDate }
  if (a.id) {
    const { error } = await supabase.from('cfo_accounts').update(row).eq('id', a.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...ws.accounts.map((x) => x.sort)) + 10
  const { error } = await supabase.from('cfo_accounts').insert({ ...row, ...owned(ws), sort })
  check(error)
}

// Several accounts in one insert — all or nothing, so a failed first-run wizard never leaves half the accounts.
export async function createAccounts(ws: Workspace, list: { name: string; kind: AccountKind; openingBalance: number; openingDate: string }[]): Promise<void> {
  const base = Math.max(0, ...ws.accounts.map((x) => x.sort))
  const rows = list.map((a, i) => ({
    name: a.name, kind: a.kind, opening_balance: toDbAmount(a.openingBalance), opening_date: a.openingDate,
    ...owned(ws), sort: base + (i + 1) * 10,
  }))
  const { error } = await supabase.from('cfo_accounts').insert(rows)
  check(error)
}

// Every report relies on «direction matches article kind», so kind is frozen once referenced.
export function articleInUse(ws: Workspace, articleId: string): boolean {
  return ws.operations.some((o) => o.articleId === articleId)
    || ws.recurrences.some((r) => r.articleId === articleId)
    || ws.plan.some((p) => p.articleId === articleId)
}

export async function saveArticle(ws: Workspace, a: { id?: string; name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null }): Promise<void> {
  const row = { name: a.name, kind: a.kind, activity: a.activity, pnl_group: a.pnlGroup }
  if (a.id) {
    const before = ws.articles.find((x) => x.id === a.id)
    if (before && before.kind !== a.kind && articleInUse(ws, a.id)) {
      throw new Error('По статье уже есть операции, повторы или план — тип менять нельзя. Создайте новую статью.')
    }
    const { error } = await supabase.from('cfo_articles').update(row).eq('id', a.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...ws.articles.map((x) => x.sort)) + 10
  const { error } = await supabase.from('cfo_articles').insert({ ...row, ...owned(ws), sort })
  check(error)
}

export async function setArchived(table: 'cfo_accounts' | 'cfo_articles', id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from(table).update({ archived }).eq('id', id)
  check(error)
}

// Переписывает sort только у тех, чья позиция изменилась (10, 20, 30…).
export async function reorder(table: 'cfo_accounts' | 'cfo_articles', orderedIds: string[], current: { id: string; sort: number }[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const want = (i + 1) * 10
    const cur = current.find((c) => c.id === orderedIds[i])
    if (!cur || cur.sort === want) continue
    const { error } = await supabase.from(table).update({ sort: want }).eq('id', orderedIds[i])
    check(error)
  }
}

export async function saveOperation(ws: Workspace, op: OperationDraft & { id?: string; counterparty: string | null; comment: string | null }): Promise<void> {
  const row = {
    direction: op.direction,
    amount: toDbAmount(op.amount),
    account_id: op.accountId,
    to_account_id: op.direction === 'transfer' ? op.toAccountId : null,
    article_id: op.direction === 'transfer' ? null : op.articleId,
    counterparty: op.counterparty,
    comment: op.comment,
    paid_on: op.paidOn,
    accrued_on: op.accruedOn,
    status: op.status,
  }
  if (op.id) {
    const { error } = await supabase.from('cfo_operations').update({ ...row, updated_at: new Date().toISOString() }).eq('id', op.id)
    check(error)
    return
  }
  const { error } = await supabase.from('cfo_operations').insert({ ...row, ...owned(ws) })
  check(error)
}

// Импорт выписки: пачками по 500 строк, каждая пачка — один insert (всё или ничего).
// Возвращает, сколько строк успело записаться, чтобы при сбое сказать человеку правду.
export async function importOperations(ws: Workspace, drafts: ImportDraft[]): Promise<number> {
  let written = 0
  for (let i = 0; i < drafts.length; i += 500) {
    const rows = drafts.slice(i, i + 500).map((op) => ({
      direction: op.direction,
      amount: toDbAmount(op.amount),
      account_id: op.accountId,
      to_account_id: op.toAccountId,
      article_id: op.articleId,
      counterparty: op.counterparty,
      comment: op.comment,
      paid_on: op.paidOn,
      accrued_on: op.accruedOn,
      status: op.status,
      ...owned(ws),
    }))
    const { error } = await supabase.from('cfo_operations').insert(rows)
    if (error) throw new Error(`${written > 0 ? `Записано ${written} из ${drafts.length}, дальше ошибка: ` : ''}${error.message}`)
    written += rows.length
  }
  return written
}

export async function deleteOperation(id: string): Promise<void> {
  const { error } = await supabase.from('cfo_operations').delete().eq('id', id)
  check(error)
}

// «Оплачено сегодня». Вхождение повтора становится отдельной фактической
// операцией со ссылкой на правило; разовая плановая — просто переходит в факт.
export async function markPaid(ws: Workspace, op: CfoOperation, today: string): Promise<void> {
  if (op.id.startsWith('rec:')) {
    const { error } = await supabase.from('cfo_operations').insert({
      ...owned(ws),
      direction: op.direction,
      amount: toDbAmount(op.amount),
      account_id: op.accountId,
      to_account_id: op.toAccountId,
      article_id: op.articleId,
      counterparty: op.counterparty,
      comment: op.comment,
      paid_on: today,
      accrued_on: op.accruedOn,
      status: 'actual',
      recurrence_id: op.recurrenceId,
      recurrence_date: op.recurrenceDate,
    })
    check(error)
    return
  }
  const { error } = await supabase
    .from('cfo_operations')
    .update({ status: 'actual', paid_on: today, updated_at: new Date().toISOString() })
    .eq('id', op.id)
  check(error)
}

// Перенос планового платежа на другую дату. Вхождение повтора становится
// отдельной плановой операцией со ссылкой на правило (как при «Оплачено»), поэтому
// правило дальше идёт своим чередом, а уникальный индекс не даст перенести дважды.
export async function reschedule(ws: Workspace, op: CfoOperation, date: string): Promise<void> {
  if (op.status !== 'planned') throw new Error('Переносить можно только плановые платежи')
  if (op.id.startsWith('rec:')) {
    const { error } = await supabase.from('cfo_operations').insert({
      ...owned(ws), direction: op.direction, amount: toDbAmount(op.amount), account_id: op.accountId, to_account_id: op.toAccountId,
      article_id: op.articleId, counterparty: op.counterparty, comment: op.comment, paid_on: date, accrued_on: op.accruedOn,
      status: 'planned', recurrence_id: op.recurrenceId, recurrence_date: op.recurrenceDate,
    })
    check(error)
    return
  }
  const { error } = await supabase.from('cfo_operations').update({ paid_on: date, updated_at: new Date().toISOString() }).eq('id', op.id)
  check(error)
}

export async function saveRecurrence(ws: Workspace, r: RecurrenceDraft & { counterparty: string | null; comment: string | null }): Promise<void> {
  const { error } = await supabase.from('cfo_recurrences').insert({
    ...owned(ws),
    direction: r.direction,
    amount: toDbAmount(r.amount),
    account_id: r.accountId,
    to_account_id: r.direction === 'transfer' ? r.toAccountId : null,
    article_id: r.direction === 'transfer' ? null : r.articleId,
    counterparty: r.counterparty,
    comment: r.comment,
    day_of_month: r.dayOfMonth,
    starts_on: r.startsOn,
    ends_on: r.endsOn,
  })
  check(error)
}

export async function deleteRecurrence(id: string): Promise<void> {
  const { error } = await supabase.from('cfo_recurrences').delete().eq('id', id)
  check(error)
}

// Ячейка с нулём удаляется, остальные — upsert по (company_id, article_id, month).
export async function setPlanCells(ws: Workspace, cells: { articleId: string; month: string; amount: number }[]): Promise<void> {
  const upserts = cells
    .filter((c) => c.amount > 0)
    .map((c) => ({ ...owned(ws), article_id: c.articleId, month: `${c.month}-01`, amount: toDbAmount(c.amount) }))
  if (upserts.length > 0) {
    const { error } = await supabase.from('cfo_plan_items').upsert(upserts, { onConflict: 'company_id,article_id,month' })
    check(error)
  }
  for (const c of cells.filter((x) => x.amount <= 0)) {
    const { error } = await supabase
      .from('cfo_plan_items')
      .delete()
      .eq('company_id', ws.companyId)
      .eq('article_id', c.articleId)
      .eq('month', `${c.month}-01`)
    check(error)
  }
}
