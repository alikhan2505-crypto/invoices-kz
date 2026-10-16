import { describe, it, expect, vi, beforeEach } from 'vitest'

const createNotification = vi.fn(async (..._a: unknown[]) => {})
const sendTelegramNotification = vi.fn(async (..._a: unknown[]) => true)
const emailSend = vi.fn(async (..._a: unknown[]) => ({ data: { id: 'e1' }, error: null }))
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: (...a: unknown[]) => sendTelegramNotification(...a) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: (...a: unknown[]) => emailSend(...a) } } }))

import { kaspiPaidTexts, notifyOwnerInvoicePaidViaKaspi } from './ownerPaidNotify'
import { __resetPrefsColumnCacheForTests } from '@/lib/notificationPrefsServer'

const invoice = { id: 'inv-1', number: '17', amount: 125000, client_name: 'ТОО <Ромашка>', user_id: 'u1' }

function fakeSupabase(profile: Record<string, unknown> | null) {
  return {
    from: (table: string) => ({
      select: () => {
        const b: any = {
          eq: () => b,
          maybeSingle: async () => ({ data: table === 'invoices' ? invoice : profile, error: null }),
        }
        return b
      },
    }),
  } as any
}

beforeEach(() => {
  __resetPrefsColumnCacheForTests()
  createNotification.mockClear()
  sendTelegramNotification.mockClear()
  emailSend.mockClear()
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key'
})

describe('kaspiPaidTexts', () => {
  it('escapes the client name for Telegram HTML and email, keeps it plain in the bell', () => {
    const t = kaspiPaidTexts(invoice)
    expect(t.telegram).toContain('ТОО &lt;Ромашка&gt;')
    expect(t.telegram).not.toContain('<Ромашка>')
    expect(t.emailHtml).toContain('ТОО &lt;Ромашка&gt;')
    expect(t.bellBody).toContain('ТОО <Ромашка>')
    expect(t.bellTitle).toBe('Счёт №17 оплачен через Kaspi Pay')
    expect(t.bellLink).toBe('/invoice/inv-1')
  })
})

describe('notifyOwnerInvoicePaidViaKaspi', () => {
  it('defaults (old columns): bell + Telegram (notify_telegram) + email (on by default)', async () => {
    await notifyOwnerInvoicePaidViaKaspi(fakeSupabase({
      email: 'o@example.kz', telegram_chat_id: '42', notify_telegram: true, notify_email: true, notification_prefs: null,
    }), 'inv-1')
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification.mock.calls[0][0]).toBe('u1')
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1)
    expect(sendTelegramNotification.mock.calls[0][0]).toBe('42')
    expect(emailSend).toHaveBeenCalledTimes(1)
  })

  it('respects explicit prefs: bell stays, switched-off channels stay silent', async () => {
    await notifyOwnerInvoicePaidViaKaspi(fakeSupabase({
      email: 'o@example.kz', telegram_chat_id: '42', notify_telegram: true, notify_email: true,
      notification_prefs: { invoice_paid_kaspi: { telegram: false, email: false } },
    }), 'inv-1')
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(sendTelegramNotification).not.toHaveBeenCalled()
    expect(emailSend).not.toHaveBeenCalled()
  })

  it('never throws, even when everything fails', async () => {
    createNotification.mockRejectedValueOnce(new Error('db down'))
    await expect(notifyOwnerInvoicePaidViaKaspi(fakeSupabase(null), 'inv-1')).resolves.toBeUndefined()
  })
})
