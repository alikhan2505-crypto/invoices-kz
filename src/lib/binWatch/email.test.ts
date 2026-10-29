import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  binWatchUnsubToken, binWatchUnsubUrl, buildBinWatchEmail, changeLineRu, sendBinWatchMail, subjectFor,
  verifyBinWatchUnsub, type MailItem,
} from './email'
import type { WatchDetails } from './signals'
import { unsubToken } from '@/lib/welcomeDrip'

const details: WatchDetails = {
  totalArrear: 1_234_567, enforcementCount: 3, enforcementActive: 2,
  unreliableCategories: ['inactive'], status: 'Ликвидирован', rehabSince: null,
}
const item = (over: Partial<MailItem> = {}): MailItem => ({ bin: '123456789012', name: 'ТОО Ромашка', keys: ['taxDebt'], details, ...over })

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-hmac'; process.env.RESEND_API_KEY = 're_test' })
afterEach(() => { vi.unstubAllGlobals() })

describe('текст «что изменилось»', () => {
  it('каждая строка понятна и без тире/эмодзи', () => {
    for (const k of ['unreliable', 'bankrupt', 'liquidating', 'registryClosed', 'taxDebt', 'enforcement', 'rehabilitation', 'vatLost'] as const) {
      const line = changeLineRu(k, details)
      expect(line.length).toBeGreaterThan(10)
      expect(line).not.toMatch(/[‒-―\u{1F300}-\u{1FAFF}]/u)
    }
    expect(changeLineRu('taxDebt', details)).toContain('1 234 567 ₸')
    expect(changeLineRu('enforcement', details)).toContain('3')
    expect(changeLineRu('unreliable', details)).toContain('бездействующий')
  })
})

describe('buildBinWatchEmail', () => {
  it('одно письмо несёт все БИН', () => {
    const { subject, html } = buildBinWatchEmail([item(), item({ bin: '210987654321', name: 'ИП Тест', keys: ['unreliable', 'vatLost'] })], 'https://x/u')
    expect(subject).toBe('Изменения у 2 контрагентов на слежении')
    expect(html).toContain('ТОО Ромашка')
    expect(html).toContain('210987654321')
    expect(html).toContain('/profile/bin-watch')
    expect(html).toContain('Не получать такие письма')
  })

  it('тема для одного контрагента называет его и не ломается от переводов строк', () => {
    expect(subjectFor([item({ name: 'ТОО\r\nBcc: evil@x.kz' })])).not.toMatch(/[\r\n]/)
    expect(subjectFor([item()])).toBe('Контрагент ТОО Ромашка: новый признак риска')
  })

  it('название компании экранируется (HTML-инъекция)', () => {
    const { html } = buildBinWatchEmail([item({ name: '<script>alert(1)</script>' })], 'https://x/u')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('нет лишних персональных данных: ни адреса, ни руководителя, ни имён должников', () => {
    const { html } = buildBinWatchEmail([item()], 'https://x/u')
    expect(html).not.toMatch(/руководител|директор|адрес|ФИО|судебн/i)
  })
})

describe('отписка', () => {
  it('подпись верна только для своего пользователя', () => {
    const t = binWatchUnsubToken('user-1')
    expect(verifyBinWatchUnsub('user-1', t)).toBe(true)
    expect(verifyBinWatchUnsub('user-2', t)).toBe(false)
    expect(verifyBinWatchUnsub('user-1', t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a'))).toBe(false)
    expect(verifyBinWatchUnsub('', '')).toBe(false)
  })

  it('подпись отписки welcome-цепочки не подходит сюда и наоборот', () => {
    expect(verifyBinWatchUnsub('user-1', unsubToken('user-1'))).toBe(false)
    expect(binWatchUnsubToken('user-1')).not.toBe(unsubToken('user-1'))
  })

  it('ссылка ведёт на отдельный маршрут', () => {
    expect(binWatchUnsubUrl('user-1')).toContain('/api/bin-watch/unsubscribe?u=user-1&t=')
  })
})

describe('sendBinWatchMail', () => {
  const resend = (impl: () => Promise<{ error: null | { message: string } }>) => ({ emails: { send: vi.fn(impl) } }) as any

  it('подавленный адрес Resend: письмо не уходит', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const r = resend(async () => ({ error: null }))
    expect(await sendBinWatchMail(r, { userId: 'u', email: 'bad@example.kz' }, [item()], '2026-10-30')).toBe(false)
    expect(r.emails.send).not.toHaveBeenCalled()
  })

  it('негодный адрес: письмо не уходит и в Resend за проверкой не ходим', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = resend(async () => ({ error: null }))
    expect(await sendBinWatchMail(r, { userId: 'u', email: 'not-an-email' }, [item()], '2026-10-30')).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('чистый адрес: уходит с List-Unsubscribe и ключом идемпотентности суток', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const r = resend(async () => ({ error: null }))
    expect(await sendBinWatchMail(r, { userId: 'u', email: 'Ok@Example.kz' }, [item()], '2026-10-30')).toBe(true)
    const [payload, opts] = r.emails.send.mock.calls[0]
    expect(payload.to).toBe('ok@example.kz')
    expect(payload.headers['List-Unsubscribe']).toContain('/api/bin-watch/unsubscribe')
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(opts.idempotencyKey).toBe('bin-watch/u/2026-10-30')
  })

  it('проверка подавления недоступна - шлём (как magic-link)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const r = resend(async () => ({ error: null }))
    expect(await sendBinWatchMail(r, { userId: 'u', email: 'ok@example.kz' }, [item()], '2026-10-30')).toBe(true)
  })

  it('отказ Resend бросает исключение (вызывающий освободит слот суток)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const r = resend(async () => ({ error: { message: 'nope' } }))
    await expect(sendBinWatchMail(r, { userId: 'u', email: 'ok@example.kz' }, [item()], '2026-10-30')).rejects.toThrow('resend: nope')
  })
})
