import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  findUnappliedPayments,
  buildReconcileText,
  buildHeartbeatText,
  isHeartbeatDay,
  ackKind,
  RECONCILE_MAX_LINES,
  RECONCILE_TEXT_BUDGET,
  RECONCILE_WINDOW_DAYS,
  type ReconcileFinding,
  type ReconcileKind,
} from './paymentReconcile'
import { parseDbTimestamp } from './plan'

type Row = Record<string, unknown>

// Мини-«база»: ровно те операторы, которыми пользуется сверка. Фильтры
// действительно применяются, а select отдаёт только названные колонки (забытая
// колонка в запросе здесь станет undefined, как и в настоящем PostgREST).
// failing: ключ `таблица`, `таблица|колонки` (без пробелов), с необязательным
// `#N` — N-й вызов. Так можно уронить одно конкретное чтение.
function fakeDb(tables: Record<string, Row[]>, failing: Record<string, string> = {}) {
  const inCalls: Array<{ table: string; column: string; size: number }> = []
  const counters = new Map<string, number>()
  const stamp = (v: unknown) => (typeof v === 'string' ? parseDbTimestamp(v)?.getTime() ?? NaN : NaN)
  const next = (key: string) => { const n = (counters.get(key) ?? 0) + 1; counters.set(key, n); return n }
  const db = {
    inCalls,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let max = Infinity
      let cols: string[] = []
      const q = {
        select(c: string) { cols = c.split(',').map(x => x.trim()); return q },
        eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q },
        gte(c: string, v: string) { filters.push(r => stamp(r[c]) >= stamp(v)); return q },
        in(c: string, vs: unknown[]) { inCalls.push({ table, column: c, size: vs.length }); filters.push(r => vs.includes(r[c])); return q },
        limit(n: number) { max = n; return q },
        then(resolve: (v: unknown) => void) {
          const withCols = `${table}|${cols.join(',')}`
          const nCols = next(withCols)
          const nTable = next(table)
          const message = failing[`${withCols}#${nCols}`] ?? failing[withCols] ?? failing[`${table}#${nTable}`] ?? failing[table]
          if (message) return resolve({ data: null, error: { message } })
          const rows = (tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(0, max)
            .map(r => Object.fromEntries(cols.map(c => [c, r[c]])))
          return resolve({ data: rows, error: null })
        },
      }
      return q
    },
  }
  return db as unknown as SupabaseClient & { inCalls: typeof inCalls }
}

const NOW = new Date('2026-11-03T06:20:00Z') // вторник, 11:20 по Алматы
const kinds = (r: { findings: ReconcileFinding[] }) => r.findings.map(f => f.kind)

// ---------------------------------------------------------------------------
// Оплата тарифа. Время в payment_requests/profiles хранится без зоны (UTC).
// ---------------------------------------------------------------------------
const planRow = (over: Row = {}) => ({
  id: 'pay1', user_id: 'u1', plan: 'pro', billing_period: 'monthly', amount: 5990,
  status: 'paid', created_at: '2026-11-02 09:59:00', activated_at: '2026-11-02 10:00:00', ...over,
})
const profile = (over: Row = {}) => ({ id: 'u1', plan: 'pro', plan_expires_at: '2026-12-02 10:00:00', ...over })

describe('оплата тарифа', () => {
  it('тариф включён (+30 дней от оплаты) - расхождений нет, строка учтена в checked', async () => {
    const r = await findUnappliedPayments(fakeDb({ payment_requests: [planRow()], profiles: [profile()] }), NOW)
    expect(r).toEqual({ findings: [], errors: [], checked: 1 })
  })

  it('оплачено, а окончание не сдвинулось - находка с понятным описанием', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow()],
      profiles: [profile({ plan: 'free', plan_expires_at: null })],
    }), NOW)
    expect(kinds(r)).toEqual(['plan'])
    expect(r.findings[0]).toMatchObject({ id: 'pay1', userId: 'u1', amount: 5990 })
    expect(r.findings[0].detail).toContain('оплачен тариф pro (месяц)')
    expect(r.findings[0].detail).toContain('окончание не задано')
  })

  it('окончание есть, но раньше, чем оплата должна была дать', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow()], profiles: [profile({ plan_expires_at: '2026-11-20 10:00:00' })],
    }), NOW)
    expect(kinds(r)).toEqual(['plan'])
  })

  it('граница запаса: -1 сутки допустимо, на минуту меньше - находка', async () => {
    const ok = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow()], profiles: [profile({ plan_expires_at: '2026-12-01 10:00:00' })],
    }), NOW)
    expect(ok.findings).toEqual([])
    const bad = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow()], profiles: [profile({ plan_expires_at: '2026-12-01 09:59:00' })],
    }), NOW)
    expect(kinds(bad)).toEqual(['plan'])
  })

  it('годовая оплата ждёт +365 дней: граница 364 дня допустима, минутой меньше - находка', async () => {
    const annual = planRow({ billing_period: 'annual' })
    const monthlyOnly = await findUnappliedPayments(fakeDb({ payment_requests: [annual], profiles: [profile()] }), NOW)
    expect(kinds(monthlyOnly)).toEqual(['plan'])
    expect(monthlyOnly.findings[0].detail).toContain('(год)')
    const edge = await findUnappliedPayments(fakeDb({
      payment_requests: [annual], profiles: [profile({ plan_expires_at: '2027-11-01 10:00:00' })],
    }), NOW)
    expect(edge.findings).toEqual([])
    const short = await findUnappliedPayments(fakeDb({
      payment_requests: [annual], profiles: [profile({ plan_expires_at: '2027-11-01 09:59:00' })],
    }), NOW)
    expect(kinds(short)).toEqual(['plan'])
  })

  it('срок большой, но тариф в профиле не тот, что оплачен (не прошёл апгрейд) - находка', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ plan: 'pro' })],
      profiles: [profile({ plan: 'basic', plan_expires_at: '2027-10-20 10:00:00' })],
    }), NOW)
    expect(kinds(r)).toEqual(['plan'])
    expect(r.findings[0].detail).toContain('в профиле тариф «basic»')
  })

  it('позже купили другой тариф: сверяется только последняя оплата, прежняя годовая не тревожит', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [
        planRow({ id: 'old', plan: 'basic', billing_period: 'annual', activated_at: '2026-11-01 10:00:00' }),
        planRow({ id: 'new', plan: 'pro', billing_period: 'monthly', activated_at: '2026-11-02 10:00:00' }),
      ],
      profiles: [profile()],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('и последняя оплата проверяется: она не применилась - находка именно по ней', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [
        planRow({ id: 'old', plan: 'basic', activated_at: '2026-11-01 10:00:00' }),
        planRow({ id: 'new', plan: 'pro', activated_at: '2026-11-02 10:00:00' }),
      ],
      profiles: [profile({ plan: 'basic', plan_expires_at: '2026-12-01 10:00:00' })],
    }), NOW)
    expect(r.findings.map(f => f.id)).toEqual(['new'])
  })

  it('позже была ручная активация в админке (activated) - прежнюю оплату не сверяем', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [
        planRow({ id: 'old', activated_at: '2026-11-01 10:00:00' }),
        planRow({ id: 'manual', status: 'activated', activated_at: '2026-11-02 12:00:00' }),
      ],
      profiles: [profile({ plan_expires_at: '2026-11-20 10:00:00' })],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('более свежая оплата ещё в запасе (10 минут назад) - прежнюю тоже пока не трогаем', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [
        planRow({ id: 'old', activated_at: '2026-11-01 10:00:00' }),
        planRow({ id: 'fresh', activated_at: '2026-11-03 06:10:00', created_at: '2026-11-03 06:09:00' }),
      ],
      profiles: [profile({ plan_expires_at: '2026-11-20 10:00:00' })],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('аккаунт удалён (профиля нет) - не находка', async () => {
    const r = await findUnappliedPayments(fakeDb({ payment_requests: [planRow()], profiles: [] }), NOW)
    expect(r.findings).toEqual([])
    expect(r.errors).toEqual([])
  })

  it('оплата 10 минут назад - ещё может применяться, не трогаем', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ activated_at: '2026-11-03 06:10:00', created_at: '2026-11-03 06:09:00' })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('время без зоны с «T» (так отдаёт PostgREST) читается как UTC: 25 минут назад = ещё в запасе', async () => {
    // Прочитай такое время как местное (UTC+5) - оплата оказалась бы 5 часов назад и стала бы находкой.
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ activated_at: '2026-11-03T05:55:00', created_at: '2026-11-03T05:54:00' })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(r.findings).toEqual([])
    const late = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ activated_at: '2026-11-03T05:45:00', created_at: '2026-11-03T05:44:00' })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(kinds(late)).toEqual(['plan'])
  })

  it('оплата старше окна (8 дней) - не повторяем бесконечно', async () => {
    expect(RECONCILE_WINDOW_DAYS).toBe(7)
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ activated_at: '2026-10-26 10:00:00', created_at: '2026-10-26 09:59:00' })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('пуш-строка создана за сутки до оплаты: берём по моменту оплаты, не по созданию', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ created_at: '2026-10-26 12:00:00', activated_at: '2026-10-27 12:00:00' })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(kinds(r)).toEqual(['plan'])
  })

  it('без activated_at берётся created_at', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [planRow({ activated_at: null })],
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(kinds(r)).toEqual(['plan'])
  })

  it('ожидающие, просроченные и отклонённые оплаты не сверяются', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: ['pending', 'expired', 'failed', 'rejected'].map((status, i) => planRow({ id: `x${i}`, status })),
      profiles: [profile({ plan_expires_at: null })],
    }), NOW)
    expect(r).toEqual({ findings: [], errors: [], checked: 0 })
  })

  it('оплата без пользователя не пропадает молча: сказано в errors', async () => {
    const r = await findUnappliedPayments(fakeDb({ payment_requests: [planRow({ user_id: null })], profiles: [] }), NOW)
    expect(r.findings).toEqual([])
    expect(r.errors).toEqual(['payment_requests: 1 оплат без пользователя не проверены'])
  })
})

// ---------------------------------------------------------------------------
// Пополнение кошелька. kaspi_wallet_topups: timestamptz, QR живёт ~5 минут.
// ---------------------------------------------------------------------------
const topup = (over: Row = {}) => ({
  id: 't1', user_id: 'u1', amount: 1000, status: 'paid', kaspi_operation_id: 'top-op1',
  created_at: '2026-11-02T08:00:00+00:00', expires_at: '2026-11-02T08:05:00+00:00', ...over,
})

describe('пополнение кошелька', () => {
  it('зачислено (есть строка topup в журнале) - тихо', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup()], wallet_ledger: [{ type: 'topup', kaspi_wallet_topup_id: 't1' }],
    }), NOW)
    expect(r).toEqual({ findings: [], errors: [], checked: 1 })
  })

  it('оплачено, но записи нет - находка с операцией Kaspi; запись другого типа не считается', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup()], wallet_ledger: [{ type: 'adjustment', kaspi_wallet_topup_id: 't1' }],
    }), NOW)
    expect(kinds(r)).toEqual(['topup'])
    expect(r.findings[0]).toMatchObject({ id: 't1', amount: 1000, opId: 'top-op1' })
    expect(r.findings[0].detail).toContain('сначала сверьте')
  })

  it('QR на 5 минут: создан 10 минут назад (срок вышел 5 минут назад) - ещё в запасе 30 минут', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup({ created_at: '2026-11-03T06:10:00+00:00', expires_at: '2026-11-03T06:15:00+00:00' })],
      wallet_ledger: [],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('QR на 5 минут: создан 40 минут назад - запас прошёл, находка', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup({ created_at: '2026-11-03T05:40:00+00:00', expires_at: '2026-11-03T05:45:00+00:00' })],
      wallet_ledger: [],
    }), NOW)
    expect(kinds(r)).toEqual(['topup'])
  })

  it('срок строки ещё не вышел (нетипично длинный) - возможно, платят прямо сейчас', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup({ created_at: '2026-11-02T08:00:00+00:00', expires_at: '2026-11-03T07:00:00+00:00' })],
      wallet_ledger: [],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('пополнение старше окна не повторяется', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: [topup({ created_at: '2026-10-20T08:00:00+00:00', expires_at: '2026-10-20T08:05:00+00:00' })],
      wallet_ledger: [],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('ожидающие, просроченные и неудавшиеся пополнения не сверяются', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: ['pending', 'expired', 'failed'].map((status, i) => topup({ id: `x${i}`, status })),
      wallet_ledger: [],
    }), NOW)
    expect(r.findings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Платежи Kaspi: счёт, заказы, комиссия.
// ---------------------------------------------------------------------------
const req = (over: Row = {}) => ({
  id: 'k1', user_id: 'u1', invoice_id: 'inv1', shop_order_id: null, print_order_id: null, amount: 12000,
  kaspi_operation_id: 'op1', status: 'paid',
  created_at: '2026-11-02T08:00:00+00:00', expires_at: '2026-11-02T08:05:00+00:00', ...over,
})
const commission = (id = 'k1', op = 'op1') => ({ type: 'commission', kaspi_payment_request_id: id, note: `kaspi_operation:${op}` })
const invoice = (over: Row = {}) => ({ id: 'inv1', number: 'INV-0001', status: 'paid', ...over })

describe('платежи Kaspi', () => {
  it('счёт оплачен и комиссия списана - тихо', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice()], wallet_ledger: [commission()],
    }), NOW)
    expect(r).toEqual({ findings: [], errors: [], checked: 1 })
  })

  it('платёж подтверждён, а счёт не оплачен - находка с номером, статусом по-русски и операцией Kaspi', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice({ status: 'overdue' })], invoice_logs: [], wallet_ledger: [commission()],
    }), NOW)
    expect(kinds(r)).toEqual(['invoice'])
    expect(r.findings[0].detail).toBe('счёт INV-0001, статус «просрочен»')
    expect(r.findings[0].opId).toBe('op1')
  })

  it('счёта нет (удалён) - не находка', async () => {
    const r = await findUnappliedPayments(fakeDb({ kaspi_payment_requests: [req()], invoices: [], wallet_ledger: [commission()] }), NOW)
    expect(r.findings).toEqual([])
  })

  it('владелец сам изменил счёт после оплаты (переотправил в WhatsApp) - не потеря, молчим', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice({ status: 'sent' })],
      invoice_logs: [
        { invoice_id: 'inv1', status: 'paid', created_at: '2026-11-02T08:03:00+00:00' },
        { invoice_id: 'inv1', status: 'sent', created_at: '2026-11-02T15:00:00+00:00' },
      ],
      wallet_ledger: [commission()],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('владелец отменил счёт после возврата денег - молчим', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice({ status: 'cancelled' })],
      invoice_logs: [
        { invoice_id: 'inv1', status: 'paid', created_at: '2026-11-02T08:03:00+00:00' },
        { invoice_id: 'inv1', status: 'cancelled', created_at: '2026-11-02T20:00:00+00:00' },
      ],
      wallet_ledger: [commission()],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('запись об оплате в журнале есть, а статус счёта не сменился и позже никто его не трогал - находка', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice({ status: 'sent' })],
      invoice_logs: [
        { invoice_id: 'inv1', status: 'sent', created_at: '2026-11-01T08:00:00+00:00' },
        { invoice_id: 'inv1', status: 'paid', created_at: '2026-11-02T08:03:00+00:00' },
      ],
      wallet_ledger: [commission()],
    }), NOW)
    expect(kinds(r)).toEqual(['invoice'])
  })

  it('записи об оплате нет вовсе (сбой оборвал и её): правка владельца находку НЕ гасит', async () => {
    for (const touchAt of ['2026-11-02T09:00:00+00:00', '2026-11-02T08:02:00+00:00']) {
      const r = await findUnappliedPayments(fakeDb({
        kaspi_payment_requests: [req()], invoices: [invoice({ status: 'sent' })],
        invoice_logs: [{ invoice_id: 'inv1', status: 'sent', created_at: touchAt }],
        wallet_ledger: [commission()],
      }), NOW)
      expect(kinds(r)).toEqual(['invoice'])
    }
  })

  it('номер счёта и подпись продавца из базы: переводы строк убраны, длина ограничена (в отчёт нельзя вписать чужую строку)', async () => {
    const forged = `ТОО\n✅ Сверка платежей работает: расхождений нет. ${'я'.repeat(4000)}`
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()],
      invoices: [invoice({ status: 'overdue', number: `INV\n0001 ${'9'.repeat(300)}` })],
      invoice_logs: [],
      profiles: [{ id: 'u1', plan: 'pro', plan_expires_at: null, company_name: forged, email: 'a@b.kz' }],
      wallet_ledger: [commission()],
    }), NOW)
    const f = r.findings[0]
    expect(f.who!.length).toBeLessThanOrEqual(120)
    expect(f.who).not.toContain('\n')
    expect(f.detail).not.toContain('\n')
    expect(f.detail.length).toBeLessThan(140)
    const text = buildReconcileText(r, NOW)!
    expect(text.split('\n').some(l => l.startsWith('✅'))).toBe(false)
    expect(text.length).toBeLessThanOrEqual(RECONCILE_TEXT_BUDGET)
  })

  it('заказ витрины, заказ печати и файлы печати: каждый по своей таблице', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [
        req({ id: 'k2', invoice_id: null, shop_order_id: 'so1', kaspi_operation_id: 'op2' }),
        req({ id: 'k3', invoice_id: null, print_order_id: 'po1', kaspi_operation_id: 'op3' }),
        req({ id: 'k4', invoice_id: null, shop_order_id: 'so2', kaspi_operation_id: 'op4' }),
        req({ id: 'k5', invoice_id: null, print_order_id: 'po2', kaspi_operation_id: 'op5' }),
        req({ id: 'k6', invoice_id: null, print_order_id: 'po3', kaspi_operation_id: 'op6' }),
      ],
      kaspi_shop_orders: [{ id: 'so1', status: 'pending_payment' }, { id: 'so2', status: 'paid' }],
      print_orders: [
        { id: 'po1', status: 'pending', base_stl_path: null },
        { id: 'po2', status: 'paid', base_stl_path: null },
        { id: 'po3', status: 'paid', base_stl_path: 'po3/base.stl' },
      ],
      wallet_ledger: [commission('k2', 'op2'), commission('k3', 'op3'), commission('k4', 'op4'), commission('k5', 'op5'), commission('k6', 'op6')],
    }), NOW)
    expect(r.findings.map(f => [f.kind, f.id]).sort()).toEqual([['print_files', 'k5'], ['print_order', 'k3'], ['shop_order', 'k2']])
    expect(r.findings.find(f => f.kind === 'print_files')!.detail).toContain('print-orders/po2/')
  })

  it('комиссия: нет строки журнала ни по id, ни по примечанию - находка', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice()], wallet_ledger: [],
    }), NOW)
    expect(kinds(r)).toEqual(['commission'])
    expect(r.findings[0].detail).toContain('сначала сверьте баланс')
  })

  it('комиссия найдена по примечанию kaspi_operation (строка без id запроса) - тихо', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice()],
      wallet_ledger: [{ type: 'commission', kaspi_payment_request_id: null, note: 'kaspi_operation:op1' }],
    }), NOW)
    expect(r.findings).toEqual([])
  })

  it('строка журнала другого типа комиссией не считается', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [req()], invoices: [invoice()],
      wallet_ledger: [{ type: 'adjustment', kaspi_payment_request_id: 'k1', note: 'kaspi_operation:op1' }],
    }), NOW)
    expect(kinds(r)).toEqual(['commission'])
  })

  it('свежие (срок не вышел), старше окна и не оплаченные строки пропускаются', async () => {
    const r = await findUnappliedPayments(fakeDb({
      kaspi_payment_requests: [
        req({ id: 'fresh', created_at: '2026-11-03T06:10:00+00:00', expires_at: '2026-11-03T06:15:00+00:00' }),
        req({ id: 'old', created_at: '2026-10-20T08:00:00+00:00', expires_at: '2026-10-20T08:05:00+00:00' }),
        req({ id: 'pend', status: 'pending' }),
      ],
      invoices: [invoice({ status: 'overdue' })], invoice_logs: [], wallet_ledger: [],
    }), NOW)
    expect(r.findings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Сбои самой сверки: ни один не должен превращаться в «ничего не применено»
// и ни один не должен проходить молча.
// ---------------------------------------------------------------------------
describe('сбои чтения', () => {
  // Данные, на которых КАЖДОЕ правило дало бы находку, если бы пустой ответ приняли за «записи нет».
  const everythingBroken = () => ({
    payment_requests: [planRow()],
    profiles: [profile({ plan: 'free', plan_expires_at: null })],
    kaspi_wallet_topups: [topup()],
    kaspi_payment_requests: [
      req({ id: 'ka', invoice_id: 'inv1', kaspi_operation_id: 'opa' }),
      req({ id: 'kb', invoice_id: null, shop_order_id: 'so1', kaspi_operation_id: 'opb' }),
      req({ id: 'kc', invoice_id: null, print_order_id: 'po1', kaspi_operation_id: 'opc' }),
    ],
    invoices: [invoice({ status: 'overdue' })],
    invoice_logs: [],
    kaspi_shop_orders: [{ id: 'so1', status: 'pending_payment' }],
    print_orders: [{ id: 'po1', status: 'paid', base_stl_path: null }],
    wallet_ledger: [],
  })

  it('без сбоев на этих данных находятся все виды (контроль самого теста)', async () => {
    const r = await findUnappliedPayments(fakeDb(everythingBroken()), NOW)
    expect(new Set(kinds(r))).toEqual(new Set<ReconcileKind>(['plan', 'topup', 'invoice', 'shop_order', 'print_files', 'commission']))
    expect(r.errors).toEqual([])
  })

  const ALL: ReconcileKind[] = ['plan', 'topup', 'invoice', 'shop_order', 'print_files', 'commission']
  const without = (...blocked: ReconcileKind[]) => ALL.filter(k => !blocked.includes(k))
  // [ключ сбоя, что из-за него не должно появиться, что обязано остаться]
  const cases: Array<[string, ReconcileKind[], ReconcileKind[]]> = [
    ['payment_requests', ['plan'], without('plan')],
    ['profiles|id,plan,plan_expires_at', ['plan'], without('plan')],
    ['kaspi_wallet_topups', ['topup'], without('topup')],
    ['wallet_ledger|kaspi_wallet_topup_id', ['topup'], without('topup')],
    ['kaspi_payment_requests', ['invoice', 'shop_order', 'print_files', 'commission'], ['plan', 'topup']],
    ['invoices', ['invoice'], without('invoice')],
    ['invoice_logs', ['invoice'], without('invoice')],
    ['kaspi_shop_orders', ['shop_order'], without('shop_order')],
    ['print_orders', ['print_files'], without('print_files')],
    ['wallet_ledger|kaspi_payment_request_id', ['commission'], without('commission')],
    ['wallet_ledger|note', ['commission'], without('commission')],
  ]
  it.each(cases)('падает чтение %s: об этом сказано, ложных находок нет, остальные проверки идут', async (key, blocked, stillPresent) => {
    const r = await findUnappliedPayments(fakeDb(everythingBroken(), { [key]: 'boom' }), NOW)
    expect(r.errors.length).toBeGreaterThanOrEqual(1)
    expect(r.errors[0]).toContain(`${key.split('|')[0]}: boom`)
    for (const k of blocked) expect(kinds(r)).not.toContain(k)
    for (const k of stillPresent) expect(kinds(r)).toContain(k)
  })

  it('второй кусок списка не прочитался: весь список пропускается, а не проверяется наполовину', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `t${i}`)
    const r = await findUnappliedPayments(fakeDb({
      kaspi_wallet_topups: ids.map(id => topup({ id })),
      wallet_ledger: [],
    }, { 'wallet_ledger|kaspi_wallet_topup_id#2': 'timeout' }), NOW)
    expect(r.findings).toEqual([])
    expect(r.errors).toEqual(['wallet_ledger: timeout'])
  })

  it('исключение внутри проверки тоже превращается в errors, по одному на проверку', async () => {
    const db = { from() { throw new Error('client exploded') } } as unknown as SupabaseClient
    const r = await findUnappliedPayments(db, NOW)
    expect(r.findings).toEqual([])
    expect(r.errors).toHaveLength(3)
    expect(r.errors[0]).toContain('client exploded')
  })

  it('длинный ответ шлюза (HTML-страница) режется до 200 знаков, без переводов строк', async () => {
    const html = `<html>\n<body>${'x'.repeat(5000)}</body>\n</html>`
    const r = await findUnappliedPayments(fakeDb({}, { payment_requests: html }), NOW)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].length).toBeLessThanOrEqual(200)
    expect(r.errors[0]).not.toContain('\n')
  })

  it('длинные списки id уходят в запрос порциями по 100', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `t${i}`)
    const db = fakeDb({
      kaspi_wallet_topups: ids.map(id => topup({ id })),
      wallet_ledger: ids.map(id => ({ type: 'topup', kaspi_wallet_topup_id: id })),
    })
    const r = await findUnappliedPayments(db, NOW)
    expect(r).toEqual({ findings: [], errors: [], checked: 250 })
    expect(db.inCalls.filter(c => c.table === 'wallet_ledger').map(c => c.size)).toEqual([100, 100, 50])
  })

  it('упёрлись в лимит строк - об этом сказано, находки по прочитанному остаются', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => topup({ id: `t${i}` }))
    const r = await findUnappliedPayments(fakeDb({ kaspi_wallet_topups: rows, wallet_ledger: [] }), NOW)
    expect(r.errors.some(e => e.includes('лимит 1000'))).toBe(true)
    expect(r.findings).toHaveLength(1000)
  })
})

// ---------------------------------------------------------------------------
// Обогащение и порядок.
// ---------------------------------------------------------------------------
describe('подпись продавца, заглушка и порядок', () => {
  const scenario = () => ({
    payment_requests: [planRow()],
    profiles: [{ id: 'u1', plan: 'free', plan_expires_at: null, company_name: 'ТОО Ромашка', email: 'a@b.kz' }],
    kaspi_payment_requests: [req({ invoice_id: null })],
    wallet_ledger: [],
  })

  it('к находке приписаны название компании и e-mail продавца', async () => {
    const r = await findUnappliedPayments(fakeDb(scenario()), NOW)
    expect(r.findings.find(f => f.kind === 'plan')?.who).toBe('ТОО Ромашка, a@b.kz')
  })

  it('профиль подписи не прочитался - находки остаются, в отчёте будет id пользователя', async () => {
    const r = await findUnappliedPayments(fakeDb(scenario(), { 'profiles|id,company_name,email': 'boom' }), NOW)
    expect(kinds(r)).toContain('plan')
    expect(r.findings[0].who).toBeUndefined()
    expect(r.errors).toEqual([])
  })

  it('платёж, разобранный вручную (есть строка заглушки в daily_reports), из отчёта убран', async () => {
    const r = await findUnappliedPayments(fakeDb({
      ...scenario(), daily_reports: [{ kind: ackKind('pay1'), day: '2026-11-03' }],
    }), NOW)
    expect(kinds(r)).toEqual(['commission'])
  })

  it('заглушка по виду гасит только его: счёт разобрали, комиссия остаётся в отчёте', async () => {
    const data = {
      kaspi_payment_requests: [req()], invoices: [invoice({ status: 'overdue' })], invoice_logs: [], wallet_ledger: [],
    }
    const both = await findUnappliedPayments(fakeDb(data), NOW)
    expect(kinds(both).sort()).toEqual(['commission', 'invoice'])
    const oneKind = await findUnappliedPayments(fakeDb({ ...data, daily_reports: [{ kind: ackKind('k1', 'invoice'), day: '2026-11-03' }] }), NOW)
    expect(kinds(oneKind)).toEqual(['commission'])
    const wholePayment = await findUnappliedPayments(fakeDb({ ...data, daily_reports: [{ kind: ackKind('k1'), day: '2026-11-03' }] }), NOW)
    expect(wholePayment.findings).toEqual([])
  })

  it('формат заглушки: id платежа, при необходимости вид через двоеточие', () => {
    expect(ackKind('abc')).toBe('payment-reconcile-ack:abc')
    expect(ackKind('abc', 'commission')).toBe('payment-reconcile-ack:abc:commission')
  })

  it('заглушку не прочитать - показываем всё, лучше лишнее, чем потерянное', async () => {
    const r = await findUnappliedPayments(fakeDb(scenario(), { daily_reports: 'boom' }), NOW)
    expect(kinds(r)).toEqual(['plan', 'commission'])
    expect(r.errors).toEqual([])
  })

  it('порядок: тариф раньше комиссии, внутри вида свежие раньше старых', async () => {
    const r = await findUnappliedPayments(fakeDb({
      payment_requests: [
        planRow({ id: 'p-old', user_id: 'a', activated_at: '2026-10-30 10:00:00' }),
        planRow({ id: 'p-new', user_id: 'b', activated_at: '2026-11-02 10:00:00' }),
      ],
      profiles: [profile({ id: 'a', plan_expires_at: null }), profile({ id: 'b', plan_expires_at: null })],
      kaspi_payment_requests: [req({ invoice_id: null })],
      wallet_ledger: [],
    }), NOW)
    expect(r.findings.map(f => f.id)).toEqual(['p-new', 'p-old', 'k1'])
  })
})

// ---------------------------------------------------------------------------
// Текст.
// ---------------------------------------------------------------------------
const UUID = (n: number) => `${String(n).padStart(8, '0')}-aaaa-bbbb-cccc-${String(n).padStart(12, '0')}`
const finding = (i: number, over: Partial<ReconcileFinding> = {}): ReconcileFinding => ({
  kind: 'plan', id: UUID(i), userId: UUID(1000 + i), amount: 5990, at: '2026-11-02T10:00:00.000Z',
  detail: 'оплачен тариф pro (месяц); в профиле тариф «free», окончание не задано, ожидалось «pro» не раньше 02.12.2026 15:00',
  who: 'ТОО «Очень длинное название компании для проверки переноса», owner@example-company.kz', opId: '12345678901', ...over,
})

describe('buildReconcileText', () => {
  it('нет находок и сбоев - null, Telegram молчит', () => {
    expect(buildReconcileText({ findings: [], errors: [], checked: 5 }, NOW)).toBeNull()
  })

  it('находка: заголовок, сумма, время по Алматы, продавец, операция и id платежа', () => {
    const text = buildReconcileText({ findings: [finding(1)], errors: [], checked: 1 }, NOW)!
    expect(text).toContain('платежей без результата — 1')
    expect(text).toContain('Тариф оплачен, но не включён: 5 990 ₸, 02.11.2026 15:00')
    expect(text).toContain('продавец: ТОО «Очень длинное название')
    expect(text).toContain('операция Kaspi: 12345678901')
    expect(text).toContain(`платёж: ${UUID(1)}`)
  })

  it('без названия продавца в строке остаётся id пользователя', () => {
    const text = buildReconcileText({ findings: [finding(1, { who: undefined })], errors: [], checked: 1 }, NOW)!
    expect(text).toContain(`продавец: ${UUID(1001)}`)
  })

  it('комиссия показана суммой комиссии, а не всего платежа', () => {
    const text = buildReconcileText({ findings: [finding(1, { kind: 'commission', amount: 120000 })], errors: [], checked: 1 }, NOW)!
    expect(text).toContain('2 400 ₸ (с платежа 120 000 ₸)')
  })

  it('одна оплата с двумя записями считается одним платежом', () => {
    const text = buildReconcileText({
      findings: [finding(1, { kind: 'invoice' }), finding(1, { kind: 'commission' })], errors: [], checked: 1,
    }, NOW)!
    expect(text).toContain('платежей без результата — 1 (записей: 2)')
  })

  it('подсказки по видам: «примените вручную» не звучит для кошелька и комиссии', () => {
    const only = (k: ReconcileKind) => buildReconcileText({ findings: [finding(1, { kind: k })], errors: [], checked: 1 }, NOW)!
    expect(only('plan')).toContain('оплата подтверждена, а результат не применился')
    expect(only('plan')).not.toContain('Повторно не зачислять')
    expect(only('topup')).toContain('Повторно не зачислять и не списывать')
    expect(only('topup')).not.toContain('оплата подтверждена, а результат не применился')
    expect(only('commission')).toContain('Повторно не зачислять и не списывать')
    expect(only('plan')).toContain('Уже разобрали или тариф меняли руками?')
  })

  it('больше лимита строк - обрезается с «и ещё N»', () => {
    const findings = Array.from({ length: RECONCILE_MAX_LINES + 5 }, (_, i) => finding(i + 1))
    const text = buildReconcileText({ findings, errors: [], checked: 20 }, NOW)!
    expect(text).toMatch(/… и ещё \d+/)
  })

  it('самый тяжёлый случай (12 находок с настоящими uuid + 5 длинных сбоев) укладывается в бюджет, хвост цел', () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding(i + 1, { kind: i % 2 ? 'topup' : 'plan' }))
    const errors = ['payment_requests: ' + 'x'.repeat(1000), 'a', 'b', 'c', 'd', 'e-лишний']
    const text = buildReconcileText({ findings, errors, checked: 40 }, NOW)!
    expect(text.length).toBeLessThanOrEqual(RECONCILE_TEXT_BUDGET)
    expect(text).toContain('Не удалось проверить')
    expect(text).toContain('Уже разобрали или тариф меняли руками?')
    expect(text).toContain('Повторно не зачислять')
    expect(text).not.toContain('e-лишний')
    expect(text).toMatch(/… и ещё \d+/)
    // не больше 200 знаков на строку сбоя
    const errLine = text.split('\n').find(l => l.startsWith('• payment_requests'))!
    expect(errLine.length).toBeLessThanOrEqual(202)
  })

  it('только сбои проверки - сообщение уходит, без «примените вручную», с пояснением, что деньги не затронуты', () => {
    const text = buildReconcileText({ findings: [], errors: ['profiles: boom'], checked: 0 }, NOW)!
    expect(text).toContain('прошла не целиком')
    expect(text).toContain('деньги это не затрагивает')
    expect(text).toContain('• profiles: boom')
    expect(text).not.toContain('оплата подтверждена')
    expect(text).not.toContain('Уже разобрали')
    // между заголовком и блоком сбоев ровно одна пустая строка
    expect(text.split('\n\n')).toHaveLength(2)
    expect(text).not.toContain('\n\n\n')
  })

  it('сбоев больше пяти - лишние не теряются молча', () => {
    const errors = Array.from({ length: 7 }, (_, i) => `t${i}: boom`)
    const text = buildReconcileText({ findings: [], errors, checked: 0 }, NOW)!
    expect(text).toContain('• t4: boom')
    expect(text).not.toContain('• t5: boom')
    expect(text).toContain('… и ещё 2')
  })
})

describe('«сверка жива»', () => {
  it('понедельник по Алматы, включая ночь на воскресенье по UTC', () => {
    expect(isHeartbeatDay(new Date('2026-11-02T06:20:00Z'))).toBe(true) // пн 11:20
    expect(isHeartbeatDay(new Date('2026-11-01T20:00:00Z'))).toBe(true) // пн 01:00 по Алматы, ещё вс по UTC
    expect(isHeartbeatDay(NOW)).toBe(false) // вт
    expect(isHeartbeatDay(new Date('2026-11-01T06:20:00Z'))).toBe(false) // вс
  })

  it('строка называет окно и число проверенных платежей', () => {
    const text = buildHeartbeatText(12, NOW)
    expect(text).toContain('Сверка платежей работает')
    expect(text).toContain('проверено платежей — 12')
    expect(text).toContain('за 7 дн.')
  })
})
