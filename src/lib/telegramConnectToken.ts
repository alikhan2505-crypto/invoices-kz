// Одноразовый токен привязки Telegram (deep-link t.me/<бот>?start=<токен>).
//
// Время выдачи зашито в сам токен — `<base36 мс>_<48 hex>` (Telegram
// разрешает в start-параметре только A-Z a-z 0-9 _ - и до 64 символов; здесь
// ~58), поэтому срок жизни проверяется без отдельной колонки. Раньше токен
// жил вечно: QR, попавший на скриншот или чужой глаз, позволял привязать
// СВОЙ чат к чужому аккаунту и получать его уведомления (клиенты, суммы).
//
// Файл чистый — без crypto/Supabase, генерация случайной части снаружи.

// Сколько ссылка/QR действует после выдачи.
export const TELEGRAM_CONNECT_TTL_MS = 15 * 60 * 1000
// Повторный запрос со страницы (вторая вкладка, перезагрузка) получает тот же
// токен, пока он моложе этого — ссылка, уже открытая в Telegram, не
// «сгорает». Старше — выдаётся новый, чтобы на экране всегда была ссылка
// минимум с 5 минутами запаса.
export const TELEGRAM_CONNECT_REUSE_MS = 10 * 60 * 1000

const TOKEN_RE = /^([0-9a-z]{1,11})_([0-9a-f]{48})$/

export function mintConnectToken(randomHex: string, now: number = Date.now()): string {
  return `${now.toString(36)}_${randomHex}`
}

// Время выдачи или null, если формат не наш (в т.ч. старые бессрочные токены).
export function connectTokenIssuedAt(token: string | null | undefined): number | null {
  if (!token) return null
  const m = TOKEN_RE.exec(token)
  if (!m) return null
  const issued = parseInt(m[1], 36)
  return Number.isFinite(issued) ? issued : null
}

// Действует ли токен сейчас. Токен «из будущего» (больше минуты вперёд) —
// не наш, отклоняем.
export function isConnectTokenFresh(token: string | null | undefined, now: number = Date.now()): boolean {
  const issued = connectTokenIssuedAt(token)
  if (issued === null) return false
  if (issued > now + 60_000) return false
  return now - issued < TELEGRAM_CONNECT_TTL_MS
}

// Можно ли отдать уже выданный токен повторно вместо нового.
export function isConnectTokenReusable(token: string | null | undefined, now: number = Date.now()): boolean {
  const issued = connectTokenIssuedAt(token)
  if (issued === null || issued > now + 60_000) return false
  return now - issued < TELEGRAM_CONNECT_REUSE_MS
}

export function connectTokenExpiresAt(token: string): number | null {
  const issued = connectTokenIssuedAt(token)
  return issued === null ? null : issued + TELEGRAM_CONNECT_TTL_MS
}
