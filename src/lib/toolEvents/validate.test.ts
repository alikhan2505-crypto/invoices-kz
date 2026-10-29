import { describe, expect, it } from 'vitest'
import { looksLikeBot, MAX_BODY_CHARS, parseToolEventBody, parseToolEventPayload } from './validate'
import { eventRateLimited } from './server'

const base = { event: 'view', tool: 'kp' }

describe('parseToolEventPayload', () => {
  it('accepts a minimal valid event and fills nulls', () => {
    expect(parseToolEventPayload(base)).toEqual({
      event: 'view', tool: 'kp', lang: null, visitor: null, medium: null,
      utm_source: null, utm_medium: null, utm_campaign: null,
      referrer_host: null, device: null, internal: false,
    })
  })

  it('keeps every valid optional field', () => {
    const row = parseToolEventPayload({
      event: 'cta', tool: 'margin', lang: 'kk', visitor: 'a1b2c3d4-e5f6', medium: 'product',
      utm: { source: 'instagram', medium: 'cpc', campaign: 'oct' },
      referrerHost: 'L.Instagram.com', device: 'mobile', internal: true,
    })
    expect(row).toMatchObject({
      event: 'cta', tool: 'margin', lang: 'kk', visitor: 'a1b2c3d4-e5f6', medium: 'product',
      utm_source: 'instagram', utm_medium: 'cpc', utm_campaign: 'oct',
      referrer_host: 'l.instagram.com', device: 'mobile', internal: true,
    })
  })

  it('rejects unknown events and tools', () => {
    expect(parseToolEventPayload({ event: 'click', tool: 'kp' })).toBeNull()
    expect(parseToolEventPayload({ event: 'view', tool: 'invoices' })).toBeNull()
    expect(parseToolEventPayload({ event: 'view' })).toBeNull()
    expect(parseToolEventPayload(null)).toBeNull()
    expect(parseToolEventPayload([base])).toBeNull()
    expect(parseToolEventPayload('view')).toBeNull()
  })

  it("allows tool 'none' only for signup", () => {
    expect(parseToolEventPayload({ event: 'signup', tool: 'none' })?.tool).toBe('none')
    expect(parseToolEventPayload({ event: 'view', tool: 'none' })).toBeNull()
  })

  it('drops invalid optional fields instead of the whole event', () => {
    const row = parseToolEventPayload({
      ...base, lang: 'de', medium: 'banner', device: 'tablet', internal: 'yes',
      referrerHost: 'evil.com/<script>', utm: 'x',
    })
    expect(row).toMatchObject({ lang: null, medium: null, device: null, internal: false, referrer_host: null, utm_source: null })
  })

  it('validates the visitor id: 8-64 chars of [a-zA-Z0-9-]', () => {
    expect(parseToolEventPayload({ ...base, visitor: 'short' })?.visitor).toBeNull()
    expect(parseToolEventPayload({ ...base, visitor: 'x'.repeat(65) })?.visitor).toBeNull()
    expect(parseToolEventPayload({ ...base, visitor: 'abc_defgh' })?.visitor).toBeNull()
    expect(parseToolEventPayload({ ...base, visitor: 'abcdefgh' })?.visitor).toBe('abcdefgh')
    expect(parseToolEventPayload({ ...base, visitor: 'A'.repeat(64) })?.visitor).toBe('A'.repeat(64))
  })

  it('truncates long utm values and strips control characters', () => {
    const row = parseToolEventPayload({ ...base, utm: { source: 'a'.repeat(300), medium: 'x\u0000y', campaign: '   ' } })
    expect(row?.utm_source).toHaveLength(100)
    expect(row?.utm_medium).toBe('xy')
    expect(row?.utm_campaign).toBeNull()
  })
})

describe('parseToolEventBody', () => {
  it('parses a JSON string (sendBeacon text/plain body)', () => {
    expect(parseToolEventBody(JSON.stringify(base))?.tool).toBe('kp')
  })
  it('returns null for garbage, empty and oversized bodies', () => {
    expect(parseToolEventBody('')).toBeNull()
    expect(parseToolEventBody('{not json')).toBeNull()
    expect(parseToolEventBody(JSON.stringify({ ...base, pad: 'x'.repeat(MAX_BODY_CHARS) }))).toBeNull()
  })
})

describe('looksLikeBot', () => {
  it('flags bots, crawlers and headless browsers', () => {
    expect(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(looksLikeBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36')).toBe(true)
    expect(looksLikeBot('Mozilla/5.0 YandexBot/3.0')).toBe(true)
    expect(looksLikeBot('Mozilla/5.0 Playwright/1.40')).toBe(true)
    expect(looksLikeBot('some spider')).toBe(true)
    expect(looksLikeBot('')).toBe(true)
    expect(looksLikeBot(null)).toBe(true)
  })
  it('lets ordinary browsers through', () => {
    expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(looksLikeBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')).toBe(false)
  })
})

describe('eventRateLimited', () => {
  it('allows 60 events per minute per IP, then limits; other IPs unaffected', () => {
    const now = 1_000_000
    for (let i = 0; i < 60; i++) expect(eventRateLimited('10.0.0.1', now + i)).toBe(false)
    expect(eventRateLimited('10.0.0.1', now + 61)).toBe(true)
    expect(eventRateLimited('10.0.0.2', now + 61)).toBe(false)
    // a minute later the window has moved on
    expect(eventRateLimited('10.0.0.1', now + 61 + 60_001 + 60)).toBe(false)
  })
})

describe('utm.content (токен диалога Instagram-агента)', () => {
  const base = { event: 'view', tool: 'kontragent' }
  it('валидный токен попадает в строку как utm_content', () => {
    const row = parseToolEventPayload({ ...base, utm: { source: 'dm', content: 'AbCdEf0123456789' } })
    expect(row?.utm_content).toBe('AbCdEf0123456789')
  })
  it('без токена ключа utm_content в строке НЕТ (до миграции колонки нет, лишний ключ ронял бы вставку)', () => {
    const row = parseToolEventPayload({ ...base, utm: { source: 'dm' } })
    expect(row).not.toBeNull()
    expect('utm_content' in row!).toBe(false)
  })
  it('мусор, пробелы, длинное, чужие символы -- отбрасывается, событие остаётся', () => {
    for (const bad of ['short', 'a'.repeat(65), 'has space token!', '<script>alert(1)</script>', 'ivan_petrov@gmail.com', 123, null]) {
      const row = parseToolEventPayload({ ...base, utm: { source: 'dm', content: bad } })
      expect(row).not.toBeNull()
      expect('utm_content' in row!).toBe(false)
    }
  })
})
