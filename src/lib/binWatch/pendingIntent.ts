// «Добавить БИН в слежение после входа». Невошедший посетитель жмёт «Следить за
// этим БИН» на бесплатном инструменте: БИН запоминается в localStorage на 30
// минут (общее правило намерений, src/lib/storedIntent.ts), посетитель уходит на
// /login с возвратом на /profile/bin-watch (путь в списке разрешённых
// возвратов, postLoginRedirect.ts), а страница списка, открывшись, забирает
// намерение и добавляет БИН. Хранится только 12 цифр БИН, и только на 30 минут;
// устаревшее и битое молча выбрасывается.
//
// Правило проекта сохраняется: новичок после регистрации сначала попадает на тур
// (choosePostLoginDestination), намерение при этом ждёт свои 30 минут и сработает,
// если он откроет страницу списка за это время.

import { isFreshIntent, parseIntentJson } from '@/lib/storedIntent'

export const PENDING_BIN_WATCH_KEY = 'invoices.pendingBinWatch'
/** Куда ведёт возврат после входа. Должен быть в ALLOWED_POST_LOGIN_REDIRECTS. */
export const BIN_WATCH_PAGE_PATH = '/profile/bin-watch' as const

const BIN_RE = /^\d{12}$/

export function setPendingBinWatch(bin: string, now: number = Date.now()): boolean {
  if (!BIN_RE.test(bin)) return false
  try {
    localStorage.setItem(PENDING_BIN_WATCH_KEY, JSON.stringify({ bin, at: now }))
    return true
  } catch {
    // Хранилище недоступно (приватный режим, квота): вход всё равно состоится,
    // просто без запомненного БИН.
    return false
  }
}

/** Прочитать и удалить намерение за один шаг; устаревшее или битое даёт null. */
export function consumePendingBinWatch(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(PENDING_BIN_WATCH_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_BIN_WATCH_KEY)
    const entry = parseIntentJson(raw)
    if (!entry || !isFreshIntent(entry.at, now)) return null
    return typeof entry.bin === 'string' && BIN_RE.test(entry.bin) ? entry.bin : null
  } catch {
    return null
  }
}
