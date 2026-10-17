import { describe, expect, it } from 'vitest'
import { FIRST_TOUCH_TTL_MS } from '@/lib/toolEvents/schema'
import { nextFirstTouch, parseFreshFirstTouch, pickUtm } from './toolEvents'

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

describe('pickUtm', () => {
  it('reads utm from the address and asks to persist it', () => {
    expect(pickUtm('?utm_source=tg_chat&utm_medium=chat_post&utm_campaign=waybills_oct', null))
      .toEqual({ utm: { source: 'tg_chat', medium: 'chat_post', campaign: 'waybills_oct' }, persist: true })
  })
  it('falls back to the session value when the address has no utm', () => {
    const stored = JSON.stringify({ source: 'ig', campaign: 'margin_oct' })
    expect(pickUtm('', stored)).toEqual({ utm: { source: 'ig', campaign: 'margin_oct' }, persist: false })
    expect(pickUtm('?lang=kk', stored).utm.source).toBe('ig')
  })
  it('lets a new address utm override the stored one', () => {
    const r = pickUtm('?utm_source=dm', JSON.stringify({ source: 'ig' }))
    expect(r).toEqual({ utm: { source: 'dm' }, persist: true })
  })
  it('survives garbage and trims long values', () => {
    expect(pickUtm('', '{oops')).toEqual({ utm: {}, persist: false })
    expect(pickUtm('', '[1]')).toEqual({ utm: {}, persist: false })
    expect(pickUtm(`?utm_source=${'a'.repeat(300)}`, null).utm.source).toHaveLength(100)
  })
})
