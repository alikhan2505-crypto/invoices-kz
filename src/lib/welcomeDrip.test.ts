import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  STEPS, DAILY_STEPS, INSTANT_STEP, LAUNCH, MIN_GAP_HOURS,
  pickDailyStep, dailyWindow, instantWindow, trialUntil, trackedUrl,
  isEmailConfirmed, sendDrip, dripIdempotencyKey,
  type DripProfile,
} from './welcomeDrip'

const DAY = 86_400_000
const HOUR = 3_600_000
const created = '2026-10-20T06:00:00.000Z'
const createdMs = new Date(created).getTime()
const at = (days: number) => createdMs + days * DAY
const profile: DripProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'user@example.com',
  created_at: created,
  trial_expires_at: new Date(createdMs + 7 * DAY).toISOString(),
}
const UNSUB = 'https://invoices.kz/api/email/unsubscribe?u=x&amp;t=y'
const step = (n: number) => STEPS.find(s => s.n === n)!
const html = (n: number, now = at(0.01)) => step(n).html(UNSUB, profile, now)
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ')

describe('welcome drip schedule', () => {
  it('keeps step numbers unique and the sequence 10 min → 1 → 3 → 7 days', () => {
    expect(new Set(STEPS.map(s => s.n)).size).toBe(STEPS.length)
    expect(step(INSTANT_STEP).afterDays).toBeUndefined()
    expect(DAILY_STEPS.map(s => s.afterDays)).toEqual([1, 3, 7])
    // Старые номера не меняют смысла: 2 — 3-й день, 3 — 7-й день, новое письмо — 4.
    expect(step(2).afterDays).toBe(3)
    expect(step(3).afterDays).toBe(7)
    expect(step(4).afterDays).toBe(1)
  })

  it('daily windows do not overlap', () => {
    const windows = DAILY_STEPS.map(dailyWindow)
    for (let i = 1; i < windows.length; i++) expect(windows[i].from).toBeGreaterThanOrEqual(windows[i - 1].to)
    expect(windows[0]).toEqual({ from: 1, to: 3 })
  })

  it('picks nothing before day 1 (welcome is the instant hook)', () => {
    expect(pickDailyStep(created, [], at(0.5))).toBeNull()
  })

  it('picks the services mail after one day, tips on day 3, feedback on day 7', () => {
    expect(pickDailyStep(created, [], at(1.1))?.n).toBe(4)
    expect(pickDailyStep(created, [{ step: 4, sent_at: new Date(at(1.1)).toISOString() }], at(3.1))?.n).toBe(2)
    expect(pickDailyStep(created, [
      { step: 4, sent_at: new Date(at(1.1)).toISOString() },
      { step: 2, sent_at: new Date(at(3.1)).toISOString() },
    ], at(7.1))?.n).toBe(3)
  })

  it('does not resend a step already sent', () => {
    expect(pickDailyStep(created, [{ step: 4, sent_at: new Date(at(1.1)).toISOString() }], at(2.2))).toBeNull()
  })

  it('never sends two mails within MIN_GAP_HOURS, including right after the welcome', () => {
    const welcomeSent = { step: INSTANT_STEP, sent_at: new Date(at(1.1) - 2 * HOUR).toISOString() }
    expect(pickDailyStep(created, [welcomeSent], at(1.1))).toBeNull()
    const longAgo = { step: INSTANT_STEP, sent_at: new Date(at(1.1) - (MIN_GAP_HOURS + 1) * HOUR).toISOString() }
    expect(pickDailyStep(created, [longAgo], at(1.1))?.n).toBe(4)
  })

  it('does not catch up stale steps outside their window', () => {
    // День 2 после пропуска: шаг «через сутки» ещё в окне.
    expect(pickDailyStep(created, [], at(2.5))?.n).toBe(4)
    // День 5: окно 3-го дня закрылось, 7-го ещё не открылось.
    expect(pickDailyStep(created, [], at(5.5))).toBeNull()
    // День 10: всё прошло.
    expect(pickDailyStep(created, [], at(10))).toBeNull()
  })

  it('accounts that got old step 1 from the previous code get the services mail, not a second welcome', () => {
    const oldStep1 = { step: 1, sent_at: new Date(at(1.2)).toISOString() }
    expect(pickDailyStep(created, [oldStep1], at(2.2))?.n).toBe(4)
    expect(pickDailyStep(created, [oldStep1], at(2.2))?.n).not.toBe(INSTANT_STEP)
  })

  it('never writes to accounts created before LAUNCH', () => {
    const old = new Date(new Date(LAUNCH).getTime() - DAY).toISOString()
    expect(pickDailyStep(old, [], new Date(old).getTime() + 1.5 * DAY)).toBeNull()
  })

  it('instant window is 10 minutes to 24 hours old, never before LAUNCH', () => {
    const now = at(3)
    const w = instantWindow(now)
    expect(new Date(w.olderThan).getTime()).toBe(now - 10 * 60_000)
    expect(new Date(w.newerThan).getTime()).toBe(now - 24 * HOUR)
    const early = instantWindow(new Date(LAUNCH).getTime() + HOUR)
    expect(w.newerThan < w.olderThan).toBe(true)
    expect(new Date(early.newerThan).getTime()).toBe(new Date(LAUNCH).getTime())
  })
})

describe('welcome drip content', () => {
  it('welcome mail explains the profile bonus honestly and has both CTAs', () => {
    const h = html(INSTANT_STEP)
    const text = stripTags(h)
    expect(text).toContain('100 ₸')
    expect(text).toContain('300 ₸')
    expect(text).toContain('госреестр')
    expect(text).toContain('ИИК')
    expect(text).toMatch(/[Пп]одпись или печать/)
    expect(text).toContain('один раз на БИН')
    expect(text).toContain('тариф Про')
    expect(h).toContain('https://invoices.kz/profile?utm_source=drip&amp;utm_medium=email&amp;utm_campaign=d0')
    expect(h).toContain('https://invoices.kz/create?utm_source=drip&amp;utm_medium=email&amp;utm_campaign=d0')
    expect(text).toContain('Заполнить профиль')
    expect(text).toContain('Выставить счёт')
    expect(h).toContain(UNSUB)
  })

  it('welcome mail shows the trial line only while the trial is active', () => {
    expect(stripTags(html(INSTANT_STEP))).toContain('Пробный период до 27 октября')
    const noTrial = step(INSTANT_STEP).html(UNSUB, { ...profile, trial_expires_at: null }, at(0.01))
    expect(stripTags(noTrial)).not.toContain('Пробный период')
    const expired = step(INSTANT_STEP).html(UNSUB, profile, at(8))
    expect(stripTags(expired)).not.toContain('Пробный период')
  })

  it('services mail lists every product with its own host and never advertises Витрина', () => {
    const h = html(4)
    for (const host of ['https://kaspi.invoices.kz', 'https://agent.invoices.kz', 'https://api.invoices.kz', 'https://invoices.kz/tools', 'https://invoices.kz/create']) {
      expect(h).toContain(host)
    }
    const text = stripTags(h)
    for (const name of ['Счета', 'Kaspi Bot', 'ИИ-агент', 'Kaspi Cashier API', 'Бесплатные инструменты', 'Telegram']) {
      expect(text).toContain(name)
    }
  })

  it('no mail advertises the disabled Витрина, and each has at most one emoji and an unsubscribe link', () => {
    for (const s of STEPS) {
      const h = s.html(UNSUB, profile, at(0.01))
      expect(h).not.toMatch(/[Вв]итрин/)
      expect((h.match(/\p{Extended_Pictographic}/gu) ?? []).length).toBeLessThanOrEqual(1)
      expect(h).toContain('Отписаться')
      expect(h).toContain(UNSUB)
      expect(h).toContain('name="viewport"')
      expect(s.subject.length).toBeLessThan(80)
    }
  })

  it('every /tools/<slug> link points at a tool that exists', () => {
    const toolsDir = path.resolve(__dirname, '../app/tools')
    for (const s of STEPS) {
      for (const m of s.html(UNSUB, profile, at(0.01)).matchAll(/invoices\.kz\/tools\/([a-z-]+)/g)) {
        expect(fs.existsSync(path.join(toolsDir, m[1], 'page.tsx')), m[1]).toBe(true)
      }
    }
  })

  it('every link carries utm tags', () => {
    for (const s of STEPS) {
      const hrefs = [...s.html(UNSUB, profile, at(0.01)).matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(u => u !== UNSUB)
      if (s.n !== 3) expect(hrefs.length).toBeGreaterThan(0) // «Чего не хватило?» — призыв ответить, без ссылок
      for (const u of hrefs) expect(u).toContain('utm_source=drip')
    }
  })
})

describe('helpers', () => {
  it('trialUntil formats in Almaty time and hides past dates', () => {
    expect(trialUntil('2026-10-22T20:00:00Z', at(0))).toBe('23 октября')
    expect(trialUntil('2026-10-01T00:00:00Z', at(0))).toBe('')
    expect(trialUntil(null)).toBe('')
    expect(trialUntil('garbage')).toBe('')
  })

  it('trackedUrl keeps existing query and escapes &', () => {
    expect(trackedUrl('https://invoices.kz/tools?x=1', 'd1')).toBe('https://invoices.kz/tools?x=1&amp;utm_source=drip&amp;utm_medium=email&amp;utm_campaign=d1')
  })
})

describe('review fixes 15.10', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('reads offset-less profiles.created_at (timestamp without tz) as UTC', () => {
    // Так PostgREST отдаёт profiles.created_at — без «Z». Результат не должен
    // зависеть от часового пояса процесса.
    const raw = '2026-10-20T06:00:00.123456'
    expect(pickDailyStep(raw, [], at(1) + 30 * 60_000)?.n).toBe(4)
    // Ровно за 30 минут до суток — ещё рано; при сдвиге на +5 ч было бы уже «можно».
    expect(pickDailyStep(raw, [], at(1) - 30 * 60_000)).toBeNull()
    expect(pickDailyStep('2026-10-20 06:00:00', [], at(1) + 60_000)?.n).toBe(4)
  })

  it('welcome mail promises signature/stamp in the PDF only while a trial is active', () => {
    const withTrial = stripTags(html(INSTANT_STEP))
    expect(withTrial).toContain('подпись и печать подставятся в PDF сами')
    const noTrial = stripTags(step(INSTANT_STEP).html(UNSUB, { ...profile, trial_expires_at: null }, at(0.01)))
    expect(noTrial).not.toContain('подпись и печать подставятся в PDF сами')
    expect(noTrial).toContain('на тарифах «Базовый» и «Про»')
  })

  it('welcome mail says the bank bonus needs verified requisites first', () => {
    expect(stripTags(html(INSTANT_STEP))).toContain('после проверки реквизитов')
  })

  it('services mail separates Pro-only cabinet КП/АВР from the free one-off generators', () => {
    const text = stripTags(html(4))
    expect(text).toContain('с тарифа «Базовый»')
    expect(text).toContain('на тарифе «Про»')
    expect(text).toContain('без регистрации')
    expect(text).not.toMatch(/PDF с подписью и печатью/)
  })

  it('tips mail does not assume the welcome mail was received', () => {
    expect(stripTags(html(2))).not.toContain('по-прежнему')
  })

  it('isEmailConfirmed: true only for a confirmed address, false on error/throw', async () => {
    const client = (impl: () => unknown) => ({ auth: { admin: { getUserById: vi.fn(impl) } } }) as never
    expect(await isEmailConfirmed(client(async () => ({ data: { user: { email_confirmed_at: '2026-10-15T10:00:00Z' } }, error: null })), 'u')).toBe(true)
    expect(await isEmailConfirmed(client(async () => ({ data: { user: { email_confirmed_at: null } }, error: null })), 'u')).toBe(false)
    expect(await isEmailConfirmed(client(async () => ({ data: { user: null }, error: { message: 'x' } })), 'u')).toBe(false)
    expect(await isEmailConfirmed(client(async () => { throw new Error('net') }), 'u')).toBe(false)
  })

  it('sendDrip passes a stable idempotency key and one-click unsubscribe headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const send = vi.fn(async () => ({ data: { id: 'e1' }, error: null }))
    const resend = { emails: { send } } as never
    expect(await sendDrip(resend, profile, step(INSTANT_STEP))).toBe(true)
    const [payload, options] = send.mock.calls[0] as unknown as [{ headers: Record<string, string>; to: string }, { idempotencyKey: string }]
    expect(options.idempotencyKey).toBe(dripIdempotencyKey(profile.id, INSTANT_STEP))
    expect(options.idempotencyKey).toBe(`welcome-drip/${profile.id}/1`)
    expect(payload.to).toBe('user@example.com')
    expect(payload.headers['List-Unsubscribe']).toMatch(/^<https:\/\/invoices\.kz\/api\/email\/unsubscribe\?u=/)
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('sendDrip throws on a Resend error so the caller can roll back the claim', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const resend = { emails: { send: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) } } as never
    await expect(sendDrip(resend, profile, step(4))).rejects.toThrow('resend: boom')
  })
})
