// Банковская выписка в PDF → сетка ячеек (та же, что даёт Excel), дальше работает общий разбор
// из statementImport.ts. Только в браузере: файл никуда не отправляется (pdf.js работает у человека).
//
// Откуда колонки. В PDF нет ячеек, есть куски текста с координатами. Мы собираем куски в строки по
// высоте, находим строку заголовка таблицы (Дата, Сумма, Детали…) теми же словами, что и для Excel,
// и считаем её куски колонками; каждый кусок данных попадает в колонку, с которой он больше всего
// пересекается по горизонтали. Повторяющиеся на каждой странице заголовки пропускаются, а перенесённое
// на следующую строку назначение платежа приклеивается к предыдущей операции.
//
// Только PDF с настоящим текстом (скачанные из банка). Скан или фото выписки текста не содержат,
// их мы честно отклоняем: распознавание картинок сюда не входит.
import { NO_COLUMN, detectColumns, parseCellDate, type Cell, type ColumnMap, type Grid } from './statementImport'

export type PdfItem = { str: string; x: number; y: number; w: number; h: number }
export type PdfPage = PdfItem[]

type Chunk = { text: string; x0: number; x1: number }
type Line = { y: number; chunks: Chunk[] }

const MAX_PAGES = 80
const MAX_BYTES = 10 * 1024 * 1024
/** Меньше стольких кусков текста во всём файле: это скан или пустой PDF. */
const MIN_TEXT_ITEMS = 12

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Куски одной страницы → строки сверху вниз, в строке слева направо; близкие куски склеены в один. */
export function pageToLines(items: PdfPage): Line[] {
  const its = items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; items: PdfItem[] }[] = []
  for (const it of its) {
    const last = lines[lines.length - 1]
    const tol = Math.max(2, 0.45 * (it.h || 8))
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  return lines.map((ln) => {
    const sorted = ln.items.sort((a, b) => a.x - b.x)
    const chunks: Chunk[] = []
    for (const it of sorted) {
      const prev = chunks[chunks.length - 1]
      const gap = prev ? it.x - prev.x1 : Infinity
      // Между словами одной ячейки зазор мал (пробел), между колонками таблицы заметно больше.
      if (prev && gap <= Math.max(4, 0.8 * (it.h || 8))) {
        prev.text += (gap > 1 ? ' ' : '') + it.str.trim()
        prev.x1 = Math.max(prev.x1, it.x + it.w)
      } else {
        chunks.push({ text: it.str.trim(), x0: it.x, x1: it.x + it.w })
      }
    }
    return { y: ln.y, chunks }
  })
}

const rowOf = (ln: Line): Cell[] => ln.chunks.map((c) => c.text)

/** Объединяет две соседние строки (заголовок в два этажа: «Дата» над «операции»). */
function mergeLines(a: Line, b: Line): Line {
  const chunks: Chunk[] = a.chunks.map((c) => ({ ...c }))
  for (const c of b.chunks) {
    const hit = chunks.find((x) => Math.min(x.x1, c.x1) + 2 >= Math.max(x.x0, c.x0))
    if (hit) { hit.text = `${hit.text} ${c.text}`; hit.x0 = Math.min(hit.x0, c.x0); hit.x1 = Math.max(hit.x1, c.x1) }
    else chunks.push({ ...c })
  }
  chunks.sort((p, q) => p.x0 - q.x0)
  return { y: a.y, chunks }
}

type Header = { chunks: Chunk[]; map: ColumnMap; skip: number }

/** Строка (или две соседних) с заголовком таблицы. Сначала строгий поиск, потом мягкий. */
function findHeader(lines: Line[]): { header: Header; index: number } | null {
  // Одиночные строки по всему файлу идут раньше пар: иначе строка шапки выписки («Сформирована…»),
  // склеенная со следующей строкой-заголовком, победит сам заголовок.
  const attempt = (strict: boolean, span: 1 | 2) => {
    for (let k = 0; k + span <= lines.length; k++) {
      const ln = span === 1 ? lines[k] : mergeLines(lines[k], lines[k + 1])
      const d = detectColumns([rowOf(ln)])
      if (!d) continue
      if (strict && d.map.purpose === NO_COLUMN && d.map.counterparty === NO_COLUMN) continue
      return { header: { chunks: ln.chunks, map: d.map, skip: span }, index: k }
    }
    return null
  }
  return attempt(true, 1) ?? attempt(true, 2) ?? attempt(false, 1) ?? attempt(false, 2)
}

/** Колонка заголовка, с которой кусок пересекается по горизонтали больше всего; иначе ближайшая. */
function columnFor(c: Chunk, cols: Chunk[]): number {
  let best = -1
  let bestOverlap = 0
  for (let j = 0; j < cols.length; j++) {
    const overlap = Math.min(c.x1, cols[j].x1) - Math.max(c.x0, cols[j].x0)
    if (overlap > bestOverlap) { bestOverlap = overlap; best = j }
  }
  if (best !== -1) return best
  let nearest = 0
  let gap = Infinity
  for (let j = 0; j < cols.length; j++) {
    const g = Math.max(cols[j].x0 - c.x1, c.x0 - cols[j].x1)
    if (g < gap) { gap = g; nearest = j }
  }
  return nearest
}

const FOOTER = /итого|всего|остаток|баланс|страниц|^стр\.|выписк|сформирован|подпис/i

export function itemsToGrid(pages: PdfPage[]): Grid {
  const lines = pages.flatMap(pageToLines)
  const found = findHeader(lines)
  if (!found) {
    throw new Error('В PDF не нашлась таблица с колонками «Дата» и «Сумма». Выгрузите выписку в Excel (.xlsx) или проверьте, что это выписка, а не справка')
  }
  const { header, index } = found
  const cols = header.chunks
  const m = header.map
  const textCols = new Set<number>()
  for (let j = 0; j < cols.length; j++) {
    if (![m.date, m.amount, m.debit, m.credit].includes(j)) textCols.add(j)
  }
  const headerTexts = new Set(cols.map((c) => norm(c.text).toLowerCase()))

  const grid: Grid = [cols.map((c) => c.text)]
  let last: Cell[] | null = null
  for (let k = index + header.skip; k < lines.length; k++) {
    const ln = lines[k]
    // Заголовок, повторённый на следующей странице.
    const same = ln.chunks.filter((c) => headerTexts.has(norm(c.text).toLowerCase())).length
    if (same >= Math.min(2, cols.length)) continue

    const row: string[] = cols.map(() => '')
    const used = new Set<number>()
    for (const c of ln.chunks) {
      const j = columnFor(c, cols)
      used.add(j)
      row[j] = row[j] ? `${row[j]} ${c.text}` : c.text
    }
    const hasDate = parseCellDate(row[m.date]) !== null
    if (hasDate) { grid.push(row); last = row; continue }

    // Перенос назначения/контрагента на следующую строку: только если в строке одни текстовые колонки.
    const textOnly = [...used].every((j) => textCols.has(j))
    if (last && textOnly && !FOOTER.test(row.join(' '))) {
      for (const j of used) last[j] = last[j] ? `${last[j]} ${row[j]}` : row[j]
    }
  }
  return grid
}

// ---- чтение файла (браузер) ----

export const PDF_WORKER_URL = '/pdfjs/pdf.worker.min.mjs'

/** Куски текста всех страниц PDF. Бросает понятные ошибки для пароля и повреждённого файла. */
export async function extractPdfItems(buffer: ArrayBuffer): Promise<PdfPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
    if (name === 'PasswordException') throw new Error('PDF защищён паролем. Снимите защиту или выгрузите выписку в Excel')
    throw new Error('Не удалось прочитать PDF: файл повреждён или это не выписка. Выгрузите её в Excel (.xlsx)')
  }
  const pages: PdfPage[] = []
  try {
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items: PdfItem[] = []
      for (const it of content.items) {
        if (!('str' in it) || typeof it.str !== 'string') continue
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) })
      }
      pages.push(items)
    }
  } finally {
    await task.destroy().catch(() => {})
  }
  return pages
}

export async function readPdfGrid(buffer: ArrayBuffer): Promise<Grid> {
  if (buffer.byteLength > MAX_BYTES) throw new Error('PDF больше 10 МБ: выгрузите выписку за период покороче')
  const pages = await extractPdfItems(buffer)
  const count = pages.reduce((n, p) => n + p.length, 0)
  if (count < MIN_TEXT_ITEMS) {
    throw new Error('В этом PDF нет текста: похоже, это скан или фото. Скачайте выписку из банка в PDF или Excel, а не фотографируйте её')
  }
  return itemsToGrid(pages)
}
