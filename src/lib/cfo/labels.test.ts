import { describe, it, expect } from 'vitest'
import { shortMonth, monthTitle, dayLabel, accountName, opTitle } from './labels'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 100000, openingDate: '2026-01-01', archived: false, sort: 1 }
const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 2 }
const rent: CfoArticle = { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 1 }
const rev: CfoArticle = { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 2 }

describe('labels', () => {
  it('shortMonth returns abbreviated month name', () => {
    expect(shortMonth('2026-01')).toBe('янв')
    expect(shortMonth('2026-12')).toBe('дек')
  })

  it('monthTitle returns full month name with year', () => {
    expect(monthTitle('2026-10')).toBe('Октябрь 2026')
  })

  it('dayLabel returns formatted date with weekday', () => {
    const label = dayLabel('2026-10-07')
    expect(label).toContain('7')
    expect(label).toContain('октября')
  })

  it('accountName returns account name or em-dash for null', () => {
    expect(accountName('kaspi', [kaspi, cash])).toBe('Kaspi')
    expect(accountName('cash', [kaspi, cash])).toBe('Касса')
    expect(accountName(null, [kaspi, cash])).toBe('—')
  })

  it('opTitle for transfer returns formatted transfer description', () => {
    const transfer: Pick<CfoOperation, 'direction' | 'accountId' | 'toAccountId' | 'articleId'> = {
      direction: 'transfer',
      accountId: 'kaspi',
      toAccountId: 'cash',
      articleId: null,
    }
    expect(opTitle(transfer, [kaspi, cash], [rent, rev])).toBe('Перевод: Kaspi → Касса')
  })

  it('opTitle for article operation returns article name', () => {
    const articleOp: Pick<CfoOperation, 'direction' | 'accountId' | 'toAccountId' | 'articleId'> = {
      direction: 'out',
      accountId: 'kaspi',
      toAccountId: null,
      articleId: 'rent',
    }
    expect(opTitle(articleOp, [kaspi, cash], [rent, rev])).toBe('Аренда')
  })

  it('opTitle for unknown article returns Без статьи', () => {
    const unknownOp: Pick<CfoOperation, 'direction' | 'accountId' | 'toAccountId' | 'articleId'> = {
      direction: 'out',
      accountId: 'kaspi',
      toAccountId: null,
      articleId: 'unknown',
    }
    expect(opTitle(unknownOp, [kaspi, cash], [rent, rev])).toBe('Без статьи')
  })
})
