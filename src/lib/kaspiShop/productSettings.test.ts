import { describe, it, expect } from 'vitest'
import {
  validateProductPatch, validateProductCreate, validateBulkSettings, partitionBulkRows, toFiniteNumber, MIN_CHECK_FREQUENCY_MINUTES,
} from './productSettings'

// Серверная проверка денежных полей (аудит Kaspi 06.11.2026, K7/K16/K18).
const stored = { floor_price: 1000, max_price: 5000 }

describe('toFiniteNumber', () => {
  it('accepts numbers and plain numeric strings only', () => {
    expect(toFiniteNumber(12)).toBe(12)
    expect(toFiniteNumber('12.5')).toBe(12.5)
    expect(toFiniteNumber(' 700 ')).toBe(700)
    for (const bad of [NaN, Infinity, -Infinity, '', '  ', '12,5', '1 250', 'abc', null, undefined, true, [], {}]) {
      expect(toFiniteNumber(bad)).toBeNull()
    }
  })
})

describe('validateProductPatch', () => {
  it('rejects an empty patch', () => {
    expect(validateProductPatch({ id: 'x', foo: 1 }, stored)).toEqual({ ok: false, error: 'no updatable fields provided' })
  })

  it.each([0, -5, NaN, null, '', 'abc', '12,5', true, 0.3])('floor_price %p is rejected (was saved as-is: 0, null, NaN)', bad => {
    const r = validateProductPatch({ floor_price: bad }, stored)
    expect(r.ok).toBe(false)
  })

  it('floor_price is normalized to an integer number', () => {
    const r = validateProductPatch({ floor_price: '1500' }, { floor_price: 100, max_price: null })
    expect(r).toEqual({ ok: true, patch: { floor_price: 1500 } })
  })

  it.each([-100, NaN, null, 'x'])('undercut_step %p is rejected', bad => {
    expect(validateProductPatch({ undercut_step: bad }, stored).ok).toBe(false)
  })

  it('undercut_step 0 is allowed (match the competitor), fractional rounds', () => {
    expect(validateProductPatch({ undercut_step: 0 }, stored)).toEqual({ ok: true, patch: { undercut_step: 0 } })
    expect(validateProductPatch({ undercut_step: 49.6 }, stored)).toEqual({ ok: true, patch: { undercut_step: 50 } })
  })

  it.each([0, 4, 7.5, -15, NaN, null, 'abc'])('check_frequency_minutes %p is rejected', bad => {
    expect(validateProductPatch({ check_frequency_minutes: bad }, stored).ok).toBe(false)
  })

  it('check_frequency_minutes at the form minimum and above is accepted', () => {
    expect(MIN_CHECK_FREQUENCY_MINUTES).toBe(5)
    expect(validateProductPatch({ check_frequency_minutes: 5 }, stored).ok).toBe(true)
    expect(validateProductPatch({ check_frequency_minutes: '60' }, stored)).toEqual({ ok: true, patch: { check_frequency_minutes: 60 } })
  })

  it('demping_strategy must be one of the four known strategies (an unknown one behaved as be_second)', () => {
    expect(validateProductPatch({ demping_strategy: 'wild' }, stored).ok).toBe(false)
    expect(validateProductPatch({ demping_strategy: null }, stored).ok).toBe(false)
    for (const s of ['undercut_leader', 'match_leader', 'stay_above_leader', 'be_second']) {
      expect(validateProductPatch({ demping_strategy: s }, stored).ok).toBe(true)
    }
  })

  it('enabled must be a boolean', () => {
    expect(validateProductPatch({ enabled: 'yes' }, stored).ok).toBe(false)
    expect(validateProductPatch({ enabled: true }, stored).ok).toBe(true)
  })

  it('max_price alone is checked against the STORED floor', () => {
    const bad = validateProductPatch({ max_price: 900 }, stored)
    expect(bad).toEqual({ ok: false, error: 'max_price должен быть больше floor_price' })
    expect(validateProductPatch({ max_price: 1000 }, stored).ok).toBe(false)
    expect(validateProductPatch({ max_price: 1001 }, stored)).toEqual({ ok: true, patch: { max_price: 1001 } })
  })

  it('floor_price alone is checked against the STORED max', () => {
    expect(validateProductPatch({ floor_price: 5000 }, stored)).toEqual({ ok: false, error: 'max_price должен быть больше floor_price' })
    expect(validateProductPatch({ floor_price: 4999 }, stored)).toEqual({ ok: true, patch: { floor_price: 4999 } })
    // no stored max: any floor is fine
    expect(validateProductPatch({ floor_price: 9_000_000 }, { floor_price: 1000, max_price: null }).ok).toBe(true)
  })

  it('both together are checked against each other, the stored values are ignored', () => {
    expect(validateProductPatch({ floor_price: 100, max_price: 200 }, { floor_price: 9999, max_price: 10000 }).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 300, max_price: 200 }, stored).ok).toBe(false)
  })

  it('max_price null or empty clears the ceiling', () => {
    expect(validateProductPatch({ max_price: null }, stored)).toEqual({ ok: true, patch: { max_price: null } })
    expect(validateProductPatch({ max_price: '' }, stored)).toEqual({ ok: true, patch: { max_price: null } })
  })

  it('max_price garbage (NaN string, negative, zero) is rejected', () => {
    for (const bad of ['abc', -1, 0, true]) expect(validateProductPatch({ max_price: bad }, stored).ok).toBe(false)
  })

  it('turning the bot on needs a real floor', () => {
    expect(validateProductPatch({ enabled: true }, { floor_price: 0, max_price: null }).ok).toBe(false)
    expect(validateProductPatch({ enabled: true }, { floor_price: null, max_price: null }).ok).toBe(false)
    expect(validateProductPatch({ enabled: true }, stored).ok).toBe(true)
    expect(validateProductPatch({ enabled: true, floor_price: 700 }, { floor_price: 0, max_price: null }).ok).toBe(true)
    // turning off never needs a floor
    expect(validateProductPatch({ enabled: false }, { floor_price: 0, max_price: null }).ok).toBe(true)
  })

  it('city/merchant exclusion lists must be string arrays', () => {
    expect(validateProductPatch({ excluded_city_codes: ['750000000'] }, stored).ok).toBe(true)
    expect(validateProductPatch({ excluded_city_codes: 'x' }, stored).ok).toBe(false)
    expect(validateProductPatch({ excluded_merchant_ids: [1, 2] }, stored).ok).toBe(false)
  })

  it('stock_count must be a non-negative number', () => {
    expect(validateProductPatch({ stock_count: -1 }, stored).ok).toBe(false)
    expect(validateProductPatch({ stock_count: NaN }, stored).ok).toBe(false)
    expect(validateProductPatch({ stock_count: 12 }, stored)).toEqual({ ok: true, patch: { stock_count: 12 } })
  })

  it('unknown keys never reach the update', () => {
    const r = validateProductPatch({ floor_price: 700, user_id: 'attacker', own_current_price: 1 }, { floor_price: 100, max_price: null })
    expect(r).toEqual({ ok: true, patch: { floor_price: 700 } })
  })
})

describe('validateProductCreate', () => {
  const ok = { ownCurrentPrice: 1500, floorPrice: 1000, undercutStep: 100 }
  it('accepts a sane body and defaults frequency 60 (hourly) and stock 0', () => {
    expect(validateProductCreate(ok)).toEqual({
      ok: true, value: { ownCurrentPrice: 1500, floorPrice: 1000, undercutStep: 100, checkFrequencyMinutes: 60, stockCount: 0 },
    })
  })
  it.each([
    [{ ...ok, ownCurrentPrice: 0 }],
    [{ ...ok, ownCurrentPrice: 'abc' }],
    [{ ...ok, floorPrice: 0 }],
    [{ ...ok, floorPrice: 'x' }],
    [{ ...ok, undercutStep: -1 }],
    [{ ...ok, undercutStep: 'x' }],
    [{ ...ok, checkFrequencyMinutes: 1 }],
    [{ ...ok, checkFrequencyMinutes: 12.5 }],
    [{ ...ok, stockCount: -3 }],
  ])('rejects %j', body => {
    expect(validateProductCreate(body as any).ok).toBe(false)
  })
})

describe('validateBulkSettings', () => {
  const ok = { floorPrice: 1000, maxPrice: 3000, undercutStep: 100, dempingStrategy: 'be_second', checkFrequencyMinutes: 20 }
  it('accepts a full config', () => {
    expect(validateBulkSettings(ok)).toEqual({
      ok: true, value: { floorPrice: 1000, maxPrice: 3000, undercutStep: 100, dempingStrategy: 'be_second', checkFrequencyMinutes: 20 },
    })
  })
  it('defaults: no max, undercut_leader, 60 minutes (hourly)', () => {
    expect(validateBulkSettings({ floorPrice: 700, undercutStep: 0 })).toEqual({
      ok: true, value: { floorPrice: 700, maxPrice: null, undercutStep: 0, dempingStrategy: 'undercut_leader', checkFrequencyMinutes: 60 },
    })
  })
  it('rejects an unknown strategy instead of silently replacing it', () => {
    expect(validateBulkSettings({ ...ok, dempingStrategy: 'nope' }).ok).toBe(false)
  })
  it.each([
    [{ ...ok, floorPrice: 0 }],
    [{ ...ok, floorPrice: '' }],
    [{ ...ok, maxPrice: 1000 }],
    [{ ...ok, maxPrice: 500 }],
    [{ ...ok, undercutStep: -1 }],
    [{ ...ok, checkFrequencyMinutes: 0 }],
    [{ ...ok, checkFrequencyMinutes: 3 }],
    [{ ...ok, checkFrequencyMinutes: 10.5 }],
  ])('rejects %j', body => {
    expect(validateBulkSettings(body as any).ok).toBe(false)
  })
})

describe('partitionBulkRows (K18: one floor for products of different prices)', () => {
  const rows = [
    { id: 'cheap', product_name: 'Дешёвый', own_current_price: 800 },
    { id: 'mid', product_name: 'Средний', own_current_price: 5000 },
    { id: 'dear', product_name: 'Дорогой', own_current_price: 30000 },
    { id: 'none', product_name: 'Без цены', own_current_price: null },
  ]

  it('skips rows whose price is below the floor, keeps the rest', () => {
    const { eligible, skipped } = partitionBulkRows(rows, 5000, null)
    expect(eligible.map(r => r.id)).toEqual(['mid', 'dear'])
    expect(skipped).toEqual([
      { id: 'cheap', name: 'Дешёвый', ownPrice: 800, reason: 'floor_above_price' },
      { id: 'none', name: 'Без цены', ownPrice: null, reason: 'no_price' },
    ])
  })

  it('a floor equal to the current price is fine', () => {
    expect(partitionBulkRows([rows[1]], 5000, null).eligible).toHaveLength(1)
  })

  it('skips rows whose price is above the max', () => {
    const { eligible, skipped } = partitionBulkRows(rows, 100, 6000)
    expect(eligible.map(r => r.id)).toEqual(['cheap', 'mid'])
    expect(skipped.find(s => s.id === 'dear')).toEqual({ id: 'dear', name: 'Дорогой', ownPrice: 30000, reason: 'max_below_price' })
  })

  it('a max equal to the current price is fine', () => {
    expect(partitionBulkRows([rows[1]], 100, 5000).eligible).toHaveLength(1)
  })

  it('returns everything when nothing conflicts', () => {
    const { eligible, skipped } = partitionBulkRows(rows.slice(0, 3), 500, 40000)
    expect(eligible).toHaveLength(3)
    expect(skipped).toEqual([])
  })
})

// Engine2: пол сильно выше цены (или максимум сильно ниже) -- вероятная опечатка.
describe('validateProductPatch: floor far from the current price', () => {
  const withOwn = { floor_price: 1000, max_price: 5000, own_current_price: 2000 }

  it('floor more than 3x the price is refused with a stable code and the numbers', () => {
    const r = validateProductPatch({ floor_price: 6001, max_price: null }, withOwn)
    expect(r).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'floor_price', floorPrice: 6001, ownPrice: 2000, factor: 3 } })
  })

  it('floor above the price (even within 3x) asks for confirmation: the bot would raise the price', () => {
    const r = validateProductPatch({ floor_price: 6000, max_price: null }, withOwn)
    expect(r).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'floor_price', direction: 'above', floorPrice: 6000, ownPrice: 2000 } })
    expect(validateProductPatch({ floor_price: 2100, max_price: null }, withOwn)).toMatchObject({ ok: false, details: { direction: 'above' } })
  })

  it('floor below half of the price asks for confirmation: a lost zero (7000 instead of 70000)', () => {
    const own = { floor_price: 78990, max_price: null, own_current_price: 78990 }
    expect(validateProductPatch({ floor_price: 7000 }, own)).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'floor_price', direction: 'below', floorPrice: 7000, ownPrice: 78990 } })
    expect(validateProductPatch({ floor_price: 39000 }, own)).toMatchObject({ ok: false, details: { direction: 'below' } })
  })

  it('a floor between half the price and the price needs no confirmation; neither does an unchanged floor', () => {
    const own = { floor_price: 78990, max_price: null, own_current_price: 78990 }
    expect(validateProductPatch({ floor_price: 70000 }, own).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 39495 }, own).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 78990, undercut_step: 10 }, own).ok).toBe(true)
  })

  it('confirmFloor: true lets a low floor through too', () => {
    const own = { floor_price: 78990, max_price: null, own_current_price: 78990 }
    expect(validateProductPatch({ floor_price: 7000, confirmFloor: true }, own).ok).toBe(true)
  })

  it('floor 50000 for a 5000 item is refused (the typo case)', () => {
    const r = validateProductPatch({ floor_price: '50000', max_price: null }, { floor_price: 1000, max_price: null, own_current_price: 5000 })
    expect(r).toMatchObject({ ok: false, code: 'floor_far_above_price' })
  })

  it('confirmFloor: true lets it through and is not written into the patch', () => {
    const r = validateProductPatch({ floor_price: 50000, max_price: null, confirmFloor: true }, { floor_price: 1000, max_price: null, own_current_price: 5000 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.patch.floor_price).toBe(50000)
      expect('confirmFloor' in r.patch).toBe(false)
    }
  })

  it.each(['true', 1, 'yes', null])('confirmFloor %p is not a confirmation', v => {
    expect(validateProductPatch({ floor_price: 50000, max_price: null, confirmFloor: v }, { floor_price: 1000, max_price: null, own_current_price: 5000 })).toMatchObject({ ok: false, code: 'floor_far_above_price' })
  })

  it('max more than 3x below the price is refused; the details name the field', () => {
    const r = validateProductPatch({ max_price: 1500 }, { floor_price: 100, max_price: null, own_current_price: 5000 })
    expect(r).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'max_price', maxPrice: 1500, ownPrice: 5000 } })
  })

  it('max exactly price/3 is allowed', () => {
    expect(validateProductPatch({ max_price: 2000 }, { floor_price: 100, max_price: null, own_current_price: 6000 }).ok).toBe(true)
  })

  it('a patch that touches neither floor nor max is not blocked by an old crazy floor', () => {
    expect(validateProductPatch({ undercut_step: 50 }, { floor_price: 90000, max_price: null, own_current_price: 1000 }).ok).toBe(true)
  })

  it('the form sends every field each time: an unchanged old crazy floor does not block editing the step', () => {
    const stored = { floor_price: 90000, max_price: null, own_current_price: 1000 }
    const r = validateProductPatch({ floor_price: 90000, max_price: null, undercut_step: 50, check_frequency_minutes: 20 }, stored)
    expect(r.ok).toBe(true)
    // То же значение строкой и с дробной частью: после округления это тот же пол.
    expect(validateProductPatch({ floor_price: '90000', undercut_step: 50 }, stored).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 90000.4, undercut_step: 50 }, stored).ok).toBe(true)
  })

  it('an unchanged old crazy max does not block either, a changed one still does', () => {
    const stored = { floor_price: 100, max_price: 1500, own_current_price: 5000 }
    expect(validateProductPatch({ floor_price: 100, max_price: 1500, undercut_step: 10 }, stored).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 100, max_price: 1400, undercut_step: 10 }, stored)).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'max_price' } })
  })

  it('a changed floor is still checked even when the other fields are unchanged', () => {
    const stored = { floor_price: 1000, max_price: null, own_current_price: 5000 }
    expect(validateProductPatch({ floor_price: 50000, max_price: null, undercut_step: 10 }, stored)).toMatchObject({ ok: false, code: 'floor_far_above_price', details: { field: 'floor_price' } })
    expect(validateProductPatch({ floor_price: 50000, max_price: null, undercut_step: 10, confirmFloor: true }, stored).ok).toBe(true)
  })

  it('an unknown current price skips the check (nothing to compare with)', () => {
    expect(validateProductPatch({ floor_price: 99999 }, { floor_price: 1000, max_price: null }).ok).toBe(true)
    expect(validateProductPatch({ floor_price: 99999 }, { floor_price: 1000, max_price: null, own_current_price: 0 }).ok).toBe(true)
  })

  it('an ordinary floor change is untouched', () => {
    const r = validateProductPatch({ floor_price: 1500 }, withOwn)
    expect(r.ok).toBe(true)
  })
})
