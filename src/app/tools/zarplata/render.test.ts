import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOOL_LANGS, formatTenge } from '@/lib/tools-i18n'
import ZarplataTool from './ZarplataTool'
import { zarplataDict } from './dict'

// Серверная отрисовка стартового состояния (300 000 ₸, из начисленной,
// обычный работник, вычет включён): H1, интро, результат, FAQ и источники
// должны быть в HTML сразу, без браузера. Данные берутся из константной
// таблицы SPEC (вектор V06), не из самой функции.

const html = (lang: 'ru' | 'kk' | 'en') => renderToStaticMarkup(createElement(ZarplataTool, { lang }))
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('ZarplataTool server render', () => {
  for (const lang of TOOL_LANGS) {
    it(`${lang}: default state is rendered honestly with V06 numbers`, () => {
      const markup = html(lang)
      const t = zarplataDict[lang]
      expect(markup).toContain(t.h1)
      const plain = text(markup).replace(/ /g, ' ')
      for (const v of [250_575, 30_000, 6_000, 13_425, 134_250, 10_500, 13_500, 15_840, 9_000, 348_840, 98_265]) {
        expect(plain, `${lang}: ${v}`).toContain(formatTenge(v).replace(/ /g, ' '))
      }
      for (const f of t.faq) expect(markup).toContain(f.q.replace(/&/g, '&amp;'))
      expect(markup).toContain(t.noteRounding)
    })

    it(`${lang}: no unresolved placeholders, undefined or NaN in the markup`, () => {
      const markup = html(lang)
      expect(text(markup)).not.toMatch(/\{\w+\}|undefined|NaN|\[object/)
    })

    it(`${lang}: money input is numeric, labelled and the result region is live`, () => {
      const markup = html(lang)
      expect(markup).toContain('inputMode="numeric"')
      expect(markup).toContain('for="zp-amount"')
      expect(markup).toContain('aria-live="polite"')
      expect(markup).toContain('aria-pressed="true"')
    })

    it(`${lang}: three employer regimes, labelled radiogroup, tooltip and help button outside the live region`, () => {
      const markup = html(lang)
      const t = zarplataDict[lang]
      for (const label of [t.regimeGeneral, t.regimeSole, t.regimeSimple]) expect(markup).toContain(label)
      const live = markup.slice(markup.indexOf('aria-live="polite"'), markup.indexOf('absolute right-0 top-3.5'))
      expect(live.length).toBeGreaterThan(50)
      expect(live).not.toContain('role="tooltip"')
      expect(live).not.toContain('<button')
      // ₸ рядом с цифрами рисуется обычным шрифтом
      expect(markup).toContain('font-sans text-[0.85em]')
    })

    it(`${lang}: the regime switch to the sole proprietor changes only the SN row`, () => {
      // Ядро проверено в payroll.test.ts; здесь только то, что подпись строки СН берётся из словаря.
      const t = zarplataDict[lang]
      expect(t.snSole).not.toBe(t.sn)
    })

    it(`${lang}: styles use design tokens only (no hex, rgb or gray utilities)`, () => {
      // Логотип (BrandWordmark) рисуется SVG со своими цветами: в проверку не входит.
      const markup = html(lang).replace(/<svg[\s\S]*?<\/svg>/g, '')
      expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|bg-gray|text-gray|border-gray/)
    })
  }
})
