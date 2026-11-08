import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDbTimestamp } from '@/lib/plan'
import { ALMATY_OFFSET_MS, almatyDay } from '@/lib/visits/almatyDay'
import { computeCommission } from '@/lib/kaspiPay/commission'

// Ночная сверка «деньги пришли, а результат не применился» (пункт 1.2 аудита
// 02.11.2026). Три места ставят платёжной строке status='paid' РАНЬШЕ, чем
// применяют результат (включают тариф, зачисляют кошелёк, отмечают счёт
// оплаченным, списывают комиссию), и повторов у них нет: крон проверяет только
// 'pending'. Сбой Supabase в этот момент оставляет оплату без последствий и
// только строку в логе Vercel. Здесь мы такие строки находим и сообщаем
// основателю. Ничего не чиним сами: исправление (включить тариф, зачислить,
// отметить) делает человек, который видит контекст.
//
// Только чтение. Без новых таблиц и колонок: каждое правило опирается на то,
// что у «применённого» платежа обязательно есть в базе. Единственная запись
// вне этой библиотеки — строка daily_reports в роуте (захват дня).
//
// Строку можно «заглушить», когда её уже разобрали вручную: добавить в
// daily_reports запись с kind = ackKind(<id платежа>) (все записи платежа) или
// ackKind(<id>, <вид>) (только один вид, например commission); day — любой.
//
// Границы, о которых надо помнить:
//  - тариф сверяется с нижней границей «оплата + период». Если у пользователя
//    уже было не меньше (период - 1) дня того же тарифа, неудавшееся продление
//    поверх него не видно: прежнего срока база не хранит;
//  - платежи, которые засчитываются выпиской Kaspi (historySync.ts и
//    pending-matches/confirm) без строки в kaspi_payment_requests, сюда не
//    попадают: у них свой механизм восстановления (settled_at).

export const RECONCILE_WINDOW_DAYS = 7
// Платёж, который подтвердили минуту назад, может быть как раз посередине
// применения. Смотрим только строки старше этого запаса.
export const RECONCILE_GRACE_MINUTES = 30
// Продление тарифа: +365 дней за год, +30 за месяц (computePlanActivation).
// Сутки запаса на округление и на правку даты вручную в админке.
const PLAN_DAYS = { monthly: 30, annual: 365 } as const
const PLAN_SLACK_DAYS = 1
const DAY_MS = 24 * 60 * 60 * 1000
// Оплаченная пуш-строка тарифа могла быть создана за сутки до оплаты
// (PLAN_PAYMENT_STALE_MS в settlePlanPayment.ts), поэтому отбор по created_at
// шире окна; точное попадание в окно проверяется по моменту оплаты.
const PLAN_CREATED_LOOKBACK_DAYS = 2
const IN_CHUNK = 100
const ROW_LIMIT = 1000
export const RECONCILE_MAX_LINES = 12
// Telegram режет текст на 4000 знаках (sendFounderTelegram), поэтому собираем
// с запасом: хвост (что делать, сбои проверки) обязан дойти целиком.
export const RECONCILE_TEXT_BUDGET = 3800
const ERROR_CLIP = 200

export type ReconcileKind =
  | 'plan' | 'topup' | 'invoice' | 'shop_order' | 'print_order' | 'print_files' | 'commission'

export interface ReconcileFinding {
  kind: ReconcileKind
  /** id платёжной строки (payment_requests / kaspi_wallet_topups / kaspi_payment_requests). */
  id: string
  userId: string | null
  amount: number
  /** Когда оплата подтверждена (для кошелька и Kaspi-строк это created_at строки). */
  at: string
  detail: string
  /** Операция Kaspi: по ней платёж находят в кабинете Kaspi. */
  opId?: string | null
  /** Продавец «название, e-mail»; пусто, если профиль не прочитался. */
  who?: string | null
}

export interface ReconcileResult {
  findings: ReconcileFinding[]
  /** Что не удалось проверить (сбой запроса, обрезка по лимиту). Не пусто — сверка неполная. */
  errors: string[]
  /** Сколько оплаченных строк было проверено (для еженедельного «сверка жива»). */
  checked: number
}

export const ackKind = (paymentId: string, kind?: ReconcileKind) =>
  kind ? `payment-reconcile-ack:${paymentId}:${kind}` : `payment-reconcile-ack:${paymentId}`

// ---------------------------------------------------------------------------
// Чтение из базы
// ---------------------------------------------------------------------------

// Ровно те операторы запроса, которыми пользуется сверка (так их проще
// подменить в тесте и не тянуть типы построителя запросов).
interface QueryLike {
  eq(column: string, value: string | boolean): QueryLike
  in(column: string, values: string[]): QueryLike
  gte(column: string, value: string): QueryLike
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}
type Apply = (q: QueryLike) => QueryLike

// failed: запрос не отработал, строк нет или их часть. По такому результату
// нельзя делать вывод «записи нет» (ложная тревога), поэтому вызывающий в этом
// случае пропускает проверку и только сообщает о ней в errors.
interface Selected<T> { rows: T[]; error?: string; failed: boolean }

// Текст из базы или от шлюза (название компании, тело ответа при сбое) попадает
// в сообщение: без переводов строк (иначе в нём можно «нарисовать» чужую строку) и с потолком длины.
const clip = (s: string, max = ERROR_CLIP) => s.replace(/\s+/g, ' ').trim().slice(0, max)

async function selectRows<T>(sb: SupabaseClient, table: string, cols: string, apply: Apply): Promise<Selected<T>> {
  const query = sb.from(table).select(cols) as unknown as QueryLike
  const { data, error } = await apply(query).limit(ROW_LIMIT)
  // Тело ответа шлюза при сбое бывает целой HTML-страницей: режем.
  if (error) return { rows: [], error: clip(`${table}: ${error.message}`), failed: true }
  const rows = (data ?? []) as T[]
  // Обрезка по лимиту: прочитанное верно, но это не всё. Для вторичных чтений
  // (профили, журнал) это сбой проверки, иначе недостающие строки выглядели бы
  // «не применёнными»; основной список вызывающий использует как есть.
  if (rows.length >= ROW_LIMIT) return { rows, error: `${table}: достигнут лимит ${ROW_LIMIT} строк, часть могла не проверяться`, failed: true }
  return { rows, failed: false }
}

// Длинный список id в .in() упирается в длину URL: режем на куски.
async function selectIn<T>(
  sb: SupabaseClient, table: string, cols: string, column: string, values: string[], apply: Apply = q => q,
): Promise<Selected<T>> {
  const unique = [...new Set(values)]
  const rows: T[] = []
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const part = await selectRows<T>(sb, table, cols, q => apply(q).in(column, unique.slice(i, i + IN_CHUNK)))
    rows.push(...part.rows)
    if (part.failed) return { rows, error: part.error, failed: true }
  }
  return { rows, failed: false }
}

// ---------------------------------------------------------------------------
// Строки таблиц (только читаемые колонки)
// ---------------------------------------------------------------------------

interface PlanPayRow {
  id: string; user_id: string | null; plan: string; billing_period: string | null
  amount: number | string; status: string; created_at: string; activated_at: string | null
}
interface ProfileRow { id: string; plan: string | null; plan_expires_at: string | null }
interface PersonRow { id: string; company_name: string | null; email: string | null }
interface TopupRow {
  id: string; user_id: string | null; amount: number | string; kaspi_operation_id: string | null
  created_at: string; expires_at: string | null
}
interface KaspiReqRow extends TopupRow {
  invoice_id: string | null; shop_order_id: string | null; print_order_id: string | null
}
interface InvoiceRow { id: string; number: string | null; status: string }
interface OrderRow { id: string; status: string; base_stl_path?: string | null }
interface InvoiceLogRow { invoice_id: string; status: string; created_at: string }

interface Part { findings: ReconcileFinding[]; errors: string[]; checked: number }
const emptyPart = (): Part => ({ findings: [], errors: [], checked: 0 })

const iso = (d: Date) => d.toISOString()

function settledLongAgo(row: { created_at: string; expires_at: string | null }, settledBefore: Date): boolean {
  const created = parseDbTimestamp(row.created_at)
  if (!created || created > settledBefore) return false
  // Строка с ещё не истёкшим сроком могла быть оплачена только что.
  const expires = parseDbTimestamp(row.expires_at)
  return !expires || expires <= settledBefore
}

// 1. Оплата тарифа: к дате оплаты профиль должен «уехать» минимум на период, и
// тариф в профиле должен быть оплаченным. Проверяется только ПОСЛЕДНЯЯ оплата
// или ручная активация пользователя: покупка другого тарифа после неё
// (computePlanActivation тогда считает срок от «сейчас») или правка в админке
// законно «перекрывает» прежнюю, и сверять её уже не с чем.
async function planPayments(sb: SupabaseClient, windowStart: Date, settledBefore: Date): Promise<Part> {
  const part = emptyPart()
  const res = await selectRows<PlanPayRow>(
    sb, 'payment_requests', 'id, user_id, plan, billing_period, amount, status, created_at, activated_at',
    q => q.in('status', ['paid', 'activated']).gte('created_at', iso(new Date(windowStart.getTime() - PLAN_CREATED_LOOKBACK_DAYS * DAY_MS))),
  )
  if (res.error) part.errors.push(res.error)

  const rows = res.rows
    .map(r => ({ r, at: parseDbTimestamp(r.activated_at) ?? parseDbTimestamp(r.created_at) }))
    .filter((x): x is { r: PlanPayRow; at: Date } => !!x.at)

  const latest = new Map<string, { id: string; t: number }>()
  for (const { r, at } of rows) {
    if (!r.user_id) continue
    const cur = latest.get(r.user_id)
    const t = at.getTime()
    if (!cur || t > cur.t || (t === cur.t && r.id > cur.id)) latest.set(r.user_id, { id: r.id, t })
  }

  const due = rows.filter(x => x.r.status === 'paid' && x.at >= windowStart && x.at <= settledBefore)
  part.checked = due.length
  const withoutUser = due.filter(x => !x.r.user_id).length
  if (withoutUser) part.errors.push(`payment_requests: ${withoutUser} оплат без пользователя не проверены`)
  const candidates = due.filter(x => x.r.user_id && latest.get(x.r.user_id)?.id === x.r.id)
  if (!candidates.length) return part

  const profiles = await selectIn<ProfileRow>(sb, 'profiles', 'id, plan, plan_expires_at', 'id', candidates.map(x => x.r.user_id as string))
  if (profiles.error) part.errors.push(profiles.error)
  if (profiles.failed) return part
  const byId = new Map(profiles.rows.map(p => [p.id, p]))

  for (const { r, at } of candidates) {
    const profile = byId.get(r.user_id as string)
    if (!profile) continue // аккаунт удалён: проверять нечего
    const days = r.billing_period === 'annual' ? PLAN_DAYS.annual : PLAN_DAYS.monthly
    const minExpiry = new Date(at.getTime() + (days - PLAN_SLACK_DAYS) * DAY_MS)
    const expiry = parseDbTimestamp(profile.plan_expires_at)
    if (expiry && expiry >= minExpiry && profile.plan === r.plan) continue
    part.findings.push({
      kind: 'plan', id: r.id, userId: r.user_id, amount: Number(r.amount) || 0, at: iso(at),
      detail: `оплачен тариф ${r.plan} (${r.billing_period === 'annual' ? 'год' : 'месяц'}); в профиле тариф «${profile.plan ?? 'нет'}», `
        + `окончание ${expiry ? fmtAlmaty(expiry) : 'не задано'}, ожидалось «${r.plan}» не раньше ${fmtAlmaty(minExpiry)}`,
    })
  }
  return part
}

// 2. Пополнение кошелька: у зачисленного пополнения есть строка в журнале.
async function walletTopups(sb: SupabaseClient, windowStart: Date, settledBefore: Date): Promise<Part> {
  const part = emptyPart()
  const paid = await selectRows<TopupRow>(
    sb, 'kaspi_wallet_topups', 'id, user_id, amount, kaspi_operation_id, created_at, expires_at',
    q => q.eq('status', 'paid').gte('created_at', iso(windowStart)),
  )
  if (paid.error) part.errors.push(paid.error)
  const due = paid.rows.filter(r => settledLongAgo(r, settledBefore))
  part.checked = due.length
  if (!due.length) return part

  const ledger = await selectIn<{ kaspi_wallet_topup_id: string }>(
    sb, 'wallet_ledger', 'kaspi_wallet_topup_id', 'kaspi_wallet_topup_id', due.map(r => r.id), q => q.eq('type', 'topup'),
  )
  if (ledger.error) part.errors.push(ledger.error)
  // Сбой чтения журнала не должен превращаться в «ни одно не зачислено».
  if (ledger.failed) return part
  const credited = new Set(ledger.rows.map(l => l.kaspi_wallet_topup_id))

  for (const r of due) {
    if (credited.has(r.id)) continue
    part.findings.push({
      kind: 'topup', id: r.id, userId: r.user_id, amount: Number(r.amount) || 0, at: iso(parseDbTimestamp(r.created_at) as Date),
      opId: r.kaspi_operation_id,
      detail: 'в журнале кошелька нет записи о зачислении; баланс мог пополниться без записи, поэтому сначала сверьте его',
    })
  }
  return part
}

const STATUS_RU: Record<string, string> = {
  draft: 'черновик', sent: 'отправлен', viewed: 'просмотрен', overdue: 'просрочен', cancelled: 'отменён',
  pending_payment: 'ожидает оплаты', pending: 'ожидает оплаты', expired: 'истёк', failed: 'ошибка',
}
const statusRu = (s: string) => STATUS_RU[s] ?? s

// 3. Платежи Kaspi по счетам, заказам витрины и печати + комиссия.
async function kaspiRequests(sb: SupabaseClient, windowStart: Date, settledBefore: Date): Promise<Part> {
  const part = emptyPart()
  const paid = await selectRows<KaspiReqRow>(
    sb, 'kaspi_payment_requests',
    'id, user_id, invoice_id, shop_order_id, print_order_id, amount, kaspi_operation_id, created_at, expires_at',
    q => q.eq('status', 'paid').gte('created_at', iso(windowStart)),
  )
  if (paid.error) part.errors.push(paid.error)
  const due = paid.rows.filter(r => settledLongAgo(r, settledBefore))
  part.checked = due.length
  if (!due.length) return part

  const finding = (r: KaspiReqRow, kind: ReconcileKind, detail: string): ReconcileFinding => ({
    kind, id: r.id, userId: r.user_id, amount: Number(r.amount) || 0, at: iso(parseDbTimestamp(r.created_at) as Date),
    opId: r.kaspi_operation_id, detail,
  })

  // --- счёт ---
  const withInvoice = due.filter(r => r.invoice_id)
  if (withInvoice.length) {
    const invoices = await selectIn<InvoiceRow>(sb, 'invoices', 'id, number, status', 'id', withInvoice.map(r => r.invoice_id as string))
    if (invoices.error) part.errors.push(invoices.error)
    if (!invoices.failed) {
      const byId = new Map(invoices.rows.map(i => [i.id, i]))
      const open = withInvoice.filter(r => {
        const inv = byId.get(r.invoice_id as string)
        return !!inv && inv.status !== 'paid'
      })
      // Владелец мог сам изменить счёт после оплаты (отменить после возврата
      // денег, выбрать статус вручную): каждое такое действие пишет строку в
      // invoice_logs новее записи об оплате. Это его решение, не потеря.
      // Записи об оплате нет совсем — значит, сбой оборвал и её, и всё
      // остальное, а правка владельца потом ничего не доказывает: сообщаем.
      let logs: Selected<InvoiceLogRow> = { rows: [], failed: false }
      if (open.length) {
        logs = await selectIn<InvoiceLogRow>(sb, 'invoice_logs', 'invoice_id, status, created_at', 'invoice_id', open.map(r => r.invoice_id as string))
        if (logs.error) part.errors.push(logs.error)
      }
      if (!logs.failed) {
        for (const r of open) {
          const inv = byId.get(r.invoice_id as string) as InvoiceRow
          const mine = logs.rows.filter(l => l.invoice_id === r.invoice_id)
          const created = parseDbTimestamp(r.created_at) as Date
          const settleLog = mine
            .filter(l => l.status === 'paid')
            .map(l => parseDbTimestamp(l.created_at))
            .filter((d): d is Date => !!d && d >= created)
            .sort((a, b) => b.getTime() - a.getTime())[0]
          const touchedByOwner = !!settleLog && mine.some(l => {
            const at = parseDbTimestamp(l.created_at)
            return l.status !== 'paid' && !!at && at > settleLog
          })
          if (!touchedByOwner) {
            part.findings.push(finding(r, 'invoice', `счёт ${clip(inv.number ?? inv.id, 60)}, статус «${statusRu(inv.status)}»`))
          }
        }
      }
    }
  }

  // --- заказ витрины ---
  const withShop = due.filter(r => r.shop_order_id)
  if (withShop.length) {
    const orders = await selectIn<OrderRow>(sb, 'kaspi_shop_orders', 'id, status', 'id', withShop.map(r => r.shop_order_id as string))
    if (orders.error) part.errors.push(orders.error)
    if (!orders.failed) {
      const byId = new Map(orders.rows.map(o => [o.id, o]))
      for (const r of withShop) {
        const o = byId.get(r.shop_order_id as string)
        if (o && o.status !== 'paid') part.findings.push(finding(r, 'shop_order', `заказ витрины ${o.id}, статус «${statusRu(o.status)}»`))
      }
    }
  }

  // --- заказ печати: статус и файлы для печати ---
  const withPrint = due.filter(r => r.print_order_id)
  if (withPrint.length) {
    const orders = await selectIn<OrderRow>(sb, 'print_orders', 'id, status, base_stl_path', 'id', withPrint.map(r => r.print_order_id as string))
    if (orders.error) part.errors.push(orders.error)
    if (!orders.failed) {
      const byId = new Map(orders.rows.map(o => [o.id, o]))
      for (const r of withPrint) {
        const o = byId.get(r.print_order_id as string)
        if (!o) continue
        if (o.status !== 'paid') part.findings.push(finding(r, 'print_order', `заказ печати ${o.id}, статус «${statusRu(o.status)}»`))
        else if (!o.base_stl_path) part.findings.push(finding(r, 'print_files', `заказ печати ${o.id}: путь к файлам STL не записан в заказе (файлы могли загрузиться, проверьте хранилище print-orders/${o.id}/; иначе брелок надо готовить вручную)`))
      }
    }
  }

  // --- комиссия ---
  // Комиссия 2% списывается один раз при подтверждении; признак — строка
  // журнала по id запроса либо по примечанию kaspi_operation:<id> (так её
  // находит и выписка Kaspi). Касса с commission_exempt комиссию не платит
  // и строк журнала не получает (wallet.ts), её оплаты здесь не сверяем.
  const exempt = await selectIn<{ user_id: string }>(
    sb, 'kaspi_connections', 'user_id', 'user_id', due.flatMap(r => (r.user_id ? [r.user_id] : [])), q => q.eq('commission_exempt', true),
  )
  if (exempt.error) part.errors.push(exempt.error)
  if (exempt.failed) return part
  const exemptUsers = new Set(exempt.rows.map(c => c.user_id))
  const chargeable = due.filter(r => !(r.user_id && exemptUsers.has(r.user_id)))
  if (!chargeable.length) return part
  const byRequest = await selectIn<{ kaspi_payment_request_id: string }>(
    sb, 'wallet_ledger', 'kaspi_payment_request_id', 'kaspi_payment_request_id', chargeable.map(r => r.id), q => q.eq('type', 'commission'),
  )
  if (byRequest.error) part.errors.push(byRequest.error)
  if (byRequest.failed) return part
  const charged = new Set(byRequest.rows.map(l => l.kaspi_payment_request_id))
  const rest = chargeable.filter(r => !charged.has(r.id) && r.kaspi_operation_id)
  if (!rest.length) return part
  const byNote = await selectIn<{ note: string }>(
    sb, 'wallet_ledger', 'note', 'note', rest.map(r => `kaspi_operation:${r.kaspi_operation_id}`), q => q.eq('type', 'commission'),
  )
  if (byNote.error) part.errors.push(byNote.error)
  if (byNote.failed) return part
  const notes = new Set(byNote.rows.map(l => l.note))
  for (const r of rest) {
    if (notes.has(`kaspi_operation:${r.kaspi_operation_id}`)) continue
    part.findings.push(finding(r, 'commission',
      'в журнале кошелька нет записи о списании комиссии; она могла списаться без записи, поэтому сначала сверьте баланс'))
  }
  return part
}

// Чем раньше в отчёте, тем сильнее задевает клиента: комиссия — деньги
// платформы, и в отчёте она всегда после остального.
const KIND_ORDER: Record<ReconcileKind, number> = {
  plan: 0, topup: 1, invoice: 2, shop_order: 2, print_order: 2, print_files: 2, commission: 3,
}

export async function findUnappliedPayments(sb: SupabaseClient, now: Date = new Date()): Promise<ReconcileResult> {
  const windowStart = new Date(now.getTime() - RECONCILE_WINDOW_DAYS * DAY_MS)
  const settledBefore = new Date(now.getTime() - RECONCILE_GRACE_MINUTES * 60_000)
  const finders: Array<[string, () => Promise<Part>]> = [
    ['payment_requests', () => planPayments(sb, windowStart, settledBefore)],
    ['kaspi_wallet_topups', () => walletTopups(sb, windowStart, settledBefore)],
    ['kaspi_payment_requests', () => kaspiRequests(sb, windowStart, settledBefore)],
  ]
  // Один сбой не должен отменять остальные проверки.
  const parts = await Promise.all(finders.map(async ([name, run]) => {
    try { return await run() } catch (e) {
      return { ...emptyPart(), errors: [clip(`${name}: ${e instanceof Error ? e.message : String(e)}`)] }
    }
  }))
  let findings = parts.flatMap(p => p.findings)
  const errors = parts.flatMap(p => p.errors)
  const checked = parts.reduce((n, p) => n + p.checked, 0)

  if (findings.length) {
    findings = await withoutAcknowledged(sb, findings)
    await attachSellers(sb, findings)
  }
  findings.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.at.localeCompare(a.at))
  return { findings, errors, checked }
}

// Разобранные вручную платежи заглушены строкой daily_reports. Сбой чтения
// не скрывает ничего: лучше лишний раз показать, чем потерять.
async function withoutAcknowledged(sb: SupabaseClient, findings: ReconcileFinding[]): Promise<ReconcileFinding[]> {
  try {
    const wanted = findings.flatMap(f => [ackKind(f.id), ackKind(f.id, f.kind)])
    const acks = await selectIn<{ kind: string }>(sb, 'daily_reports', 'kind', 'kind', wanted)
    if (acks.failed) return findings
    const acknowledged = new Set(acks.rows.map(a => a.kind))
    return findings.filter(f => !acknowledged.has(ackKind(f.id)) && !acknowledged.has(ackKind(f.id, f.kind)))
  } catch {
    return findings
  }
}

// «Продавец»: чтобы основатель понимал, о ком речь, а не искал uuid. Не
// критично: без профиля в отчёте остаётся id пользователя.
async function attachSellers(sb: SupabaseClient, findings: ReconcileFinding[]): Promise<void> {
  try {
    const ids = findings.map(f => f.userId).filter((id): id is string => !!id)
    if (!ids.length) return
    const people = await selectIn<PersonRow>(sb, 'profiles', 'id, company_name, email', 'id', ids)
    if (people.failed && !people.rows.length) return
    const byId = new Map(people.rows.map(p => [p.id, p]))
    for (const f of findings) {
      const p = f.userId ? byId.get(f.userId) : undefined
      if (p) f.who = clip([p.company_name, p.email].filter(Boolean).join(', '), 120) || null
    }
  } catch { /* подпись не обязательна */ }
}

// ---------------------------------------------------------------------------
// Текст для Telegram. Обычный текст без разметки (как у sendFounderTelegram).
// ---------------------------------------------------------------------------

const TITLES: Record<ReconcileKind, string> = {
  plan: 'Тариф оплачен, но не включён',
  topup: 'Пополнение оплачено, но в журнале кошелька нет записи',
  invoice: 'Счёт оплачен через Kaspi, но не отмечен оплаченным',
  shop_order: 'Заказ витрины оплачен, но не отмечен',
  print_order: 'Заказ печати оплачен, но не отмечен',
  print_files: 'Заказ печати оплачен, но файлы для печати не созданы',
  commission: 'Нет записи о списании комиссии',
}

const money = (n: number) => `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function fmtAlmaty(d: Date): string {
  const l = new Date(d.getTime() + ALMATY_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(l.getUTCDate())}.${p(l.getUTCMonth() + 1)}.${l.getUTCFullYear()} ${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`
}

function findingBlock(f: ReconcileFinding, n: number): string {
  const amount = f.kind === 'commission'
    ? `${money(computeCommission(f.amount))} ₸ (с платежа ${money(f.amount)} ₸)`
    : `${money(f.amount)} ₸`
  const lines = [
    `${n}. ${TITLES[f.kind]}: ${amount}, ${fmtAlmaty(new Date(f.at))}`,
    `   ${f.detail}`,
    `   продавец: ${f.who ?? f.userId ?? 'не определён'}${f.opId ? `; операция Kaspi: ${f.opId}` : ''}`,
    `   платёж: ${f.id}`,
  ]
  return lines.join('\n')
}

const MONEY_CONFIRMED: ReconcileKind[] = ['plan', 'invoice', 'shop_order', 'print_order', 'print_files']

/** null — сообщать нечего (расхождений нет и проверка прошла целиком). */
export function buildReconcileText(result: ReconcileResult, now: Date = new Date()): string | null {
  const { findings, errors } = result
  if (!findings.length && !errors.length) return null

  const payments = new Set(findings.map(f => f.id)).size
  const head = findings.length
    ? `⚠️ Сверка платежей ${fmtAlmaty(now)}: платежей без результата — ${payments}`
      + (findings.length !== payments ? ` (записей: ${findings.length})` : '')
      + `, окно ${RECONCILE_WINDOW_DAYS} дн.`
    : `⚠️ Сверка платежей ${fmtAlmaty(now)}: расхождений не найдено, но проверка прошла не целиком`

  const errorBlock = errors.length
    ? [
        'Не удалось проверить (деньги это не затрагивает, проверка повторится завтра):',
        ...errors.slice(0, 5).map(e => `• ${clip(e)}`),
        ...(errors.length > 5 ? [`… и ещё ${errors.length - 5}`] : []),
      ].join('\n')
    : ''
  const advice: string[] = []
  if (findings.some(f => MONEY_CONFIRMED.includes(f.kind))) {
    advice.push('Тарифы, счета и заказы: оплата подтверждена, а результат не применился. Примените вручную.')
  }
  if (findings.some(f => f.kind === 'topup' || f.kind === 'commission')) {
    advice.push('Кошелёк и комиссия: сначала сверьте баланс с журналом, деньги могли уже учесться без записи. Повторно не зачислять и не списывать.')
  }
  if (findings.length) {
    advice.push('Уже разобрали или тариф меняли руками? Скажите в чате с Claude id платежа (и вид строки, если у платежа их две): уберу из отчёта. Иначе строка повторяется, пока платёж в окне.')
  }
  const tailText = [errorBlock, advice.join('\n')].filter(Boolean).join('\n\n')

  const body: string[] = []
  let used = head.length + tailText.length + 4
  let shown = 0
  for (const f of findings.slice(0, RECONCILE_MAX_LINES)) {
    const block = findingBlock(f, shown + 1)
    // запас под строку «… и ещё N»
    if (used + block.length + 1 > RECONCILE_TEXT_BUDGET - 100) break
    body.push(block)
    used += block.length + 1
    shown++
  }
  if (findings.length > shown) body.push(`… и ещё ${findings.length - shown} (id в логе Vercel: cron/payment-reconcile)`)

  return [head, body.join('\n'), tailText].filter(Boolean).join('\n\n')
}

// ---------------------------------------------------------------------------
// «Сверка жива»: молчание при чистой ночи нельзя отличить от «крон не
// запустился», поэтому раз в неделю (понедельник по Алматы) приходит одна
// строка с числом проверенных платежей.
// ---------------------------------------------------------------------------

export function isHeartbeatDay(now: Date): boolean {
  return new Date(`${almatyDay(now).day}T00:00:00Z`).getUTCDay() === 1
}

export function buildHeartbeatText(checked: number, now: Date = new Date()): string {
  return `✅ Сверка платежей работает (${fmtAlmaty(now)}): за ${RECONCILE_WINDOW_DAYS} дн. проверено платежей — ${checked}, расхождений нет.`
}
