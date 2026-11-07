import { describe, it, expect, vi, beforeEach } from 'vitest'

// Предупреждение «баланс меньше 5 ₸: бот не меняет цены» (правило основателя
// 07.11.2026): раз в сутки на владельца, колокольчиком, без Telegram-дубля
// дневной сводки. Счётчик windowLimits и колокольчик подменены.
const h = vi.hoisted(() => ({
  claims: [] as string[],
  claimResult: { ok: true, used: 1 } as any,
  notifications: [] as any[],
  notifyThrows: false,
}))

vi.mock('@/lib/windowLimits', async () => {
  const actual = await vi.importActual<typeof import('@/lib/windowLimits')>('@/lib/windowLimits')
  return {
    ...actual,
    claimWindowSlot: async (_s: unknown, key: string) => {
      h.claims.push(key)
      // Первый захват ключа удаётся, повторный в те же сутки -- limit.
      if (h.claimResult.ok && h.claims.filter(k => k === key).length > 1) return { ok: false, reason: 'limit' }
      return h.claimResult
    },
  }
})
vi.mock('@/lib/notifications', () => ({
  createNotification: async (userId: string, title: string, body?: string, link?: string) => {
    if (h.notifyThrows) throw new Error('bell down')
    h.notifications.push({ userId, title, body, link })
  },
}))

import {
  notifyLowBalanceOwner, notifyLowBalanceOwners, LOW_BALANCE_NOTICE_TITLE, LOW_BALANCE_NOTICE_BODY, LOW_BALANCE_NOTICE_LINK,
} from './lowBalanceNotice'

const DAY = 24 * 3_600_000
const T0 = Date.UTC(2026, 10, 7, 10, 0, 0)

beforeEach(() => {
  h.claims = []
  h.claimResult = { ok: true, used: 1 }
  h.notifications = []
  h.notifyThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyLowBalanceOwner', () => {
  it('sends one bell notice in the new model words: balance below 5, bot cannot change prices, checks are free', async () => {
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0)).toBe('sent')
    expect(h.notifications).toEqual([{ userId: 'u1', title: LOW_BALANCE_NOTICE_TITLE, body: LOW_BALANCE_NOTICE_BODY, link: LOW_BALANCE_NOTICE_LINK }])
    expect(LOW_BALANCE_NOTICE_TITLE).toBe('Баланс меньше 5 ₸: Kaspi Bot не меняет цены')
    expect(LOW_BALANCE_NOTICE_BODY).toContain('Проверки бесплатны, 5 ₸ списывается только за каждое изменение цены ботом.')
    expect(LOW_BALANCE_NOTICE_LINK).toBe('/kaspi-shop')
  })

  it('once per day: the runs every 10 minutes of the same day stay silent, the next day tells again', async () => {
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0)).toBe('sent')
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0 + 10 * 60_000)).toBe('duplicate')
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0 + 3 * 3_600_000)).toBe('duplicate')
    expect(h.notifications).toHaveLength(1)
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0 + DAY)).toBe('sent')
    expect(h.notifications).toHaveLength(2)
  })

  it('the slot is per owner: another owner is told in the same day', async () => {
    await notifyLowBalanceOwner({} as any, 'u1', T0)
    await notifyLowBalanceOwner({} as any, 'u2', T0)
    expect(h.notifications.map(n => n.userId)).toEqual(['u1', 'u2'])
  })

  it('a broken counter stays silent instead of spamming every run', async () => {
    h.claimResult = { ok: false, reason: 'error' }
    expect(await notifyLowBalanceOwner({} as any, 'u1', T0)).toBe('failed')
    expect(h.notifications).toHaveLength(0)
  })

  it('never throws: a failing bell is a quiet failure', async () => {
    h.notifyThrows = true
    await expect(notifyLowBalanceOwner({} as any, 'u1', T0)).resolves.toBe('failed')
  })
})

describe('notifyLowBalanceOwners', () => {
  it('walks every owner, one notice each', async () => {
    await notifyLowBalanceOwners({} as any, ['u1', 'u2', 'u3'], T0)
    expect(h.notifications.map(n => n.userId)).toEqual(['u1', 'u2', 'u3'])
  })
})
