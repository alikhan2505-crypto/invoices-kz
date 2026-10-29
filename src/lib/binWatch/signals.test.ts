import { describe, it, expect } from 'vitest'
import type { BinLookupResult } from '@/lib/binLookup'
import {
  EMPTY_SIGNALS, compareSignals, extractResult, mergeBaseline, parseSignals, stillActive, summarize,
  type WatchSignals,
} from './signals'
import { planRowUpdate } from './check'

const clean: WatchSignals = {
  unreliable: false, bankrupt: false, liquidating: false, registryClosed: false,
  taxDebt: false, enforcement: false, rehabilitation: false, vat: true,
}
const sig = (over: Partial<WatchSignals>): WatchSignals => ({ ...clean, ...over })

const company = (over: Partial<BinLookupResult> = {}): BinLookupResult => ({
  bin: '123456789012', name: 'ТОО Тест', address: null, director: null, activity: null,
  status: 'Зарегистрирован', registeredAt: null, source: 'egov',
  isVatPayer: true, vatRegisteredAt: null, isUnreliable: false, isLiquidating: false,
  totalArrear: 0, taxArrear: 0,
  unreliableCategories: [],
  enforcement: { found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null },
  rehabilitation: { state: 'not_listed' },
  ...over,
})

describe('compareSignals: что считается ухудшением', () => {
  it('первая проверка (базы нет): ухудшения нет по определению', () => {
    expect(compareSignals(null, sig({ unreliable: true, taxDebt: true })).worsened).toEqual([])
  })

  it('«не было» -> «есть» - ухудшение', () => {
    const r = compareSignals(clean, sig({ taxDebt: true, enforcement: true }))
    expect(r.worsened).toEqual(['taxDebt', 'enforcement'])
  })

  it('«ни разу не проверялся» -> «есть»: первый отсчёт признака, письма нет (неполный первый снимок)', () => {
    const r = compareSignals(sig({ enforcement: null }), sig({ enforcement: true }))
    expect(r.worsened).toEqual([])
    expect(r.improved).toEqual([])
  })

  it('неполный первый снимок: давний признак при первом чтении не даёт письма, настоящее ухудшение потом - даёт', () => {
    // День 0: добавили БИН, Минюст ответил 403 (enforcement = null), долг неизвестен.
    const first = extractResult(company({ enforcement: null, totalArrear: null }))
    let base = mergeBaseline(null, first.signals)
    expect(base.enforcement).toBeNull()
    expect(base.taxDebt).toBeNull()
    // День 1: Минюст ответил, производство давнее. Долг тоже впервые прочитан: есть.
    const day1 = extractResult(company({
      enforcement: { found: true, count: 2, activeCount: 1, totalAmount: 10, earliestStart: '2024-01-01' },
      totalArrear: 500,
    }))
    expect(compareSignals(base, day1.signals).worsened).toEqual([])
    base = mergeBaseline(base, day1.signals)
    expect(base.enforcement).toBe(true)
    expect(base.taxDebt).toBe(true)
    // День 2: то же самое - не новость.
    expect(compareSignals(base, day1.signals).worsened).toEqual([])
    // Признак, который уже наблюдался как «нет», по-прежнему даёт письмо при появлении.
    expect(base.liquidating).toBe(false)
    expect(compareSignals(base, sig({ liquidating: true, enforcement: true, taxDebt: true })).worsened).toEqual(['liquidating'])
  })

  it('«есть» -> «есть» - не новое, письма нет', () => {
    expect(compareSignals(sig({ unreliable: true }), sig({ unreliable: true })).worsened).toEqual([])
  })

  it('в этот раз просто не проверилось (null) - ни ухудшение, ни улучшение', () => {
    const r = compareSignals(sig({ taxDebt: false, unreliable: true }), sig({ taxDebt: null, unreliable: null }))
    expect(r.worsened).toEqual([])
    expect(r.improved).toEqual([])
    expect(r.unchecked).toEqual(['unreliable', 'taxDebt'])
  })

  it('улучшение учитывается, но не ухудшение', () => {
    const r = compareSignals(sig({ taxDebt: true }), sig({ taxDebt: false }))
    expect(r.worsened).toEqual([])
    expect(r.improved).toEqual(['taxDebt'])
  })

  it('НДС: плательщик -> не плательщик = снят (ухудшение); null с любой стороны - нет', () => {
    expect(compareSignals(sig({ vat: true }), sig({ vat: false })).worsened).toEqual(['vatLost'])
    expect(compareSignals(sig({ vat: true }), sig({ vat: null })).worsened).toEqual([])
    expect(compareSignals(sig({ vat: null }), sig({ vat: false })).worsened).toEqual([])
    expect(compareSignals(sig({ vat: false }), sig({ vat: false })).worsened).toEqual([])
    expect(compareSignals(sig({ vat: false }), sig({ vat: true })).improved).toEqual(['vatLost'])
  })
})

describe('mergeBaseline: сбой реестра не затирает известное', () => {
  it('null в новой проверке оставляет прежнее значение', () => {
    const merged = mergeBaseline(sig({ taxDebt: true, enforcement: false }), sig({ taxDebt: null, enforcement: true }))
    expect(merged.taxDebt).toBe(true)
    expect(merged.enforcement).toBe(true)
  })

  it('после true -> null -> true письма второй раз нет', () => {
    let base: WatchSignals | null = clean
    expect(compareSignals(base, sig({ taxDebt: true })).worsened).toEqual(['taxDebt'])
    base = mergeBaseline(base, sig({ taxDebt: true }))
    base = mergeBaseline(base, sig({ taxDebt: null }))
    expect(compareSignals(base, sig({ taxDebt: true })).worsened).toEqual([])
  })

  it('без базы и без значения остаётся null, а не false', () => {
    expect(mergeBaseline(null, EMPTY_SIGNALS).taxDebt).toBeNull()
  })
})

describe('extractResult: никакого «чисто» из null', () => {
  it('чистая компания: все признаки false', () => {
    const { signals } = extractResult(company())
    expect(signals).toEqual(clean)
  })

  it('не проверено (null / undefined) остаётся null', () => {
    const { signals } = extractResult(company({
      isUnreliable: null, isLiquidating: null, totalArrear: null, isVatPayer: null,
      unreliableCategories: null, enforcement: null, rehabilitation: undefined, status: null,
    }))
    expect(signals).toEqual(EMPTY_SIGNALS)
  })

  it('неблагонадёжный с категорией «банкрот»', () => {
    const { signals, details } = extractResult(company({ isUnreliable: true, unreliableCategories: ['bankrupt'] }))
    expect(signals.unreliable).toBe(true)
    expect(signals.bankrupt).toBe(true)
    expect(details.unreliableCategories).toEqual(['bankrupt'])
  })

  it('в списке, но причина не распознана - банкротство неизвестно, а не «нет»', () => {
    expect(extractResult(company({ isUnreliable: true, unreliableCategories: [] })).signals.bankrupt).toBeNull()
  })

  it('долг, производства, реабилитация и закрытый статус', () => {
    const { signals, details } = extractResult(company({
      totalArrear: 150_000,
      enforcement: { found: true, count: 3, activeCount: 2, totalAmount: 1000, earliestStart: '2026-01-01' },
      rehabilitation: { state: 'listed', since: '2026-02-03' },
      status: 'Ликвидирован',
    }))
    expect(signals.taxDebt).toBe(true)
    expect(signals.enforcement).toBe(true)
    expect(signals.rehabilitation).toBe(true)
    expect(signals.registryClosed).toBe(true)
    expect(details).toMatchObject({ totalArrear: 150_000, enforcementCount: 3, enforcementActive: 2, rehabSince: '2026-02-03' })
  })

  it('реабилитация «прекращена» - не плохой признак', () => {
    expect(extractResult(company({ rehabilitation: { state: 'terminated', since: null } })).signals.rehabilitation).toBe(false)
  })

  it('в деталях нет имён должников и категорий взыскания', () => {
    const { details } = extractResult(company({
      enforcement: { found: true, count: 1, activeCount: 1, totalAmount: 5, earliestStart: null },
    }))
    expect(Object.keys(details).sort()).toEqual(
      ['enforcementActive', 'enforcementCount', 'rehabSince', 'status', 'totalArrear', 'unreliableCategories'])
  })
})

describe('parseSignals / stillActive / summarize', () => {
  it('parseSignals отбрасывает мусор', () => {
    expect(parseSignals(null)).toBeNull()
    expect(parseSignals([])).toBeNull()
    expect(parseSignals({ taxDebt: 'yes', vat: true })?.taxDebt).toBeNull()
  })

  it('stillActive убирает прошедшие проблемы и vatLost, если НДС вернулся', () => {
    expect(stillActive(['taxDebt', 'enforcement'], sig({ taxDebt: false, enforcement: true }))).toEqual(['enforcement'])
    expect(stillActive(['vatLost'], sig({ vat: true }))).toEqual([])
    expect(stillActive(['vatLost'], sig({ vat: false }))).toEqual(['vatLost'])
    expect(stillActive(['taxDebt'], null)).toEqual([])
  })

  it('summarize: чисто только когда проверено всё', () => {
    const details = extractResult(company()).details
    expect(summarize({ signals: clean, details })?.clean).toBe(true)
    expect(summarize({ signals: sig({ taxDebt: null }), details })?.clean).toBe(false)
    expect(summarize({ signals: sig({ taxDebt: true }), details })?.bad).toEqual(['taxDebt'])
    expect(summarize(null)).toBeNull()
  })
})

describe('planRowUpdate', () => {
  const now = '2026-10-30T02:30:00.000Z'
  const ok = (over: Partial<BinLookupResult> = {}) => ({ status: 'ok' as const, result: extractResult(company(over)), name: 'ТОО Тест' })

  it('первый снимок: база сохраняется, ожидающих писем нет', () => {
    const { patch, worsened } = planRowUpdate({ baseline: null, pending_changes: [] }, ok({ totalArrear: 10 }), now)
    expect(worsened).toEqual([])
    expect(patch.pending_changes).toEqual([])
    expect(patch.baseline).toMatchObject({ taxDebt: true })
    expect(patch.last_checked_at).toBe(now)
  })

  it('ухудшение попадает в ожидающие', () => {
    const { patch } = planRowUpdate({ baseline: clean, pending_changes: [] }, ok({ totalArrear: 10 }), now)
    expect(patch.pending_changes).toEqual(['taxDebt'])
  })

  it('сбой реестра: пишется только попытка, база и результат не трогаются', () => {
    const { patch } = planRowUpdate({ baseline: clean, pending_changes: ['taxDebt'] }, { status: 'unavailable' }, now)
    expect(patch).toEqual({ last_attempt_at: now, last_status: 'unavailable' })
  })

  it('ожидающее предупреждение снимается, если проблема прошла до отправки', () => {
    const { patch } = planRowUpdate({ baseline: sig({ taxDebt: true }), pending_changes: ['taxDebt'] }, ok({ totalArrear: 0 }), now)
    expect(patch.pending_changes).toEqual([])
  })

  it('ожидающие накапливаются без дублей', () => {
    const { patch } = planRowUpdate({ baseline: sig({ taxDebt: true }), pending_changes: ['taxDebt'] }, ok({ totalArrear: 5, isUnreliable: true, unreliableCategories: ['inactive'] }), now)
    expect(patch.pending_changes).toEqual(['taxDebt', 'unreliable'])
  })
})
