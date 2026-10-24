import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  KASPI_ACCESSORIES,
  KASPI_DELIVERY,
  KASPI_FOOD,
  KASPI_GADGET_ROWS_BASE,
  KASPI_JEWELRY,
  KASPI_PAGE_SLUGS,
  KASPI_PETS,
  KASPI_PHARMACY,
  KASPI_PHONE_ACCESSORIES,
  KASPI_SOURCES,
  KASPI_TARIFF_CHECKED_TEXT,
  KASPI_TIERS,
  KASPI_TIER_ORDER,
  KASPI_TV_AUDIO,
  commissionTenge,
  deliveryRowById,
  formatNumber,
  formatPercent,
  formatTenge,
  kaspiDeliveryExample,
  kaspiExample,
  priceToReceiveTenge,
  sellerReceivesTenge,
  withoutVatTimes116,
} from './kaspiTariff'
import { KASPI_GUIDES, getKaspiGuide, kaspiGuidesForRegistry } from './kaspiGuides'

const ROOT = join(__dirname, '..', '..')
const GUIDES_DIR = join(ROOT, 'src', 'app', 'guides')

describe('три уровня ставки Kaspi Магазина', () => {
  it('7,3 / 12,5 / 15,5 с НДС и 6,4 / 10,9 / 13,5 без НДС, других уровней нет', () => {
    expect(KASPI_TIER_ORDER).toEqual(['low', 'base', 'high'])
    expect(Object.keys(KASPI_TIERS)).toHaveLength(3)
    expect(KASPI_TIERS.low).toEqual({ id: 'low', withVat: 7.3, withoutVat: 6.4 })
    expect(KASPI_TIERS.base).toEqual({ id: 'base', withVat: 12.5, withoutVat: 10.9 })
    expect(KASPI_TIERS.high).toEqual({ id: 'high', withVat: 15.5, withoutVat: 13.5 })
  })

  it('пары "без НДС" и "с НДС" не равны умножению на 1,16: берём опубликованные числа', () => {
    expect(withoutVatTimes116('low')).toBe(7.42)
    expect(withoutVatTimes116('base')).toBe(12.64)
    expect(withoutVatTimes116('high')).toBe(15.66)
    for (const t of KASPI_TIER_ORDER) {
      expect(withoutVatTimes116(t)).not.toBe(KASPI_TIERS[t].withVat)
    }
  })

  it('дата сверки и дата начала действия напечатаны в виде дд.мм.гггг', () => {
    expect(KASPI_TARIFF_CHECKED_TEXT).toBe('23.10.2026')
  })
})

describe('списки категорий не пустые и совпадают с числом строк в таблице Kaspi', () => {
  it('продукты питания: 152 строки в 20 подкатегориях, 20 строк алкоголя', () => {
    expect(KASPI_FOOD.subcategories).toHaveLength(20)
    expect(KASPI_FOOD.subcategories.reduce((s, x) => s + x.rows, 0)).toBe(152)
    expect(KASPI_FOOD.totalRows).toBe(152)
    expect(KASPI_FOOD.alcoholRows).toHaveLength(20)
    expect(KASPI_FOOD.subcategories.find(s => s.name === 'Алкоголь')?.rows).toBe(20)
    expect(KASPI_FOOD.babyFoodRows).toHaveLength(6)
    expect(KASPI_FOOD.sportNutritionRows).toHaveLength(14)
  })

  it('аптека: 15 строк "Лекарства" и 149 остальных', () => {
    expect(KASPI_PHARMACY.medicineRows).toHaveLength(15)
    expect(KASPI_PHARMACY.medicineRows).toContain('Витаминные препараты')
    expect(KASPI_PHARMACY.otherGroups.reduce((s, x) => s + x.rows, 0)).toBe(149)
    expect(KASPI_PHARMACY.otherTotalRows).toBe(149)
    expect(KASPI_PHARMACY.otherGroups.find(g => g.name === 'Витамины и БАД')?.rows).toBe(2)
  })

  it('товары для животных: 13 строк по 7,3% и 95 остальных', () => {
    expect(KASPI_PETS.foodRows).toHaveLength(13)
    expect(KASPI_PETS.otherGroups.reduce((s, x) => s + x.rows, 0)).toBe(95)
    expect(KASPI_PETS.otherTotalRows).toBe(95)
    for (const g of KASPI_PETS.otherGroups) {
      if (g.names) expect(g.names).toHaveLength(g.rows)
    }
  })

  it('украшения: 33 строки', () => {
    expect(KASPI_JEWELRY.totalRows).toBe(33)
    expect(KASPI_JEWELRY.groups.reduce((s, g) => s + g.rows.length, 0)).toBe(33)
    for (const g of KASPI_JEWELRY.groups) expect(g.rows.length).toBeGreaterThan(0)
  })

  it('аксессуары: 29 строк, 17 по 15,5% и 12 по 12,5%', () => {
    expect(KASPI_ACCESSORIES).toHaveLength(29)
    expect(KASPI_ACCESSORIES.filter(r => r.tier === 'high')).toHaveLength(17)
    expect(KASPI_ACCESSORIES.filter(r => r.tier === 'base')).toHaveLength(12)
    expect(KASPI_ACCESSORIES.some(r => r.tier === 'low')).toBe(false)
  })

  it('аксессуары для телефонов: 16 строк, 14 по 15,5% и 2 по 12,5%', () => {
    expect(KASPI_PHONE_ACCESSORIES).toHaveLength(16)
    expect(KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'high')).toHaveLength(14)
    const base = KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'base').map(r => r.name)
    expect(base.sort()).toEqual(['Внешние аккумуляторы', 'Зарядные устройства'])
    expect(KASPI_GADGET_ROWS_BASE).toHaveLength(22)
    expect(KASPI_TV_AUDIO.highRows).toEqual(['Чехлы для наушников'])
    expect(KASPI_TV_AUDIO.baseRows).toBe(119)
  })

  it('ни один список не пустой', () => {
    const lists: unknown[][] = [
      KASPI_FOOD.subcategories,
      KASPI_FOOD.alcoholRows,
      KASPI_FOOD.babyFoodRows,
      KASPI_FOOD.sportNutritionRows,
      KASPI_PHARMACY.medicineRows,
      KASPI_PHARMACY.otherGroups,
      KASPI_PETS.foodRows,
      KASPI_PETS.otherGroups,
      KASPI_JEWELRY.groups,
      KASPI_ACCESSORIES,
      KASPI_PHONE_ACCESSORIES,
      KASPI_GADGET_ROWS_BASE,
      KASPI_DELIVERY.underThreshold,
      KASPI_DELIVERY.fromThreshold,
      KASPI_DELIVERY.tires,
    ]
    for (const l of lists) expect(l.length).toBeGreaterThan(0)
    for (const l of lists) {
      for (const item of l) {
        const name = typeof item === 'string' ? item : (item as { name?: string }).name
        if (name !== undefined) expect(name.trim()).not.toBe('')
      }
    }
  })
})

describe('пример: продажа на 10 000 ₸ по опубликованной ставке с НДС', () => {
  it('комиссия и остаток считаются без дробных хвостов', () => {
    expect(commissionTenge(10000, 'low')).toBe(730)
    expect(commissionTenge(10000, 'base')).toBe(1250)
    expect(commissionTenge(10000, 'high')).toBe(1550)
    expect(sellerReceivesTenge(10000, 'low')).toBe(9270)
    expect(sellerReceivesTenge(10000, 'base')).toBe(8750)
    expect(sellerReceivesTenge(10000, 'high')).toBe(8450)
  })

  it('цена, при которой после комиссии остаётся 5 000 ₸, округляется вверх', () => {
    expect(priceToReceiveTenge(5000, 'low')).toBe(5394)
    expect(priceToReceiveTenge(5000, 'base')).toBe(5715)
    expect(priceToReceiveTenge(5000, 'high')).toBe(5918)
    for (const t of KASPI_TIER_ORDER) {
      const price = priceToReceiveTenge(5000, t)
      expect(sellerReceivesTenge(price, t)).toBeGreaterThanOrEqual(5000)
      expect(sellerReceivesTenge(price - 1, t)).toBeLessThan(5000)
    }
  })

  it('kaspiExample собирает все цифры в одном объекте', () => {
    expect(kaspiExample('base')).toEqual({
      tier: 'base',
      amount: 10000,
      ratePercent: 12.5,
      commission: 1250,
      receives: 8750,
      targetNet: 5000,
      priceForTarget: 5715,
    })
  })
})

describe('доставка Kaspi (страница q2288, с 01.01.2026, без НДС)', () => {
  it('12 строк: 4 по сумме заказа, 6 по весу, 2 по шинам', () => {
    expect(KASPI_DELIVERY.underThreshold).toHaveLength(4)
    expect(KASPI_DELIVERY.fromThreshold).toHaveLength(6)
    expect(KASPI_DELIVERY.tires).toHaveLength(2)
    expect(KASPI_DELIVERY.thresholdTenge).toBe(10000)
  })

  it('значения совпадают со страницей Kaspi', () => {
    const table: Record<string, [number, number, number]> = {
      lt1000: [49, 49, 49],
      '1000-3000': [149, 149, 149],
      '3000-5000': [199, 199, 199],
      '5000-10000': [699, 799, 799],
      'w-to5': [1099, 1299, 1699],
      'w-5-15': [1349, 1699, 1849],
      'w-15-30': [2299, 3599, 3149],
      'w-30-60': [2899, 5649, 3599],
      'w-60-100': [4149, 8549, 5599],
      'w-over100': [6449, 11999, 8449],
      'tire-car': [1049, 1649, 1349],
      'tire-truck': [4199, 6049, 5749],
    }
    for (const [id, [city, kz, express]] of Object.entries(table)) {
      const row = deliveryRowById(id)
      expect([row.city, row.kazakhstan, row.express], id).toEqual([city, kz, express])
    }
    expect(() => deliveryRowById('nope')).toThrow()
  })

  it('пример: продажа 10 000 ₸, ставка 12,5%, до 5 кг, колонка "Город"', () => {
    expect(kaspiDeliveryExample('base', 'w-to5', 'city')).toEqual({
      amount: 10000,
      commission: 1250,
      delivery: 1099,
      left: 7651,
    })
  })
})

describe('форматирование', () => {
  it('проценты по-русски и тенге с неразрывными пробелами', () => {
    expect(formatPercent(7.3)).toBe('7,3%')
    expect(formatPercent(12.5)).toBe('12,5%')
    expect(formatTenge(10000)).toBe('10 000 ₸')
    expect(formatTenge(730)).toBe('730 ₸')
    expect(formatNumber(11999)).toBe('11 999')
  })
})

describe('страницы K1-K8', () => {
  it('для каждого slug есть ru и kk каталог со своей page.tsx', () => {
    expect(KASPI_PAGE_SLUGS).toHaveLength(8)
    for (const slug of KASPI_PAGE_SLUGS) {
      for (const dir of [join(GUIDES_DIR, slug), join(GUIDES_DIR, 'kk', slug)]) {
        expect(existsSync(dir) && statSync(dir).isDirectory(), dir).toBe(true)
        expect(existsSync(join(dir, 'page.tsx')), dir).toBe(true)
      }
    }
  })

  it('у каждого slug есть запись реестра с ru, kk, FAQ из 3-4 вопросов и датой сверки', () => {
    expect(KASPI_GUIDES.map(g => g.slug).sort()).toEqual([...KASPI_PAGE_SLUGS].sort())
    for (const g of KASPI_GUIDES) {
      expect(getKaspiGuide(g.slug as (typeof KASPI_PAGE_SLUGS)[number])).toBe(g)
      expect(g.updated).toBe('2026-10-23')
      expect(g.relatedGuides).toContain('komissiya-kaspi')
      for (const lang of ['ru', 'kk'] as const) {
        const c = g[lang]
        expect(c.title.length, `${g.slug} ${lang} title`).toBeGreaterThan(10)
        expect(c.description.length, `${g.slug} ${lang} description`).toBeGreaterThan(60)
        expect(c.description.length, `${g.slug} ${lang} description`).toBeLessThanOrEqual(260)
        expect(c.shortTitle.length).toBeGreaterThan(5)
        expect(c.summary, `${g.slug} ${lang} summary`).toContain('23.10.2026')
        const words = (c.summary ?? '').split(/\s+/).length
        // В казахском слов меньше при том же смысле (агглютинация), поэтому нижняя граница ниже.
        expect(words, `${g.slug} ${lang} summary words`).toBeGreaterThanOrEqual(lang === 'ru' ? 40 : 28)
        expect(words, `${g.slug} ${lang} summary words`).toBeLessThanOrEqual(75)
        expect(c.faq?.length, `${g.slug} ${lang} faq`).toBeGreaterThanOrEqual(3)
        expect(c.faq?.length, `${g.slug} ${lang} faq`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('в текстах реестра нет тире и пустых мест от undefined', () => {
    const json = JSON.stringify(KASPI_GUIDES)
    expect(json).not.toMatch(/[—–]/)
    expect(json).not.toContain('undefined')
    expect(json).not.toContain('NaN')
  })

  it('у каждого источника есть адрес guide.kaspi.kz и русский/казахский заголовок', () => {
    for (const s of Object.values(KASPI_SOURCES)) {
      expect(s.url.startsWith('https://guide.kaspi.kz/')).toBe(true)
      expect(s.urlKk.startsWith('https://guide.kaspi.kz/')).toBe(true)
      expect(s.ru.length).toBeGreaterThan(5)
      expect(s.kk.length).toBeGreaterThan(5)
    }
    expect(KASPI_SOURCES.q2288.pageUpdated).toBe('16.06.2026')
    expect(KASPI_SOURCES.q1344.pageUpdated).toBe('06.01.2026')
  })

  it('пока флаг запуска выключен, в общий реестр ничего не попадает', async () => {
    const { SEO_TARIFF_BIK_LIVE } = await import('./seoLaunch')
    expect(kaspiGuidesForRegistry()).toHaveLength(SEO_TARIFF_BIK_LIVE ? 8 : 0)
  })
})

describe('диапазон доставки в текстах гайда K7', () => {
  it('блок "от 10 000 ₸" считается вместе со строками шин: 1 049-11 999 ₸', () => {
    const guide = getKaspiGuide('tarify-dostavki-kaspi-magazin')
    const all = [...KASPI_DELIVERY.fromThreshold, ...KASPI_DELIVERY.tires].flatMap(r => [r.city, r.kazakhstan, r.express])
    const lo = formatNumber(Math.min(...all))
    const hi = formatNumber(Math.max(...all))
    expect([lo, hi]).toEqual([formatNumber(1049), formatNumber(11999)])
    for (const lang of ['ru', 'kk'] as const) {
      const g = guide[lang]
      for (const t of [g.description, g.summary, g.faq![0].a]) {
        expect(t, `${lang}: ${t}`).toContain(lo)
        expect(t).toContain(hi)
        expect(t).not.toContain(formatNumber(1099))
      }
    }
  })
})

describe('флаг запуска и robots', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/seoLaunch')
    vi.resetModules()
  })

  async function metaWithFlag(live: boolean) {
    vi.resetModules()
    // guides.ts теперь импортирует kaspiGuides (реестр), а тот читает даты из seoLaunch,
    // поэтому подменяем только флаг, остальные экспорты оставляем настоящими.
    vi.doMock('@/lib/seoLaunch', async importOriginal => ({
      ...(await importOriginal<typeof import('@/lib/seoLaunch')>()),
      SEO_TARIFF_BIK_LIVE: live,
    }))
    const { kaspiMetadata } = await import('../app/guides/_kaspi/meta')
    const guide = KASPI_GUIDES[0]
    return { meta: kaspiMetadata(guide, 'ru', 'kw'), guide }
  }

  it('флаг выключен: noindex, nofollow', async () => {
    const { meta } = await metaWithFlag(false)
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('флаг включён: robots не задан, страница как обычный гайд', async () => {
    const { meta } = await metaWithFlag(true)
    expect(meta.robots).toBeUndefined()
  })

  it('canonical указывает на саму страницу, hreflang ru, kk и x-default', async () => {
    const { meta, guide } = await metaWithFlag(false)
    expect(meta.alternates?.canonical).toBe(`https://invoices.kz/guides/${guide.slug}`)
    expect(meta.alternates?.languages).toEqual({
      ru: `https://invoices.kz/guides/${guide.slug}`,
      kk: `https://invoices.kz/guides/kk/${guide.slug}`,
      'x-default': `https://invoices.kz/guides/${guide.slug}`,
    })
  })
})

describe('правила текста страниц', () => {
  function sourceFiles(): string[] {
    const files = [
      join(ROOT, 'src', 'lib', 'kaspiTariff.ts'),
      join(ROOT, 'src', 'lib', 'kaspiGuides.ts'),
      join(GUIDES_DIR, '_kaspi', 'blocks.tsx'),
      join(GUIDES_DIR, '_kaspi', 'meta.ts'),
    ]
    for (const slug of KASPI_PAGE_SLUGS) {
      files.push(join(GUIDES_DIR, slug, 'page.tsx'), join(GUIDES_DIR, 'kk', slug, 'page.tsx'))
    }
    return files
  }

  it('в файлах нет длинного и среднего тире', () => {
    for (const f of sourceFiles()) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/[—–]/)
    }
  })

  it('казахские файлы помечены "вычитка носителем ждёт основателя" в первой строке', () => {
    for (const slug of KASPI_PAGE_SLUGS) {
      const first = readFileSync(join(GUIDES_DIR, 'kk', slug, 'page.tsx'), 'utf8').split('\n')[0]
      expect(first, slug).toContain('kk: вычитка носителем ждёт основателя')
    }
  })

  it('каждая страница берёт числа из модуля, а не пишет ставки руками', () => {
    for (const slug of KASPI_PAGE_SLUGS) {
      for (const f of [join(GUIDES_DIR, slug, 'page.tsx'), join(GUIDES_DIR, 'kk', slug, 'page.tsx')]) {
        const src = readFileSync(f, 'utf8')
        expect(src, f).toContain('@/lib/kaspiTariff')
        expect(src, f).not.toMatch(/\b(7,3|12,5|15,5)%/)
      }
    }
  })

  it('каждая страница показывает блок источника и пример', () => {
    for (const slug of KASPI_PAGE_SLUGS) {
      for (const f of [join(GUIDES_DIR, slug, 'page.tsx'), join(GUIDES_DIR, 'kk', slug, 'page.tsx')]) {
        const src = readFileSync(f, 'utf8')
        expect(src, f).toContain('<SourceBlock')
        expect(src, f).toContain('<ExampleBlock')
        expect(src, f).toContain('<LinksBlock')
      }
    }
  })

  it('каталог guides содержит все страницы (защита от опечатки в slug)', () => {
    const dirs = readdirSync(GUIDES_DIR)
    for (const slug of KASPI_PAGE_SLUGS) expect(dirs).toContain(slug)
  })
})
