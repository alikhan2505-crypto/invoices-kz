import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sitemap from './sitemap'

const ALLOWED_HOSTS = new Set([
  'invoices.kz',
  'docs.invoices.kz',
  'api.invoices.kz',
  'kaspi.invoices.kz',
  'agent.invoices.kz',
  'salon.invoices.kz',
])

const entries = sitemap()

describe('sitemap', () => {
  it('закрытый салон (noindex, «скоро») в карте сайта не светится', () => {
    expect(entries.some(e => new URL(e.url).hostname === 'salon.invoices.kz')).toBe(false)
  })

  it('не содержит /login и других служебных адресов', () => {
    for (const e of entries) {
      const path = new URL(e.url).pathname
      expect(path, e.url).not.toMatch(/^\/(login|dashboard|create|upgrade|admin|profile|onboarding|history|invoice\/|promo|print|wildberries|api\/)/)
    }
  })

  it('все адреса абсолютные https на домене invoices.kz', () => {
    for (const e of entries) {
      const u = new URL(e.url)
      expect(u.protocol, e.url).toBe('https:')
      expect(ALLOWED_HOSTS.has(u.hostname), e.url).toBe(true)
      expect(u.search, e.url).toBe('')
      expect(u.hash, e.url).toBe('')
    }
  })

  it('без дубликатов', () => {
    const urls = entries.map(e => e.url)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('lastModified — реальная дата YYYY-MM-DD, не «сейчас» и не из будущего', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const e of entries) {
      expect(typeof e.lastModified, e.url).toBe('string')
      const d = e.lastModified as string
      expect(d, e.url).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(new Date(d).getTime()), e.url).toBe(false)
      expect(d <= today, `${e.url} lastModified в будущем`).toBe(true)
    }
  })

  it('не отдаёт changefreq и priority (Google их игнорирует)', () => {
    for (const e of entries) {
      expect(e, e.url).not.toHaveProperty('changeFrequency')
      expect(e, e.url).not.toHaveProperty('priority')
    }
  })

  it('hreflang-альтернативы тоже абсолютные и без /login', () => {
    for (const e of entries) {
      for (const href of Object.values(e.alternates?.languages ?? {})) {
        expect(href as string, e.url).toMatch(/^https:\/\/invoices\.kz\//)
        expect(href as string).not.toContain('/login')
      }
    }
  })

  it('гайд про накладные Kaspi: ru + kk, hreflang, lastmod 2026-10-23', () => {
    const ru = entries.find(e => e.url === 'https://invoices.kz/guides/nakladnye-kaspi-odnim-pdf')
    const kk = entries.find(e => e.url === 'https://invoices.kz/guides/kk/nakladnye-kaspi-odnim-pdf')
    for (const e of [ru, kk]) {
      expect(e).toBeDefined()
      expect(e!.lastModified).toBe('2026-10-23')
      expect(e!.alternates?.languages).toMatchObject({
        ru: 'https://invoices.kz/guides/nakladnye-kaspi-odnim-pdf',
        kk: 'https://invoices.kz/guides/kk/nakladnye-kaspi-odnim-pdf',
      })
    }
  })

  it('сохраняет главные адреса: корень, гайды, инструменты', () => {
    const urls = new Set(entries.map(e => e.url))
    for (const u of [
      'https://invoices.kz',
      'https://invoices.kz/guides',
      'https://invoices.kz/guides/komissiya-kaspi',
      'https://invoices.kz/guides/kak-vystavit-schet-ip',
      'https://invoices.kz/tools/margin',
      'https://invoices.kz/tools/waybills',
      'https://invoices.kz/privacy',
    ]) expect(urls.has(u), u).toBe(true)
  })
})

describe('public/robots.txt (чистка обхода)', () => {
  const robots = readFileSync(join(__dirname, '../../public/robots.txt'), 'utf8')
  const lines = robots.split(/\r?\n/).map(l => l.trim())

  it('закрывает /invoice/ со слэшем, а не префикс /invoice', () => {
    expect(lines).toContain('Disallow: /invoice/')
    expect(lines).not.toContain('Disallow: /invoice')
  })
  it('закрывает /api/', () => {
    expect(lines).toContain('Disallow: /api/')
  })
  it('не закрывает /invoices-landing и ИИ-ботов', () => {
    expect(lines.some(l => /^Disallow:\s*\/invoices/.test(l))).toBe(false)
    expect(robots).not.toMatch(/GPTBot|ClaudeBot|PerplexityBot|CCBot|Google-Extended|anthropic-ai|OAI-SearchBot/i)
    expect(lines.filter(l => /^User-agent:/i.test(l))).toEqual(['User-agent: *'])
  })
  it('не закрывает /login: noindex должен быть виден краулеру', () => {
    expect(lines.some(l => /^Disallow:\s*\/login/.test(l))).toBe(false)
  })
})
