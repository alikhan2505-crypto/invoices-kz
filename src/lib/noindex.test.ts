import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { noindexMetadata, ROBOTS_DISALLOW_PREFIXES, ROBOTS_MUST_STAY_ALLOWED } from './noindex'

// Те же правила, что применяет краулер: самое длинное совпадение побеждает,
// при равенстве выигрывает Allow.
function isAllowed(txt: string, path: string): boolean {
  const rules: { allow: boolean; prefix: string }[] = []
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.match(/^\s*(allow|disallow)\s*:\s*(\S*)\s*$/i)
    if (m && m[2]) rules.push({ allow: m[1].toLowerCase() === 'allow', prefix: m[2] })
  }
  let best: { allow: boolean; len: number } | null = null
  for (const r of rules) {
    if (!path.startsWith(r.prefix)) continue
    if (!best || r.prefix.length > best.len || (r.prefix.length === best.len && r.allow)) best = { allow: r.allow, len: r.prefix.length }
  }
  return best ? best.allow : true
}

const robots = readFileSync(join(__dirname, '../../public/robots.txt'), 'utf8')

describe('public/robots.txt', () => {
  it('закрывает токен-страницы и кабинетные оболочки', () => {
    for (const p of ROBOTS_DISALLOW_PREFIXES) {
      expect(isAllowed(robots, `${p}/abc`), p).toBe(false)
    }
    expect(isAllowed(robots, '/view/some-token')).toBe(true) // noindex тегом, а не Disallow: иначе Google не увидит noindex
    expect(isAllowed(robots, '/contract-view/some-token')).toBe(true)
  })
  it('не закрывает публичные страницы', () => {
    for (const p of ROBOTS_MUST_STAY_ALLOWED) {
      expect(isAllowed(robots, p), p).toBe(true)
    }
  })
  it('оставляет карту сайта', () => {
    expect(robots).toMatch(/^Sitemap: https:\/\/invoices\.kz\/sitemap\.xml/m)
  })
})

describe('noindexMetadata', () => {
  it('ставит noindex, nofollow и необязательный заголовок', () => {
    const m = noindexMetadata('Счёт — INVOICES.KZ')
    expect(m.title).toBe('Счёт — INVOICES.KZ')
    expect(m.robots).toMatchObject({ index: false, follow: false })
    expect('title' in noindexMetadata()).toBe(false)
  })
})
