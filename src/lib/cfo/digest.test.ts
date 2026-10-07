import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoAccount, CfoArticle, CfoOperation, CfoRecurrence } from './types'
import { almatyToday, buildDigest as build } from './digest'

// formatTenge отдаёт неразрывные пробелы между разрядами — в проверках сравниваем с обычными.
const buildDigest = (w: Workspace, today: string) => build(w, today).replace(/ /g, ' ')

const account: CfoAccount = { id: 'acc', name: 'Kaspi', kind: 'bank', openingBalance: 100_000_00, openingDate: '2026-10-01', archived: false, sort: 10 }
const rent: CfoArticle = { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 10 }
const sales: CfoArticle = { id: 'sales', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 20 }
const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: Math.random().toString(36), direction: 'out', amount: 0, accountId: 'acc', toAccountId: null, articleId: 'rent', counterparty: null, comment: null,
  paidOn: '2026-10-08', accruedOn: '2026-10-08', status: 'planned', recurrenceId: null, recurrenceDate: null, ...p,
})
const ws = (ops: CfoOperation[], recurrences: CfoRecurrence[] = []): Workspace => ({
  userId: 'u', companyId: 'c', companyName: 'ТОО <Ромашка> & Ко', telegramDigest: true,
  accounts: [account], articles: [rent, sales], operations: ops, recurrences, plan: [],
})

describe('buildDigest', () => {
  it('reports cash, today payments, receipts and a quiet horizon', () => {
    const text = buildDigest(ws([
      op({ amount: 30_000_00, counterparty: 'ИП Арендодатель' }),
      op({ amount: 5_000_00, direction: 'in', articleId: 'sales' }),
      op({ amount: 2_000_00, status: 'actual', paidOn: '2026-10-02' }),
    ]), '2026-10-08')
    expect(text).toContain('<b>CFO · ТОО &lt;Ромашка&gt; &amp; Ко</b>')
    expect(text).toContain('💰 На счетах: <b>98 000 ₸</b>')
    expect(text).toContain('📤 Сегодня к оплате: 1 платёж на <b>30 000 ₸</b>')
    expect(text).toContain('• ИП Арендодатель — 30 000 ₸')
    expect(text).toContain('📥 Сегодня ожидается: 5 000 ₸')
    expect(text).toContain('✅ Кассовых разрывов в ближайшие 90 дней нет')
    expect(text).not.toContain('Просрочено')
  })

  it('flags overdue payments and the first cash gap with days until it', () => {
    const text = buildDigest(ws([
      op({ amount: 1_000_00, paidOn: '2026-10-05' }),
      op({ amount: 1_000_00, paidOn: '2026-10-06' }),
      op({ amount: 150_000_00, paidOn: '2026-10-20' }),
    ]), '2026-10-08')
    expect(text).toContain('⚠️ Просрочено: 2 платежа на 2 000 ₸')
    expect(text).toContain('📤 Сегодня платежей нет')
    expect(text).toMatch(/🔴 Кассовый разрыв .* — через 12 дней: не хватит 52 000 ₸/)
  })

  it('includes recurrence occurrences and the 7-day outlook', () => {
    const rec: CfoRecurrence = { id: 'r', direction: 'out', amount: 10_000_00, accountId: 'acc', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, dayOfMonth: 10, startsOn: '2026-10-01', endsOn: null }
    const text = buildDigest(ws([], [rec]), '2026-10-08')
    expect(text).toContain('📆 Следующие 7 дней: выплаты 10 000 ₸, поступления 0 ₸')
  })
})

describe('almatyToday', () => {
  it('is UTC+5', () => {
    expect(almatyToday(new Date('2026-10-07T18:59:00Z'))).toBe('2026-10-07')
    expect(almatyToday(new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-08')
  })
})
