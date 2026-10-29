import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findGoLink, GO_FALLBACK, GO_LINKS, goDestination, goRedirects, resolveGo } from './goLinks'

const APP = path.join(process.cwd(), 'src', 'app')

describe('GO_LINKS table', () => {
  it('has unique, URL-safe lowercase codes', () => {
    const codes = GO_LINKS.map(l => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[a-z0-9-]+$/)
  })

  it('points every code at a page that exists in src/app', () => {
    for (const l of GO_LINKS) {
      expect(l.path.startsWith('/'), l.code).toBe(true)
      expect(l.path.includes('?'), `${l.code}: path without query`).toBe(false)
      const segs = l.path.split('/').filter(Boolean)
      const page = path.join(APP, ...segs, 'page.tsx')
      // Лендинги продуктов: /lp/<ключ> обслуживает динамический lp/[key]/page.tsx.
      const dynamic = segs[0] === 'lp' ? path.join(APP, 'lp', '[key]', 'page.tsx') : ''
      expect(existsSync(page) || (dynamic !== '' && existsSync(dynamic)), `${l.code} -> ${l.path} (${page})`).toBe(true)
    }
  })

  it('always carries a full utm triple made of safe characters', () => {
    for (const l of GO_LINKS) {
      for (const v of [l.utm.source, l.utm.medium, l.utm.campaign]) {
        expect(v, l.code).toMatch(/^[a-z0-9_]{2,60}$/)
      }
    }
  })

  it('has the launch codes with the agreed utm', () => {
    const by = (c: string) => findGoLink(c)!
    expect(by('nakladnye')).toMatchObject({ path: '/tools/waybills', utm: { source: 'tg_chat', medium: 'chat_post', campaign: 'waybills_oct' } })
    expect(by('marzha')).toMatchObject({ path: '/tools/margin', utm: { source: 'tg_chat', medium: 'chat_post', campaign: 'margin_oct' } })
    expect(by('sellers-nakladnye').utm).toEqual({ source: 'sellers_kz', medium: 'paid_post', campaign: 'waybills_oct' })
    expect(by('sellers-marzha').utm).toEqual({ source: 'sellers_kz', medium: 'paid_post', campaign: 'margin_oct' })
    expect(by('ig-nakladnye').utm.medium).toBe('organic_social')
    expect(by('ig-marzha').utm.medium).toBe('organic_social')
    expect(by('reels-nakladnye').utm).toMatchObject({ source: 'meta', medium: 'paid_reels' })
    expect(by('reels-marzha').utm).toMatchObject({ source: 'meta', medium: 'paid_reels' })
    expect(by('dm')).toMatchObject({ path: '/tools/waybills', utm: { source: 'dm', medium: 'outreach', campaign: 'waybills_oct' } })
    for (const c of ['kontragent', 'schet', 'kp', 'nalogi']) expect(by(c).path).toBe(`/tools/${c}`)
  })
})

describe('кодовые слова директа 25.10.2026', () => {
  const by = (c: string) => findGoLink(c)!
  it('инструменты ведут на свои страницы с меткой dm / outreach / <инструмент>_oct', () => {
    const tools: [string, string, string][] = [
      ['dm-schet', '/tools/schet', 'schet_oct'],
      ['dm-kp', '/tools/kp', 'kp_oct'],
      ['dm-akt', '/tools/avr', 'avr_oct'],
      ['dm-tovar', '/tools/nakladnaya', 'nakladnaya_oct'],
      ['dm-zarplata', '/tools/zarplata', 'zarplata_oct'],
    ]
    for (const [code, p, campaign] of tools) {
      expect(by(code), code).toMatchObject({ path: p, utm: { source: 'dm', medium: 'outreach', campaign } })
      expect(by(code).host, code).toBeUndefined()
      expect(resolveGo(code)).toBe(`${p}?utm_source=dm&utm_medium=outreach&utm_campaign=${campaign}`)
    }
  })
  it('ПОДПИСЬ, АГЕНТ и БОТ ведут на корень своего хоста с меткой', () => {
    expect(resolveGo('dm-podpis')).toBe('https://docs.invoices.kz/?utm_source=dm&utm_medium=outreach&utm_campaign=esign_oct')
    expect(resolveGo('dm-agent')).toBe('https://agent.invoices.kz/?utm_source=dm&utm_medium=outreach&utm_campaign=agent_oct')
    expect(resolveGo('dm-bot')).toBe('https://kaspi.invoices.kz/?utm_source=dm&utm_medium=outreach&utm_campaign=kaspi_bot_oct')
  })
  it('редирект для хостовой ссылки абсолютный', () => {
    expect(goRedirects().find(x => x.source === '/go/dm-bot')?.destination).toBe(resolveGo('dm-bot'))
  })
})

describe('кнопка КОНТРАГЕНТ в директе (отдельная кампания)', () => {
  it('dm-kontragent-btn: тот же инструмент, кампания kontragent_oct_btn, старая ссылка не тронута', () => {
    expect(resolveGo('dm-kontragent-btn')).toBe('/tools/kontragent?utm_source=dm&utm_medium=outreach&utm_campaign=kontragent_oct_btn')
    expect(findGoLink('dm-kontragent-btn')!.host).toBeUndefined()
    expect(resolveGo('dm-kontragent')).toBe('/tools/kontragent?utm_source=dm&utm_medium=outreach&utm_campaign=kontragent_oct')
    expect(goRedirects().find(x => x.source === '/go/dm-kontragent-btn')?.destination).toBe(resolveGo('dm-kontragent-btn'))
  })
})

describe('goDestination / resolveGo', () => {
  it('builds the path with the three utm params', () => {
    expect(resolveGo('nakladnye')).toBe('/tools/waybills?utm_source=tg_chat&utm_medium=chat_post&utm_campaign=waybills_oct')
  })
  it('is case-insensitive and trims', () => {
    expect(resolveGo(' DM ')).toBe(goDestination(findGoLink('dm')!))
  })
  it('sends unknown or malformed codes to the home page without utm', () => {
    expect(resolveGo('nope')).toBe(GO_FALLBACK)
    expect(resolveGo('')).toBe(GO_FALLBACK)
    expect(resolveGo('../admin')).toBe(GO_FALLBACK)
    expect(GO_FALLBACK).toBe('/')
  })
})

describe('goRedirects', () => {
  const r = goRedirects()
  it('are temporary (307) so a target can be changed any time', () => {
    for (const x of r) expect(x.permanent).toBe(false)
  })
  it('has one exact rule per code and the catch-all LAST', () => {
    expect(r).toHaveLength(GO_LINKS.length + 1)
    expect(r[r.length - 1]).toEqual({ source: '/go/:code*', destination: '/', permanent: false })
    for (const l of GO_LINKS) expect(r.find(x => x.source === `/go/${l.code}`)?.destination).toBe(goDestination(l))
  })
})
