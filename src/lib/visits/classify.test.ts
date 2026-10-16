import { describe, expect, it } from 'vitest'
import {
  classifySource, FIRST_SOURCE_TTL_MS, isCarSignal, isMobileUA, isProductionHost, isScannerReferrer,
  isSignupSourceClass, nextFirstSource, normalizePath, parseFirstSource, referrerKind, type VisitSignals,
} from './classify'
import { parseVisitBody } from './validate'

// Типичный скан QR без метки: телефон, без реферера, главная, впервые, не вошёл.
const qrScan: VisitSignals = {
  path: '/', host: 'invoices.kz', referrerHost: null,
  utmSource: null, utmMedium: null, utmCampaign: null,
  isMobile: true, isNew: true, signedIn: false,
}

describe('classifySource', () => {
  it('car_exact by utm_source=car (the /car and /qr redirects), any case, any device', () => {
    expect(classifySource({ ...qrScan, utmSource: 'car', utmMedium: 'decal', utmCampaign: 'jetour' })).toBe('car_exact')
    expect(classifySource({ ...qrScan, utmSource: 'CAR', isMobile: false, isNew: false, signedIn: true })).toBe('car_exact')
    expect(classifySource({ ...qrScan, utmSource: 'car', referrerHost: 'l.instagram.com' })).toBe('car_exact')
  })

  it('car_exact once per browser: a reload / returning browser with utm_source=car is direct_other', () => {
    expect(classifySource({ ...qrScan, utmSource: 'car', carSeen: true })).toBe('direct_other')
    expect(classifySource({ ...qrScan, utmSource: 'car', isNew: false, carSeen: true })).toBe('direct_other')
    expect(classifySource({ ...qrScan, path: '/qr', carSeen: true })).toBe('direct_other')
    // уже бывал на сайте, но с машины впервые — засчитывается
    expect(classifySource({ ...qrScan, utmSource: 'car', isNew: false, carSeen: false })).toBe('car_exact')
  })

  it('isCarSignal', () => {
    expect(isCarSignal('/', 'car')).toBe(true)
    expect(isCarSignal('/', ' Car ')).toBe(true)
    expect(isCarSignal('/QR/', null)).toBe(true)
    expect(isCarSignal('/', 'instagram')).toBe(false)
    expect(isCarSignal('/cars', null)).toBe(false)
  })

  it('car_exact by the path /car or /qr itself', () => {
    expect(classifySource({ ...qrScan, path: '/car' })).toBe('car_exact')
    expect(classifySource({ ...qrScan, path: '/qr/' })).toBe('car_exact')
  })

  it('car_likely: mobile, no referrer, no utm, "/" on apex or www, new, signed out', () => {
    expect(classifySource(qrScan)).toBe('car_likely')
    expect(classifySource({ ...qrScan, host: 'www.invoices.kz' })).toBe('car_likely')
  })

  it('not car_likely when any condition fails', () => {
    expect(classifySource({ ...qrScan, isMobile: false })).toBe('direct_other')
    expect(classifySource({ ...qrScan, isNew: false })).toBe('direct_other')
    expect(classifySource({ ...qrScan, signedIn: true })).toBe('direct_other')
    expect(classifySource({ ...qrScan, path: '/tools/kp' })).toBe('direct_other')
    expect(classifySource({ ...qrScan, host: 'kaspi.invoices.kz' })).toBe('direct_other')
    expect(classifySource({ ...qrScan, referrerHost: 'invoices.kz' })).toBe('direct_other')
    expect(classifySource({ ...qrScan, utmCampaign: 'oct' })).toBe('referral')
  })

  it('search by referrer or utm', () => {
    expect(classifySource({ ...qrScan, referrerHost: 'www.google.com' })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'google.kz' })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'yandex.kz' })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'www.bing.com' })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'com.google.android.googlequicksearchbox', isNew: false })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'com.google.android.googlequicksearchbox', isMobile: false })).toBe('search')
    expect(classifySource({ ...qrScan, utmSource: 'google', utmMedium: 'cpc' })).toBe('search')
  })

  it('Android QR scanners (Google Lens / Google app) count as car_likely when the rest matches', () => {
    expect(classifySource({ ...qrScan, referrerHost: 'com.google.android.googlequicksearchbox' })).toBe('car_likely')
    expect(classifySource({ ...qrScan, referrerHost: 'lens.google.com' })).toBe('car_likely')
    expect(classifySource({ ...qrScan, referrerHost: 'lens.google.com', path: '/tools/kp' })).toBe('search')
    expect(classifySource({ ...qrScan, referrerHost: 'lens.google.com', signedIn: true })).toBe('search')
    expect(isScannerReferrer('lens.google.kz')).toBe(true)
    expect(isScannerReferrer('www.google.com')).toBe(false)
    expect(isScannerReferrer(null)).toBe(false)
  })

  it('social by referrer or utm', () => {
    for (const h of ['l.instagram.com', 'm.facebook.com', 't.me', 'web.whatsapp.com', 'www.tiktok.com', 'org.telegram.messenger']) {
      expect(classifySource({ ...qrScan, referrerHost: h })).toBe('social')
    }
    expect(classifySource({ ...qrScan, utmSource: 'instagram' })).toBe('social')
    expect(classifySource({ ...qrScan, utmSource: 'tg' })).toBe('social')
  })

  it('utm beats referrer', () => {
    expect(classifySource({ ...qrScan, utmSource: 'instagram', referrerHost: 'www.google.com' })).toBe('social')
  })

  it('referral for other sites and unknown utm campaigns', () => {
    expect(classifySource({ ...qrScan, referrerHost: 'sellers.kz' })).toBe('referral')
    expect(classifySource({ ...qrScan, utmSource: 'tools', utmMedium: 'cta' })).toBe('referral')
    // google-like but not google
    expect(classifySource({ ...qrScan, referrerHost: 'notgoogle.com' })).toBe('referral')
  })

  it('direct_other for desktop typed-in visits and own-domain referrers', () => {
    expect(classifySource({ ...qrScan, isMobile: false })).toBe('direct_other')
    expect(classifySource({ ...qrScan, referrerHost: 'kaspi.invoices.kz' })).toBe('direct_other')
  })
})

describe('helpers', () => {
  it('normalizePath', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('/Car/')).toBe('/car')
    expect(normalizePath('/lp/kaspi?x=1#a')).toBe('/lp/kaspi')
    expect(normalizePath('///')).toBe('/')
  })

  it('isProductionHost: invoices.kz and subdomains only', () => {
    expect(isProductionHost('invoices.kz')).toBe(true)
    expect(isProductionHost('www.invoices.kz')).toBe(true)
    expect(isProductionHost('kaspi.invoices.kz')).toBe(true)
    expect(isProductionHost('localhost')).toBe(false)
    expect(isProductionHost('127.0.0.1')).toBe(false)
    expect(isProductionHost('invoices-kz-git-main.vercel.app')).toBe(false)
    expect(isProductionHost('evilinvoices.kz')).toBe(false)
  })

  it('referrerKind', () => {
    expect(referrerKind(null)).toBe('none')
    expect(referrerKind('invoices.kz')).toBe('own')
    expect(referrerKind('docs.invoices.kz')).toBe('own')
    expect(referrerKind('google.co.uk')).toBe('search')
    expect(referrerKind('example.com')).toBe('other')
  })

  it('isMobileUA: client hint first, then UA', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    const android = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
    const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36'
    expect(isMobileUA(iphone)).toBe(true)
    expect(isMobileUA(android)).toBe(true)
    expect(isMobileUA(desktop)).toBe(false)
    expect(isMobileUA(desktop, '?1')).toBe(true)
    expect(isMobileUA(android, '?0')).toBe(false)
    expect(isMobileUA(null)).toBe(false)
  })

  it('signup source allowlist', () => {
    expect(isSignupSourceClass('car_likely')).toBe(true)
    expect(isSignupSourceClass('unknown')).toBe(true)
    expect(isSignupSourceClass('car')).toBe(false)
    expect(isSignupSourceClass(null)).toBe(false)
  })
})

describe('first source (30-day first touch)', () => {
  const now = Date.UTC(2026, 9, 16, 10)
  it('is written only when nothing fresh is stored', () => {
    expect(nextFirstSource(null, 'car_likely', now)).toEqual({ cls: 'car_likely', at: now })
    const fresh = JSON.stringify({ cls: 'car_exact', at: now - 1000 })
    expect(nextFirstSource(fresh, 'search', now)).toBeNull()
  })

  it('expires after 30 days and ignores garbage', () => {
    const old = JSON.stringify({ cls: 'car_exact', at: now - FIRST_SOURCE_TTL_MS })
    expect(parseFirstSource(old, now)).toBeNull()
    expect(nextFirstSource(old, 'search', now)).toEqual({ cls: 'search', at: now })
    expect(parseFirstSource('{', now)).toBeNull()
    expect(parseFirstSource(JSON.stringify({ cls: 'admin', at: now }), now)).toBeNull()
    expect(parseFirstSource(JSON.stringify({ cls: 'social', at: now + 2 * 3600_000 }), now)).toBeNull()
  })
})

describe('parseVisitBody', () => {
  const meta = {
    host: 'invoices.kz',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    chMobile: null,
  }
  const body = (o: Record<string, unknown>) => JSON.stringify({ loadId: 'abcd1234-ef', path: '/', isNew: true, signedIn: false, ...o })

  it('classifies on the server from UA and the request host, never stores UA', () => {
    const row = parseVisitBody(body({}), meta)
    expect(row).toEqual({
      load_id: 'abcd1234-ef', path: '/', host: 'invoices.kz', source_class: 'car_likely',
      is_mobile: true, is_new: true, signed_in: false, utm_source: null, utm_campaign: null,
    })
    expect(JSON.stringify(row)).not.toContain('iPhone')
  })

  it('takes the request Host header over the body', () => {
    expect(parseVisitBody(body({ host: 'invoices.kz' }), { ...meta, host: 'kaspi.invoices.kz:443' })?.host).toBe('kaspi.invoices.kz')
  })

  it('keeps utm and marks car_exact', () => {
    const row = parseVisitBody(body({ utm: { source: 'car', medium: 'decal', campaign: 'jetour' } }), meta)
    expect(row).toMatchObject({ source_class: 'car_exact', utm_source: 'car', utm_campaign: 'jetour' })
  })

  it('passes carSeen through: a returning car browser is not car_exact', () => {
    expect(parseVisitBody(body({ utm: { source: 'car' }, carSeen: true }), meta)?.source_class).toBe('direct_other')
    expect(parseVisitBody(body({ utm: { source: 'car' }, carSeen: 'yes' }), meta)?.source_class).toBe('car_exact')
  })

  it('drops visits from non-production hosts (local dev, Vercel previews)', () => {
    expect(parseVisitBody(body({ utm: { source: 'car' } }), { ...meta, host: 'localhost:3000' })).toBeNull()
    expect(parseVisitBody(body({}), { ...meta, host: '127.0.0.1:3000' })).toBeNull()
    expect(parseVisitBody(body({}), { ...meta, host: 'invoices-kz-abc.vercel.app' })).toBeNull()
  })

  it('rejects junk', () => {
    expect(parseVisitBody('', meta)).toBeNull()
    expect(parseVisitBody('nope', meta)).toBeNull()
    expect(parseVisitBody(body({ loadId: 'x' }), meta)).toBeNull()
    expect(parseVisitBody(body({ path: '/<script>' }), meta)).toBeNull()
    expect(parseVisitBody('x'.repeat(5000), meta)).toBeNull()
    expect(parseVisitBody(body({}), { ...meta, host: null })).toBeNull()
  })
})
