import { describe, expect, it } from 'vitest'
import { bikGuidesIndexCard, bikHubLink } from './bikLinks'
import { bikHubPath } from './bikRegistry'
import { SEO_TARIFF_BIK_LIVE } from './seoLaunch'

describe('bikLinks', () => {
  it('флаг выключен: ссылок нет', () => {
    for (const lang of ['ru', 'kk', 'en']) expect(bikHubLink(lang, false)).toBeNull()
    expect(bikGuidesIndexCard('ru', false)).toBeNull()
    expect(bikGuidesIndexCard('kk', false)).toBeNull()
  })

  it('по умолчанию (флаг в репозитории включён) ссылки есть', () => {
    expect(SEO_TARIFF_BIK_LIVE).toBe(true)
    expect(bikHubLink('ru')?.href).toBe(bikHubPath('ru'))
    expect(bikHubLink('kk')?.href).toBe(bikHubPath('kk'))
    expect(bikGuidesIndexCard('ru')?.href).toBe('/bik')
    expect(bikGuidesIndexCard('kk')?.href).toBe('/bik/kk')
  })

  it('флаг включён: ссылки ведут на хаб нужного языка, en на русский', () => {
    expect(bikHubLink('ru', true)?.href).toBe(bikHubPath('ru'))
    expect(bikHubLink('kk', true)?.href).toBe(bikHubPath('kk'))
    expect(bikHubLink('en', true)?.href).toBe(bikHubPath('ru'))
    expect(bikGuidesIndexCard('ru', true)?.href).toBe('/bik')
    expect(bikGuidesIndexCard('kk', true)?.href).toBe('/bik/kk')
  })

  it('en-подпись без кириллицы, в текстах нет тире', () => {
    expect(bikHubLink('en', true)!.label).not.toMatch(/[А-Яа-яЁё]/)
    for (const lang of ['ru', 'kk', 'en']) expect(bikHubLink(lang, true)!.label).not.toMatch(/[—–]/)
    for (const lang of ['ru', 'kk'] as const) {
      const c = bikGuidesIndexCard(lang, true)!
      expect(c.title + c.text).not.toMatch(/[—–]/)
    }
  })
})
