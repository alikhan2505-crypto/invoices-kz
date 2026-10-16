import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendTelegramNotification = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: (...a: unknown[]) => sendTelegramNotification(...a) }))

import {
  __resetPrefsColumnCacheForTests,
  isMissingSchemaError,
  loadNotifyProfile,
  notifyOwnerTelegram,
  selectWithNotificationPrefs,
} from './notificationPrefsServer'

const MISSING = { code: '42703', message: 'column profiles.notification_prefs does not exist' }

// Минимальный supabase: profiles.select(cols).eq().maybeSingle(); если в cols
// есть notification_prefs, а колонки «нет» — отдаёт ошибку 42703.
function fakeSupabase(opts: { row: Record<string, unknown> | null; columnExists: boolean }) {
  const selects: string[] = []
  const sb = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols)
        const b: any = {
          eq: () => b,
          maybeSingle: async () => {
            if (cols.includes('notification_prefs') && !opts.columnExists) return { data: null, error: MISSING }
            return { data: opts.row, error: null }
          },
        }
        return b
      },
    }),
  }
  return { sb: sb as any, selects }
}

beforeEach(() => {
  __resetPrefsColumnCacheForTests()
  sendTelegramNotification.mockClear()
})

describe('isMissingSchemaError', () => {
  it('recognises missing column / function errors only for the named object', () => {
    expect(isMissingSchemaError(MISSING, 'notification_prefs')).toBe(true)
    expect(isMissingSchemaError({ code: '42703', message: 'column profiles.other does not exist' }, 'notification_prefs')).toBe(false)
    expect(isMissingSchemaError({ code: 'PGRST202', message: 'Could not find the function public.set_notification_pref(...) in the schema cache' }, 'set_notification_pref')).toBe(true)
    expect(isMissingSchemaError({ code: '23505', message: 'duplicate key' }, 'notification_prefs')).toBe(false)
    expect(isMissingSchemaError(null, 'notification_prefs')).toBe(false)
  })
})

describe('selectWithNotificationPrefs (works before the migration)', () => {
  it('uses the column when it exists', async () => {
    const run = vi.fn(async (cols: string) => ({ data: cols, error: null }))
    const res = await selectWithNotificationPrefs('a, b', run)
    expect(res.data).toBe('a, b, notification_prefs')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries without it when it is missing, and remembers that for a while', async () => {
    const run = vi.fn(async (cols: string) => cols.includes('notification_prefs')
      ? { data: null, error: MISSING }
      : { data: cols, error: null })
    const first = await selectWithNotificationPrefs('a', run)
    expect(first).toEqual({ data: 'a', error: null })
    expect(run).toHaveBeenCalledTimes(2)
    const second = await selectWithNotificationPrefs('a', run)
    expect(second.data).toBe('a')
    expect(run).toHaveBeenCalledTimes(3) // без повторной попытки с колонкой
  })

  it('passes other errors through untouched', async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: '500', message: 'boom' } }))
    const res = await selectWithNotificationPrefs('a', run)
    expect(res.error?.message).toBe('boom')
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('loadNotifyProfile + notifyOwnerTelegram', () => {
  it('before the migration: falls back to notify_telegram', async () => {
    const { sb, selects } = fakeSupabase({ row: { telegram_chat_id: '42', notify_telegram: true }, columnExists: false })
    const profile = await loadNotifyProfile(sb, 'u1')
    expect(profile?.telegram_chat_id).toBe('42')
    expect(selects).toHaveLength(2)
    const sent = await notifyOwnerTelegram(sb, 'u1', 'ai_wallet_empty', 'hi')
    expect(sent).toBe(true)
    expect(sendTelegramNotification).toHaveBeenCalledWith('42', 'hi', undefined)
  })

  it('after the migration: an explicit off wins over notify_telegram', async () => {
    const { sb } = fakeSupabase({
      row: { telegram_chat_id: '42', notify_telegram: true, notification_prefs: { ai_wallet_empty: { telegram: false } } },
      columnExists: true,
    })
    expect(await notifyOwnerTelegram(sb, 'u1', 'ai_wallet_empty', 'hi')).toBe(false)
    expect(await notifyOwnerTelegram(sb, 'u1', 'ai_training_exit', 'hi', { timeoutMs: 5000 })).toBe(true)
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1)
    expect(sendTelegramNotification).toHaveBeenCalledWith('42', 'hi', { timeoutMs: 5000 })
  })

  it('no chat connected or no profile: nothing is sent and nothing throws', async () => {
    const { sb } = fakeSupabase({ row: { telegram_chat_id: null, notify_telegram: true }, columnExists: true })
    expect(await notifyOwnerTelegram(sb, 'u1', 'ai_pro_lapsed', 'hi')).toBe(false)
    const { sb: empty } = fakeSupabase({ row: null, columnExists: true })
    expect(await notifyOwnerTelegram(empty, 'u1', 'ai_pro_lapsed', 'hi')).toBe(false)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
  })
})
