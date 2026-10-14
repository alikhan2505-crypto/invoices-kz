import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { waybillsDict, pluralRu } from './dict'
import { addToQueue, expandUploads, sheetCount, MAX_FILE_BYTES } from './uploads'

const pdf = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })

describe('waybills metadata', () => {
  it('keeps the ru title, description and canonical exactly as before the split', () => {
    const m = toolMetadata('waybills', 'ru', waybillsDict.ru.seo)
    expect(m.title).toBe('Склейка накладных Kaspi — бесплатно, без регистрации | invoices.kz')
    expect(m.description).toBe('Соберите накладные Kaspi Магазина в один PDF: по 4 на лист А4 или по одной в А6 для термопринтера. Бесплатно, без регистрации, файлы нигде не сохраняются.')
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
