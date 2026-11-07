import { describe, it, expect } from 'vitest'
import { isCheckDue } from './checkCycle'

// Pure-predicate coverage for the shared due/not-due logic used by both
// getDueTrackedProducts (global, cron-secret-gated) and the "Готовы
// применить" stat on GET /api/kaspi-shop/products (per-user). Everything
// else in checkCycle.ts talks to Supabase directly and isn't unit-testable
// without a live/mocked DB, matching the rest of this file's existing test
// coverage (see rateLimitBudget.test.ts for the same pure-function pattern).
describe('isCheckDue', () => {
  it('is due when there is no prior check', () => {
    expect(isCheckDue(null, 15, 1_000_000)).toBe(true)
  })

  it('is not due before the configured frequency has elapsed', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 5 * 60_000).toISOString() // 5 min ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(false)
  })

  it('is due once the configured frequency has elapsed', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 15 * 60_000).toISOString() // exactly 15 min ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(true)
  })

  it('is due when well past the configured frequency', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 60 * 60_000).toISOString() // 1 hour ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(true)
  })
})

// Правило основателя 07.11.2026: проверка раз в час по умолчанию. «60» должно
// означать раз в час на деле: запуски идут раз в 10 минут, last_checked_at пишется
// внутри запуска, и товар, записанный чуть после тика, обязан созреть на тике через
// час, а не через 70 минут (пока порог был ровно 60, подпись «70» была правдой).
describe('isCheckDue: частота 60 минут = раз в час', () => {
  const MIN = 60_000
  const lastCheckedAt = new Date(3 * MIN).toISOString() // запись через 3 минуты после тика

  it('на тике через 50 минут ещё рано', () => {
    expect(isCheckDue(lastCheckedAt, 60, 50 * MIN)).toBe(false)
  })

  it('на тике через 60 минут после тика записи товар уже созрел', () => {
    expect(isCheckDue(lastCheckedAt, 60, 60 * MIN)).toBe(true)
  })

  it('запись в самом конце запуска (9 минут после тика) тоже созревает ровно через час', () => {
    const late = new Date(9 * MIN).toISOString()
    expect(isCheckDue(late, 60, 60 * MIN)).toBe(true)
    expect(isCheckDue(late, 60, 50 * MIN)).toBe(false)
  })

  it('частота 15 по-прежнему означает второй тик (20 минут), а не первый', () => {
    expect(isCheckDue(lastCheckedAt, 15, 10 * MIN)).toBe(false)
    expect(isCheckDue(lastCheckedAt, 15, 20 * MIN)).toBe(true)
  })

  it('мусорная частота считается значением по умолчанию (60), а не «никогда»', () => {
    expect(isCheckDue(lastCheckedAt, NaN as any, 60 * MIN)).toBe(true)
    expect(isCheckDue(lastCheckedAt, NaN as any, 20 * MIN)).toBe(false)
  })
})
