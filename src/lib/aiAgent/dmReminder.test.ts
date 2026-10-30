import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_REMINDER_TEXT, REMINDER_AFTER_MS, REMINDER_DAILY_LIMIT, REMINDER_PER_RUN_LIMIT, REMINDER_STUCK_AFTER_MS, REMINDER_WINDOW_MAX_MS,
  attributionReady, confirmReminderLinkSent, decideReminder, failureReason, hasTrackedLink, isQuietHoursAlmaty, newReminderToken,
  prepareReminderTracking, reminderConfigFromRows, replyHasTrackedLink, resetAttributionCache, runDmReminders,
  withReminderToken, withTokenInReply,
  type ReminderConfig, type ReminderConversation, type ReminderDeps, type ReminderRow, type ReminderStore,
} from './dmReminder'
import { UTM_CONTENT_RE } from '@/lib/toolEvents/schema'

const H = 3600_000
const NOW = Date.parse('2026-10-29T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('токен и ссылки', () => {
  it('токен: 16 символов url-безопасного алфавита, не повторяется, не похож на id/имя', () => {
    const set = new Set(Array.from({ length: 200 }, newReminderToken))
    expect(set.size).toBe(200)
    for (const t of set) {
      expect(t).toMatch(UTM_CONTENT_RE)
      expect(t).toHaveLength(16)
    }
  })

  it('токен дописывается к ссылкам ответа на КОНТРАГЕНТ (текст и кнопка), остальное не трогает', () => {
    const tok = 'AbCdEf0123456789'
    const text = 'Вот проверка по БИН 👇 https://invoices.kz/go/dm-kontragent\n\nПокажет долги.'
    expect(withReminderToken(text, tok)).toBe(`Вот проверка по БИН 👇 https://invoices.kz/go/dm-kontragent?utm_content=${tok}\n\nПокажет долги.`)
    expect(withReminderToken('https://invoices.kz/go/dm-kontragent-btn', tok)).toBe(`https://invoices.kz/go/dm-kontragent-btn?utm_content=${tok}`)
    // чужие ссылки и ссылка напоминания не меняются
    for (const same of ['https://invoices.kz/go/dm-schet', 'https://invoices.kz/go/dm-kontragent-rem', 'https://invoices.kz/go/dm-kontragent2', 'https://example.com/go/dm-kontragent']) {
      expect(withReminderToken(same, tok)).toBe(same)
    }
    // уже есть query: добавляем через &, повторно не добавляем
    expect(withReminderToken('https://invoices.kz/go/dm-kontragent?x=1', tok)).toBe(`https://invoices.kz/go/dm-kontragent?x=1&utm_content=${tok}`)
    expect(withReminderToken(`https://invoices.kz/go/dm-kontragent?utm_content=${tok}`, tok)).toBe(`https://invoices.kz/go/dm-kontragent?utm_content=${tok}`)
    // негодный токен ничего не меняет
    expect(withReminderToken(text, 'bad token!')).toBe(text)
  })

  it('withTokenInReply меняет и текст, и url кнопки; replyHasTrackedLink видит оба места', () => {
    const r = {
      reply_text: 'Ссылка: https://invoices.kz/go/dm-kontragent',
      button: { title: 'Т', subtitle: 'П', buttonTitle: 'Открыть', url: 'https://invoices.kz/go/dm-kontragent-btn' },
    }
    expect(replyHasTrackedLink(r)).toBe(true)
    expect(replyHasTrackedLink({ reply_text: 'Счёт: https://invoices.kz/go/dm-schet', button: null })).toBe(false)
    expect(replyHasTrackedLink({ reply_text: 'без ссылки', button: { ...r.button } })).toBe(true)
    const t = withTokenInReply(r, 'AbCdEf0123456789')
    expect(t.reply_text).toContain('?utm_content=AbCdEf0123456789')
    expect(t.button?.url).toBe('https://invoices.kz/go/dm-kontragent-btn?utm_content=AbCdEf0123456789')
    expect(hasTrackedLink('https://invoices.kz/go/dm-kontragent-rem')).toBe(false)
  })

  it('в токене нет персональных данных: ссылка = только адрес + случайная строка', () => {
    const t = withReminderToken('https://invoices.kz/go/dm-kontragent', newReminderToken())
    expect(t).toMatch(/^https:\/\/invoices\.kz\/go\/dm-kontragent\?utm_content=[A-Za-z0-9_-]{16}$/)
  })
})

describe('настройка: выключатель и текст', () => {
  const row = (trigger: string[], text: string) => ({ id: 'r', trigger_words: trigger, reply_text: text, channel: 'dm' })
  it('нет строки @reminder -- выключено', () => {
    expect(reminderConfigFromRows([row(['бин'], 'x')])).toEqual({ enabled: false, text: '' })
    expect(reminderConfigFromRows([])).toEqual({ enabled: false, text: '' })
  })
  it('@reminder_off не включает', () => {
    expect(reminderConfigFromRows([row(['@reminder_off'], 'x')]).enabled).toBe(false)
  })
  it('есть строка -- включено, текст из строки; пустой текст -- по умолчанию из кода', () => {
    expect(reminderConfigFromRows([row(['@reminder'], '  Свой текст https://invoices.kz/go/dm-kontragent-rem ')])).toEqual({ enabled: true, text: 'Свой текст https://invoices.kz/go/dm-kontragent-rem' })
    expect(reminderConfigFromRows([row(['@reminder'], '   ')])).toEqual({ enabled: true, text: DEFAULT_REMINDER_TEXT })
  })
  it('служебный блок @@button в тексте клиенту не уходит', () => {
    const cfg = reminderConfigFromRows([row(['@reminder'], 'Текст\n\n@@button\ntitle: T\nbutton: B\nurl: https://x.kz')])
    expect(cfg.text).toBe('Текст')
  })
  it('текст по умолчанию: короткий, русский, ссылка на ту же проверку, без давления', () => {
    expect(DEFAULT_REMINDER_TEXT.length).toBeLessThan(200)
    expect(DEFAULT_REMINDER_TEXT).toContain('https://invoices.kz/go/dm-kontragent-rem')
    expect(DEFAULT_REMINDER_TEXT).not.toMatch(/срочно|последн|только сегодня|!/i)
  })
})

describe('decideReminder: кого выбираем', () => {
  const base = { now: NOW, linkSentAt: iso(NOW - 2 * H), baselineInboundAt: iso(NOW - 2 * H - 1000), latestInboundAt: iso(NOW - 2 * H - 1000), visited: false }
  it('ровно 2 часа -- отправляем', () => {
    expect(decideReminder(base)).toEqual({ action: 'send' })
  })
  it('без одной секунды 2 часа -- ждём', () => {
    expect(decideReminder({ ...base, now: NOW - 1000 })).toEqual({ action: 'wait' })
  })
  it('граница окна: 22 часа от последнего входящего -- уже нет, без одной секунды -- ещё да', () => {
    const baseline = iso(NOW - REMINDER_WINDOW_MAX_MS)
    expect(decideReminder({ ...base, baselineInboundAt: baseline, latestInboundAt: baseline, linkSentAt: iso(NOW - 21 * H) })).toEqual({ action: 'skip', reason: 'expired' })
    const later = iso(NOW - REMINDER_WINDOW_MAX_MS + 1000)
    expect(decideReminder({ ...base, baselineInboundAt: later, latestInboundAt: later, linkSentAt: iso(NOW - 21 * H) })).toEqual({ action: 'send' })
  })
  it('новое входящее после ответа бота (слово, кнопка, вопрос) -- не напоминаем', () => {
    expect(decideReminder({ ...base, latestInboundAt: iso(NOW - 30 * 60_000) })).toEqual({ action: 'skip', reason: 'replied' })
  })
  it('то же самое входящее (микросекунды базы) не считается новым', () => {
    const t = '2026-10-29T09:59:59.123456+00:00'
    expect(decideReminder({ ...base, baselineInboundAt: t, latestInboundAt: t })).toEqual({ action: 'send' })
  })
  it('посещение найдено -- не напоминаем', () => {
    expect(decideReminder({ ...base, visited: true })).toEqual({ action: 'skip', reason: 'visited' })
  })
  it('нет входящих вообще (латентный случай) -- не считается ответом', () => {
    expect(decideReminder({ ...base, latestInboundAt: null })).toEqual({ action: 'send' })
  })
  it('мусорные даты -- не отправляем', () => {
    expect(decideReminder({ ...base, linkSentAt: 'x' })).toEqual({ action: 'skip', reason: 'expired' })
  })
  it('тихие часы по Алматы (UTC+5): с 22:00 до 08:00 ждём утра, окно не теряется', () => {
    // 21:59 Алматы (16:59 UTC): ещё можно; 22:00 (17:00 UTC) и ночью нельзя; 08:00 (03:00 UTC) можно.
    const at = (h: number, m = 0) => Date.UTC(2026, 9, 29, h, m)
    expect(isQuietHoursAlmaty(at(16, 59))).toBe(false)
    expect(isQuietHoursAlmaty(at(17, 0))).toBe(true)
    expect(isQuietHoursAlmaty(at(22, 0))).toBe(true) // 03:00 по Алматы
    expect(isQuietHoursAlmaty(at(2, 59))).toBe(true)
    expect(isQuietHoursAlmaty(at(3, 0))).toBe(false)
    // Прошло 2 часа, но сейчас 03:00 Алматы (22:00 UTC): ждём, а не отправляем и не пропускаем.
    const night = at(22, 0)
    const sentNight = iso(night - 2 * H - 60_000)
    const baseNight = { ...base, now: night, baselineInboundAt: sentNight, latestInboundAt: sentNight, linkSentAt: sentNight }
    expect(decideReminder(baseNight)).toEqual({ action: 'wait' })
    // Утром (08:00 Алматы = 03:00 UTC), через 8 часов после ночного входящего, всё ещё внутри окна: отправляем.
    const sentAt = iso(night - 2 * H - 60_000)
    const morning = Date.parse(sentAt) + 8 * H
    expect(isQuietHoursAlmaty(morning)).toBe(false)
    expect(decideReminder({ ...base, now: morning, baselineInboundAt: sentAt, latestInboundAt: sentAt, linkSentAt: sentAt })).toEqual({ action: 'send' })
  })
  it('REMINDER_AFTER_MS = 2 часа', () => {
    expect(REMINDER_AFTER_MS).toBe(2 * H)
  })
})

// ---------------------------------------------------------------- крон на поддельном сторе

interface FakeRow extends ReminderRow { status: string; reason?: string | null; claimed_at?: string | null }

function fakeStore(rows: FakeRow[], opts: { configs?: Map<string, ReminderConfig>; conv?: Partial<ReminderConversation>; latest?: Record<string, string | null>; visited?: Set<string>; claimsToday?: number; claimsByAgent?: Record<string, number> } = {}) {
  const log = { outbound: [] as { conversationId: string; text: string }[], claimCalls: 0, listDueAgents: [] as string[][] }
  const store: ReminderStore = {
    async expireStale(nowIso) {
      for (const r of rows) if (r.status === 'pending' && Date.parse(r.last_inbound_at) < Date.parse(nowIso) - REMINDER_WINDOW_MAX_MS) { r.status = 'skipped'; r.reason = 'expired' }
    },
    async reapStuck(nowIso) {
      let n = 0
      for (const r of rows) if (r.status === 'sending' && r.claimed_at && Date.parse(r.claimed_at) < Date.parse(nowIso) - REMINDER_STUCK_AFTER_MS) { r.status = 'failed'; r.reason = 'interrupted'; n++ }
      return n
    },
    async loadAgentConfigs() { return opts.configs ?? new Map([['agent1', { enabled: true, text: 'НАПОМИНАНИЕ' }]]) },
    async listDue(nowIso, limit, agentIds) {
      log.listDueAgents.push([...agentIds])
      const now = Date.parse(nowIso)
      return rows.filter(r => agentIds.includes(r.agent_id) && r.status === 'pending' && Date.parse(r.link_sent_at) <= now - REMINDER_AFTER_MS && Date.parse(r.last_inbound_at) > now - REMINDER_WINDOW_MAX_MS).slice(0, limit)
    },
    async conversation() { return { external_thread_id: 'IGSID-1', channel: 'instagram', source: 'dm', paused_for_human: false, ...opts.conv } },
    async latestInboundAt(cid) { return opts.latest && cid in opts.latest ? opts.latest[cid] : rows.find(r => r.conversation_id === cid)!.last_inbound_at },
    async hasVisit(token) { return !!opts.visited?.has(token) },
    async markSkipped(id, reason) { const r = rows.find(x => x.id === id)!; if (r.status === 'pending') { r.status = 'skipped'; r.reason = reason } },
    async countClaimsSince(agentId) { return opts.claimsByAgent?.[agentId] ?? opts.claimsToday ?? rows.filter(r => r.agent_id === agentId && r.claimed_at).length },
    async claim(id, nowIso) {
      log.claimCalls++
      const r = rows.find(x => x.id === id)!
      if (r.status !== 'pending') return false
      r.status = 'sending'; r.claimed_at = nowIso
      return true
    },
    async markSent(id) { rows.find(x => x.id === id)!.status = 'sent' },
    async markFailed(id, reason) { const r = rows.find(x => x.id === id)!; r.status = 'failed'; r.reason = reason },
    async logOutbound(conversationId, text) { log.outbound.push({ conversationId, text }) },
  }
  return { store, log }
}

const mkRow = (n: number, over: Partial<FakeRow> = {}): FakeRow => ({
  id: `row${n}`, agent_id: 'agent1', conversation_id: `conv${n}`, token: `TOKEN${String(n).padStart(11, '0')}`,
  link_sent_at: iso(NOW - 2 * H - 60_000), last_inbound_at: iso(NOW - 2 * H - 61_000), status: 'pending', ...over,
})

function depsFor(store: ReminderStore, over: Partial<ReminderDeps> = {}) {
  const sends: { to: string; text: string; creds: any }[] = []
  const deps: ReminderDeps = {
    store,
    attributionReady: async () => true,
    agentCanReply: async () => true,
    loadConnection: async () => ({ connectionId: 'c1', externalAccountId: 'ig1', accessToken: 'SECRET-TOKEN' }),
    sendText: async (conn, to, text) => { sends.push({ to, text, creds: conn }) },
    now: () => NOW,
    ...over,
  }
  return { deps, sends }
}

describe('runDmReminders', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('выключатель: нет строки @reminder ни у одного агента -- ничего не отправляется', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows, { configs: new Map() })
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(s.disabled).toBe(true)
    expect(sends).toHaveLength(0)
    expect(rows[0].status).toBe('pending')
  })

  it('обычный случай: одно напоминание, строка sent, в журнал ушёл текст', async () => {
    const rows = [mkRow(1)]
    const { store, log } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(s).toMatchObject({ sent: 1, failed: 0 })
    expect(sends).toEqual([{ to: 'IGSID-1', text: 'НАПОМИНАНИЕ', creds: { connectionId: 'c1', externalAccountId: 'ig1', accessToken: 'SECRET-TOKEN' } }])
    expect(rows[0].status).toBe('sent')
    expect(log.outbound).toEqual([{ conversationId: 'conv1', text: 'НАПОМИНАНИЕ' }])
  })

  it('ещё нет 2 часов -- не шлём, строка остаётся pending', async () => {
    const rows = [mkRow(1, { link_sent_at: iso(NOW - H) })]
    const { store } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(rows[0].status).toBe('pending')
  })

  it('окно: последнее входящее старше 22 часов -- закрывается expired и не отправляется', async () => {
    const rows = [mkRow(1, { link_sent_at: iso(NOW - 23 * H), last_inbound_at: iso(NOW - 23 * H - 1000) })]
    const { store } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'expired' })
  })

  it('человек написал снова -- skipped/replied', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows, { latest: { conv1: iso(NOW - 10 * 60_000) } })
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'replied' })
    expect(s.skipped).toEqual({ replied: 1 })
  })

  it('посещение найдено -- skipped/visited', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows, { visited: new Set([rows[0].token]) })
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'visited' })
  })

  it('уже отправлено (sent/sending/failed/skipped) -- повторно не шлётся ни при каком количестве запусков', async () => {
    const rows = [mkRow(1, { status: 'sent' }), mkRow(2, { status: 'sending' }), mkRow(3, { status: 'failed' }), mkRow(4, { status: 'skipped' }), mkRow(5, { status: 'prepared' })]
    const { store } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    await runDmReminders(deps)
    expect(sends).toHaveLength(0)
  })

  it('два параллельных запуска на одной строке: атомарный claim -- ровно одно сообщение', async () => {
    const rows = [mkRow(1)]
    const { store, log } = fakeStore(rows)
    const a = depsFor(store)
    const b = depsFor(store)
    // сендеры медленные, чтобы запуски действительно перекрылись
    a.deps.sendText = async (c, to, t) => { await new Promise(r => setTimeout(r, 5)); a.sends.push({ to, text: t, creds: c }) }
    b.deps.sendText = async (c, to, t) => { await new Promise(r => setTimeout(r, 5)); b.sends.push({ to, text: t, creds: c }) }
    await Promise.all([runDmReminders(a.deps), runDmReminders(b.deps)])
    expect(a.sends.length + b.sends.length).toBe(1)
    expect(log.claimCalls).toBeGreaterThanOrEqual(2)
    expect(rows[0].status).toBe('sent')
  })

  it('суточный предохранитель: при достижении лимита агента никому не шлём, считаем capped', async () => {
    const rows = [mkRow(1), mkRow(2)]
    const { store } = fakeStore(rows, { claimsToday: REMINDER_DAILY_LIMIT })
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(s.cappedAgents).toBe(1)
    expect(rows.every(r => r.status === 'pending')).toBe(true)
  })

  it('лимит считается по ходу запуска: до лимита шлём, дальше стоп', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => mkRow(i + 1, { claimed_at: undefined }))
    // 48 уже взято сегодня: влезают только две
    const base = REMINDER_DAILY_LIMIT - 2
    const { store } = fakeStore(rows)
    const original = store.countClaimsSince
    store.countClaimsSince = async (agentId, since) => base + (await original(agentId, since))
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(2)
  })

  it(`за один запуск не больше ${REMINDER_PER_RUN_LIMIT} напоминаний`, async () => {
    const rows = Array.from({ length: 40 }, (_, i) => mkRow(i + 1))
    const { store } = fakeStore(rows, { claimsToday: 0 })
    store.countClaimsSince = async () => 0
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(REMINDER_PER_RUN_LIMIT)
  })

  it('ошибка Meta: строка failed с кодом, повтора НЕТ ни в этом, ни в следующем запуске, обработчик не падает', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows)
    const err: any = Object.assign(new Error('Message sent outside of allowed window (code 10, subcode 2534022)'), { status: 400, metaCode: 10, metaSubcode: 2534022 })
    const sendText = vi.fn(async () => { throw err })
    const onSendError = vi.fn(async () => {})
    const { deps } = depsFor(store, { sendText, onSendError })
    const s1 = await runDmReminders(deps)
    const s2 = await runDmReminders(deps)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(rows[0]).toMatchObject({ status: 'failed', reason: 'error:http400:code10:sub2534022' })
    expect(s1).toMatchObject({ sent: 0, failed: 1 })
    expect(s2).toMatchObject({ sent: 0, failed: 0 })
    expect(onSendError).toHaveBeenCalledWith('c1', err)
  })

  it('таймаут (status 0): тоже без повтора, чтобы не продублировать сообщение, которое могло дойти', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows)
    const sendText = vi.fn(async () => { throw Object.assign(new Error('No response from Instagram (TimeoutError)'), { status: 0 }) })
    const { deps } = depsFor(store, { sendText })
    await runDmReminders(deps)
    await runDmReminders(deps)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(rows[0]).toMatchObject({ status: 'failed', reason: 'error:http0' })
  })

  it('сбой журнала после успешной отправки не превращает отправку в ошибку', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows)
    store.logOutbound = async () => { throw new Error('db down') }
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(sends).toHaveLength(1)
    expect(s.sent).toBe(1)
    expect(rows[0].status).toBe('sent')
  })

  it('диалог на паузе у оператора / агент выключен / нет подключения -- skipped без отправки', async () => {
    let rows = [mkRow(1)]
    let r = fakeStore(rows, { conv: { paused_for_human: true } })
    await runDmReminders(depsFor(r.store).deps)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'paused' })

    rows = [mkRow(1)]
    r = fakeStore(rows)
    let d = depsFor(r.store, { agentCanReply: async () => false })
    await runDmReminders(d.deps)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'agent_off' })
    expect(d.sends).toHaveLength(0)

    rows = [mkRow(1)]
    r = fakeStore(rows)
    d = depsFor(r.store, { loadConnection: async () => null })
    await runDmReminders(d.deps)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'no_connection' })

    rows = [mkRow(1)]
    r = fakeStore(rows, { conv: { source: 'comment' } })
    d = depsFor(r.store)
    await runDmReminders(d.deps)
    expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'no_conversation' })
    expect(d.sends).toHaveLength(0)
  })

  it('агент без строки @reminder: его строки не трогаем и не шлём', async () => {
    const rows = [mkRow(1, { agent_id: 'other' })]
    const { store } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(sends).toHaveLength(0)
    expect(rows[0].status).toBe('pending')
  })

  it('нет колонки utm_content (миграция не применена): ничего не шлём, строки ждут', async () => {
    const rows = [mkRow(1)]
    const { store } = fakeStore(rows)
    const { deps, sends } = depsFor(store, { attributionReady: async () => false })
    const s = await runDmReminders(deps)
    expect(s.attributionReady).toBe(false)
    expect(sends).toHaveLength(0)
    expect(rows[0].status).toBe('pending')
  })

  it('сбой чтения по одной строке не валит остальные', async () => {
    const rows = [mkRow(1), mkRow(2)]
    const { store } = fakeStore(rows)
    const orig = store.conversation
    store.conversation = async id => { if (id === 'conv1') throw new Error('boom'); return orig(id) }
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(sends).toHaveLength(1)
    expect(s.skipped.row_error).toBe(1)
  })

  it('в логах и сводке нет персональных данных: ни токена диалога, ни id Instagram, ни токена доступа, ни текста', async () => {
    const rows = [mkRow(1), mkRow(2)]
    const { store } = fakeStore(rows, { visited: new Set([rows[1].token]) })
    const errSpy = console.error as unknown as ReturnType<typeof vi.fn>
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const sendText = vi.fn(async () => { throw Object.assign(new Error('boom SECRET-TOKEN IGSID-1'), { status: 401 }) })
    const { deps } = depsFor(store, { sendText })
    const s = await runDmReminders(deps)
    const dump = JSON.stringify([s, errSpy.mock.calls, logSpy.mock.calls, rows.map(r => r.reason)])
    for (const secret of ['SECRET-TOKEN', 'IGSID-1', rows[0].token, rows[1].token, 'НАПОМИНАНИЕ', 'conv1']) {
      expect(dump).not.toContain(secret)
    }
  })
})

describe('runDmReminders: ревью 29.10 (очередь, время, зависшие)', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('строки выключенного агента не занимают голову очереди: выборка только по включённым агентам', async () => {
    // 60 старых строк агента без @reminder и одна строка включённого
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => mkRow(i + 1, { agent_id: 'off', link_sent_at: iso(NOW - 10 * H), last_inbound_at: iso(NOW - 10 * H - 1000) })),
      mkRow(100),
    ]
    const { store, log } = fakeStore(rows)
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(log.listDueAgents[0]).toEqual(['agent1'])
    expect(sends).toHaveLength(1)
    expect(rows.filter(r => r.agent_id === 'off').every(r => r.status === 'pending')).toBe(true)
  })

  it('агент в суточном лимите не пускается в выборку и не блокирует другого агента', async () => {
    const rows = [
      ...Array.from({ length: 55 }, (_, i) => mkRow(i + 1, { agent_id: 'capped', link_sent_at: iso(NOW - 10 * H), last_inbound_at: iso(NOW - 10 * H - 1000) })),
      mkRow(100, { agent_id: 'free' }),
    ]
    const configs = new Map<string, ReminderConfig>([['capped', { enabled: true, text: 'A' }], ['free', { enabled: true, text: 'B' }]])
    const { store, log } = fakeStore(rows, { configs, claimsByAgent: { capped: REMINDER_DAILY_LIMIT, free: 0 } })
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(log.listDueAgents[0]).toEqual(['free'])
    expect(s.cappedAgents).toBe(1)
    expect(sends.map(x => x.text)).toEqual(['B'])
  })

  it('все агенты в лимите: выборка вообще не делается', async () => {
    const rows = [mkRow(1)]
    const { store, log } = fakeStore(rows, { claimsToday: REMINDER_DAILY_LIMIT })
    const { deps, sends } = depsFor(store)
    await runDmReminders(deps)
    expect(log.listDueAgents).toHaveLength(0)
    expect(sends).toHaveLength(0)
  })

  it('agentCanReply и loadConnection вызываются один раз на агента за запуск, а не на каждую строку', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => mkRow(i + 1))
    const { store } = fakeStore(rows, { claimsToday: 0 })
    const agentCanReply = vi.fn(async () => true)
    const loadConnection = vi.fn(async () => ({ connectionId: 'c1', externalAccountId: 'ig1', accessToken: 'SECRET-TOKEN' }))
    const { deps, sends } = depsFor(store, { agentCanReply, loadConnection })
    await runDmReminders(deps)
    expect(sends).toHaveLength(6)
    expect(agentCanReply).toHaveBeenCalledTimes(1)
    expect(loadConnection).toHaveBeenCalledTimes(1)
  })

  it('после отказа отправки подключение агента перечитывается (токен могли пометить просроченным)', async () => {
    const rows = [mkRow(1), mkRow(2)]
    const { store } = fakeStore(rows, { claimsToday: 0 })
    let expired = false
    const loadConnection = vi.fn(async () => (expired ? null : { connectionId: 'c1', externalAccountId: 'ig1', accessToken: 'SECRET-TOKEN' }))
    const sendText = vi.fn(async () => { throw Object.assign(new Error('auth'), { status: 401 }) })
    const onSendError = vi.fn(async () => { expired = true })
    const { deps } = depsFor(store, { loadConnection, sendText, onSendError })
    await runDmReminders(deps)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(loadConnection).toHaveBeenCalledTimes(2)
    expect(rows[0]).toMatchObject({ status: 'failed' })
    expect(rows[1]).toMatchObject({ status: 'skipped', reason: 'no_connection' })
  })

  it('бюджет времени: после его исчерпания новые строки не начинаем, остаток ждёт следующий тик', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => mkRow(i + 1))
    const { store } = fakeStore(rows, { claimsToday: 0 })
    let t = 1_000
    const sent: string[] = []
    // каждая отправка «стоит» 12 секунд: четвёртую строку (24+12 > 30 с) уже не начинаем... берём три
    const { deps } = depsFor(store, {
      clock: () => t,
      sendText: async (_c, to) => { t += 12_000; sent.push(to) },
    })
    const s = await runDmReminders(deps)
    expect(sent).toHaveLength(3)
    expect(s.timeBudgetHit).toBe(true)
    expect(rows.filter(r => r.status === 'pending')).toHaveLength(2)
  })

  it('зависшая в sending (процесс убит между claim и markSent) закрывается как failed/interrupted и видна в сводке', async () => {
    const rows = [
      mkRow(1, { status: 'sending', claimed_at: iso(NOW - REMINDER_STUCK_AFTER_MS - 1000) }),
      mkRow(2, { status: 'sending', claimed_at: iso(NOW - 60_000) }), // свежая: прямо сейчас отправляется
    ]
    const { store } = fakeStore(rows, { claimsToday: 0 })
    const { deps, sends } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(s.stuck).toBe(1)
    expect(rows[0]).toMatchObject({ status: 'failed', reason: 'interrupted' })
    expect(rows[1].status).toBe('sending')
    expect(sends).toHaveLength(0) // повторной отправки нет
  })

  it('зависшие закрываются, даже если напоминания выключены у всех агентов (потери видны всегда)', async () => {
    const rows = [mkRow(1, { status: 'sending', claimed_at: iso(NOW - 3 * H) })]
    const { store } = fakeStore(rows, { configs: new Map() })
    const { deps } = depsFor(store)
    const s = await runDmReminders(deps)
    expect(s.disabled).toBe(true)
    expect(s.stuck).toBe(1)
  })
})

describe('миграции: токен utm_content не хранится вечно', () => {
  it('ig_dm_reminders_cron.sql содержит идемпотентное расписание очистки utm_content у старых событий', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/ig_dm_reminders_cron.sql'), 'utf8')
    expect(sql).toMatch(/cron\.unschedule\('ig-dm-reminders-purge-utm'\)/)
    expect(sql).toMatch(/cron\.schedule\(\s*'ig-dm-reminders-purge-utm'/)
    expect(sql).toMatch(/update public\.tool_events\s+set utm_content = null/)
    expect(sql).toMatch(/created_at < now\(\) - interval '3 days'/)
    // очистка живёт дольше окна напоминания (22 ч), иначе стёрла бы токен до проверки
    expect(3 * 24 * H).toBeGreaterThan(REMINDER_WINDOW_MAX_MS)
  })
})

describe('failureReason', () => {
  it('только числа: статус и коды Meta', () => {
    expect(failureReason({ status: 403, metaCode: 200 })).toBe('error:http403:code200')
    expect(failureReason(new Error('x'))).toBe('error')
    expect(failureReason(null)).toBe('error')
  })
})

// ---------------------------------------------------------------- сторона ответа (prepare/confirm)

function fakeDb(opts: { toolEventsError?: boolean; latestInbound?: string | null; upsertError?: boolean } = {}) {
  const state = { reminders: [] as any[], updates: [] as any[], upserts: [] as any[] }
  const db: any = {
    from(table: string) {
      const q: any = { table, filters: [] as any[], op: 'select', payload: null as any, opts: null as any }
      const result = () => {
        if (table === 'tool_events') return { data: opts.toolEventsError ? null : [], error: opts.toolEventsError ? { code: '42703' } : null }
        if (table === 'ai_agent_messages') return { data: opts.latestInbound ? { created_at: opts.latestInbound } : null, error: null }
        if (table === 'ig_dm_reminders') {
          if (q.op === 'upsert') {
            state.upserts.push({ payload: q.payload, opts: q.opts })
            if (opts.upsertError) return { data: null, error: { code: 'XX000' } }
            if (!state.reminders.some(r => r.conversation_id === q.payload.conversation_id)) state.reminders.push({ ...q.payload })
            return { data: null, error: null }
          }
          if (q.op === 'update') {
            state.updates.push({ payload: q.payload, filters: q.filters })
            const conv = q.filters.find((f: any) => f[0] === 'conversation_id')?.[1]
            const status = q.filters.find((f: any) => f[0] === 'status')?.[1]
            for (const r of state.reminders) if (r.conversation_id === conv && r.status === status) Object.assign(r, q.payload)
            return { data: null, error: null }
          }
          const conv = q.filters.find((f: any) => f[0] === 'conversation_id')?.[1]
          return { data: state.reminders.find(r => r.conversation_id === conv) ?? null, error: null }
        }
        return { data: null, error: null }
      }
      const b: any = {
        select() { return b },
        upsert(p: any, o: any) { q.op = 'upsert'; q.payload = p; q.opts = o; return b },
        update(p: any) { q.op = 'update'; q.payload = p; return b },
        eq(c: string, v: any) { q.filters.push([c, v]); return b },
        order() { return b },
        limit() { return b },
        maybeSingle: () => Promise.resolve(result()),
        then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
      }
      return b
    },
  }
  return { db, state }
}

describe('prepareReminderTracking / confirmReminderLinkSent', () => {
  beforeEach(() => { resetAttributionCache(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('выдаёт токен, создаёт строку prepared; повторный вызов в том же диалоге отдаёт тот же токен', async () => {
    const { db, state } = fakeDb()
    const t1 = await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })
    const t2 = await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })
    expect(t1).toMatch(UTM_CONTENT_RE)
    expect(t2).toBe(t1)
    expect(state.reminders).toHaveLength(1)
    expect(state.reminders[0]).toMatchObject({ status: 'prepared', agent_id: 'a1', conversation_id: 'c1' })
    expect(state.upserts[0].opts).toEqual({ onConflict: 'conversation_id', ignoreDuplicates: true })
  })

  it('два разных диалога -- два разных токена', async () => {
    const { db } = fakeDb()
    const a = await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })
    const b = await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c2' })
    expect(a).not.toBe(b)
  })

  it('колонки utm_content нет -- токена нет, строка не создаётся (ответ уйдёт как раньше)', async () => {
    const { db, state } = fakeDb({ toolEventsError: true })
    expect(await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })).toBeNull()
    expect(state.reminders).toHaveLength(0)
  })

  it('сбой записи -- null, не бросает', async () => {
    const { db } = fakeDb({ upsertError: true })
    expect(await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })).toBeNull()
  })

  it('confirm: prepared -> pending с отсчётом от момента отправки и базовым входящим', async () => {
    const { db, state } = fakeDb({ latestInbound: '2026-10-29T11:59:00.123456+00:00' })
    await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })
    await confirmReminderLinkSent(db, 'c1')
    expect(state.reminders[0]).toMatchObject({ status: 'pending', last_inbound_at: '2026-10-29T11:59:00.123456+00:00' })
    // условие в запросе: только из prepared
    expect(state.updates[0].filters).toContainEqual(['status', 'prepared'])
  })

  it('confirm не трогает строку, которая уже не prepared (повторное слово в диалоге)', async () => {
    const { db, state } = fakeDb()
    await prepareReminderTracking(db, { agentId: 'a1', conversationId: 'c1' })
    state.reminders[0].status = 'sent'
    await confirmReminderLinkSent(db, 'c1')
    expect(state.reminders[0].status).toBe('sent')
  })

  it('attributionReady кеширует успех и быстро перепроверяет отказ', async () => {
    resetAttributionCache()
    const bad = fakeDb({ toolEventsError: true })
    expect(await attributionReady(bad.db, 1_000)).toBe(false)
    const good = fakeDb()
    expect(await attributionReady(good.db, 1_000 + 30_000)).toBe(false) // отказ кеширован на минуту
    expect(await attributionReady(good.db, 1_000 + 61_000)).toBe(true)
    expect(await attributionReady(bad.db, 1_000 + 61_000 + 5 * 60_000)).toBe(true) // успех кеширован на 10 минут
  })
})
