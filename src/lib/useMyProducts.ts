'use client'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { loadSupabase } from './lazySupabase'
import { mightHaveStoredSession } from './hasStoredSession'
import { parseMyProducts, serializeMyProducts, type ProductKey } from './products'

// Which products are connected to this account (menu shows only these). The
// source of truth is profiles.enabled_products, so it follows the person across
// subdomains; localStorage is only a per-host cache for the first paint. It's a
// display preference, not a permission -- nothing here grants or removes access.
const KEY = 'my_products'
const EVENT = 'my-products-changed'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

// The raw string is the snapshot (a stable primitive), parsed afterwards --
// parsing inside getSnapshot would return a new array every call and loop.
function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    // Private mode / blocked storage: behave as "never chose".
    return null
  }
}

function getServerSnapshot(): string | null {
  return null
}

// «Список аккаунта уже получен» -- отдельный от самого списка сигнал: null в
// кэше значит и «ещё не загрузили», и «человек ничего не выбирал», а меню в
// этих двух случаях должно вести себя по-разному (см. isSectionVisible).
let profileLoaded = false
function markLoaded() {
  if (profileLoaded) return
  profileLoaded = true
  window.dispatchEvent(new Event(EVENT))
}
function getLoadedSnapshot(): boolean {
  return profileLoaded
}
function getServerLoadedSnapshot(): boolean {
  return false
}

function writeCache(raw: string | null) {
  try {
    if (raw === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, raw)
  } catch {
    // Private mode: the event below still updates this tab.
  }
  window.dispatchEvent(new Event(EVENT))
}

// Pull the account's list once per page load and refresh the cache. A signed-out
// browser drops the cache, so one person's choice never shows up for the next.
let refreshed: Promise<void> | null = null
function refreshFromProfile(): Promise<void> {
  if (!refreshed) {
    refreshed = (async () => {
      // No stored login: nothing to fetch, so supabase-js is never downloaded.
      if (!mightHaveStoredSession()) { writeCache(null); markLoaded(); return }
      const supabase = await loadSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { writeCache(null); markLoaded(); return }
      const { data } = await supabase.from('profiles').select('enabled_products').eq('id', user.id).single()
      const list = Array.isArray(data?.enabled_products) ? (data.enabled_products as string[]) : null
      writeCache(list ? serializeMyProducts(list as ProductKey[]) : null)
      markLoaded()
    })().catch(() => {
      refreshed = null
      // Сеть не ответила: дальше ждать нечего, меню показывает то, что есть в кэше.
      markLoaded()
    })
  }
  return refreshed
}

// Opening a product's section connects it to the account ("go there and it's
// yours"). Re-reads the account's list first, so a stale per-host cache can
// never overwrite it with an older one.
export async function connectProduct(key: ProductKey): Promise<void> {
  await refreshFromProfile()
  const supabase = await loadSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase.from('profiles').select('enabled_products').eq('id', user.id).single()
  const list = data?.enabled_products
  if (Array.isArray(list) && list.includes(key)) return
  // A new account has no list yet: the first product it opens becomes its only one.
  const next = Array.isArray(list) ? [...(list as ProductKey[]), key] : [key]
  await supabase.from('profiles').update({ enabled_products: next }).eq('id', user.id)
  writeCache(serializeMyProducts(next))
}

// Третий элемент -- ready: список известен (есть кэш с прошлого визита или
// ответ профиля уже пришёл). Пока false, mine === null значит «не знаем», а не
// «ничего не выбирал».
export function useMyProducts(): [ProductKey[] | null, (next: ProductKey[]) => void, boolean] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const loaded = useSyncExternalStore(subscribe, getLoadedSnapshot, getServerLoadedSnapshot)
  const mine = useMemo(() => parseMyProducts(raw), [raw])
  useEffect(() => { void refreshFromProfile() }, [])
  const save = useCallback((next: ProductKey[]) => {
    writeCache(serializeMyProducts(next))
    void loadSupabase().then((supabase) => supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) void supabase.from('profiles').update({ enabled_products: next }).eq('id', user.id)
    }))
  }, [])
  return [mine, save, mine !== null || loaded]
}
