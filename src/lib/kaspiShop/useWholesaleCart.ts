'use client'
import { useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey(slug))
      if (raw) setLines(JSON.parse(raw))
    } catch {
      // Corrupt/blocked storage -- start with an empty cart rather than crash.
    }
    setLoaded(true)
  }, [slug])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(cartStorageKey(slug), JSON.stringify(lines)) } catch {}
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
