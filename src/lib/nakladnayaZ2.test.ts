import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// generateNakladnaya тянет imageResize (Image/canvas, в node нет); картинок в
// примере нет, подмена нужна только чтобы модуль загрузился.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildNakladnayaHtml } from './generateNakladnaya'
import {
  ACCOUNTING_RULES,
  EXAMPLE_BUYER,
  EXAMPLE_COUNT_WORDS,
  EXAMPLE_DATE,
  EXAMPLE_NUMBER,
  EXAMPLE_ROWS,
  EXAMPLE_SELLER,
  EXAMPLE_TOTAL_WORDS,
  FREE_TOOL_QUARTER_LIMIT,
  NAKLADNAYA_Z2_GUIDE,
  NO_ACCOUNTING_INCOME_LIMIT_MRP,
  NO_ACCOUNTING_INCOME_LIMIT_TENGE,
  ORDER_562,
  Z2_CHECKED,
  Z2_COLUMNS,
  Z2_FOOTER_FIELDS,
  Z2_HEADER_FIELDS,
  Z2_HEADER_LINE,
  Z2_REVIEW_BEFORE,
  Z2_SLUG,
  formatMoney,
  vatFromGross,
  z2Example,
} from './nakladnayaZ2'
import { MRP_2026, formatTenge } from './mrp'
import { getGuide, GUIDES } from './guides'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'
import { DOC_QUOTA_DEFAULT_LIMIT } from './tools-i18n/docQuota'
import { documentRows, documentTotal, vatIncluded, type Row } from '@/app/tools/nakladnaya/calc'

const words = (s: string) => s.trim().split(/\s+/).length

describe('накладная З-2: реквизиты актов', () => {
  it('приказ № 562 от 20.12.2012, приложение 26, регистрация 8265', () => {
    expect(ORDER_562).toMatchObject({ number: 562, date: '2012-12-20', registration: 8265, appendix: 26 })
    expect(ORDER_562.appendixRevisedBy).toEqual({ date: '2013-08-19', number: 402 })
    expect(Z2_HEADER_LINE).toContain('Приложение 26')
    expect(Z2_HEADER_LINE).toContain('№ 562')
    expect(Z2_HEADER_LINE).toContain('З-2')
  })

  it('Правила учёта: приказ № 241 от 31.03.2015, пункт 32', () => {
    expect(ACCOUNTING_RULES).toEqual({ number: 241, date: '2015-03-31', nakladnayaPoint: 32 })
  })

  it('порог «можно не вести бухучёт» 135 000 МРП считается от МРП сайта', () => {
    expect(NO_ACCOUNTING_INCOME_LIMIT_MRP).toBe(135_000)
    expect(NO_ACCOUNTING_INCOME_LIMIT_TENGE).toBe(135_000 * MRP_2026)
    expect(NO_ACCOUNTING_INCOME_LIMIT_TENGE).toBe(583_875_000)
  })

  it('дата проверки 25.10.2026', () => {
    expect(Z2_CHECKED).toBe('2026-10-25')
  })

  it('лимит бесплатных накладных совпадает с инструментом', () => {
    expect(FREE_TOOL_QUARTER_LIMIT).toBe(DOC_QUOTA_DEFAULT_LIMIT)
  })
})

describe('поля формы З-2', () => {
  it('в таблице девять граф с номерами 1-9 подряд', () => {
    expect(Z2_COLUMNS.map(c => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(Z2_COLUMNS.map(c => c.official)).toEqual([
      'Номер по порядку',
      'Наименование, характеристика',
      'Номенклатурный номер',
      'Единица измерения',
      'Количество: подлежит отпуску',
      'Количество: отпущено',
      'Цена за единицу, в тенге',
      'Сумма с НДС, в тенге',
      'Сумма НДС, в тенге',
    ])
  })

  it('шапка содержит все реквизиты бланка в порядке приложения 26', () => {
    expect(Z2_HEADER_FIELDS.map(f => f.key)).toEqual([
      'org', 'iin', 'number', 'date', 'sender', 'recipient', 'responsible', 'transport', 'ttn',
    ])
  })

  it('обязательные реквизиты статьи 7 закона покрыты: наименование, дата, ИП, единицы, подписи, номер', () => {
    const all = [...Z2_HEADER_FIELDS, ...Z2_COLUMNS, ...Z2_FOOTER_FIELDS]
    expect(all.some(f => f.official === 'Дата составления')).toBe(true)
    expect(all.some(f => f.official === 'ИИН/БИН')).toBe(true)
    expect(all.some(f => f.official === 'Единица измерения')).toBe(true)
    expect(all.some(f => f.key === 'received')).toBe(true)
  })

  it('у каждой графы есть русское и казахское пояснение, ключи уникальны', () => {
    const all = [...Z2_HEADER_FIELDS, ...Z2_COLUMNS, ...Z2_FOOTER_FIELDS]
    expect(new Set(all.map(f => f.key)).size).toBe(all.length)
    for (const f of all) {
      expect(f.ru.how.length, f.key).toBeGreaterThan(20)
      expect(f.kk.how.length, f.key).toBeGreaterThan(20)
      expect(f.kk.label.length, f.key).toBeGreaterThan(2)
    }
  })

  it('в текстах полей нет длинных и средних тире, эмодзи', () => {
    const all = [...Z2_HEADER_FIELDS, ...Z2_COLUMNS, ...Z2_FOOTER_FIELDS]
    const text = all.flatMap(f => [f.official, f.ru.how, f.kk.label, f.kk.how]).join(' ')
    expect(text).not.toMatch(/[–—]/)
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
  })

  it('названия граф бланка совпадают с тем, что печатает генератор invoices.kz (кроме известных сокращений)', () => {
    const html = buildNakladnayaHtml({
      number: '1', date: '01.01.2026', clientName: 'X', total: 1,
      services: [{ name: 'a', qty: 1, price: 1, type: 'product' }],
      profile: { company_name: 'Y', bin_iin: '000000000000', address: '' },
    })!
    for (const s of ['Номер по порядку', 'Наименование, характеристика', 'Единица измерения', 'подлежит отпуску', 'отпущено']) {
      expect(html, s).toContain(s)
    }
    expect(html).toContain('Организация (индивидуальный предприниматель)')
    expect(html).toContain('отправитель')
    expect(html).toContain('получатель')
  })
})

describe('пример на странице', () => {
  const ex = z2Example()

  it('итог 45 000: 10 × 2 000 + 5 × 5 000', () => {
    expect(EXAMPLE_ROWS.reduce((s, r) => s + r.qty * r.price, 0)).toBe(10 * 2_000 + 5 * 5_000)
    expect(ex.total).toBe(45_000)
    expect(ex.lines.map(l => l.amount)).toEqual([20_000, 25_000])
    expect(ex.positions).toBe(2)
  })

  it('НДС 16% выделяется из итога: 6 207, налог меньше 16% от суммы, строки сходятся с итогом', () => {
    expect(vatFromGross(45_000)).toBe(6_207)
    expect(ex.vatTotal).toBe(6_207)
    expect(ex.vatTotal).toBe(Math.round((45_000 * 16) / 116))
    expect(ex.vatTotal).toBeLessThan(45_000 * 0.16)
    expect(ex.lines.map(l => l.vat)).toEqual([2_759, 3_448])
    // пример подобран так, чтобы НДС по строкам и по итогу совпал до тенге
    expect(ex.vatLinesSum).toBe(ex.vatTotal)
    expect(ex.netTotal).toBe(45_000 - 6_207)
  })

  it('совпадает с расчётом инструмента /tools/nakladnaya (calc.ts)', () => {
    const rows: Row[] = EXAMPLE_ROWS.map(r => ({ name: r.name, qty: String(r.qty), unit: r.unit, price: String(r.price) }))
    expect(documentTotal(rows)).toBe(ex.total)
    expect(vatIncluded(documentTotal(rows), 'vat_16')).toBe(ex.vatTotal)
    expect(documentRows(rows)).toHaveLength(ex.positions)
  })

  it('совпадает с настоящим HTML генератора: итог, НДС, прописью, номер, дата, шапка формы', () => {
    const html = buildNakladnayaHtml({
      number: EXAMPLE_NUMBER,
      date: EXAMPLE_DATE,
      clientName: EXAMPLE_BUYER.name,
      clientBin: EXAMPLE_BUYER.bin,
      services: EXAMPLE_ROWS.map(r => ({ ...r, type: 'product' as const })),
      total: ex.total,
      vatType: 'no_vat',
      profile: {
        company_name: EXAMPLE_SELLER.name,
        bin_iin: EXAMPLE_SELLER.bin,
        address: '',
        director_name: EXAMPLE_SELLER.director,
      },
    })!
    expect(html).toContain(EXAMPLE_TOTAL_WORDS)
    expect(html).toContain(EXAMPLE_COUNT_WORDS)
    expect(html).toContain('Форма З-2')
    expect(html).toContain('от 20 декабря 2012 года № 562')
    expect(html).toContain('НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ')
    expect(html).toMatch(/2[\s  ]000,00/)
    expect(html).toMatch(/45[\s  ]000,00/)
    expect(html).toContain(EXAMPLE_DATE)
    // без НДС в графе 9 нули
    const withVat = buildNakladnayaHtml({
      number: '1', date: EXAMPLE_DATE, clientName: 'X',
      services: EXAMPLE_ROWS.map(r => ({ ...r, type: 'product' as const })),
      total: ex.total, vatType: 'vat_16',
      profile: { company_name: 'Y', bin_iin: EXAMPLE_SELLER.bin, address: '' },
    })!
    expect(withVat).toMatch(/6[\s  ]207,00/)
  })

  it('данные вымышленные: БИН из нулей', () => {
    expect(EXAMPLE_SELLER.bin).toMatch(/^0{11}[0-9]$/)
    expect(EXAMPLE_BUYER.bin).toMatch(/^0{11}[0-9]$/)
  })

  it('форматирование денег: «2 000,00»', () => {
    expect(formatMoney(2_000)).toMatch(/^2\s000,00$/)
    expect(formatMoney(45_000)).toMatch(/^45\s000,00$/)
  })
})

describe('сторож актуальности: статус проекта приказа об изменении названий полей', () => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  it('страница свежая (иначе перепроверить на adilet, принят ли проект приказа к приказу № 562, и обновить Z2_CHECKED)', () => {
    expect(
      today <= Z2_REVIEW_BEFORE,
      `Страница проверялась ${Z2_CHECKED}, срок перепроверки ${Z2_REVIEW_BEFORE} прошёл (сегодня ${today}). ` +
        'Откройте приказ № 562 на adilet.zan.kz: если названия полей в приложении 26 изменились ' +
        '(«Индивидуальный идентификационный номер/Бизнес идентификационный номер», «Место печати», «теңге»), ' +
        'обновите Z2_FIELDS, комментарий в nakladnayaZ2.ts, обе страницы и Z2_CHECKED.',
    ).toBe(true)
  })
})

describe('запись гайда', () => {
  const guide = NAKLADNAYA_Z2_GUIDE

  it('слаг и дата', () => {
    expect(guide.slug).toBe(Z2_SLUG)
    expect(guide.slug).toBe('nakladnaya-na-otpusk-zapasov-obrazec')
    expect(guide.updated).toBe(Z2_CHECKED)
  })

  it('связи: инструменты локализованы, связанные гайды существуют в реестре', () => {
    expect(guide.relatedTools).toEqual(['nakladnaya', 'schet', 'kontragent'])
    for (const t of guide.relatedTools) expect(LOCALIZED_TOOL_SLUGS).toContain(t)
    for (const r of guide.relatedGuides) {
      expect(getGuide(r), r).toBeDefined()
      expect(r).not.toBe(guide.slug)
    }
  })

  for (const lang of ['ru', 'kk'] as const) {
    it(`${lang}: title <= 60, description <= 155, summary 40-60 слов, 4-5 FAQ с ответами >= 10 слов`, () => {
      const c = guide[lang]
      expect(c.title.length).toBeLessThanOrEqual(60)
      expect(c.description.length).toBeLessThanOrEqual(155)
      expect(words(c.summary!)).toBeGreaterThanOrEqual(40)
      expect(words(c.summary!)).toBeLessThanOrEqual(60)
      const faq = c.faq!
      expect(faq.length).toBeGreaterThanOrEqual(4)
      expect(faq.length).toBeLessThanOrEqual(5)
      for (const f of faq) {
        expect(f.q.trim().endsWith('?'), f.q).toBe(true)
        expect(words(f.a), f.q).toBeGreaterThanOrEqual(10)
      }
      expect(new Set(faq.map(f => f.q)).size).toBe(faq.length)
    })

    it(`${lang}: без длинных и средних тире и эмодзи, без цифр спроса`, () => {
      const c = guide[lang]
      const all = [c.title, c.description, c.shortTitle, c.summary!, ...c.faq!.flatMap(f => [f.q, f.a])]
      const text = all.join(' ')
      expect(text).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
      expect(text).not.toMatch(/Вордстат|Wordstat|запросов в месяц/i)
    })

    it(`${lang}: цифры в FAQ берутся из модуля (порог 583 875 000, НДС не выдуман)`, () => {
      const text = guide[lang].faq!.map(f => f.a).join(' ')
      expect(text).toContain(formatTenge(NO_ACCOUNTING_INCOME_LIMIT_TENGE))
      expect(text).toContain('562')
      expect(text).toContain('402')
      expect(text).toContain('241')
    })
  }

  it('ru и kk: одинаковое число вопросов', () => {
    expect(guide.ru.faq!.length).toBe(guide.kk.faq!.length)
  })

  it('не обещает того, чего инструмент не делает: ТТН и сопроводительная накладная названы как НЕ создаваемые', () => {
    for (const lang of ['ru', 'kk'] as const) {
      const text = guide[lang].faq!.map(f => f.a).join(' ')
      expect(text).toMatch(/ТТН|ТКЖ/)
    }
    expect(guide.ru.faq![4].a).toContain('не оформляет')
    expect(guide.kk.faq![4].a).toContain('ресімдемейді')
  })

  // Гайд регистрируется контроллером в guides.ts; до этого проверки реестра пропущены.
  const registered = getGuide(Z2_SLUG)
  ;(registered ? it : it.skip)('зарегистрирован в GUIDES один раз и это тот же объект', () => {
    expect(registered).toBe(guide)
    expect(GUIDES.filter(g => g.slug === Z2_SLUG)).toHaveLength(1)
  })
})

describe('исправления по рецензии: подписи, бумажные копии, реквизиты закона, проект приказа', () => {
  const page = (kk: boolean) =>
    readFileSync(join(process.cwd(), `src/app/guides/${kk ? 'kk/' : ''}${Z2_SLUG}/page.tsx`), 'utf8').replace(/\s+/g, ' ')

  it('в бланке четыре подписи, а не пять (ru и kk, страницы и FAQ)', () => {
    expect(page(false)).toContain('В бланке четыре подписи')
    expect(page(false)).not.toContain('пять подписей')
    expect(page(true)).toContain('Бланкіде төрт қолтаңба бар')
    expect(page(true)).not.toContain('бес қолтаңба')
    expect(NAKLADNAYA_Z2_GUIDE.ru.faq![3].a).toContain('четыре подписи')
    expect(NAKLADNAYA_Z2_GUIDE.kk.faq![3].a).toContain('төрт қолтаңба')
  })

  it('бумажные копии электронного документа обязательны для других участников, по требованию только для госорганов', () => {
    const ru = NAKLADNAYA_Z2_GUIDE.ru.faq![3].a
    expect(ru).toContain('нужно изготовить его бумажные копии для других участников операции')
    expect(ru).toContain('государственным органам, имеющим такое право, по их требованию')
    expect(ru).not.toContain('по требованию распечатывают для другой стороны')
    expect(NAKLADNAYA_Z2_GUIDE.kk.faq![3].a).toContain('қағаз көшірмелерін дайындау керек')
    expect(page(false)).toContain('нужно изготовить бумажные копии для других участников операции')
    expect(page(true)).not.toContain('басқа тарап талап етсе')
  })

  it('обязательные реквизиты ст. 7 п. 3 названы нормой для самостоятельно разработанных форм, не для З-2', () => {
    for (const key of ['org', 'iin']) {
      expect(Z2_HEADER_FIELDS.find(f => f.key === key)!.ru.how, key).toContain('самостоятельно разработанных форм')
    }
    expect(Z2_COLUMNS.find(c => c.key === 'unit')!.ru.how).toContain('самостоятельно разработанных форм')
    expect(page(false)).not.toContain('обязательные реквизиты любого первичного документа')
    expect(page(false)).not.toContain('Это обязательный реквизит (статья 7')
    expect(Z2_HEADER_FIELDS.find(f => f.key === 'org')!.ru.how).toContain('фамилия и инициалы ИП')
  })

  it('проект приказа: конец мая 2026, замена «теңге» подтверждена карточкой, остальное со ссылкой на pro1c.kz', () => {
    for (const kk of [false, true]) {
      const text = page(kk)
      expect(text).toContain('legalacts.egov.kz/npa/view?id=15836845')
      expect(text).toContain('pro1c.kz')
    }
    expect(page(false)).toContain('В конце мая 2026 года')
    expect(page(true)).toContain('2026 жылғы мамырдың соңында')
    expect(NAKLADNAYA_Z2_GUIDE.ru.faq![0].a).not.toContain('В июне 2026')
    expect(NAKLADNAYA_Z2_GUIDE.ru.faq![0].a).toContain('pro1c.kz')
  })

  it('инструмент печатает «в KZT», и страницы это не скрывают; цена с НДС названа соглашением инструмента', () => {
    expect(page(false)).toContain('в бланке инструмента: «в KZT»')
    expect(page(true)).toContain('құралдың бланкісінде «в KZT»')
    expect(Z2_COLUMNS.find(c => c.key === 'price')!.ru.how).toContain('Приказ не уточняет')
    expect(page(false)).toContain('В нашем инструменте цена вводится с НДС')
  })

  it('подписи: пустыми остаются должность и подпись, расшифровка берётся из руководителя; «дословно» убрано', () => {
    expect(page(false)).toContain('строки «должность» и «подпись» остаются пустыми')
    expect(page(false)).not.toContain('линии для подписей остаются пустыми')
    expect(page(false)).not.toContain('дословно по приложению')
    expect(page(false)).toContain('добавлены подписи «должность»')
  })

  it('знак «х» в строке «Итого»: не утверждаем, в каких графах он стоит в приказе', () => {
    const how = Z2_FOOTER_FIELDS.find(f => f.key === 'total')!.ru.how
    expect(how).toContain('из текста приказа не видно')
    expect(how).toContain('в графах 5-7')
  })
})
