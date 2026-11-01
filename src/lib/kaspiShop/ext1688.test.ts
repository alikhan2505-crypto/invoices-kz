import { describe, it, expect } from 'vitest'
import {
  EXT_SOURCE, MAX_EXT_OFFERS, cnyToKzt, extErrorText, parseExtEvent, sanitizeExtOffers,
} from './ext1688'

const offer = (over: Record<string, unknown> = {}) => ({
  id: '1070470662204',
  url: 'https://evil.example/should-be-ignored',
  title: '  Влажные   салфетки  ',
  priceCny: 1.18,
  priceNote: '¥1.26 за упаковку',
  sales: '10 000+ товаров',
  shop: 'Магазин',
  imageUrl: 'https://cbu01.alicdn.com/img/ibank/a.jpg_460x460q100.jpg_.webp',
  ...over,
})

describe('sanitizeExtOffers', () => {
  it('адрес товара строится из id (присланному не верим), пробелы схлопываются', () => {
    const r = sanitizeExtOffers([offer()])
    expect(r).toHaveLength(1)
    expect(r[0].url).toBe('https://detail.1688.com/offer/1070470662204.html')
    expect(r[0].title).toBe('Влажные салфетки')
    expect(r[0]).toMatchObject({ priceCny: 1.18, priceNote: '¥1.26 за упаковку', sales: '10 000+ товаров', shop: 'Магазин' })
  })
  it('фото только https с alicdn.com; иначе пусто, а карточка остаётся', () => {
    for (const img of ['http://cbu01.alicdn.com/a.jpg', 'https://evil.example/a.jpg', 'https://alicdn.com.evil.example/a.jpg', 'javascript:alert(1)', '', 5, null]) {
      expect(sanitizeExtOffers([offer({ imageUrl: img })])[0].imageUrl).toBe('')
    }
    expect(sanitizeExtOffers([offer({ imageUrl: 'https://img.alicdn.com/x.png' })])[0].imageUrl).toBe('https://img.alicdn.com/x.png')
  })
  it('мусор отбрасывается: нет id или цены, повтор id, не объект, пустое название', () => {
    const r = sanitizeExtOffers([
      offer({ id: 'abc' }), offer({ id: '123' }), offer({ priceCny: 0 }), offer({ priceCny: 'x' }), offer({ priceCny: 1e9 }),
      offer({ title: '   ' }), null, 'str', 7, offer({ id: '222222222222' }), offer({ id: '222222222222' }),
    ])
    expect(r.map(o => o.id)).toEqual(['222222222222'])
  })
  it('не больше MAX_EXT_OFFERS; не массив даёт пустой список', () => {
    const many = Array.from({ length: 40 }, (_, i) => offer({ id: String(100000000000 + i) }))
    expect(sanitizeExtOffers(many)).toHaveLength(MAX_EXT_OFFERS)
    expect(sanitizeExtOffers('x')).toEqual([])
    expect(sanitizeExtOffers(undefined)).toEqual([])
  })
  it('длинные строки обрезаются', () => {
    const r = sanitizeExtOffers([offer({ title: 'а'.repeat(500), shop: 'б'.repeat(500), priceNote: 'в'.repeat(500), sales: 'г'.repeat(500) })])[0]
    expect([r.title.length, r.shop.length, r.priceNote.length, r.sales.length]).toEqual([200, 80, 60, 60])
  })
})

describe('parseExtEvent', () => {
  const msg = (over: Record<string, unknown>) => ({ source: EXT_SOURCE, type: 'ik1688:event', id: 'ik-1', status: 'started', ...over })
  it('свои события разбираются', () => {
    expect(parseExtEvent(msg({}), 'ik-1')).toEqual({ id: 'ik-1', status: 'started' })
    expect(parseExtEvent(msg({ status: 'captcha' }), 'ik-1')).toEqual({ id: 'ik-1', status: 'captcha' })
    expect(parseExtEvent(msg({ status: 'attention' }), 'ik-1')).toEqual({ id: 'ik-1', status: 'attention' })
    expect(parseExtEvent(msg({ status: 'error', reason: 'hourly_limit' }), 'ik-1')?.reason).toBe('hourly_limit')
    expect(parseExtEvent(msg({ status: 'error', reason: 'no_gesture' }), 'ik-1')?.reason).toBe('no_gesture')
    expect(parseExtEvent(msg({ status: 'results', items: [offer()] }), 'ik-1')?.items).toHaveLength(1)
    expect(parseExtEvent(msg({ status: 'error', reason: 'busy' }), 'ik-1')).toEqual({ id: 'ik-1', status: 'error', reason: 'busy' })
  })
  it('неизвестная причина становится unknown', () => {
    expect(parseExtEvent(msg({ status: 'error', reason: '<script>' }), 'ik-1')?.reason).toBe('unknown')
  })
  it('чужой источник, другой id, другой тип, неизвестный статус и не объект игнорируются', () => {
    expect(parseExtEvent(msg({ source: 'other' }), 'ik-1')).toBeNull()
    expect(parseExtEvent(msg({ id: 'ik-2' }), 'ik-1')).toBeNull()
    expect(parseExtEvent(msg({ type: 'ik1688:pong' }), 'ik-1')).toBeNull()
    expect(parseExtEvent(msg({ status: 'hacked' }), 'ik-1')).toBeNull()
    expect(parseExtEvent(null, 'ik-1')).toBeNull()
    expect(parseExtEvent('x', 'ik-1')).toBeNull()
  })
  it('результаты проходят очистку: чужой адрес не доходит', () => {
    const ev = parseExtEvent(msg({ status: 'results', items: [offer()] }), 'ik-1')
    expect(ev?.items?.[0].url).toBe('https://detail.1688.com/offer/1070470662204.html')
  })
})

describe('cnyToKzt и тексты', () => {
  it('считает и округляет; нет курса даёт null', () => {
    expect(cnyToKzt(1.18, 65)).toBe(77)
    expect(cnyToKzt(10, 65.4)).toBe(654)
    for (const rate of [null, undefined, 0, -1, NaN]) expect(cnyToKzt(5, rate as number | null | undefined)).toBeNull()
  })
  it('у каждой причины есть человеческий текст', () => {
    for (const r of ['busy', 'too_fast', 'cannot_open', 'timeout', 'page_timeout', 'unreadable', 'tab_closed', 'extension_unavailable', 'bad_request', 'hourly_limit', 'no_gesture', 'unknown', undefined] as const) {
      expect(extErrorText(r).length).toBeGreaterThan(10)
    }
  })
})
