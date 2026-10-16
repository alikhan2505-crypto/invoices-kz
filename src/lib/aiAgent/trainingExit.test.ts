import { describe, it, expect, vi, beforeEach } from 'vitest'

const createNotification = vi.fn(async () => {})
const sendTelegramNotification = vi.fn(async () => {})
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => (createNotification as any)(...a) }))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: (...a: unknown[]) => (sendTelegramNotification as any)(...a) }))

import { exitTrainingIfDue, trainingExitNotificationTitle, trainingExitSettingsUrl } from './trainingExit'
import { TRAINING_MESSAGE_THRESHOLD } from './trainingStatus'

// Minimal chainable stand-in for the supabase-js query builder: every method
// returns the same builder, awaiting it (or .maybeSingle()) yields the
// table's canned result.
function fakeSupabase(results: Record<string, unknown>) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  return {
    calls,
    from(table: string) {
      const result = { data: results[table] ?? null, error: null }
      const builder: any = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => void) => res(result)
          if (prop === 'maybeSingle' || prop === 'single') return async () => result
          return (...args: unknown[]) => { calls.push({ table, method: String(prop), args }); return builder }
        },
      })
      return builder
    },
  }
}

const now = new Date('2026-10-16T12:00:00.000Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()

describe('exitTrainingIfDue', () => {
  beforeEach(() => {
    createNotification.mockClear()
    sendTelegramNotification.mockClear()
  })

  it('keeps an old agent with no drafts in training and never touches the row', async () => {
    const sb = fakeSupabase({ ai_agent_messages: [], ai_agents: [{ id: 'a1' }] })
    const agent = { id: 'a1', user_id: 'u1', name: 'Салон', status: 'training', training_started_at: daysAgo(30), training_message_count: 0 }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(false)
    expect(sb.calls.some(c => c.table === 'ai_agents' && c.method === 'update')).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('does not even look for drafts while the agent is younger than the threshold', async () => {
    const sb = fakeSupabase({ ai_agent_messages: [{ created_at: daysAgo(3) }] })
    const agent = { id: 'a1', user_id: 'u1', name: 'Салон', status: 'training', training_started_at: daysAgo(3), training_message_count: 0 }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(false)
    expect(sb.calls.some(c => c.table === 'ai_agent_messages')).toBe(false)
  })

  it('exits a week after the first draft and notifies the owner (bell + Telegram)', async () => {
    const sb = fakeSupabase({
      ai_agent_messages: [{ created_at: daysAgo(8) }],
      ai_agents: [{ id: 'a1' }],
      profiles: { telegram_chat_id: '42', notify_telegram: true },
    })
    const agent = { id: 'a1', user_id: 'u1', name: 'Салон <Люкс>', status: 'training', training_started_at: daysAgo(30), training_message_count: 1 }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(true)
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [userId, title, , link] = createNotification.mock.calls[0] as unknown as string[]
    expect(userId).toBe('u1')
    expect(title).toBe('Агент «Салон <Люкс>» вышел из обучения и теперь отвечает клиентам сам')
    expect(link).toBe('https://agent.invoices.kz/ai-agent/settings?agent=a1&tab=control')
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1)
    const [chatId, text] = sendTelegramNotification.mock.calls[0] as unknown as string[]
    expect(chatId).toBe('42')
    expect(text).toContain('Салон &lt;Люкс&gt;')
    expect(text).toContain('https://agent.invoices.kz/ai-agent/settings?agent=a1&amp;tab=control')
  })

  it('does not notify when another request already flipped the agent (conditional update matched nothing)', async () => {
    const sb = fakeSupabase({ ai_agent_messages: [{ created_at: daysAgo(8) }], ai_agents: [] })
    const agent = { id: 'a1', user_id: 'u1', name: 'Салон', status: 'training', training_started_at: daysAgo(30), training_message_count: 1 }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('exits on the approval threshold without a draft lookup; no Telegram when not connected', async () => {
    const sb = fakeSupabase({ ai_agents: [{ id: 'a1' }], profiles: { telegram_chat_id: null, notify_telegram: false } })
    const agent = { id: 'a1', user_id: 'u1', name: null, status: 'training', training_started_at: daysAgo(1), training_message_count: TRAINING_MESSAGE_THRESHOLD }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(true)
    expect(sb.calls.some(c => c.table === 'ai_agent_messages')).toBe(false)
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
  })

  it('ignores agents that are not in training', async () => {
    const sb = fakeSupabase({ ai_agent_messages: [{ created_at: daysAgo(30) }], ai_agents: [{ id: 'a1' }] })
    const agent = { id: 'a1', user_id: 'u1', name: 'X', status: 'active', training_started_at: daysAgo(30), training_message_count: 0 }
    expect(await exitTrainingIfDue(sb as any, agent, now)).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe('training exit texts', () => {
  it('falls back to a generic name', () => {
    expect(trainingExitNotificationTitle('  ')).toBe('Агент «ИИ-агент» вышел из обучения и теперь отвечает клиентам сам')
  })
  it('links to the agent settings on agent.invoices.kz', () => {
    expect(trainingExitSettingsUrl('x y')).toBe('https://agent.invoices.kz/ai-agent/settings?agent=x+y&tab=control')
  })
})
