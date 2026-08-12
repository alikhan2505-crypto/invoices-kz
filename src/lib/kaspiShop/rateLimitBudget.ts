// Kaspi allows at most 250 price/stock/preorder changes per rolling
// 30-minute window per connection -- exceeding it blocks all changes for
// 30 minutes (confirmed via competitor documentation, 2026-08-12). This
// module tracks nothing itself; the caller supplies the connection's
// recent change timestamps (ms since epoch) and gets back how much
// budget is left right now.
export const KASPI_RATE_LIMIT_MAX = 250
export const KASPI_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000

export function remainingBudget(changeTimestamps: number[], now: number): number {
  const withinWindow = changeTimestamps.filter(t => now - t < KASPI_RATE_LIMIT_WINDOW_MS).length
  return Math.max(0, KASPI_RATE_LIMIT_MAX - withinWindow)
}

export function isWithinBudget(changeTimestamps: number[], now: number): boolean {
  return remainingBudget(changeTimestamps, now) > 0
}
