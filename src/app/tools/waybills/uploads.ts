// Чистая логика очереди файлов /tools/waybills — без React, чтобы её можно
// было проверить тестом (uploads.test.ts).
//
// Две вещи, которых раньше не было:
//  1. ZIP-архив из Kaspi распаковывается прямо в браузере. Самая частая
//     причина ошибки «не удалось прочитать файл» была в том, что продавец
//     грузил архив как есть (кабинет Kaspi отдаёт накладные ZIP-ом). Теперь
//     архив можно бросить целиком — на сервер всё равно уходят только PDF,
//     API-роут не меняется.
//  2. Повторно добавленный тот же файл пропускается: иначе одна накладная
//     печаталась дважды, а лимит в 30 файлов съедался впустую.

export const MAX_FILES = 30
/** Тот же предел, что в /api/tools/waybills — проверяем заранее, чтобы ошибка была на языке страницы. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/**
 * Предел на ВСЮ отправку. Vercel режет тело запроса к функции на 4,5 МБ и
 * отвечает 413 без JSON ещё до роута — то есть 30 файлов по 5 МБ, которые
 * пропускают проверки выше, всё равно не дойдут. Берём с запасом на обвязку
 * multipart и говорим об этом до отправки, а не после ожидания.
 * Обычная накладная Kaspi — 50–150 КБ, 30 штук укладываются с запасом.
 */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024

export function totalBytes(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0)
}

export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

export function isZipFile(f: File): boolean {
  return (
    f.type === 'application/zip' ||
    f.type === 'application/x-zip-compressed' ||
    f.name.toLowerCase().endsWith('.zip')
  )
}

export interface ExpandResult {
  pdfs: File[]
  /** Архив открылся, но PDF внутри нет. */
  zipEmpty: boolean
  /** Архив не открылся (битый или не ZIP). */
  zipBroken: boolean
  /** Ни PDF, ни ZIP — например, картинка или Excel. */
  rejected: number
}

type ZipLoader = () => Promise<{ loadAsync: (data: ArrayBuffer) => Promise<{ files: Record<string, { dir: boolean; name: string; async: (t: 'blob') => Promise<Blob> }> }> }>

// jszip тянется только когда кто-то действительно бросил архив — остальным
// посетителям (а это 75% телефонов) лишние ~100 КБ не грузим.
const defaultZipLoader: ZipLoader = async () => {
  const mod = await import('jszip')
  return (mod.default ?? mod) as unknown as Awaited<ReturnType<ZipLoader>>
}

/** Раскрывает выбранные файлы: PDF — как есть, ZIP — в PDF изнутри, остальное отбрасывает. */
export async function expandUploads(incoming: File[], loadZip: ZipLoader = defaultZipLoader): Promise<ExpandResult> {
  const result: ExpandResult = { pdfs: [], zipEmpty: false, zipBroken: false, rejected: 0 }
  for (const file of incoming) {
    if (isPdfFile(file)) {
      result.pdfs.push(file)
      continue
    }
    if (!isZipFile(file)) {
      result.rejected++
      continue
    }
    try {
      const JSZip = await loadZip()
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const entries = Object.values(zip.files).filter(e =>
        !e.dir &&
        e.name.toLowerCase().endsWith('.pdf') &&
        // служебный мусор архиваторов macOS: __MACOSX/._KASPI_SHOP-123.pdf
        !e.name.startsWith('__MACOSX/') &&
        !e.name.split('/').pop()!.startsWith('._'),
      )
      if (entries.length === 0) { result.zipEmpty = true; continue }
      for (const entry of entries) {
        const blob = await entry.async('blob')
        const name = entry.name.split('/').pop() || entry.name
        result.pdfs.push(new File([blob], name, { type: 'application/pdf' }))
      }
    } catch {
      result.zipBroken = true
    }
  }
  return result
}

export interface QueueResult {
  next: File[]
  /** Сколько файлов уже было в очереди (то же имя и размер). */
  duplicates: number
  /** Сколько не влезло в лимит MAX_FILES. */
  overflow: number
  /** Имена файлов больше MAX_FILE_BYTES — сервер их всё равно не примет. */
  tooBig: string[]
}

const fileKey = (f: File) => `${f.name}\u0000${f.size}`

/** Добавляет PDF в очередь: без повторов, без слишком больших, не больше max. */
export function addToQueue(prev: File[], pdfs: File[], max = MAX_FILES): QueueResult {
  const seen = new Set(prev.map(fileKey))
  const next = [...prev]
  let duplicates = 0
  let overflow = 0
  const tooBig: string[] = []
  for (const f of pdfs) {
    if (f.size > MAX_FILE_BYTES) { tooBig.push(f.name); continue }
    const key = fileKey(f)
    if (seen.has(key)) { duplicates++; continue }
    if (next.length >= max) { overflow++; continue }
    seen.add(key)
    next.push(f)
  }
  return { next, duplicates, overflow, tooBig }
}

/** Сколько листов выйдет: А4 — по 4 накладные, А6 — по одной. */
export function sheetCount(files: number, format: 'a4' | 'a6'): number {
  return format === 'a4' ? Math.ceil(files / 4) : files
}
