// Бакет `signed-documents`: загруженные договоры (PDF), снимки счетов и
// договоров, подписанные ЭЦП, и карточки SIGEX (DDC).
//
// До 15.10.2026 бакет был публичным, а в базе (contracts.file_url,
// document_signatures.snapshot_pdf_url / display_pdf_url / ddc_pdf_url)
// хранились постоянные публичные ссылки — договор с чужими реквизитами
// открывался любому, у кого оказалась ссылка, навсегда. Теперь:
//
// - новые записи хранят путь объекта в бакете, а не ссылку;
// - старые записи (публичные ссылки) читаются этой же функцией — путь
//   достаётся из ссылки, переписывать данные не нужно;
// - отдаются файлы только через сервер: служебная роль скачивает объект
//   или выдаёт короткую подписанную ссылку (createSignedUrl), после
//   проверки, что смотрящий — владелец или знает public_token документа.
//
// Подписанные ссылки и скачивание служебной ролью работают и на
// публичном бакете, поэтому код работает и до, и после того, как
// основатель выполнит supabase/migrations/signed_documents_private.sql.

export const SIGNED_DOCUMENTS_BUCKET = 'signed-documents'

/** Сколько живёт подписанная ссылка, которую видит браузер (секунды). */
export const SIGNED_URL_TTL_SECONDS = 10 * 60

// Форматы ссылок Supabase Storage на объект: публичная, подписанная,
// авторизованная. Во всех путь объекта идёт сразу после имени бакета.
const STORAGE_URL_RE = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/

function isSafeObjectPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Путь объекта в бакете signed-documents из того, что лежит в колонке:
 * либо уже путь (`contracts/<uid>/...pdf`), либо старая ссылка Supabase
 * Storage на этот бакет. Для ссылок, если передан `supabaseUrl`, хост
 * обязан совпасть с нашим проектом. Всё остальное — null: такой файл
 * не отдаётся и не скачивается.
 */
export function signedDocumentPath(value: string | null | undefined, supabaseUrl?: string): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // Без схемы — это уже путь (так пишут новые записи).
    return isSafeObjectPath(raw) ? raw : null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (supabaseUrl) {
    try {
      if (url.host !== new URL(supabaseUrl).host) return null
    } catch {
      return null
    }
  }
  const m = url.pathname.match(STORAGE_URL_RE)
  if (!m || m[1] !== SIGNED_DOCUMENTS_BUCKET) return null
  let path: string
  try {
    path = m[2].split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
  return isSafeObjectPath(path) ? path : null
}

/**
 * Путь файла договора — только если он лежит в папке владельца договора
 * (`contracts/<ownerId>/...`). contracts.file_url пишет браузер, и вставку
 * строки RLS проверяет лишь по user_id, поэтому без этой проверки можно
 * было бы завести «свой» договор с путём к чужому объекту бакета и получить
 * его через сервер. И старые публичные ссылки, и новые пути договоров ведут
 * в эту папку, так что честные записи проходят.
 */
export function contractFilePath(
  value: string | null | undefined,
  ownerId: string | null | undefined,
  supabaseUrl?: string,
): string | null {
  if (!ownerId) return null
  const path = signedDocumentPath(value, supabaseUrl)
  if (!path) return null
  return path.startsWith(`contracts/${ownerId}/`) ? path : null
}
