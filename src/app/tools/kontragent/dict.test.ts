import { describe, it, expect } from 'vitest'
import { kontragentDict } from './dict'
import { kontragentFaqJsonLd } from './KontragentFaqJsonLd'
import { TOOL_LANGS } from '@/lib/tools-i18n'

// Весь словарь как текст: функции вызываем с нейтральными латинскими
// аргументами, чтобы проверять только собственные строки словаря.
const asText = (lang: 'ru' | 'kk' | 'en') =>
  JSON.stringify(kontragentDict[lang], (k, v) => {
    if (typeof v !== 'function') return v
    if (k === 'remaining') return `${v(0)} ${v(2)}`
    if (k === 'status') return v('Registered')
    return [v('X', 'Y'), v('X', null)].join(' ')
  })

// \b в JS без флага u не видит границ у кириллицы — граница слова тут своя.
const CYR = 'А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const ruAbbr = (abbr: string, flags = '') => new RegExp(`(^|[^${CYR}])${abbr}($|[^${CYR}])`, flags)

describe('kontragent dictionary — ru stays as it was', () => {
  it('keeps the ru head copy word for word (search snippet already indexed)', () => {
    const { seo } = kontragentDict.ru
    expect(seo.description).toBe(
      'Проверьте контрагента по БИН за секунды: неблагонадёжность, ликвидация, налоговая задолженность и статус плательщика НДС — по официальным реестрам ГБД ЮЛ и КГД РК. Бесплатно, без регистрации.',
    )
    expect(seo.ogTitle).toBe('Проверка контрагента по БИН — бесплатно')
    expect(kontragentDict.ru.h1).toBe('Проверка контрагента по БИН')
  })
})

describe('kontragent dictionary — kk', () => {
  it('uses Kazakh terms instead of Russian abbreviations', () => {
    const kk = asText('kk')
    for (const abbr of ['БИН', 'ИИН', 'НДС', 'КГД', 'ИП', 'ТОО', 'ЭСФ', 'АО']) {
      expect(kk, abbr).not.toMatch(ruAbbr(abbr, 'i')) // и в нижнем регистре — keywords пишутся строчными
    }
    for (const term of ['БСН', 'ЖСН', 'ҚҚС', 'МКК', 'ЖК', 'ЖШС', 'ЭШФ']) {
      expect(kk, term).toMatch(ruAbbr(term))
    }
  })
})

describe('kontragent dictionary — en', () => {
  it('contains no Cyrillic of its own', () => {
    expect(asText('en')).not.toMatch(new RegExp(`[${CYR}]`))
  })
})

describe('kontragent dictionary — every language', () => {
  it('has an FAQ with the same number of non-empty questions', () => {
    const n = kontragentDict.ru.faq.items.length
    expect(n).toBeGreaterThanOrEqual(5)
    for (const lang of TOOL_LANGS) {
      const { faq } = kontragentDict[lang]
      expect(faq.title.length).toBeGreaterThan(0)
      expect(faq.items).toHaveLength(n)
      for (const item of faq.items) {
        expect(item.q.trim().length).toBeGreaterThan(5)
        expect(item.a.trim().length).toBeGreaterThan(20)
      }
      // Вопросы — ключи <details>, они должны быть уникальны.
      expect(new Set(faq.items.map(i => i.q)).size).toBe(n)
    }
  })

  it('says «none left» instead of «0 of 3 left» on the last free check', () => {
    for (const lang of TOOL_LANGS) {
      const t = kontragentDict[lang]
      expect(t.remaining(2)).toContain('2')
      expect(t.remaining(0)).not.toMatch(/\b0\b/)
    }
  })
})

describe('register status translation', () => {
  it('translates the statuses the register is known to return', () => {
    expect(kontragentDict.kk.status('Зарегистрирован')).toBe('Тіркелген')
    expect(kontragentDict.en.status('Ликвидирован')).toBe('Liquidated')
    expect(kontragentDict.en.status('Ликвидирован (исключен из ГБД)')).toBe('Liquidated')
    expect(kontragentDict.en.status('В стадии ликвидации')).toBe('In liquidation')
  })

  it('does not read «бездействующий» as «действующий»', () => {
    expect(kontragentDict.en.status('Бездействующий')).toBe('Inactive')
    expect(kontragentDict.en.status('Действующий')).toBe('Active')
    expect(kontragentDict.kk.status('Бездействующий')).toBe('Әрекетсіз')
  })

  it('passes unknown statuses through and never touches ru', () => {
    expect(kontragentDict.kk.status('Что-то новое')).toBe('Что-то новое')
    expect(kontragentDict.ru.status('Бездействующий')).toBe('Бездействующий')
  })
})

describe('FAQPage JSON-LD', () => {
  it('mirrors the visible FAQ on each language URL and is safe to inline', () => {
    for (const lang of TOOL_LANGS) {
      const raw = kontragentFaqJsonLd(lang)
      expect(raw).not.toContain('<')
      const data = JSON.parse(raw)
      expect(data['@type']).toBe('FAQPage')
      expect(data['@id']).toContain(lang === 'ru' ? '/tools/kontragent#faq' : `/tools/${lang}/kontragent#faq`)
      expect(data.mainEntity).toHaveLength(kontragentDict[lang].faq.items.length)
      expect(data.mainEntity[0].name).toBe(kontragentDict[lang].faq.items[0].q)
      expect(data.mainEntity[0].acceptedAnswer.text).toBe(kontragentDict[lang].faq.items[0].a)
    }
  })
})
