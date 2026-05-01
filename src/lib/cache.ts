export function cacheSet(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

export function cacheGet(key: string, maxAgeMs = 60000) {
  try {
    const item = localStorage.getItem(key)
    if (!item) return null
    const { data, ts } = JSON.parse(item)
    if (Date.now() - ts > maxAgeMs) return null
    return data
  } catch { return null }
}

export function cacheClear(key: string) {
  try { localStorage.removeItem(key) } catch {}
}