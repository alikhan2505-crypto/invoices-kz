'use client'
// Числа «в работе» у пунктов бокового меню Kaspi Bot (18.10.2026).
//
// Меню живёт в ProductShell и переживает переходы между страницами, но монтируется
// заново при открытии мобильной шторки и при смене продукта, поэтому состояние
// лежит на уровне модуля: одно значение на вкладку, один запрос на всех
// подписчиков, свежесть 60 секунд. Это же убирает мерцание -- при переходе
// между страницами меню сразу рисует последнее известное число, а свежий ответ
// просто подменяет его.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { KASPI_SHOP_PROFILE_COLUMNS, hasKaspiShopAccess } from './access'
import {
  EMPTY_MENU_COUNTS,
  MENU_COUNTS_STALE_MS,
  mergeMenuCounts,
  normalizeMenuCounts,
  type MenuCounts,
} from './menuCounts'

// Тот же сигнал, что рассылает KaspiShopStoreSwitcher при подключении/отключении
// магазина (строка не импортируется оттуда, чтобы не тянуть компонент в lib).
const CONNECTIONS_CHANGED_EVENT = 'kaspi-shop-connections-changed'

type Store = { counts: MenuCounts; fetchedAt: number; userId: string | null }

let store: Store = { counts: EMPTY_MENU_COUNTS, fetchedAt: 0, userId: null }
let inflight: Promise<void> | null = null
// Bumped on every reset: a request that started before a reset (store connect /
// disconnect, user change) must not write its result over the newer state.
let generation = 0
// Тариф проверяется один раз на пользователя: без Про запросов к серверу нет вообще.
let accessCache: { userId: string; ok: boolean } | null = null
const listeners = new Set<() => void>()

function setStore(next: Store) {
  const changed = next.counts !== store.counts
  store = next
  if (changed) listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => store.counts
/** Current cached counts (for tests; components use useKaspiMenuCounts). */
export const getMenuCountsSnapshot = getSnapshot
const getServerSnapshot = () => EMPTY_MENU_COUNTS

/** Забыть всё (смена пользователя / магазина): числа чужого магазина показывать нельзя. */
export function resetMenuCounts() {
  generation++
  inflight = null
  setStore({ counts: EMPTY_MENU_COUNTS, fetchedAt: 0, userId: null })
}

async function doRefresh(): Promise<void> {
  const gen = generation
  const { data: { session } } = await supabase.auth.getSession()
  if (gen !== generation) return
  if (!session) { resetMenuCounts(); return }
  const userId = session.user.id
  if (store.userId !== userId) setStore({ counts: EMPTY_MENU_COUNTS, fetchedAt: 0, userId })

  if (accessCache?.userId !== userId) {
    // Сбой чтения профиля -- не повод скрывать числа: сервер всё равно сам проверяет тариф.
    const { data: profile, error } = await supabase.from('profiles').select(KASPI_SHOP_PROFILE_COLUMNS).eq('id', userId).maybeSingle()
    accessCache = { userId, ok: error || !profile ? true : hasKaspiShopAccess(profile) }
    if (gen !== generation) return
  }
  if (!accessCache.ok) { setStore({ counts: EMPTY_MENU_COUNTS, fetchedAt: Date.now(), userId }); return }

  try {
    const res = await fetch('/api/kaspi-shop/menu-counts', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    })
    // 401/403/5xx: оставляем что было, но повторяем не чаще раза в минуту.
    if (gen !== generation) return // reset (store connect/disconnect, user change) while the request was in flight
    if (!res.ok) { setStore({ ...store, fetchedAt: Date.now() }); return }
    const data = await res.json().catch(() => null)
    if (gen !== generation || store.userId !== userId) return //пока шёл запрос, сменился пользователь
    if (data?.sessionExpired) {
      setStore({ counts: EMPTY_MENU_COUNTS, fetchedAt: Date.now(), userId })
      return
    }
    const merged = mergeMenuCounts(store.counts, normalizeMenuCounts(data))
    const same = merged.orders === store.counts.orders && merged.refunds === store.counts.refunds && merged.pendingProducts === store.counts.pendingProducts
    setStore({ counts: same ? store.counts : merged, fetchedAt: Date.now(), userId })
  } catch {
    if (gen !== generation) return
    setStore({ ...store, fetchedAt: Date.now() })
  }
}

/** Обновить, если данные старше 60 с (или force). Параллельные вызовы делят один запрос. */
export function refreshMenuCounts(force = false): Promise<void> {
  if (inflight) return inflight
  if (!force && store.fetchedAt > 0 && Date.now() - store.fetchedAt < MENU_COUNTS_STALE_MS) return Promise.resolve()
  const p = doRefresh().finally(() => { if (inflight === p) inflight = null })
  inflight = p
  return p
}

/**
 * Числа для меню. enabled=false (не Kaspi Bot / магазин не подключён) -- ни одного запроса.
 * routeKey и menuOpen только запускают проверку свежести: реальный запрос уходит
 * не чаще раза в минуту.
 */
export function useKaspiMenuCounts(enabled: boolean, routeKey: string, menuOpen: boolean): MenuCounts {
  const counts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (!enabled) return
    void refreshMenuCounts()
  }, [enabled, routeKey, menuOpen])

  useEffect(() => {
    if (!enabled) return
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshMenuCounts() }
    // Магазин подключили/сменили/отключили: старые числа относились к другому кабинету.
    const onConnections = () => { resetMenuCounts(); void refreshMenuCounts(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, onConnections)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && store.userId && session.user.id !== store.userId)) resetMenuCounts()
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, onConnections)
      sub.subscription.unsubscribe()
    }
  }, [enabled])

  return enabled ? counts : EMPTY_MENU_COUNTS
}
