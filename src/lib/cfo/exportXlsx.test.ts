import { describe, expect, it } from 'vitest'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'
import { operationsSheet, reportSheets } from './exportXlsx'

describe('reportSheets', () => {
  it('builds fact, plan and deviation sheets in tenge with indented labels', () => {
    const s = reportSheets(['2026-01', '2026-02'], [
      { label: 'Выручка', level: 0, cells: { '2026-01': { fact: 100_00, plan: 150_00 }, '2026-02': { fact: 50_50, plan: null } }, total: { fact: 150_50, plan: 150_00 } },
      { label: 'Аренда', level: 1, cells: { '2026-01': { fact: 0, plan: 0 }, '2026-02': { fact: 0, plan: 0 } }, total: { fact: 0, plan: 0 } },
    ])
    expect(Object.keys(s)).toEqual(['Факт', 'План', 'Отклонение'])
    expect(s['Факт'][0]).toEqual(['Статья', 'янв 2026', 'фев 2026', 'Итого'])
    expect(s['Факт'][1]).toEqual(['Выручка', 100, 50.5, 150.5])
    expect(s['План'][1]).toEqual(['Выручка', 150, null, 150])
    expect(s['Отклонение'][1]).toEqual(['Выручка', -50, null, 0.5])
    expect(s['Факт'][2][0]).toBe('   Аренда')
  })
})

describe('operationsSheet', () => {
  it('writes one signed row per operation', () => {
    const accounts = [{ id: 'a', name: 'Kaspi' }, { id: 'b', name: 'Касса' }] as CfoAccount[]
    const articles = [{ id: 'r', name: 'Аренда' }] as CfoArticle[]
    const base = { id: '1', accruedOn: '2026-10-01', paidOn: '2026-10-02', counterparty: null, comment: null, recurrenceId: null, recurrenceDate: null, status: 'actual' } as const
    const rows = operationsSheet([
      { ...base, direction: 'out', amount: 300_000_00, accountId: 'a', toAccountId: null, articleId: 'r', counterparty: 'ИП Ахметов' },
      { ...base, direction: 'transfer', amount: 50_000_00, accountId: 'a', toAccountId: 'b', articleId: null, status: 'planned' },
    ] as CfoOperation[], accounts, articles)
    expect(rows[1]).toEqual(['2026-10-02', '2026-10-01', 'Расход', 'Аренда', 'Kaspi', '', 'ИП Ахметов', '', -300000, 'Факт'])
    expect(rows[2]).toEqual(['2026-10-02', '2026-10-01', 'Перевод', '', 'Kaspi', 'Касса', '', '', 50000, 'План'])
  })
})
