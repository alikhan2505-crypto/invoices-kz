import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendTelegramNotification = vi.fn(async () => {})
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: (...a: unknown[]) => (sendTelegramNotification as any)(...a) }))
// after() вне запроса Next бросает -- модуль тогда запускает промис сам.
vi.mock('next/server', () => ({ after: () => { throw new Error('outside request') } }))

import {
  proLapsedAlertLink, proLapsedAlertTexts, shouldSendProLapsedAlert, notifyOwnerProLapsed,
  storeInboundWithoutReply, handleInboundWithoutReply, lapsedPlaceholder,
  PRO_LAPSED_ALERT_INTERVAL_MS, PRO_LAPSED_ALERT_TITLE, PRO_LAPSED_ALERT_TELEGRAM_TIMEOUT_MS,
} from './lapsedInbound'

function fakeSupabase(opts: {
  recent?: unknown[]
  insertError?: { message: string; code?: string } | null
  messageInsertError?: { message: string; code?: string } | null
  conversation?: { id: string } | null
  profile?: unknown
}) {
  const inserted: { table: string; row: any }[] = []
  const upserted: { table: string; row: any; opts: any }[] = []
  return {
    inserted,
    upserted,
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b, in: () => b, gte: () => b, order: () => b,
        limit: async () => ({ data: opts.recent ?? [], error: null }),
        maybeSingle: async () => ({ data: table === 'profiles' ? opts.profile ?? null : null, error: null }),
        single: async () => ({ data: opts.conversation === undefined ? { id: 'c1' } : opts.conversation, error: null }),
        upsert: (row: unknown, o: unknown) => { upserted.push({ table, row, opts: o }); return b },
        insert: async (row: unknown) => {
          inserted.push({ table, row })
          const err = table === 'ai_agent_messages' ? opts.messageInsertError : opts.insertError
          return { error: err ?? null }
        },
      }
      return b
    },
  }
}

describe('lapsedPlaceholder', () => {
  it('подпись по типу, неизвестное -- «Вложение»', () => {
    expect(lapsedPlaceholder('image')).toBe('[Фото]')
    expect(lapsedPlaceholder('audio')).toBe('[Голосовое сообщение]')
    expect(lapsedPlaceholder('sticker')).toBe('[Стикер]')
    expect(lapsedPlaceholder('ig_reel')).toBe('[Вложение]')
    expect(lapsedPlaceholder(undefined)).toBe('[Вложение]')
  })
})

describe('proLapsedAlertLink', () => {
  it('ведёт на invoices.kz/upgrade, своя для каждого агента (ключ дедупа)', () => {
    const link = proLapsedAlertLink('a1')
    expect(link.startsWith('https://invoices.kz/upgrade?')).toBe(true)
    expect(link).toContain('agent=a1')
    expect(link).not.toBe(proLapsedAlertLink('a2'))
  })
})

describe('shouldSendProLapsedAlert', () => {
  const now = new Date('2026-10-16T12:00:00.000Z')
  it('раз в сутки на агента', () => {
    expect(shouldSendProLapsedAlert(null, now)).toBe(true)
    expect(shouldSendProLapsedAlert(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(false)
    expect(shouldSendProLapsedAlert(new Date(now.getTime() - PRO_LAPSED_ALERT_INTERVAL_MS).toISOString(), now)).toBe(true)
  })
})

describe('proLapsedAlertTexts', () => {
  it('экранирует имя в Telegram-тексте', () => {
    const t = proLapsedAlertTexts({ id: 'a1', user_id: 'u1', name: '<Салон>' }, 'https://invoices.kz/upgrade?a=1&b=2')
    expect(t.title).toBe(PRO_LAPSED_ALERT_TITLE)
    expect(t.telegram).toContain('&lt;Салон&gt;')
    expect(t.telegram).toContain('&amp;b=2')
  })
})

describe('notifyOwnerProLapsed', () => {
  const now = new Date('2026-10-16T12:00:00.000Z')
  const agent = { id: 'a1', user_id: 'u1', name: 'Салон' }
  beforeEach(() => sendTelegramNotification.mockClear())

  it('колокольчик, потом Telegram с таймаутом', async () => {
    const sb = fakeSupabase({ profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerProLapsed(sb as any, agent, now)
    expect(sb.inserted).toHaveLength(1)
    expect(sb.inserted[0].row.link).toBe(proLapsedAlertLink('a1'))
    expect((sendTelegramNotification.mock.calls[0] as unknown[])[2]).toEqual({ timeoutMs: PRO_LAPSED_ALERT_TELEGRAM_TIMEOUT_MS })
  })

  it('в течение суток после прошлого -- молчит', async () => {
    const sb = fakeSupabase({ recent: [{ created_at: new Date(now.getTime() - 60_000).toISOString() }], profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerProLapsed(sb as any, agent, now)
    expect(sb.inserted).toHaveLength(0)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
  })

  it('не вставился колокольчик -- без Telegram', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sb = fakeSupabase({ insertError: { message: 'boom' }, profile: { telegram_chat_id: '42', notify_telegram: true } })
    await notifyOwnerProLapsed(sb as any, agent, now)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('storeInboundWithoutReply', () => {
  const base = { agentId: 'a1', channel: 'instagram' as const, externalThreadId: 't1', customerHandle: 'ivan', text: 'Привет', externalId: 'm1' }

  it('тот же upsert диалога, что в обработчиках, и входящее с external_id', async () => {
    const sb = fakeSupabase({})
    expect(await storeInboundWithoutReply(sb as any, { ...base, source: 'comment' })).toBe(true)
    expect(sb.upserted[0].row).toEqual({ agent_id: 'a1', channel: 'instagram', external_thread_id: 't1', customer_handle: 'ivan', source: 'comment' })
    expect(sb.upserted[0].opts).toEqual({ onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    expect(sb.inserted[0]).toEqual({ table: 'ai_agent_messages', row: { conversation_id: 'c1', direction: 'inbound', text: 'Привет', external_id: 'm1' } })
  })

  it('дубль (23505) -- не ошибка, но и не «вставлено»', async () => {
    const sb = fakeSupabase({ messageInsertError: { message: 'dup', code: '23505' } })
    expect(await storeInboundWithoutReply(sb as any, base)).toBe(false)
  })

  it('ни ответа, ни списаний: пишет только диалог и входящее', async () => {
    const sb = fakeSupabase({})
    await storeInboundWithoutReply(sb as any, base)
    expect(sb.inserted.map(i => i.table)).toEqual(['ai_agent_messages'])
    expect(sb.inserted.every(i => i.row.direction === 'inbound')).toBe(true)
  })
})

describe('handleInboundWithoutReply', () => {
  beforeEach(() => sendTelegramNotification.mockClear())
  const agent = { id: 'a1', user_id: 'u1', name: 'Салон' }
  const p = { agentId: 'a1', channel: 'whatsapp' as const, externalThreadId: '7701', customerHandle: 'Иван', text: 'Есть?', externalId: 'wamid.1' }

  it('lapsed -- сохраняет и напоминает владельцу', async () => {
    const sb = fakeSupabase({ profile: { telegram_chat_id: '42', notify_telegram: true } })
    await handleInboundWithoutReply(sb as any, 'lapsed', agent, p)
    await new Promise(r => setTimeout(r, 0))
    const bell = sb.inserted.filter(i => i.table === 'app_notifications')
    expect(bell).toHaveLength(1)
  })

  it('unknown (сбой профиля) -- сохраняет, но без «Про кончился»', async () => {
    const sb = fakeSupabase({})
    await handleInboundWithoutReply(sb as any, 'unknown', agent, p)
    await new Promise(r => setTimeout(r, 0))
    expect(sb.inserted.filter(i => i.table === 'ai_agent_messages')).toHaveLength(1)
    expect(sb.inserted.filter(i => i.table === 'app_notifications')).toHaveLength(0)
  })
})
