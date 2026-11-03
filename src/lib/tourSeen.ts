import { sharedCookieDomain } from './sharedSessionStorage'

// «Тур уже показан» для туров без своего места в базе (Kaspi Shop, AI-агент).
// Раньше отметка ставилась только когда тур дойдёт до конца или его закроют кнопкой,
// и хранилась в localStorage одного адреса: Kaspi-кабинет открывается и с
// invoices.kz/kaspi-shop, и с kaspi.invoices.kz, а у каждого адреса свой localStorage,
// поэтому тур возвращался снова и снова. Теперь:
//  - отметка ставится в момент показа, а не по окончании;
//  - она лежит и в localStorage, и в cookie на .invoices.kz (одна на все поддомены);
//  - прежние ключи localStorage считаются тоже (кто тур уже проходил, второй раз не увидит).

const COOKIE = 'tours_seen'
const KEY_PREFIX = 'tour-seen-'
const ONE_YEAR_S = 60 * 60 * 24 * 365

export interface TourSeenEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  cookie?: { get: () => string; set: (cookie: string) => void } | null
  hostname?: string
  secure?: boolean
}

function browserEnv(): TourSeenEnv {
  if (typeof window === 'undefined') return {}
  let storage: Storage | null = null
  try { storage = window.localStorage } catch { /* приватный режим */ }
  return {
    storage,
    // При запрете cookie document.cookie молча читается пустым и игнорирует запись: считаем, что cookie нет.
    cookie: navigator.cookieEnabled ? { get: () => document.cookie, set: (c) => { document.cookie = c } } : null,
    hostname: window.location.hostname,
    secure: window.location.protocol === 'https:',
  }
}

function seenInCookie(raw: string, id: string): boolean {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`).exec(raw)
  return !!m && m[1].split('.').includes(id)
}

/**
 * Показывали ли этот тур. Если хранилища недоступны совсем (закрытый режим без
 * cookie), считаем «показывали»: подсказка не должна лезть на экран при каждом заходе.
 */
export function isTourSeen(id: string, legacyKeys: string[] = [], env: TourSeenEnv = browserEnv()): boolean {
  let readable = false
  if (env.storage) {
    try {
      readable = true
      if (env.storage.getItem(KEY_PREFIX + id)) return true
      if (legacyKeys.some(k => env.storage!.getItem(k))) return true
    } catch { readable = false }
  }
  if (env.cookie) {
    try {
      readable = true
      if (seenInCookie(env.cookie.get(), id)) return true
    } catch { /* cookie недоступны */ }
  }
  return !readable
}

/** Запоминает, что тур показан: localStorage этого адреса и общая cookie на все поддомены. */
export function markTourSeen(id: string, env: TourSeenEnv = browserEnv()): void {
  try { env.storage?.setItem(KEY_PREFIX + id, new Date().toISOString()) } catch { /* ничего страшного */ }
  if (!env.cookie) return
  try {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`).exec(env.cookie.get())
    const ids = new Set((m ? m[1] : '').split('.').filter(Boolean))
    ids.add(id)
    const domain = sharedCookieDomain(env.hostname ?? '')
    env.cookie.set(
      `${COOKIE}=${[...ids].join('.')}; path=/; max-age=${ONE_YEAR_S}; SameSite=Lax`
      + (domain ? `; domain=${domain}` : '')
      + (env.secure ? '; Secure' : ''),
    )
  } catch { /* cookie недоступны */ }
}
