import { describe, expect, it } from 'vitest'
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'
import { operationsSheet, reportSheets, type ExportRow } from './exportXlsx'
import { buildPnl } from './pnl'
import { cellValue, totalValue, type Measure } from './reportView'
import { yearMonths } from './dates'

describe('reportSheets', () => {
  it('builds fact, plan and deviation sheets in tenge with indented labels', () => {
    const s = reportSheets(['2026-01', '2026-02'], [
      { label: 'Выручка', level: 0, cells: { '2026-01': { fact: 100_00, plan: 150_00 }, '2026-02': { fact: 50_50, plan: null } }, total: { fact: 150_50, plan: 150_00 } },
      { label: 'Аренда', level: 1, cells: { '2026-01': { fact: 0, plan: 0 }, '2026-02': { fact: 0, plan: 0 } }, total: { fact: 0, plan: 0 } },
    ], '2026-02')
    expect(Object.keys(s)).toEqual(['Факт', 'План', 'Отклонение'])
    expect(s['Факт'][0]).toEqual(['Статья', 'янв 2026', 'фев 2026', 'Итого'])
    expect(s['Факт'][1]).toEqual(['Выручка', 100, 50.5, 150.5])
    expect(s['План'][1]).toEqual(['Выручка', 150, null, 150])
    expect(s['Отклонение'][1]).toEqual(['Выручка', -50, null, 0.5])
    expect(s['Факт'][2][0]).toBe('   Аренда')
  })

  it('future months are blank in Факт and Отклонение, Итого by deviation covers elapsed months only (P1-3)', () => {
    const months = ['2026-09', '2026-10', '2026-11', '2026-12']
    const cells = Object.fromEntries(months.map((m) => [m, { fact: m <= '2026-10' ? 1_000_000_00 : 0, plan: 5_000_000_00 }]))
    const s = reportSheets(months, [{ label: 'Выручка', level: 0, cells, total: { fact: 2_000_000_00, plan: 20_000_000_00 } }], '2026-10')
    expect(s['Факт'][1]).toEqual(['Выручка', 1_000_000, 1_000_000, null, null, 2_000_000])
    expect(s['План'][1]).toEqual(['Выручка', 5_000_000, 5_000_000, 5_000_000, 5_000_000, 20_000_000])
    expect(s['Отклонение'][0][5]).toBe('Итого с начала года')
    expect(s['Отклонение'][1]).toEqual(['Выручка', -4_000_000, -4_000_000, null, null, -8_000_000])
  })

  it('every exported cell equals what ReportTable shows, for a real P&L model in both modes', () => {
    const t = (x: number) => x * 100
    const articles: CfoArticle[] = [
      { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 },
      { id: 'cogs', name: 'Закупка', kind: 'expense', activity: 'operating', pnlGroup: 'cogs', archived: false, sort: 2 },
      { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 3 },
    ]
    const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: Math.random().toString(36), direction: 'out', amount: 0, accountId: 'k', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-10-05', accruedOn: '2026-10-05', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })
    const operations = [
      op({ direction: 'in', articleId: 'rev', amount: t(1_000_000) }),
      op({ articleId: 'cogs', amount: t(250_000) }),
      op({ articleId: 'rent', amount: t(300_000) }),
      op({ direction: 'in', articleId: 'rev', amount: t(400_000), paidOn: '2026-09-10', accruedOn: '2026-09-10' }),
    ]
    const months = yearMonths(2026)
    const plan: CfoPlanItem[] = months.map((m) => ({ articleId: 'rent', month: m, amount: t(83_333.33) }))
    const current = '2026-10'
    for (const mode of ['business', 'family'] as const) {
      const rows: ExportRow[] = buildPnl({ articles, operations, plan, months, mode }).map((r) => ({ label: r.label, level: r.type === 'article' ? 1 : 0, cells: r.cells, total: r.total }))
      const sheets = reportSheets(months, rows, current)
      const sheetOf: Record<Measure, string> = { fact: 'Факт', plan: 'План', diff: 'Отклонение' }
      rows.forEach((r, i) => {
        for (const measure of ['fact', 'plan', 'diff'] as const) {
          const line = sheets[sheetOf[measure]][i + 1]
          months.forEach((m, j) => {
            const screen = cellValue(r, m, measure, current)
            expect(line[j + 1]).toBe(screen === null ? null : screen / 100)
          })
          const total = totalValue(r, months, current, measure)
          expect(line[months.length + 1]).toBe(total === null ? null : total / 100)
        }
      })
      // Семья: итог «Сбережено» по отклонению — только за прошедшие месяцы, не минус план ноября и декабря.
      if (mode === 'family') {
        const net = rows.findIndex((r) => r.label === 'Сбережено')
        expect(sheets['Отклонение'][net + 1][months.length + 1]).toBeCloseTo((t(1_400_000) - t(550_000) + 10 * t(83_333.33)) / 100, 2)
      }
    }
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
    expect(rows[0][6]).toBe('Контрагент')
    expect(rows[1]).toEqual(['2026-10-02', '2026-10-01', 'Расход', 'Аренда', 'Kaspi', '', 'ИП Ахметов', '', -300000, 'Факт'])
    expect(rows[2]).toEqual(['2026-10-02', '2026-10-01', 'Перевод', '', 'Kaspi', 'Касса', '', '', 50000, 'План'])
  })
  it('family mode renames the counterparty column', () => {
    expect(operationsSheet([], [], [], 'family')[0][6]).toBe('Кому или от кого')
  })
})
