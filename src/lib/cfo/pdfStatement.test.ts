import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PDF_WORKER_URL, extractPdfItems, itemsToGrid, pageToLines, readPdfGrid, type PdfItem } from './pdfStatement'
import { detectColumns, extractRows } from './statementImport'

// Выписки в тестах вымышленные. Координаты повторяют типичную таблицу банка: колонки слева направо,
// суммы прижаты вправо, заголовок на каждой странице.

const H = 9
const item = (str: string, x: number, y: number, w = str.length * 5): PdfItem => ({ str, x, y, w, h: H })
/** Строка таблицы: [текст, x начала, ширина] по колонкам. Слова внутри ячейки идут отдельными кусками. */
const line = (y: number, cells: [string, number, number?][]): PdfItem[] =>
  cells.flatMap(([text, x, w]) => {
    const words = text.split(' ')
    let cx = x
    return words.map((wd) => { const it = item(wd, cx, y, w && words.length === 1 ? w : wd.length * 5); cx += it.w + 3; return it })
  })

const COLS = { date: 40, amount: 140, kind: 240, details: 330 }
const header = (y: number) => line(y, [['Дата', COLS.date], ['Сумма', COLS.amount + 30], ['Операция', COLS.kind], ['Детали', COLS.details]])
const row = (y: number, d: string, amount: string, kind: string, details: string) =>
  line(y, [[d, COLS.date, 52], [amount, COLS.amount + 30 - (amount.length * 5 - 25), amount.length * 5], [kind, COLS.kind], [details, COLS.details]])

describe('pageToLines', () => {
  it('куски одной высоты в одной строке, слова одной ячейки склеены, колонки разделены', () => {
    const lines = pageToLines([...row(600, '30.10.25', '- 5 000,00 ₸', 'Покупка', 'Magnum Cash Carry')])
    expect(lines).toHaveLength(1)
    expect(lines[0].chunks.map((c) => c.text)).toEqual(['30.10.25', '- 5 000,00 ₸', 'Покупка', 'Magnum Cash Carry'])
  })
  it('пустые и пробельные куски игнорируются, строки идут сверху вниз', () => {
    const lines = pageToLines([item(' ', 10, 500), item('нижняя', 10, 400), item('верхняя', 10, 500)])
    expect(lines.map((l) => l.chunks[0].text)).toEqual(['верхняя', 'нижняя'])
  })
})

describe('itemsToGrid: выписка в стиле Kaspi', () => {
  const page: PdfItem[] = [
    ...line(780, [['Выписка по счёту KZ00', 40]]),
    ...line(765, [['Сформирована 02.11.2026', 40]]),
    ...header(740),
    ...row(720, '30.10.25', '- 5 000,00 ₸', 'Покупка', 'Magnum Cash Carry'),
    ...row(705, '30.10.25', '+ 120 000,00 ₸', 'Пополнение', 'Зарплата ТОО Ромашка'),
    ...row(690, '31.10.25', '- 1 250,50 ₸', 'Перевод', 'Иван И.'),
  ]
  it('таблица находится среди шапки выписки, колонки выровнены', () => {
    const grid = itemsToGrid([page])
    expect(grid[0]).toEqual(['Дата', 'Сумма', 'Операция', 'Детали'])
    expect(grid).toHaveLength(4)
    expect(grid[1]).toEqual(['30.10.25', '- 5 000,00 ₸', 'Покупка', 'Magnum Cash Carry'])
  })
  it('дальше общий разбор: даты, знак суммы и назначение', () => {
    const grid = itemsToGrid([page])
    const d = detectColumns(grid)!
    expect(d.headerRow).toBe(0)
    const rows = extractRows(grid, d.headerRow, d.map)
    expect(rows.map((r) => [r.date, r.direction, r.amount, r.purpose])).toEqual([
      ['2025-10-30', 'out', 500000, 'Magnum Cash Carry'],
      ['2025-10-30', 'in', 12000000, 'Зарплата ТОО Ромашка'],
      ['2025-10-31', 'out', 125050, 'Иван И.'],
    ])
  })
  it('заголовок на второй странице пропускается, строки обеих страниц сохраняются', () => {
    const page2: PdfItem[] = [...header(780), ...row(760, '01.11.25', '- 700,00 ₸', 'Покупка', 'Kaspi Red')]
    const grid = itemsToGrid([page, page2])
    expect(grid).toHaveLength(5)
    expect(grid[4][0]).toBe('01.11.25')
  })
  it('назначение платежа, перенесённое на следующую строку, приклеивается к операции; итоги нет', () => {
    const wrapped: PdfItem[] = [
      ...header(740),
      ...row(720, '30.10.25', '- 5 000,00 ₸', 'Перевод', 'Оплата по счёту'),
      ...line(711, [['№ 42 за услуги', COLS.details]]),
      ...line(690, [['Итого за период', COLS.kind]]),
    ]
    const grid = itemsToGrid([wrapped])
    expect(grid).toHaveLength(2)
    expect(grid[1][3]).toBe('Оплата по счёту № 42 за услуги')
  })
})

describe('itemsToGrid: другие раскладки', () => {
  it('отдельные колонки «Дебет» и «Кредит»', () => {
    const items: PdfItem[] = [
      ...line(740, [['Дата операции', 40], ['Дебет', 180], ['Кредит', 260], ['Назначение платежа', 340]]),
      ...line(720, [['01.11.2025', 40, 50], ['10 000,00', 180, 45], ['', 260], ['Оплата аренды', 340]]),
      ...line(705, [['02.11.2025', 40, 50], ['', 180], ['25 000,00', 260, 45], ['Поступление от клиента', 340]]),
    ]
    const grid = itemsToGrid([items])
    const d = detectColumns(grid)!
    const rows = extractRows(grid, d.headerRow, d.map)
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([['out', 1000000], ['in', 2500000]])
  })
  it('вторая строка заголовка («операции», «платежа») не принимается за операцию', () => {
    const items: PdfItem[] = [
      ...line(740, [['Дата', 40], ['Сумма', 140], ['Назначение', 260]]),
      ...line(730, [['операции', 40], ['(тенге)', 140], ['платежа', 260]]),
      ...line(710, [['01.11.2025', 40, 50], ['- 900,00', 140, 40], ['Такси', 260]]),
    ]
    const grid = itemsToGrid([items])
    expect(grid[0]).toEqual(['Дата', 'Сумма', 'Назначение'])
    expect(grid).toHaveLength(2)
    expect(extractRows(grid, 0, detectColumns(grid)!.map)).toHaveLength(1)
  })
  it('нет таблицы с датой и суммой: понятная ошибка, а не пустой список', () => {
    expect(() => itemsToGrid([line(700, [['Справка о состоянии счёта', 40]])])).toThrow(/не нашлась таблица/)
  })
})

describe('чтение настоящего PDF', () => {
  const make = async (draw: (page: import('pdf-lib').PDFPage, font: import('pdf-lib').PDFFont) => void) => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    draw(doc.addPage([595, 842]), font)
    const bytes = await doc.save()
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  }

  it('куски текста с координатами извлекаются из PDF', async () => {
    const buf = await make((p, font) => {
      for (let i = 0; i < 15; i++) p.drawText(`Row${i}`, { x: 50, y: 800 - i * 20, size: 10, font })
      p.drawText('Amount', { x: 300, y: 800, size: 10, font })
    })
    const pages = await extractPdfItems(buf)
    expect(pages).toHaveLength(1)
    const amount = pages[0].find((i) => i.str === 'Amount')!
    expect(amount.x).toBeCloseTo(300, 0)
    expect(amount.y).toBeCloseTo(800, 0)
    expect(pages[0].filter((i) => i.str.startsWith('Row'))).toHaveLength(15)
  })
  it('PDF без текста (скан, пустая страница): отдельное объяснение', async () => {
    const buf = await make(() => {})
    await expect(readPdfGrid(buf)).rejects.toThrow(/нет текста/)
  })
  it('не PDF и повреждённый файл: понятная ошибка', async () => {
    const junk = new TextEncoder().encode('это не pdf, просто текст '.repeat(20)).buffer as ArrayBuffer
    await expect(readPdfGrid(junk)).rejects.toThrow(/Не удалось прочитать PDF/)
  })
  it('слишком большой файл отклоняется до разбора', async () => {
    await expect(readPdfGrid(new ArrayBuffer(11 * 1024 * 1024))).rejects.toThrow(/больше 10 МБ/)
  })
})

describe('рабочий скрипт pdf.js для браузера', () => {
  it('лежит в public и совпадает с версией из node_modules (после обновления pdfjs-dist скопируйте файл заново)', () => {
    expect(PDF_WORKER_URL).toBe('/pdfjs/pdf.worker.min.mjs')
    const root = path.resolve(__dirname, '../../..')
    const mine = fs.readFileSync(path.join(root, 'public/pdfjs/pdf.worker.min.mjs'))
    const lib = fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'))
    expect(mine.equals(lib)).toBe(true)
  })
})
