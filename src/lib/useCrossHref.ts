'use client'
import { useSyncExternalStore } from 'react'
import { crossProductHref } from './crossProduct'
import type { ProductKey } from './products'

const noopSubscribe = () => () => {}

// Builds a link to another product with a way back. Reads the host in the
// browser (server render sees '' and gets a same-host link, corrected on the
// client without a hydration mismatch).
export function useCrossHref() {
  const hostname = useSyncExternalStore(noopSubscribe, () => window.location.hostname, () => '')
  return (to: ProductKey, path: string, from: ProductKey, back: string) => crossProductHref({ to, path, from, back, hostname })
}
