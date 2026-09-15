'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export type WholesaleCartLine = {
  key: string
  modelId: string
  modelName: string
  size: string
  color: string
  price: number
  imageUrl: string | null
  qty: number
  customOrder: boolean
}

const MAX_LINE_QTY = 999

function cartStorageKey(slug: string): string {
  return `invoiceskz_shop_wholesale_cart_${slug}`
}

function lineKey(modelId: string, size: string, color: string): string {
  return `${modelId}:${size}:${color}`
}

// The model-detail page (which calls addLine) and WholesaleCartBar (which
// displays the floating bar) are separate components, each with their own
// useWholesaleCart() call and so their own independent React state -- the
// native `storage` event only fires in OTHER tabs/windows, never the one
// that made the write, so without this a same-page add-to-cart left the
// floating bar showing stale (empty) state until a reload or navigation
// (confirmed live during Task 13's end-to-end check). A custom event, fired
// after every localStorage write and listened for by every instance on the
// same page, keeps them in sync within one page load.
const CART_CHANGED_EVENT = 'wholesale-cart-changed'

// Cart lines are stored denormalized (full name/price/image, not just an id)
// -- unlike the existing flat storefront cart (shop/[slug]/page.tsx), which
// re-derives display data from one already-fetched product list, a
// wholesale cart line comes from a specific model's DETAIL page (its own
// fetch), so there's no single in-memory list to look the line back up in
// once the buyer has navigated elsewhere (e.g. back to /catalog). Re-priced
// server-side at checkout regardless (see resolveWholesaleLine) -- what's
// stored here is display-only.
export function useWholesaleCart(slug: string) {
  const [lines, setLines] = useState<WholesaleCartLine[]>([])
  const [loaded, setLoaded] = useState(false)
  // The exact JSON string this instance itself last wrote -- lets the event
  // listener below tell "another instance changed the cart" (raw differs,
  // must re-render) apart from "I'm hearing the echo of my own write" (raw
  // is identical, skip). Without this a self-dispatched event would setLines
  // to a new-but-equal array, which changes reference, re-triggers the write
  // effect, dispatches again, and loops forever.
  const lastWrittenRef = useRef<string | null>(null)

  const readFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey(slug))
      if (raw === lastWrittenRef.current) return
      setLines(raw ? JSON.parse(raw) : [])
    } catch {
      // Corrupt/blocked storage -- fall back to an empty cart rather than crash.
      setLines([])
    }
  }, [slug])

  useEffect(() => {
    readFromStorage()
    setLoaded(true)
    window.addEventListener(CART_CHANGED_EVENT, readFromStorage)
    return () => window.removeEventListener(CART_CHANGED_EVENT, readFromStorage)
  }, [readFromStorage])

  useEffect(() => {
    if (!loaded) return
    try {
      const raw = JSON.stringify(lines)
      lastWrittenRef.current = raw
      localStorage.setItem(cartStorageKey(slug), raw)
      window.dispatchEvent(new Event(CART_CHANGED_EVENT))
    } catch {}
  }, [lines, loaded, slug])

  const addLine = useCallback((line: WholesaleCartLine) => {
    setLines(prev => {
      const key = lineKey(line.modelId, line.size, line.color)
      const existing = prev.find(l => l.key === key)
      if (existing) {
        return prev.map(l => l.key === key ? { ...l, qty: Math.min(l.qty + line.qty, MAX_LINE_QTY) } : l)
      }
      return [...prev, { ...line, key, qty: Math.min(line.qty, MAX_LINE_QTY) }]
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines(prev => {
      if (qty <= 0) return prev.filter(l => l.key !== key)
      return prev.map(l => l.key === key ? { ...l, qty: Math.min(qty, MAX_LINE_QTY) } : l)
    })
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines(prev => prev.filter(l => l.key !== key))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return { lines, count, total, addLine, setQty, removeLine, clear }
}
