import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendTelegramNotification = vi.fn(async () => {})
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: (...a: unknown[]) => (sendTelegramNotification as any)(...a) }))

import {
  shouldSendBudgetAlert, budgetAlertLink, budgetAlertTexts, notifyOwnerBudgetDepleted,
  BUDGET_ALERT_INTERVAL_MS, BUDGET_ALERT_TITLE, BUDGET_ALERT_TITLE_TRAINING, BUDGET_ALERT_TELEGRAM_TIMEOUT_MS,
} from './budgetAlert'

describe('shouldSendBudgetAlert', () => {
  const now = new Date('2026-10-15T12:00:00.000Z')

  it('alerts on the first substitution', () => {
    expect(shouldSendBudgetAlert(null, now)).toBe(true)
  })

  it('stays quiet within a day of the last alert', () => {
    expect(shouldSendBudgetAlert(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(false)
    expect(shouldSendBudgetAlert(new Date(now.getTime() - BUDGET_ALERT_INTERVAL_MS + 1000).toISOString(), now)).toBe(false)
  })

  it('alerts again once a day has passed', () => {
    expect(shouldSendBudgetAlert(new Date(now.getTime() - BUDGET_ALERT_INTERVAL_MS).toISOString(), now)).toBe(true)
  })

  it('treats an unreadable timestamp as no previous alert', () => {
    expect(shouldSendBudgetAlert('not-a-date', now)).toBe(true)
  })
})

describe('budgetAlertLink', () => {
  it('is per agent and opens that agent on the Контроль tab (wallet card)', () => {
    expect(budgetAlertLink('a1')).toBe('/ai-agent/settings?agent=a1&tab=control')
    expect(budgetAlertLink('a1')).not.toBe(budgetAlertLink('a2'))
  })
})

describe('budgetAlertTexts', () => {
  it('says customers get the canned text when the agent is active', () => {
    const t = budgetAlertTexts({ id: 'a1', user_id: 'u1', name: 'Салон', status: 'active' }, 'https://agent.invoices.kz/x?a=1&b=2')
    expect(t.title).toBe(BUDGET_ALERT_TITLE)
    expect(t.body).toContain('клиенты получают')
    expect(t.telegram).toContain('&amp;b=2')
  })

  it('says customers get nothing and the draft is the canned text while in training', () => {
    const t = budgetAlertTexts({ id: 'a1', user_id: 'u1', name: '<Салон>', status: 'training' }, 'https://agent.invoices.kz/x')
    expect(t.title).toBe(BUDGET_ALERT_TITLE_TRAINING)
    expect(t.body).toContain('клиенты пока ничего не получают')
    expect(t.body).not.toContain('клиенты получают «')
    expect(t.telegram).toContain('&lt;Салон&gt;')
  })
})

function fakeSupabase(opts: { recent?: unknown[]; insertError?: string | null; profile?: unknown }) {
  const inserted: unknown[] = []
  return {
    inserted,
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b, in: () => b, gte: () => b, order: () => b,
        limit: async () => ({ data: opts.recent ?? [], error: null }),
        maybeSingle: async () => ({ data: table === 'profiles' ? opts.profile ?? null : null, error: null }),
        insert: async (row: unknown) => { inserted.push(row); return { error: opts.insertError ? { message: opts.insertError } : null } },
      }
      return b
    },
  }
}

describe('notifyOwnerBudgetDepleted', () => {
  const now = new Date('2026-10-15T12:00:00.000Z')
  const agent = { id: 'a1', user_id: 'u1', name: 'Салон', status: 'active' }
  beforeEach(() => sendTelegramNotification.mockClear())

  it('sends Telegram (with a timeout) only after the bell row was inserted', async () => {
    const sb = fakeSupabase({ profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerBudgetDepleted(sb as any, agent, now)
    expect(sb.inserted).toHaveLength(1)
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1)
    expect((sendTelegramNotification.mock.calls[0] as unknown[])[2]).toEqual({ timeoutMs: BUDGET_ALERT_TELEGRAM_TIMEOUT_MS })
  })

  it('skips Telegram when the bell insert failed (no dedupe mark = would spam)', async () => {
    const sb = fakeSupabase({ insertError: 'boom', profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerBudgetDepleted(sb as any, agent, now)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
  })

  it('stays quiet within a day of the previous alert', async () => {
    const sb = fakeSupabase({ recent: [{ created_at: new Date(now.getTime() - 60_000).toISOString() }], profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerBudgetDepleted(sb as any, agent, now)
    expect(sb.inserted).toHaveLength(0)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
  })
})
