import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { waybillsDict, pluralRu, monthStartLabel } from './dict'
import { addToQueue, expandUploads, sheetCount, MAX_FILE_BYTES } from './uploads'

const pdf = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })

describe('waybills metadata', () => {
  it('ru title and description name the monthly limit instead of an unqualified «без регистрации»', () => {
    const m = toolMetadata('waybills', 'ru', waybillsDict.ru.seo)
    expect(m.title).toBe('Печать накладных Kaspi одним PDF (А4/А6) | invoices.kz')
    expect(m.description).toBe('Печать накладных Kaspi Магазина одним PDF: по 4 на лист А4 или по одной в А6 для термопринтера. 5 склеек в месяц бесплатно, без ограничений — в Kaspi Bot (Про). Файлы нигде не сохраняются.')
    expect(m.alternates?.canonical).toBe('https://invoices.kz/tools/waybills')
  })

  it('canonicalises every language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('waybills', lang, waybillsDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('waybills', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('waybills'))
    }
  })
})

describe('waybills dictionary', () => {
  it('has the same keys and FAQ length in every language', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(waybillsDict.kk)).toEqual(keys(waybillsDict.ru))
    expect(keys(waybillsDict.en)).toEqual(keys(waybillsDict.ru))
    expect(waybillsDict.kk.faq).toHaveLength(waybillsDict.ru.faq.length)
    expect(waybillsDict.en.faq).toHaveLength(waybillsDict.ru.faq.length)
  })

  it('uses «жүкқұжат», not the Russian word, in the visible kk text', () => {
    // keywords намеренно содержат «kaspi накладная» — так ищут и казахоязычные продавцы.
    const { seo, ...ui } = waybillsDict.kk
    const visible = JSON.stringify({ ...ui, seo: { ...seo, keywords: '' } }, (_k, v) =>
      typeof v === 'function' ? v(3, 1) : v)
    expect(visible).not.toMatch(/накладн|склей/i)
    expect(visible).toMatch(/жүкқұжат/)
    expect(visible).toMatch(/[ӘәҒғҚқҢңӨөҰұҮүІі]/)
  })

  it('keeps Cyrillic out of the en UI except the Kaspi cabinet tab name', () => {
    const en = JSON.stringify(waybillsDict.en, (_k, v) => (typeof v === 'function' ? v(3, 1) : v))
    expect(en.replace(/«Передача»/g, '')).not.toMatch(/[А-Яа-яЁё]/)
  })

  it('describes the free limit honestly: 5 a month, unlimited only in Kaspi Bot on Pro (5 → сразу Про)', () => {
    // Ни одно «бесплатно/без регистрации» не должно оставаться без оговорки о лимите.
    expect(waybillsDict.ru.intro).toContain('Бесплатно и без регистрации — 5 склеек в месяц, без ограничений — в Kaspi Bot на тарифе Про.')
    expect(waybillsDict.kk.intro).toContain('Тегін және тіркелусіз — айына 5 рет, шектеусіз — Про тарифіндегі Kaspi Bot-та.')
    expect(waybillsDict.en.intro).toContain('5 merges a month; unlimited in Kaspi Bot on the Pro plan.')
    expect(waybillsDict.ru.faq.find(f => f.q === 'Есть ли ограничения?')?.a).toBe(
      '5 склеек в месяц с одной сети (IP) — бесплатно и без регистрации. Регистрация лимит не меняет. Без ограничений — в Kaspi Bot на тарифе Про: там накладные приходят из Kaspi сами. Лимит обновляется 1-го числа.')
    // Регистрация больше не обещает безлимит — нигде, ни на одном языке.
    const signupUnlimited = /с (бесплатной )?регистрацией — без ограничений|после (бесплатной )?регистрации — без ограничений|тіркелгеннен кейін — шектеусіз|with a free account|after a free sign-?up/i
    for (const lang of TOOL_LANGS) {
      const d = waybillsDict[lang]
      const all = [d.intro, d.seo.description, d.seo.ogDescription, d.unlimited, d.limitText('2026-11-01'), d.limitCta, ...d.faq.map(f => f.a)]
      for (const text of all) expect(text, `${lang}: ${text}`).not.toMatch(signupUnlimited)
      for (const text of [d.intro, d.seo.description, d.seo.ogDescription, d.unlimited, d.limitText('2026-11-01')]) {
        expect(text, `${lang}: ${text}`).toMatch(/Kaspi Bot/)
        expect(text, `${lang}: ${text}`).toMatch(/Про|Pro/)
      }
      expect(d.seo.title).not.toMatch(/без регистрации|тіркелусіз|no sign-?up/i)
      expect(d.seo.ogTitle).not.toMatch(/без регистрации|тіркелусіз|no sign-?up/i)
      expect(d.seo.description).toMatch(/5/)
      expect(d.faq.some(f => /ограничен|шектеу|limit/i.test(f.q))).toBe(true)
    }
  })

  it('remaining/limit texts talk about a month, never a day or a quarter', () => {
    const monthWord = { ru: /месяц/, kk: /ай/, en: /month/ } as const
    const wrongPeriod = /в день|сегодня|квартал|күніне|бүгін|тоқсан|per day|a day|today|quarter/i
    for (const lang of TOOL_LANGS) {
      const d = waybillsDict[lang]
      const texts = [d.remaining(3, 5), d.remaining(1, 5), d.limitTitle(5), d.limitText('2026-11-01'), d.faq[d.faq.length - 1].a]
      for (const s of [d.remaining(3, 5), d.limitTitle(5)]) expect(s, `${lang}: ${s}`).toMatch(monthWord[lang])
      for (const s of texts) expect(s, `${lang}: ${s}`).not.toMatch(wrongPeriod)
      expect(d.remaining(3, 5)).toContain('3')
      expect(d.remaining(3, 5)).toContain('5')
      expect(d.limitTitle(5)).toContain('5')
      expect(d.limitText('2026-11-01')).toContain(monthStartLabel(lang, '2026-11-01'))
      expect(d.limitText('')).not.toMatch(/^\s|\.\s*\./)
      expect(d.unlimited.length).toBeGreaterThan(0)
    }
    expect(waybillsDict.ru.remaining(3, 5)).toBe('Осталось 3 из 5 бесплатных склеек в этом месяце')
    expect(waybillsDict.ru.remaining(1, 5)).toBe('Осталась 1 из 5 бесплатных склеек в этом месяце')
    expect(waybillsDict.ru.limitTitle(5)).toBe('Все 5 бесплатных склеек в этом месяце использованы')
    expect(waybillsDict.ru.limitCta).toBe('Подключить Kaspi Bot')
    expect(waybillsDict.ru.unlimited).toBe('Kaspi Bot на тарифе Про — склейка без ограничений')
    expect(waybillsDict.ru.limitText('2026-11-01')).toBe(
      'Новые бесплатные склейки откроются 1 ноября. Без ограничений — в Kaspi Bot на тарифе Про: там накладные приходят из Kaspi сами, без скачивания и склейки.')
    expect(waybillsDict.ru.limitText('')).toBe(
      'Без ограничений — в Kaspi Bot на тарифе Про: там накладные приходят из Kaspi сами, без скачивания и склейки.')
  })

  it('names the reset date in words', () => {
    expect(monthStartLabel('ru', '2026-11-01')).toBe('1 ноября')
    expect(monthStartLabel('kk', '2026-11-01')).toBe('1 қарашада')
    expect(monthStartLabel('en', '2026-11-01')).toBe('1 November')
    expect(monthStartLabel('ru', '2027-01-01')).toBe('1 января')
    expect(monthStartLabel('kk', '2026-12-01')).toBe('1 желтоқсанда')
    expect(monthStartLabel('en', '2026-05-01')).toBe('1 May')
    // Не первое число или мусор — показываем как есть, а не выдумываем дату.
    expect(monthStartLabel('ru', '2026-11-15')).toBe('2026-11-15')
    expect(monthStartLabel('ru', 'x')).toBe('x')
  })

  it('pluralises the result line', () => {
    expect(pluralRu(1, 'a', 'b', 'c')).toBe('a')
    expect(pluralRu(3, 'a', 'b', 'c')).toBe('b')
    expect(pluralRu(12, 'a', 'b', 'c')).toBe('c')
    expect(pluralRu(21, 'a', 'b', 'c')).toBe('a')
    expect(waybillsDict.ru.done(5, 2)).toBe('Готово: 5 накладных на 2 листах — файл скачан.')
    expect(waybillsDict.ru.done(1, 1)).toBe('Готово: 1 накладная на 1 листе — файл скачан.')
    expect(waybillsDict.en.done(1, 1)).toBe('Done: 1 waybill on 1 page — the file has been downloaded.')
  })
})

describe('upload queue', () => {
  it('skips duplicates, oversized files and anything past the limit', () => {
    const a = pdf('KASPI_SHOP-1.pdf')
    const big = pdf('big.pdf', MAX_FILE_BYTES + 1)
    const r = addToQueue([a], [pdf('KASPI_SHOP-1.pdf'), big, pdf('2.pdf'), pdf('3.pdf')], 2)
    expect(r.next.map(f => f.name)).toEqual(['KASPI_SHOP-1.pdf', '2.pdf'])
    expect(r.duplicates).toBe(1)
    expect(r.tooBig).toEqual(['big.pdf'])
    expect(r.overflow).toBe(1)
  })

  it('counts sheets per format', () => {
    expect(sheetCount(5, 'a4')).toBe(2)
    expect(sheetCount(4, 'a4')).toBe(1)
    expect(sheetCount(5, 'a6')).toBe(5)
  })
})

describe('expandUploads', () => {
  const loadZip = async () => JSZip as never

  it('unpacks PDFs from a Kaspi ZIP and drops macOS junk and non-PDFs', async () => {
    const zip = new JSZip()
    zip.file('KASPI_SHOP-111.pdf', new Uint8Array([1, 2, 3]))
    zip.file('nested/KASPI_SHOP-222.PDF', new Uint8Array([4]))
    zip.file('__MACOSX/._KASPI_SHOP-111.pdf', new Uint8Array([0]))
    zip.file('readme.txt', 'x')
    const data = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([data], 'waybills.zip', { type: 'application/zip' })
    const r = await expandUploads([file, pdf('loose.pdf'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' })], loadZip)
    expect(r.pdfs.map(f => f.name).sort()).toEqual(['KASPI_SHOP-111.pdf', 'KASPI_SHOP-222.PDF', 'loose.pdf'])
    expect(r.pdfs.every(f => f.type === 'application/pdf')).toBe(true)
    expect(r.rejected).toBe(1)
    expect(r.zipBroken).toBe(false)
    expect(r.zipEmpty).toBe(false)
  })

  it('reports an empty or broken archive instead of failing silently', async () => {
    const empty = new JSZip()
    empty.file('readme.txt', 'x')
    const emptyFile = new File([await empty.generateAsync({ type: 'arraybuffer' })], 'a.zip')
    const broken = new File([new Uint8Array([1, 2, 3, 4])], 'b.zip')
    const r = await expandUploads([emptyFile, broken], loadZip)
    expect(r.pdfs).toHaveLength(0)
    expect(r.zipEmpty).toBe(true)
    expect(r.zipBroken).toBe(true)
  })
})
