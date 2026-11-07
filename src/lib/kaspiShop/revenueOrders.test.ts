import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  almatyDateOf, almatyDayStartMs, windowStartForDays, parseSinceDate, shiftAlmatyDate,
} from './almatyDates'
import { fetchRevenueOrders, clearRevenueOrdersCache } from './revenueOrders'
import type { Order } from './cabinetApi'

function makeOrder(code: string, creationTime: string, totalPrice = 100): Order {
  return { code, status: 'TRANSMITTED', customerFirstName: 'T', customerLastName: 'T', totalPrice, creationTime, cityId: null, cityName: null, plannedDeliveryDate: null, items: [] }
}

// Страница из 10 заказов с заданными моментами (мс), по убыванию или возрастанию.
function pageOf(prefix: string, startMs: number, stepMs: number): Order[] {
  return Array.from({ length: 10 }, (_, i) => makeOrder(`${prefix}-${i}`, new Date(startMs + i * stepMs).toISOString()))
}

describe('сутки и периоды по Алматы (аудит K37)', () => {
  it('almatyDateOf: заказ в 21:30Z относится уже к следующей дате по Алматы', () => {
    expect(almatyDateOf(Date.parse('2026-11-05T21:30:00Z'))).toBe('2026-11-06')
    expect(almatyDateOf(Date.parse('2026-11-05T18:59:59Z'))).toBe('2026-11-05')
  })

  it('almatyDayStartMs: начало суток это 00:00 по Алматы, то есть 19:00Z накануне', () => {
    expect(new Date(almatyDayStartMs(Date.parse('2026-11-06T10:00:00Z'))).toISOString()).toBe('2026-11-05T19:00:00.000Z')
    // 02:30 по Алматы 6 ноября (21:30Z 5 ноября): сутки уже шестого
    expect(new Date(almatyDayStartMs(Date.parse('2026-11-05T21:30:00Z'))).toISOString()).toBe('2026-11-05T19:00:00.000Z')
  })

  it('windowStartForDays: 7 дней это сегодня и шесть предыдущих суток с 00:00 Алматы, а не скользящие 168 часов', () => {
    const now = Date.parse('2026-11-06T10:00:00Z') // 15:00 по Алматы
    expect(new Date(windowStartForDays(7, now)).toISOString()).toBe('2026-10-30T19:00:00.000Z') // 31.10 00:00 Алматы
    expect(new Date(windowStartForDays(1, now)).toISOString()).toBe('2026-11-05T19:00:00.000Z') // сегодня с 00:00
  })

  it('parseSinceDate: «с 1 ноября» начинается ровно с 00:00 по Алматы вне зависимости от часа запроса', () => {
    const morning = parseSinceDate('2026-11-01', Date.parse('2026-11-06T03:00:00Z')) // 08:00 Алматы
    const afternoon = parseSinceDate('2026-11-01', Date.parse('2026-11-06T10:00:00Z')) // 15:00 Алматы
    expect(morning).toEqual(afternoon)
    expect(morning.ok && new Date(morning.startMs).toISOString()).toBe('2026-10-31T19:00:00.000Z')
    expect(morning.ok && morning.days).toBe(6)
  })

  it('parseSinceDate отвергает будущее, мусор, несуществующие даты и период старше года', () => {
    const now = Date.parse('2026-11-06T10:00:00Z')
    expect(parseSinceDate('2026-11-07', now).ok).toBe(false)
    expect(parseSinceDate('вчера', now).ok).toBe(false)
    expect(parseSinceDate('2026-02-31', now).ok).toBe(false)
    expect(parseSinceDate('2025-01-01', now).ok).toBe(false)
    expect(parseSinceDate('2026-11-06', now).ok).toBe(true)
    expect(parseSinceDate(null, now).ok).toBe(false)
  })

  it('shiftAlmatyDate сдвигает дату по суткам Алматы', () => {
    expect(shiftAlmatyDate('2026-11-06', -5)).toBe('2026-11-01')
    expect(shiftAlmatyDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('fetchRevenueOrders', () => {
  const NOW = Date.parse('2026-11-06T10:00:00Z')
  const DAY = 86_400_000
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); clearRevenueOrdersCache() })
  afterEach(() => { vi.useRealTimers() })

  it('заказы идут от новых к старым: листание останавливается на странице, где самый старый уже старше окна (аудит K38)', async () => {
    const cutoff = NOW - 7 * DAY
    const listOrdersFn = vi.fn(async (_c: string, _m: string, status: string, page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, sessionExpired: false, failed: false, orders: [] }
      // стр.0: от «сейчас» назад по 1 суткам; стр.1: ещё глубже, последний заказ уже за окном
      const first = NOW - page * 10 * DAY
      return { total: 400, sessionExpired: false, failed: false, orders: pageOf(`p${page}`, first, -DAY) }
    })
    const r = await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any)
    // стр.0 покрывает 10 суток, самый старый заказ стр.0 это NOW-9д, он ещё в окне 7 суток? нет: 9 > 7,
    // значит остановка уже после первой страницы
    expect(listOrdersFn.mock.calls.filter(c => c[2] === 'KASPI_DELIVERY_TRANSMITTED')).toHaveLength(1)
    expect(r.truncated).toBe(false) // окно закрыто: 390 остальных заказов старше окна
    expect(r.newestFirst).toBe(true)
  })

  it('truncated считается только внутри окна: потолок страниц упёрся, а заказы всё ещё в окне', async () => {
    const cutoff = NOW - 300 * DAY
    const listOrdersFn = vi.fn(async (_c: string, _m: string, status: string, page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, sessionExpired: false, failed: false, orders: [] }
      // шаг 1 минута: за 20 страниц (200 заказов) не добираемся даже до вчерашнего дня
      return { total: 5000, sessionExpired: false, failed: false, orders: pageOf(`p${page}`, NOW - page * 10 * 60_000, -60_000) }
    })
    const r = await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any)
    expect(r.truncated).toBe(true)
    expect(r.newestFirst).toBe(true)
    expect(r.fetchedCount).toBe(200)
  })

  it('порядок «старые первыми» не принимается за «новые первыми»: листаем до потолка и честно помечаем неполноту', async () => {
    const cutoff = NOW - 7 * DAY
    const listOrdersFn = vi.fn(async (_c: string, _m: string, status: string, page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, sessionExpired: false, failed: false, orders: [] }
      // от старых к новым, все старше окна на первых страницах
      return { total: 900, sessionExpired: false, failed: false, orders: pageOf(`p${page}`, NOW - 200 * DAY + page * 10 * DAY, DAY) }
    })
    const r = await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any)
    expect(listOrdersFn.mock.calls.filter(c => c[2] === 'KASPI_DELIVERY_TRANSMITTED')).toHaveLength(20)
    expect(r.truncated).toBe(true)
    expect(r.newestFirst).toBe(false)
  })

  it('кэш: второй вызов с тем же ключом и окном не ходит в Kaspi, с другим окном или ключом ходит', async () => {
    const cutoff = NOW - 7 * DAY
    const listOrdersFn = vi.fn(async () => ({ total: 0, sessionExpired: false, failed: false, orders: [] as Order[] }))
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'conn-1' })
    const afterFirst = listOrdersFn.mock.calls.length
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'conn-1' })
    expect(listOrdersFn.mock.calls.length).toBe(afterFirst)
    await fetchRevenueOrders('c', 'm', cutoff - DAY, listOrdersFn as any, { cacheKey: 'conn-1' })
    expect(listOrdersFn.mock.calls.length).toBe(afterFirst * 2)
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'conn-2' })
    expect(listOrdersFn.mock.calls.length).toBe(afterFirst * 3)
  })

  it('кэш живёт несколько минут и истекает', async () => {
    const cutoff = NOW - 7 * DAY
    const listOrdersFn = vi.fn(async () => ({ total: 0, sessionExpired: false, failed: false, orders: [] as Order[] }))
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' })
    const n = listOrdersFn.mock.calls.length
    vi.setSystemTime(NOW + 2 * 60_000)
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' })
    expect(listOrdersFn.mock.calls.length).toBe(n)
    vi.setSystemTime(NOW + 4 * 60_000)
    await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' })
    expect(listOrdersFn.mock.calls.length).toBe(n * 2)
  })

  it('сбой Kaspi и мёртвая сессия в кэш не попадают: следующий заход пробует заново', async () => {
    const cutoff = NOW - 7 * DAY
    let failing = true
    const listOrdersFn = vi.fn(async () => (failing
      ? { total: 0, sessionExpired: false, failed: true, orders: [] as Order[] }
      : { total: 1, sessionExpired: false, failed: false, orders: [makeOrder('1', new Date(NOW - DAY).toISOString())] }))
    const bad = await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' })
    expect(bad.upstreamFailed).toBe(true)
    failing = false
    const good = await fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' })
    expect(good.upstreamFailed).toBe(false)
    expect(good.orders).toHaveLength(2) // по одному на каждый из двух статусов
  })

  it('одновременные открытия делят один обход Kaspi', async () => {
    const cutoff = NOW - 7 * DAY
    const listOrdersFn = vi.fn(async () => ({ total: 0, sessionExpired: false, failed: false, orders: [] as Order[] }))
    await Promise.all([
      fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' }),
      fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' }),
      fetchRevenueOrders('c', 'm', cutoff, listOrdersFn as any, { cacheKey: 'k' }),
    ])
    expect(listOrdersFn).toHaveBeenCalledTimes(2) // по одному вызову на статус, не по три
  })
})
