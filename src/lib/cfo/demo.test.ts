import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoArticle, CfoOperation } from './types'
import { buildDemo } from './demo'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from './calendar'
import { addDays, firstDay, monthKey } from './dates'
import { monthLimits } from './limits'

const names = ['Выручка от продажи товаров', 'Закупка товаров и материалов', 'Зарплата', 'Налоги и взносы с зарплаты (ОПВ, СО, ВОСМС, СН, ИПН)', 'Аренда', 'Коммунальные услуги', 'Реклама и маркетинг', 'Связь и интернет', 'Банковские комиссии и эквайринг']
const articles: CfoArticle[] = names.map((name, i) => ({ id: `a${i}`, name, kind: i === 0 ? 'income' : 'expense', activity: 'operating', pnlGroup: i === 0 ? 'revenue' : i === 1 ? 'cogs' : 'opex', archived: false, sort: i }))
let n = 0
const newId = () => `id${++n}`
const T = '2026-10-08'

describe('buildDemo', () => {
  const demo = buildDemo(T, articles, newId)!

  it('produces past facts only up to today and planned items only ahead', () => {
    expect(demo.operations.filter((o) => o.status === 'actual').every((o) => o.paidOn <= T && o.paidOn >= '2026-05-01')).toBe(true)
    expect(demo.operations.filter((o) => o.status === 'planned').every((o) => o.paidOn > T)).toBe(true)
    expect(demo.recurrences.every((r) => r.startsOn > T)).toBe(true)
  })

  it('shows a cash gap ahead and an exceeded ad limit — the point of the example', () => {
    const ws: Workspace = {
      userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices: false, invoices: [], articles,
      accounts: demo.accounts.map((a, i) => ({ ...a, archived: false, sort: i })),
      operations: demo.operations.map((o, i): CfoOperation => ({ id: `o${i}`, ...o, toAccountId: null, comment: null, accruedOn: o.paidOn, recurrenceId: null, recurrenceDate: null })),
      recurrences: demo.recurrences.map((r, i) => ({ id: `r${i}`, ...r, toAccountId: null, comment: null, endsOn: null })),
      plan: demo.plan,
    }
    const cal = buildCalendar({ accounts: ws.accounts, operations: ws.operations, recurrences: ws.recurrences, today: T, from: firstDay(monthKey(T)), to: addDays(T, CALENDAR_HORIZON_DAYS - 1) })
    expect(cal.firstGap).not.toBeNull()
    expect(cal.firstGap! > T).toBe(true)
    expect(cal.days.find((d) => d.date === T)!.balance).toBeGreaterThan(0)
    expect(monthLimits(ws, monthKey(T)).find((r) => r.articleId === 'a6')?.level).toBe('over')
  })

  it('gives up when a starter article is missing', () => {
    expect(buildDemo(T, articles.slice(1), newId)).toBeNull()
  })
})
