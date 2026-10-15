import { describe, expect, it } from 'vitest'
import { FIRST_TOUCH_TTL_MS } from '@/lib/toolEvents/schema'
import { nextFirstTouch, parseFreshFirstTouch } from './toolEvents'

const NOW = Date.parse('2026-10-15T07:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const stored = (v: object) => JSON.stringify(v)

describe('parseFreshFirstTouch', () => {
  it('returns a first touch younger than 30 days', () => {
    const ft = parseFreshFirstTouch(stored({ tool: 'kp', at: NOW - 29 * DAY, utm_source: 'ig' }), NOW)
    expect(ft).toEqual({ tool: 'kp', at: NOW - 29 * DAY, utm_source: 'ig', utm_medium: undefined, utm_campaign: undefined })
  })
  it('treats exactly 30 days and older as expired', () => {
    expect(parseFreshFirstTouch(stored({ tool: 'kp', at: NOW - FIRST_TOUCH_TTL_MS }), NOW)).toBeNull()
    expect(parseFreshFirstTouch(stored({ tool: 'kp', at: NOW - 31 * DAY }), NOW)).toBeNull()
  })
  it('rejects garbage, unknown tools and timestamps far in the future', () => {
    expect(parseFreshFirstTouch(null, NOW)).toBeNull()
    expect(parseFreshFirstTouch('{oops', NOW)).toBeNull()
    expect(parseFreshFirstTouch(stored({ tool: 'invoices', at: NOW }), NOW)).toBeNull()
    expect(parseFreshFirstTouch(stored({ tool: 'kp', at: String(NOW) }), NOW)).toBeNull()
    expect(parseFreshFirstTouch(stored({ tool: 'kp', at: NOW + 2 * DAY }), NOW)).toBeNull()
  })
})

describe('nextFirstTouch', () => {
  it('sets the first touch when none is stored, with utm', () => {
    expect(nextFirstTouch(null, 'margin', { source: 'ig', campaign: 'oct' }, NOW))
      .toEqual({ tool: 'margin', at: NOW, utm_source: 'ig', utm_campaign: 'oct' })
  })
  it('keeps a fresh first touch (does not overwrite with a later tool)', () => {
    expect(nextFirstTouch(stored({ tool: 'kp', at: NOW - DAY }), 'schet', {}, NOW)).toBeNull()
  })
  it('replaces an expired first touch', () => {
    expect(nextFirstTouch(stored({ tool: 'kp', at: NOW - 40 * DAY }), 'schet', {}, NOW)).toEqual({ tool: 'schet', at: NOW })
  })
})
