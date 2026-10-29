import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeWatchDb, type FakeWatchDb } from './fakeSupabase.testkit'
import type { BinLookupOutcome } from '@/lib/binLookupServer'

const h = vi.hoisted(() => ({ load: 0, counters: new Map<string, number>(), gateOpen: false }))
vi.mock('@/lib/toolQuota', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/toolQuota')>()
  return {
    ...real,
    registryLoadToday: async () => h.load,
    readCounter: async (_s: unknown, key: string) => ({ ok: true as const, used: h.counters.get(key) ?? 0 }),
    claimCounterSlot: async (_s: unknown, key: string, used: number) => {
      if ((h.counters.get(key) ?? 0) !== used) return 'raced' as const
      h.counters.set(key, used + 1)
      return 'claimed' as const
    },
  }
})
vi.mock('./config', async importOriginal => {
  const real = await importOriginal<typeof import('./config')>()
  return { ...real, canUseBinWatch: (isAdmin: boolean | null | undefined) => (h.gateOpen ? true : isAdmin === true) }
})

import { runBinWatch, type MailProfile, type RunDeps } from './run'
import type { WatchSignals } from './signals'

const NOW = Date.parse('2026-10-30T02:30:00.000Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const HOUR = 3_600_000

const A = '111111111111', B = '222222222222', C = '333333333333'
const U1 = 'u1', U2 = 'u2', U3 = 'u3'

const clean: WatchSignals = {
  unreliable: false, bankrupt: false, liquidating: false, registryClosed: false,
  taxDebt: false, enforcement: false, rehabilitation: false, vat: true,
}

const company = (bin: string, over: Record<string, unknown> = {}): BinLookupOutcome => ({
  found: true,
  company: {
    bin, name: `ТОО ${bin}`, address: null, director: null, activity: null, status: 'Зарегистрирован',
    registeredAt: null, source: 'egov', isVatPayer: true, vatRegisteredAt: null, isUnreliable: false,
    isLiquidating: false, totalArrear: 0, taxArrear: 0, unreliableCategories: [],
    enforcement: { found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null },
    rehabilitation: { state: 'not_listed' },
    ...over,
  } as any,
})

const row = (over: Record<string, unknown> = {}) => ({
  id: `r-${Math.random().toString(36).slice(2)}`, user_id: U1, bin: A, name: null,
  baseline: clean, last_result: null, last_checked_at: null, last_attempt_at: iso(30 * HOUR),
  last_status: 'ok', pending_changes: [], created_at: iso(100 * HOUR), ...over,
})

const adminProfile = (over: Partial<MailProfile> = {}): MailProfile => ({
  email: 'owner@example.kz', telegram_chat_id: null, notify_email: true, notify_telegram: false,
  notify_client_viewed: true, notify_payment_reminder: true, notify_overdue: true, notify_weekly_report: false,
  email_optout: false, is_admin: true, deleted_at: null, ...over,
})

interface Setup {
  db: FakeWatchDb
  deps: RunDeps
  lookup: ReturnType<typeof vi.fn>
  sendMail: ReturnType<typeof vi.fn>
  clock: { t: number }
  sleeps: number[]
}

function setup(rows: Array<Record<string, unknown>>, opts: {
  lookups?: Record<string, BinLookupOutcome | Error>
  profiles?: Record<string, MailProfile | null>
  identity?: (id: string) => { confirmed: boolean; email: string | null }
  send?: (to: { userId: string; email: string }) => boolean | Error
  extra?: Partial<RunDeps>
  mailLog?: Array<Record<string, unknown>>
} = {}): Setup {
  const db = makeFakeWatchDb({ bin_watch: rows.map(r => ({ ...r })), bin_watch_mail_log: opts.mailLog ?? [] })
  const clock = { t: NOW }
  const sleeps: number[] = []
  const lookup = vi.fn(async (bin: string) => {
    const v = opts.lookups?.[bin] ?? company(bin)
    if (v instanceof Error) throw v
    return v
  })
  const sendMail = vi.fn(async (to: { userId: string; email: string }) => {
    const r = opts.send ? opts.send(to) : true
    if (r instanceof Error) throw r
    return r
  })
  const profiles = opts.profiles ?? { [U1]: adminProfile(), [U2]: adminProfile({ email: 'two@example.kz' }), [U3]: adminProfile({ email: 'three@example.kz' }) }
  const deps: RunDeps = {
    supabase: db.client,
    lookup,
    loadProfile: async id => profiles[id] ?? null,
    resolveIdentity: async id => (opts.identity ? opts.identity(id) : { confirmed: true, email: `${id}@example.kz` }),
    sendMail,
    now: () => clock.t,
    // Без темпа по умолчанию (иначе тесты ждали бы по 9 с); темп проверяется отдельно.
    paceMs: 0,
    sleep: async (ms: number) => { clock.t += ms; sleeps.push(ms) },
    ...opts.extra,
  }
  return { db, deps, lookup, sendMail, clock, sleeps }
}

beforeEach(() => { h.load = 0; h.counters.clear(); h.gateOpen = false })

describe('фаза проверок: что и в каком порядке', () => {
  it('БИН проверяется не чаще раза в сутки: свежая попытка пропускается', async () => {
    const s = setup([row({ last_attempt_at: iso(1 * HOUR) }), row({ bin: B, last_attempt_at: iso(25 * HOUR) })])
    const out = await runBinWatch(s.deps)
    expect(s.lookup.mock.calls.map(c => c[0])).toEqual([B])
    expect(out.dueRows).toBe(1)
  })

  it('самые давно проверенные первыми, ещё не проверенные - раньше всех', async () => {
    const s = setup([
      row({ bin: A, last_attempt_at: iso(30 * HOUR) }),
      row({ bin: B, last_attempt_at: null }),
      row({ bin: C, last_attempt_at: iso(90 * HOUR) }),
    ])
    await runBinWatch(s.deps)
    expect(s.lookup.mock.calls.map(c => c[0])).toEqual([B, C, A])
  })

  it('суточный потолок крона: сверх лимита остаток уходит на завтра', async () => {
    const s = setup([
      row({ bin: A, last_attempt_at: iso(90 * HOUR) }),
      row({ bin: B, last_attempt_at: iso(60 * HOUR) }),
      row({ bin: C, last_attempt_at: iso(30 * HOUR) }),
    ], { extra: { dailyMax: 2 } })
    const out = await runBinWatch(s.deps)
    expect(s.lookup.mock.calls.map(c => c[0])).toEqual([A, B])
    expect(out.checked).toBe(2)
    expect(out.stoppedBy).toBe('budget')
    // C остался непроверенным и первым пойдёт завтра.
    expect(s.db.tables.bin_watch.find(r => r.bin === C)!.last_attempt_at).toBe(iso(30 * HOUR))
  })

  it('счётчик на 300: ни одной проверки', async () => {
    const s = setup([row()])
    const day = new Date(NOW + 5 * HOUR).toISOString().slice(0, 10)
    h.counters.set(`watch:${day}`, 300)
    const out = await runBinWatch(s.deps)
    expect(s.lookup).not.toHaveBeenCalled()
    expect(out.stoppedBy).toBe('budget')
  })

  it('общая нагрузка на реестры съела запас бесплатных инструментов: крон не стартует', async () => {
    const s = setup([row()])
    h.load = 200
    const out = await runBinWatch(s.deps)
    expect(s.lookup).not.toHaveBeenCalled()
    expect(out.stoppedBy).toBe('budget')
  })

  it('бюджет времени: новые проверки не стартуют после дедлайна', async () => {
    const s = setup([
      row({ bin: A, last_attempt_at: iso(90 * HOUR) }),
      row({ bin: B, last_attempt_at: iso(60 * HOUR) }),
      row({ bin: C, last_attempt_at: iso(30 * HOUR) }),
    ], { extra: { lookupDeadlineMs: 50_000 } })
    s.lookup.mockImplementation(async (bin: string) => { s.clock.t += 30_000; return company(bin) })
    const out = await runBinWatch(s.deps)
    expect(s.lookup).toHaveBeenCalledTimes(2)
    expect(out.stoppedBy).toBe('time')
  })

  it('один сбойный БИН не валит остальные', async () => {
    const s = setup([
      row({ bin: A, last_attempt_at: iso(90 * HOUR) }),
      row({ bin: B, last_attempt_at: iso(60 * HOUR) }),
    ], { lookups: { [A]: new Error('boom') } })
    const out = await runBinWatch(s.deps)
    expect(out.checked).toBe(2)
    expect(out.failed).toBe(1)
    expect(s.db.tables.bin_watch.find(r => r.bin === B)!.last_status).toBe('ok')
    expect(s.db.tables.bin_watch.find(r => r.bin === A)!.last_status).toBe('unavailable')
  })

  it('один БИН у двух пользователей - один живой запрос, обе строки обновлены', async () => {
    const s = setup([row({ user_id: U1 }), row({ user_id: U2 })])
    await runBinWatch(s.deps)
    expect(s.lookup).toHaveBeenCalledTimes(1)
    expect(s.db.tables.bin_watch.every(r => r.last_status === 'ok' && r.name === `ТОО ${A}`)).toBe(true)
  })

  it('таблицы нет (SQL не применён): штатный пропуск, без запросов к реестрам', async () => {
    const s = setup([])
    s.db.missing.add('bin_watch')
    expect(await runBinWatch(s.deps)).toEqual({ ok: false, reason: 'table_missing' })
    expect(s.lookup).not.toHaveBeenCalled()
  })
})

describe('сравнение снимков внутри прогона', () => {
  it('первый снимок (базы нет): сохраняется, письма нет', async () => {
    const s = setup([row({ baseline: null, last_attempt_at: null })], { lookups: { [A]: company(A, { totalArrear: 999, isUnreliable: true, unreliableCategories: ['inactive'] }) } })
    const out = await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(out.mailsSent).toBe(0)
    expect(s.db.tables.bin_watch[0].baseline).toMatchObject({ taxDebt: true, unreliable: true })
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual([])
  })

  it('реестр не ответил: письма нет, база не тронута', async () => {
    const s = setup([row()], { lookups: { [A]: { found: false, unavailable: true } } })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].baseline).toEqual(clean)
    expect(s.db.tables.bin_watch[0].last_status).toBe('unavailable')
  })

  it('в этот раз часть признаков не проверилась: это не ухудшение', async () => {
    const s = setup([row()], { lookups: { [A]: company(A, { totalArrear: null, isUnreliable: null, enforcement: null }) } })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].baseline).toEqual(clean)
  })

  it('улучшение письма не вызывает, база обновляется', async () => {
    const s = setup([row({ baseline: { ...clean, taxDebt: true } })], { lookups: { [A]: company(A, { totalArrear: 0 }) } })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].baseline.taxDebt).toBe(false)
  })
})

describe('письма', () => {
  const worse = { [A]: company(A, { totalArrear: 50_000 }) }

  it('ухудшение: одно письмо владельцу, ожидающие очищены, журнал занят', async () => {
    const s = setup([row()], { lookups: worse })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(1)
    expect(s.sendMail).toHaveBeenCalledTimes(1)
    const [to, items, day] = s.sendMail.mock.calls[0]
    expect(to).toEqual({ userId: U1, email: `${U1}@example.kz` })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ bin: A, keys: ['taxDebt'] })
    expect(items[0].details.totalArrear).toBe(50_000)
    expect(day).toBe('2026-10-30')
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual([])
    expect(s.db.tables.bin_watch_mail_log).toHaveLength(1)
  })

  it('несколько БИН одного пользователя собираются в ОДНО письмо', async () => {
    const s = setup([row({ bin: A }), row({ bin: B }), row({ bin: C })], {
      lookups: { [A]: company(A, { totalArrear: 1 }), [B]: company(B, { isLiquidating: true }), [C]: company(C) },
    })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(1)
    expect(s.sendMail).toHaveBeenCalledTimes(1)
    const items = s.sendMail.mock.calls[0][1] as Array<{ bin: string }>
    expect(items.map(i => i.bin).sort()).toEqual([A, B])
  })

  it('разным пользователям - разные письма', async () => {
    const s = setup([row({ user_id: U1 }), row({ user_id: U2 })], { lookups: worse })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(2)
  })

  it('не больше одного письма в сутки: журнал уже занят - ждём завтра, ожидающие остаются', async () => {
    const s = setup([row({ baseline: { ...clean, taxDebt: true }, pending_changes: ['taxDebt'], last_attempt_at: iso(1 * HOUR) })], {
      mailLog: [{ user_id: U1, day: '2026-10-30' }],
    })
    const out = await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(out.mailsDeferred).toBe(1)
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual(['taxDebt'])
  })

  it('повторный прогон в те же сутки второго письма не шлёт', async () => {
    const s = setup([row()], { lookups: worse })
    await runBinWatch(s.deps)
    await runBinWatch(s.deps)
    expect(s.sendMail).toHaveBeenCalledTimes(1)
  })

  it('подавленный/негодный адрес: не отправлено, слот суток освобождён, предупреждение ждёт', async () => {
    const s = setup([row()], { lookups: worse, send: () => false })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(0)
    expect(out.mailsSkipped).toBe(1)
    expect(s.db.tables.bin_watch_mail_log).toHaveLength(0)
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual(['taxDebt'])
  })

  it('сбой отправки: слот освобождён, предупреждение ждёт, остальные пользователи не страдают', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = setup([row({ user_id: U1 }), row({ user_id: U2 })], {
      lookups: worse, send: to => (to.userId === U1 ? new Error('resend down') : true),
    })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(1)
    expect(s.db.tables.bin_watch.find(r => r.user_id === U1)!.pending_changes).toEqual(['taxDebt'])
    expect(s.db.tables.bin_watch.find(r => r.user_id === U2)!.pending_changes).toEqual([])
  })

  it('адрес не подтверждён: не пишем', async () => {
    const s = setup([row()], { lookups: worse, identity: () => ({ confirmed: false, email: 'x@example.kz' }) })
    const out = await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(out.mailsSkipped).toBe(1)
  })

  it('письмо выключено в настройках: не шлём и не копим старьё', async () => {
    const s = setup([row()], {
      lookups: worse,
      profiles: { [U1]: adminProfile({ notification_prefs: { bin_watch_changed: { email: false } } }) },
    })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual([])
  })

  it('проблема прошла до отправки: письма нет', async () => {
    const s = setup([row({ baseline: { ...clean, taxDebt: false }, pending_changes: ['taxDebt'], last_attempt_at: iso(1 * HOUR) })])
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual([])
  })

  it('дедлайн писем: остаток откладывается', async () => {
    const s = setup([row({ user_id: U1 }), row({ user_id: U2 })], {
      lookups: worse, extra: { emailDeadlineMs: 0 },
    })
    const out = await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(out.mailsDeferred).toBe(2)
    expect(s.db.tables.bin_watch.every(r => r.pending_changes.length === 1)).toBe(true)
  })
})

describe('неполный первый снимок не даёт ложного письма', () => {
  it('день 0: Минюст и долг не ответили; день 1: давние производства и долг - письма нет, потом настоящее ухудшение - есть', async () => {
    // День 0: БИН только добавлен, базы нет, enforcement/долг = null.
    const s = setup([row({ baseline: null, last_attempt_at: null, last_status: null })], {
      lookups: { [A]: company(A, { enforcement: null, totalArrear: null }) },
    })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].baseline).toMatchObject({ enforcement: null, taxDebt: null, unreliable: false })

    // День 1: реестры ответили, давнее обнаружилось. Это отсчёт, не новость.
    s.clock.t += 24 * HOUR
    s.lookup.mockImplementation(async () => company(A, {
      enforcement: { found: true, count: 3, activeCount: 2, totalAmount: 9, earliestStart: '2023-05-01' },
      totalArrear: 1000,
    }))
    const day1 = await runBinWatch(s.deps)
    expect(day1.checked).toBe(1)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(s.db.tables.bin_watch[0].pending_changes).toEqual([])
    expect(s.db.tables.bin_watch[0].baseline).toMatchObject({ enforcement: true, taxDebt: true })

    // День 2: настоящее ухудшение по признаку, который уже наблюдался как «нет», - письмо.
    s.clock.t += 24 * HOUR
    s.lookup.mockImplementation(async () => company(A, {
      enforcement: { found: true, count: 3, activeCount: 2, totalAmount: 9, earliestStart: '2023-05-01' },
      totalArrear: 1000, isLiquidating: true,
    }))
    const day2 = await runBinWatch(s.deps)
    expect(day2.mailsSent).toBe(1)
    expect(s.sendMail.mock.calls[0][1][0]).toMatchObject({ bin: A, keys: ['liquidating'] })
  })
})

describe('темп проверок и бюджет времени', () => {
  const three = () => [
    row({ bin: A, last_attempt_at: iso(90 * HOUR) }),
    row({ bin: B, last_attempt_at: iso(60 * HOUR) }),
    row({ bin: C, last_attempt_at: iso(30 * HOUR) }),
  ]

  it('старты проверок разнесены на темп: пауза между ними, перед первой паузы нет', async () => {
    const s = setup(three(), { extra: { paceMs: 9_000 } })
    const starts: number[] = []
    s.lookup.mockImplementation(async (bin: string) => { starts.push(s.clock.t); return company(bin) })
    const out = await runBinWatch(s.deps)
    expect(out.checked).toBe(3)
    expect(s.sleeps).toEqual([9_000, 9_000])
    expect(starts.map(t => t - NOW)).toEqual([0, 9_000, 18_000])
  })

  it('если проверка сама заняла дольше темпа, лишней паузы нет; короткая добирается до темпа', async () => {
    const s = setup(three(), { extra: { paceMs: 9_000 } })
    const took = [12_000, 3_000, 1_000]
    let i = 0
    s.lookup.mockImplementation(async (bin: string) => { s.clock.t += took[i++]; return company(bin) })
    await runBinWatch(s.deps)
    // после A (12 с) паузы нет; после B (3 с) нужно ещё 6 с.
    expect(s.sleeps).toEqual([6_000])
  })

  it('пауза не должна выводить за дедлайн: новая проверка не начинается', async () => {
    const s = setup(three(), { extra: { paceMs: 9_000, lookupDeadlineMs: 20_000 } })
    const out = await runBinWatch(s.deps)
    // Дедлайн 20 с: старты на 0, 9 и 18 с укладываются.
    expect(out.checked).toBe(3)
    // Дедлайн 15 с: на третью проверку пришлось бы ждать до 18 с, то есть за дедлайн.
    const s2 = setup(three(), { extra: { paceMs: 9_000, lookupDeadlineMs: 15_000 } })
    const out2 = await runBinWatch(s2.deps)
    expect(out2.checked).toBe(2)
    expect(out2.stoppedBy).toBe('time')
    // Непроверенный остаётся первым в очереди на завтра.
    expect(s2.db.tables.bin_watch.find(r => r.bin === C)!.last_attempt_at).toBe(iso(30 * HOUR))
  })

  it('темп по умолчанию - константа конфига, ёмкость суток честно посчитана', async () => {
    const cfg = await import('./config')
    expect(cfg.BIN_WATCH_PACE_MS).toBe(9_000)
    expect(cfg.BIN_WATCH_DAILY_CAPACITY).toBe(Math.floor(cfg.BIN_WATCH_LOOKUP_DEADLINE_MS / cfg.BIN_WATCH_PACE_MS))
    // Потолок предохранителя недостижим по времени, и это зафиксировано: ёмкость < 300.
    expect(cfg.BIN_WATCH_DAILY_CAPACITY).toBeLessThan(cfg.BIN_WATCH_DAILY_MAX)
    // ~40 запросов КГД в минуту при ~6 запросах на холодный БИН.
    expect((60_000 / cfg.BIN_WATCH_PACE_MS) * 6).toBeLessThanOrEqual(40.5)
  })

  it('частичный результат: данные сохранены, повтор доступен через 6 ч, а не через 20; в сводке учтён', async () => {
    const s = setup([row({ last_attempt_at: iso(30 * HOUR) })], { lookups: { [A]: company(A, { enforcement: null }) } })
    const out = await runBinWatch(s.deps)
    expect(out.partial).toBe(1)
    const r = s.db.tables.bin_watch[0]
    expect(r.last_status).toBe('ok')
    expect(r.last_checked_at).toBe(new Date(NOW).toISOString())
    // попытка записана как сделанная 14 ч назад: через 6 ч она снова "старше 20 ч"
    expect(Date.parse(r.last_attempt_at)).toBe(NOW - 14 * HOUR)

    s.clock.t += 5 * HOUR
    expect((await runBinWatch(s.deps)).checked).toBe(0)
    s.clock.t += 2 * HOUR
    expect((await runBinWatch(s.deps)).checked).toBe(1)
  })

  it('полный результат ставит обычную отметку попытки (повтор через 20 ч)', async () => {
    const s = setup([row({ last_attempt_at: iso(30 * HOUR) })])
    const out = await runBinWatch(s.deps)
    expect(out.partial).toBe(0)
    expect(s.db.tables.bin_watch[0].last_attempt_at).toBe(new Date(NOW).toISOString())
  })

  it('частичные не вытесняют целые навсегда: сдвиг меньше суток, по кругу очередь доходит до всех', async () => {
    const s = setup([
      row({ bin: A, last_attempt_at: iso(30 * HOUR) }),
      row({ bin: B, last_attempt_at: iso(30 * HOUR) }),
    ], { lookups: { [A]: company(A, { enforcement: null }) }, extra: { dailyMax: 1 } })
    await runBinWatch(s.deps) // проверен A (частичный), записан NOW-14ч
    s.clock.t += 24 * HOUR
    const day2 = await runBinWatch(s.deps) // B (NOW-30ч) старше, чем A (NOW-14ч, т.е. NOW+10ч в новых сутках)
    expect(day2.checked).toBe(1)
    expect(s.lookup.mock.calls.map(c => c[0])).toEqual([A, B])
  })
})

describe('лимит тарифа в крон-обходе', () => {
  const bins = ['100000000001', '100000000002', '100000000003', '100000000004', '100000000005', '100000000006', '100000000007']
  const mk = (userId = U1) => bins.map((bin, i) => row({ user_id: userId, bin, created_at: iso((200 - i) * HOUR), last_attempt_at: iso(30 * HOUR) }))
  const worseAll = Object.fromEntries(bins.map(b => [b, company(b, { totalArrear: 10 })]))
  const freeProfile = (over: Partial<MailProfile> = {}) => adminProfile({ is_admin: false, plan: 'free', ...over })

  it('Free (гейт открыт): обслуживаются первые 5 по created_at, 6-я и 7-я не проверяются и не рассылаются', async () => {
    h.gateOpen = true
    const s = setup(mk(), { profiles: { [U1]: freeProfile() }, lookups: worseAll })
    const out = await runBinWatch(s.deps)
    expect(s.lookup.mock.calls.map(c => c[0]).sort()).toEqual(bins.slice(0, 5))
    expect(out.overLimit).toBe(2)
    expect(out.mailsSent).toBe(1)
    const items = s.sendMail.mock.calls[0][1] as Array<{ bin: string }>
    expect(items.map(i => i.bin).sort()).toEqual(bins.slice(0, 5))
    expect(s.db.tables.bin_watch.filter(r => r.last_status === 'ok' && r.last_checked_at).length).toBe(5)
  })

  it('ждущее письмо сверхлимитной строки не уходит', async () => {
    h.gateOpen = true
    const rows = mk().map((r, i) => i >= 5 ? { ...r, baseline: { ...clean, taxDebt: true }, pending_changes: ['taxDebt'], last_attempt_at: iso(HOUR) } : { ...r, last_attempt_at: iso(HOUR) })
    const s = setup(rows, { profiles: { [U1]: freeProfile() } })
    const out = await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
    expect(out.overLimit).toBe(2)
  })

  it('действующий Про: все 7 обслуживаются', async () => {
    h.gateOpen = true
    const s = setup(mk(), { profiles: { [U1]: freeProfile({ plan: 'pro', plan_expires_at: '2027-06-01T00:00:00' }) }, lookups: worseAll })
    const out = await runBinWatch(s.deps)
    expect(out.checked).toBe(7)
    expect(out.overLimit).toBe(0)
  })

  it('истёкший Про: снова 5, лишние лежат нетронутыми', async () => {
    h.gateOpen = true
    const s = setup(mk(), { profiles: { [U1]: freeProfile({ plan: 'pro', plan_expires_at: '2026-01-01T00:00:00' }) } })
    const out = await runBinWatch(s.deps)
    expect(out.checked).toBe(5)
    const untouched = s.db.tables.bin_watch.filter(r => r.bin === bins[5] || r.bin === bins[6])
    expect(untouched.every(r => r.last_attempt_at === iso(30 * HOUR))).toBe(true)
  })

  it('админ считается Про: лимит 50, обслуживаются все', async () => {
    const s = setup(mk(), { profiles: { [U1]: adminProfile({ plan: 'free' }) } })
    expect((await runBinWatch(s.deps)).checked).toBe(7)
  })

  it('лимит считается по каждому владельцу отдельно', async () => {
    h.gateOpen = true
    const rows = [...mk(U1), ...mk(U2).map(r => ({ ...r, bin: '2' + r.bin.slice(1) }))]
    const s = setup(rows, { profiles: { [U1]: freeProfile(), [U2]: freeProfile({ plan: 'pro', plan_expires_at: '2027-06-01T00:00:00', email: 'two@example.kz' }) } })
    const out = await runBinWatch(s.deps)
    expect(out.checked).toBe(5 + 7)
    expect(out.overLimit).toBe(2)
  })
})

describe('режим «только админы»', () => {
  const worse = { [A]: company(A, { totalArrear: 50_000 }) }
  const profiles = { [U1]: adminProfile({ is_admin: false }), [U2]: adminProfile({ is_admin: true }) }

  it('не-админов не проверяем и не пишем им, админов - как обычно', async () => {
    const s = setup([row({ user_id: U1 }), row({ user_id: U2, bin: B })], {
      profiles, lookups: { ...worse, [B]: company(B, { totalArrear: 1 }) },
    })
    const out = await runBinWatch(s.deps)
    expect(s.lookup.mock.calls.map(c => c[0])).toEqual([B])
    expect(out.mailsSent).toBe(1)
    expect(s.sendMail.mock.calls[0][0].userId).toBe(U2)
    expect(s.db.tables.bin_watch.find(r => r.user_id === U1)!.last_attempt_at).toBe(iso(30 * HOUR))
  })

  it('ждущее письмо не-админа не уходит, пока гейт закрыт', async () => {
    const s = setup([row({ user_id: U1, baseline: { ...clean, taxDebt: true }, pending_changes: ['taxDebt'], last_attempt_at: iso(HOUR) })], { profiles })
    await runBinWatch(s.deps)
    expect(s.sendMail).not.toHaveBeenCalled()
  })

  it('гейт снят (константа false) - обрабатываются все', async () => {
    h.gateOpen = true
    const s = setup([row({ user_id: U1 })], { profiles, lookups: worse })
    const out = await runBinWatch(s.deps)
    expect(out.mailsSent).toBe(1)
  })

  it('удалённый аккаунт не обрабатывается даже у админа', async () => {
    const s = setup([row({ user_id: U1 })], { profiles: { [U1]: adminProfile({ deleted_at: '2026-10-01T00:00:00Z' }) } })
    await runBinWatch(s.deps)
    expect(s.lookup).not.toHaveBeenCalled()
  })
})
