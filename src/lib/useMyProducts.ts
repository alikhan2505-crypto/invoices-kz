'use client'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { parseMyProducts, serializeMyProducts, type ProductKey } from './products'

// Which products this person wants in their menu. Stored in this browser
// (localStorage) for now: there is no column for it yet and it's a display
// preference, not a permission -- nothing here grants or removes access.
// Moving it to the profile row later means changing only this file.
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

export function useMyProducts(): [ProductKey[] | null, (next: ProductKey[]) => void] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const mine = useMemo(() => parseMyProducts(raw), [raw])
  const save = useCallback((next: ProductKey[]) => {
    try {
      localStorage.setItem(KEY, serializeMyProducts(next))
    } catch {
      // Not persisted, but the event below still updates this tab.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [mine, save]
}
