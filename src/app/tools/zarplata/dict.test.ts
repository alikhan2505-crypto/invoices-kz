import { describe, it, expect } from 'vitest'
import { toolMetadata, toolUrl, toolAlternates, toolFaqJsonLd, formatTenge, TOOL_LANGS } from '@/lib/tools-i18n'
import { BASE_DEDUCTION, MRP_2026, PAYROLL_CHECKED, RATE_OOSMS, RATE_OPV, RATE_OPVR, RATE_SN, RATE_SO, RATE_VOSMS, calculatePayroll, ipnBaseZeroUpTo } from '@/lib/payroll'
import { checkedDate, fill, SOURCE_LINKS, zarplataDict } from './dict'

// Страховка языковых версий /tools/zarplata (схема: docs/tools-i18n-pattern.md).
// Строки словаря, не функции: плейсхолдеры {name} раскрывает fill().
const flatten = (o: unknown) => JSON.stringify(o)

// \b в JS-regex без флага u кириллицу за букву не считает: граница своя.
const NOT_LETTER_BEFORE = '(?<![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const NOT_LETTER_AFTER = '(?![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const RU_ABBR_ON_KK = new RegExp(
  `${NOT_LETTER_BEFORE}(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ОПВР|ОПВ|ВОСМС|ООСМС|МЗП|МРП|СО|ИПН|СН|ФОТ|ЗП|ГПХ)${NOT_LETTER_AFTER}`,
)
const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

// Все строки словаря плоским списком «путь -> текст».
function leaves(o: unknown, path = ''): Array<[string, string]> {
  if (typeof o === 'string') return [[path, o]]
  if (Array.isArray(o)) return o.flatMap((v, i) => leaves(v, `${path}[${i}]`))
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  return []
}

describe('zarplata dictionary', () => {
  it('has the same keys in every language, 5 FAQ items and 12 months', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(zarplataDict.kk)).toEqual(keys(zarplataDict.ru))
    expect(keys(zarplataDict.en)).toEqual(keys(zarplataDict.ru))
    for (const lang of TOOL_LANGS) {
      expect(zarplataDict[lang].faq).toHaveLength(5)
      expect(zarplataDict[lang].months).toHaveLength(12)
      expect(zarplataDict[lang].howSteps).toHaveLength(zarplataDict.ru.howSteps.length)
      // Вложенные группы тоже совпадают по ключам.
      expect(keys(zarplataDict[lang].warnings)).toEqual(keys(zarplataDict.ru.warnings))
      expect(keys(zarplataDict[lang].categories)).toEqual(keys(zarplataDict.ru.categories))
      expect(keys(zarplataDict[lang].categoryHint)).toEqual(keys(zarplataDict.ru.categoryHint))
      expect(keys(zarplataDict[lang].consts)).toEqual(keys(zarplataDict.ru.consts))
    }
  })

  it('uses the same placeholders in every language for every string', () => {
    const ru = new Map(leaves(zarplataDict.ru))
    for (const lang of ['kk', 'en'] as const) {
      for (const [path, text] of leaves(zarplataDict[lang])) {
        if (path.startsWith('faq') || path.startsWith('seo')) continue
        expect(placeholders(text), `${lang}.${path}`).toEqual(placeholders(ru.get(path) ?? ''))
      }
    }
  })

  it('pins the ru title and canonicalises each language to itself with hreflang to all three', () => {
    const ru = toolMetadata('zarplata', 'ru', zarplataDict.ru.seo, '/og/tool-nalogi.png')
    expect(ru.title).toBe('Калькулятор зарплаты 2026 Казахстан: на руки и налоги')
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('zarplata', lang, zarplataDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('zarplata', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('zarplata'))
    }
  })

  it('keeps title <= 60 and description <= 155 on every language', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('zarplata', lang, zarplataDict[lang].seo)
      expect(String(m.title).length, lang).toBeLessThanOrEqual(60)
      expect(String(m.description).length, lang).toBeLessThanOrEqual(155)
    }
  })

  it('the first line of the dictionary file flags the unreviewed Kazakh copy', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(__dirname, 'dict.ts'), 'utf-8')
    expect(src.split(/\r?\n/)[0]).toBe('// kk: вычитка носителем ждёт основателя')
    const kkPage = fs.readFileSync(path.join(__dirname, '../kk/zarplata/page.tsx'), 'utf-8')
    expect(kkPage.split(/\r?\n/)[0]).toBe('// kk: вычитка носителем ждёт основателя')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = flatten(zarplataDict.kk)
    expect(kk).not.toMatch(RU_ABBR_ON_KK)
    for (const term of ['МЗЖ', 'ЖМЗЖ', 'ӘА', 'МӘМС', 'ЕТЖ', 'АЕК', 'ЖТС']) expect(kk).toContain(term)
  })

  it('has no Cyrillic in the English copy apart from the ₸ sign', () => {
    expect(flatten(zarplataDict.en)).not.toMatch(CYRILLIC)
  })

  it('has no em or en dashes anywhere and no Cyrillic homoglyph slips in en', () => {
    for (const lang of TOOL_LANGS) expect(flatten(zarplataDict[lang]), lang).not.toMatch(/[—–]/)
  })

  it('has no emoji', () => {
    for (const lang of TOOL_LANGS) expect(flatten(zarplataDict[lang]), lang).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('formats the decimal separator per language', () => {
    expect(zarplataDict.ru.decimalSeparator).toBe(',')
    expect(zarplataDict.kk.decimalSeparator).toBe(',')
    expect(zarplataDict.en.decimalSeparator).toBe('.')
  })

  it('shows the checked date from the constant: dd.mm.yyyy for ru/kk, ISO for en', () => {
    expect(checkedDate('ru')).toBe('24.10.2026')
    expect(checkedDate('kk')).toBe('24.10.2026')
    expect(checkedDate('en')).toBe(PAYROLL_CHECKED)
  })

  it('points the kk page to the Kazakh guide', () => {
    expect(zarplataDict.kk.guideHref).toBe('/guides/kk/mrp-2026')
    expect(zarplataDict.ru.guideHref).toBe('/guides/mrp-2026')
  })

  it('rate labels match the rates in the library', () => {
    const p = (r: readonly [number, number], sep: string) => String((r[0] * 100) / r[1]).replace('.', sep)
    for (const lang of TOOL_LANGS) {
      const t = zarplataDict[lang]
      const sep = t.decimalSeparator
      expect(t.opv).toContain(`${p(RATE_OPV, sep)}%`)
      expect(t.vosms).toContain(`${p(RATE_VOSMS, sep)}%`)
      expect(t.opvr).toContain(`${p(RATE_OPVR, sep)}%`)
      expect(t.so).toContain(`${p(RATE_SO, sep)}%`)
      expect(t.sn).toContain(`${p(RATE_SN, sep)}%`)
      expect(t.oosms).toContain(`${p(RATE_OOSMS, sep)}%`)
    }
  })

  it('every FAQ answer has at least 10 words', () => {
    for (const lang of TOOL_LANGS) {
      for (const f of zarplataDict[lang].faq) expect(f.a.split(/\s+/).length, `${lang}: ${f.q}`).toBeGreaterThanOrEqual(10)
    }
  })

  it('FAQ 1 and 2 numbers are the values the calculator returns (not typed in)', () => {
    const r = calculatePayroll({ gross: 300_000 })
    expect([r.opv, r.vosms, r.ipnDetail.base, r.ipn, r.net]).toEqual([30_000, 6_000, 134_250, 13_425, 250_575])
    for (const lang of TOOL_LANGS) {
      const a = zarplataDict[lang].faq[0].a
      for (const v of [r.gross, r.opv, r.vosms, r.ipnDetail.base, r.ipn, r.net, BASE_DEDUCTION]) {
        expect(a, `${lang}: ${v}`).toContain(formatTenge(v))
      }
      expect(zarplataDict[lang].faq[1].a).toContain(formatTenge(ipnBaseZeroUpTo()))
    }
    expect(ipnBaseZeroUpTo()).toBe(147_443)
  })

  it('fill() leaves no unresolved placeholder when every variable is passed', () => {
    expect(fill('A {x} B {y}', { x: 1, y: 'z' })).toBe('A 1 B z')
    expect(fill('A {x}', {})).toBe('A ')
  })

  it('builds an escaped FAQPage JSON-LD that matches the visible questions', () => {
    for (const lang of TOOL_LANGS) {
      const raw = toolFaqJsonLd('zarplata', lang, zarplataDict[lang].faq)
      expect(raw).not.toContain('<')
      const data = JSON.parse(raw)
      expect(data['@type']).toBe('FAQPage')
      expect(data.mainEntity.map((q: { name: string }) => q.name)).toEqual(zarplataDict[lang].faq.map(f => f.q))
    }
  })

  it('names the SO rounding assumption honestly: tiyn rule from the Rules, direction is our reading', () => {
    for (const lang of TOOL_LANGS) expect(zarplataDict[lang].noteRounding.length).toBeGreaterThan(80)
    expect(zarplataDict.ru.noteRounding).toContain('независимо от тиын')
    expect(zarplataDict.ru.noteRounding).toContain('мы читаем это как округление вверх')
    expect(zarplataDict.ru.noteRounding).toContain('направление в Правилах не названо')
    expect(zarplataDict.ru.noteRounding).not.toMatch(/так сказано/)
    expect(zarplataDict.en.noteRounding).toContain('we read this as rounding up')
    expect(zarplataDict.en.noteRounding).toContain('do not name the direction')
    expect(zarplataDict.kk.noteRounding).toContain('жоғары қарай дөңгелектеу деп оқимыз')
  })

  it('has three employer regimes: legal entity, sole proprietor (fixed 1 MRP), simplified', () => {
    expect(zarplataDict.ru.regimeGeneral).toBe('ТОО, АО (общеустановленный порядок)')
    expect(zarplataDict.ru.regimeSole).toBe('ИП (общеустановленный порядок)')
    expect(zarplataDict.ru.regimeSimple).toBe('Упрощённая декларация')
    for (const lang of TOOL_LANGS) {
      const t = zarplataDict[lang]
      expect(new Set([t.regimeGeneral, t.regimeSole, t.regimeSimple]).size, lang).toBe(3)
      expect(t.exSnSole, lang).toContain('{value}')
      // FAQ про работодателя называет фиксированный 1 МРП ИП суммой из кода
      expect(t.faq[2].a, lang).toContain(formatTenge(MRP_2026))
    }
    expect(zarplataDict.ru.exSnSole).toMatch(/^1 МРП = \{value\}/)
    expect(zarplataDict.en.exSnSole).toMatch(/^1 MRP = \{value\}/)
    expect(zarplataDict.kk.exSnSole).toMatch(/^1 АЕК = \{value\}/)
  })

  it('lists what the calculator does not cover, in every language', () => {
    for (const lang of TOOL_LANGS) {
      const t = zarplataDict[lang]
      expect(t.noteScopeList.length, lang).toBeGreaterThanOrEqual(4)
      const all = t.noteScopeList.join(' ')
      // «до 1975 года» калькулятор теперь считает (флажок), в ограничениях его нет
      expect(all, lang).not.toContain('1975')
      expect(all, lang).toContain('1,8%'.replace(',', lang === 'en' ? '.' : ','))
      expect(t.faq[4].a, lang).not.toContain('1975')
    }
  })

  it('has the "born before 1975" option in every language, with the article reference and a distinct exemption text', () => {
    expect(zarplataDict.ru.born1975).toBe('Родился до 1975 года')
    expect(zarplataDict.kk.born1975).toBe('1975 жылға дейін туған')
    expect(zarplataDict.en.born1975).toBe('Born before 1975')
    for (const lang of TOOL_LANGS) {
      const t = zarplataDict[lang]
      expect(t.born1975Hint, lang).toContain('248')
      expect(t.born1975Hint, lang).toContain('1975')
      expect(t.exemptOpvr1975, lang).toContain('248')
      expect(t.exemptOpvr1975, lang).toContain('01.01.1975')
      expect(t.exemptOpvr1975, lang).not.toBe(t.exemptOpvr)
      // варианты предупреждений для случая, когда ОПВР не платится, не называют ОПВР
      expect(t.w1NoOpvr, lang).toContain('{mzp}')
      expect(t.w4NoOpvr, lang).toContain('{cap50}')
    }
    expect(zarplataDict.ru.w1NoOpvr).not.toContain('ОПВР')
    expect(zarplataDict.ru.w4NoOpvr).not.toContain('ОПВР')
    expect(zarplataDict.en.w1NoOpvr).not.toContain('OPVR')
    expect(zarplataDict.en.w4NoOpvr).not.toContain('OPVR')
    expect(zarplataDict.kk.w1NoOpvr).not.toContain('ЖМЗЖ')
    expect(zarplataDict.kk.w4NoOpvr).not.toContain('ЖМЗЖ')
  })

  it('splits the sources into the SO Rules and the OSMS Rules with their own links', () => {
    expect(SOURCE_LINKS.soRules).toBe('https://adilet.zan.kz/rus/docs/V2300032897')
    expect(SOURCE_LINKS.osmsRules).toBe('https://adilet.zan.kz/rus/docs/V1700015361')
    for (const lang of TOOL_LANGS) {
      const t = zarplataDict[lang]
      expect(t.srcSoRules, lang).toContain('14')
      expect(t.srcOsmsRules, lang).toContain('39')
      expect(t.srcOsmsRules, lang).toContain('478')
      expect(t.srcNk, lang).toContain('214-VIII')
    }
    expect(zarplataDict.ru.srcNk).toContain('Налоговый кодекс РК от 18.07.2025')
    expect(zarplataDict.ru.srcNk).not.toContain('Закон')
  })

  it('kk uses one wording for take-home pay ("қолға алатын") and the agreed fixes', () => {
    const kk = flatten(zarplataDict.kk)
    expect(kk).not.toMatch(/берілетін|қолына|алғыңыз/)
    expect(kk).not.toContain('жиынтық түрде')
    expect(kk).toContain('өспелі қорытындымен')
    expect(zarplataDict.kk.exIpn).toContain('{threshold} мөлшерінен асатын бөлігінен')
    expect(zarplataDict.kk.warnings.w6).toContain('Бұл 556-баптың сөзбе-сөз оқылуы; мысалы бар МКК түсіндірмесі жоқ')
    expect(zarplataDict.kk.hire).toBe('Жұмысқа қабылдау немесе жұмыстан босату айы')
  })

  it('the deduction carryover assumption and the disability deduction spread are stated honestly', () => {
    expect(zarplataDict.ru.warnings.w2).toContain('позиция КГД; ранее допускался перенос')
    expect(zarplataDict.ru.warnings.w10).toContain('нарастающим итогом с января')
    expect(zarplataDict.ru.warnings.w10).toContain('10-12')
    expect(zarplataDict.en.warnings.w10).toContain('cumulatively from January')
    expect(zarplataDict.kk.warnings.w10).toContain('қаңтардан бастап өспелі қорытындымен')
    expect(zarplataDict.ru.warnings.w7).toContain('с суммы превышения ИПН считается по ставке 15%')
    expect(zarplataDict.ru.w7Manual).toContain('с суммы превышения ИПН считается по ставке 15%')
    expect(zarplataDict.ru.w1Base).toContain('минимальной базы')
  })

  it('OPV for permanent disability I-II is "not paid by default, may be paid on request"; en link marked (ru)', () => {
    expect(zarplataDict.ru.categoryHint.disabled12Indefinite).toContain('по умолчанию не платится, возможна уплата по заявлению')
    expect(zarplataDict.ru.exemptOpv).toContain('По умолчанию не удерживается')
    expect(zarplataDict.en.guideLink).toBe('MRP and minimum wage in 2026 (ru)')
    expect(zarplataDict.en.warnings.w3).toContain("employee's request")
  })
})
