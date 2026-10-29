// Суточный прогон слежения за БИН (крон /api/cron/bin-watch). Две фазы:
//
//  1. Проверки. Берём строки, которые пора проверять (раз в сутки), сворачиваем
//     по БИН (один живой запрос на БИН, даже если его ведут несколько
//     пользователей), идём от самых давно проверенных. Каждая проверка берёт
//     слот суточного счётчика крона и не стартует, если общая нагрузка на
//     реестры уже съела запас бесплатных инструментов или вышло время. Что не
//     успели - подхватится на следующий день (порядок «самые давние первыми»
//     этому и служит). Сбой одного БИН остальные не валит.
//  2. Письма. По строкам с ожидающими предупреждениями: не больше одного письма
//     на пользователя в сутки (несколько БИН собираются в одно), только на
//     подтверждённый и не подавленный адрес, и только если владелец не выключил
//     письмо в настройках. Админ-гейт: пока он включён, не-админов не
//     обрабатываем вовсе (ни проверок, ни писем).
//
// Всё внешнее (реестры, почта, часы) приходит через deps, поэтому прогон
// проверяется тестами без сети.

import type { SupabaseClient } from '@supabase/supabase-js'
import { almatyDay, claimCounterSlot, readCounter, registryLoadToday, REGISTRY_DAILY_GLOBAL } from '@/lib/toolQuota'
import { wantsNotification, type NotifyProfile } from '@/lib/notificationPrefs'
import {
  BIN_WATCH_COUNTER_PREFIX, BIN_WATCH_DAILY_MAX, BIN_WATCH_EMAIL_DEADLINE_MS, BIN_WATCH_LOOKUP_DEADLINE_MS,
  BIN_WATCH_MAIL_EVENT, BIN_WATCH_MIN_RECHECK_MS, BIN_WATCH_PACE_MS, BIN_WATCH_ROWS_PER_RUN, BIN_WATCH_TOOL_RESERVE,
  binWatchLimit, canUseBinWatch,
} from './config'
import { isChangeKey, isPartialResult, planRowUpdate, runLookup, type LookupFn, type WatchRow } from './check'
import { isMissingWatchTable, WATCH_COLUMNS, WATCH_TABLE } from './service'
import { parseDetails, parseSignals, stillActive, type ChangeKey } from './signals'
import type { MailItem } from './email'

export const MAIL_LOG_TABLE = 'bin_watch_mail_log'

export interface MailProfile extends NotifyProfile {
  deleted_at?: string | null
  is_admin?: boolean | null
  // Колонки тарифа: по ним binWatchLimit (getActivePlan) считает, сколько строк
  // владельца обслуживать.
  plan?: string | null
  plan_expires_at?: string | null
  bonus_expires_at?: string | null
  trial_expires_at?: string | null
}

export interface RunDeps {
  supabase: SupabaseClient
  lookup: LookupFn
  /** Профиль владельца для решения «слать ли» (настройки уведомлений, админ, удалён). */
  loadProfile: (userId: string) => Promise<MailProfile | null>
  /** Подтверждённый адрес из auth. confirmed=false - не пишем. */
  resolveIdentity: (userId: string) => Promise<{ confirmed: boolean; email: string | null }>
  /** true - ушло; false - пропущено (негодный/подавленный адрес); бросает - сбой отправки. */
  sendMail: (to: { userId: string; email: string }, items: MailItem[], day: string) => Promise<boolean>
  now?: () => number
  lookupDeadlineMs?: number
  emailDeadlineMs?: number
  dailyMax?: number
  toolReserve?: number
  /** Темп холодных проверок, мс (старт к старту). Тесты ставят 0 или свой. */
  paceMs?: number
  /** Пауза; тесты подменяют, чтобы двигать фейковые часы. */
  sleep?: (ms: number) => Promise<void>
}

export interface RunSummary {
  ok: boolean
  reason?: string
  /** Строк, которые пора проверять, после фильтра гейта. */
  dueRows?: number
  /** Проверено БИН (живых запросов). */
  checked?: number
  /** Из них неудачных (реестры не ответили / не найден). */
  failed?: number
  /** Остановка проверок: 'budget' | 'time' | 'counter' | undefined (всё сделано). */
  stoppedBy?: string
  /** Проверок с пустыми признаками (часть реестров не ответила): повтор раньше суток. */
  partial?: number
  /** Строк сверх лимита тарифа владельца: не обслуживаются (ни проверок, ни писем). */
  overLimit?: number
  /** Новых ухудшений найдено (по строкам, не по БИН). */
  worsened?: number
  mailsSent?: number
  mailsSkipped?: number
  mailsDeferred?: number
}

type PendingRow = WatchRow

/** Пользователи, чьи строки обрабатываем: с учётом админ-гейта и удалённых аккаунтов. */
async function eligibleUsers(deps: RunDeps, userIds: string[]): Promise<Set<string>> {
  const ok = new Set<string>()
  for (const id of userIds) {
    const p = await deps.loadProfile(id)
    if (!p || p.deleted_at) continue
    if (!canUseBinWatch(p.is_admin === true)) continue
    ok.add(id)
  }
  return ok
}

/** Взять слот суточного счётчика крона. false - остановиться и доложить причину. */
async function claimSlot(deps: RunDeps, now: number, dailyMax: number, reserve: number): Promise<'ok' | 'budget' | 'counter'> {
  if ((await registryLoadToday(deps.supabase, now)) >= REGISTRY_DAILY_GLOBAL - reserve) return 'budget'
  const key = `${BIN_WATCH_COUNTER_PREFIX}${almatyDay(now)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await readCounter(deps.supabase, key)
    // Счётчик не читается: лучше остановиться, чем гнать без предохранителя.
    if (!c.ok) return 'counter'
    if (c.used >= dailyMax) return 'budget'
    const claim = await claimCounterSlot(deps.supabase, key, c.used, now)
    if (claim === 'claimed') return 'ok'
    if (claim === 'error') return 'counter'
  }
  return 'counter'
}

export async function runBinWatch(rawDeps: RunDeps): Promise<RunSummary> {
  // Профиль читаем один раз на пользователя за прогон.
  const profiles = new Map<string, Promise<MailProfile | null>>()
  const deps: RunDeps = {
    ...rawDeps,
    loadProfile: id => {
      let p = profiles.get(id)
      if (!p) { p = rawDeps.loadProfile(id); profiles.set(id, p) }
      return p
    },
  }
  const clock = deps.now ?? Date.now
  const startedAt = clock()
  const lookupDeadline = deps.lookupDeadlineMs ?? BIN_WATCH_LOOKUP_DEADLINE_MS
  const emailDeadline = deps.emailDeadlineMs ?? BIN_WATCH_EMAIL_DEADLINE_MS
  const dailyMax = deps.dailyMax ?? BIN_WATCH_DAILY_MAX
  const reserve = deps.toolReserve ?? BIN_WATCH_TOOL_RESERVE
  const elapsed = () => clock() - startedAt
  const paceMs = deps.paceMs ?? BIN_WATCH_PACE_MS
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const summary: RunSummary = { ok: true, checked: 0, failed: 0, partial: 0, overLimit: 0, worsened: 0, mailsSent: 0, mailsSkipped: 0, mailsDeferred: 0 }

  // Лимит тарифа держим и в крон-обходе, а не только при добавлении: после
  // окончания Про (или снятия админ-гейта у Free) строки сверх лимита не должны
  // жечь общую квоту реестров и рассылаться. Обслуживаются первые N строк
  // владельца по created_at (N = binWatchLimit по ЕГО текущему тарифу); остальные
  // лежат нетронутыми и снова заработают при продлении Про.
  const served = new Map<string, Promise<Set<string> | null>>()
  const overLimitIds = new Set<string>()
  const servedIds = (userId: string): Promise<Set<string> | null> => {
    let p = served.get(userId)
    if (!p) {
      p = (async () => {
        const profile = await deps.loadProfile(userId)
        const limit = binWatchLimit(profile, new Date(clock()))
        const { data, error } = await deps.supabase
          .from(WATCH_TABLE).select('id').eq('user_id', userId).order('created_at', { ascending: true }).limit(limit)
        if (error) {
          console.error('bin-watch: read user rows failed:', error.message)
          return null // не знаем, какие строки в лимите: этого владельца сегодня пропускаем
        }
        return new Set(((data ?? []) as Array<{ id: string }>).map(r => r.id))
      })()
      served.set(userId, p)
    }
    return p
  }
  /** Строки, которые можно обслуживать: в лимите тарифа владельца. */
  const withinLimit = async (list: WatchRow[]): Promise<WatchRow[]> => {
    const out: WatchRow[] = []
    for (const r of list) {
      const ids = await servedIds(r.user_id)
      if (ids && ids.has(r.id)) out.push(r)
      else overLimitIds.add(r.id)
    }
    return out
  }

  // ---- фаза 1: проверки ----
  const dueBefore = new Date(startedAt - BIN_WATCH_MIN_RECHECK_MS).toISOString()
  const due = await deps.supabase
    .from(WATCH_TABLE)
    .select(WATCH_COLUMNS)
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${dueBefore}`)
    .order('last_attempt_at', { ascending: true, nullsFirst: true })
    .limit(BIN_WATCH_ROWS_PER_RUN)
  if (due.error) {
    if (isMissingWatchTable(due.error)) return { ok: false, reason: 'table_missing' }
    console.error('bin-watch: read due rows failed:', due.error.message)
    return { ok: false, reason: 'read_failed' }
  }
  const dueRows = (due.data ?? []) as WatchRow[]
  const eligible = await eligibleUsers(deps, [...new Set(dueRows.map(r => r.user_id))])
  const rows = await withinLimit(dueRows.filter(r => eligible.has(r.user_id)))
  summary.dueRows = rows.length
  summary.overLimit = overLimitIds.size

  // По БИН; Map хранит порядок первого появления, а строки уже от самых давних.
  const byBin = new Map<string, WatchRow[]>()
  for (const r of rows) {
    const list = byBin.get(r.bin)
    if (list) list.push(r)
    else byBin.set(r.bin, [r])
  }

  let lastStartedAt: number | null = null
  for (const [bin, group] of byBin) {
    if (elapsed() >= lookupDeadline) { summary.stoppedBy = 'time'; break }
    // Темп под лимиты ключей (40 запросов в минуту): пауза до начала следующей
    // проверки считается от СТАРТА предыдущей. Если паузой выйдем за дедлайн,
    // новую проверку уже не начинаем.
    if (lastStartedAt !== null && paceMs > 0) {
      const wait = lastStartedAt + paceMs - clock()
      if (wait > 0) {
        if (elapsed() + wait >= lookupDeadline) { summary.stoppedBy = 'time'; break }
        await sleep(wait)
      }
    }
    const slot = await claimSlot(deps, clock(), dailyMax, reserve)
    if (slot !== 'ok') { summary.stoppedBy = slot; break }
    try {
      lastStartedAt = clock()
      const outcome = await runLookup(deps.lookup, bin)
      summary.checked!++
      if (outcome.status !== 'ok') summary.failed!++
      else if (isPartialResult(outcome.result)) summary.partial!++
      const nowIso = new Date(clock()).toISOString()
      for (const row of group) {
        try {
          const { patch, worsened } = planRowUpdate(row, outcome, nowIso)
          const { error } = await deps.supabase.from(WATCH_TABLE).update(patch).eq('id', row.id)
          if (error) console.error('bin-watch: row update failed:', error.message)
          else summary.worsened! += worsened.length > 0 ? 1 : 0
        } catch (e) {
          console.error('bin-watch: row failed:', e instanceof Error ? e.message : e)
        }
      }
    } catch (e) {
      // Один сбойный БИН не валит остальные.
      summary.failed!++
      console.error('bin-watch: bin failed:', e instanceof Error ? e.message : e)
    }
  }

  // ---- фаза 2: письма ----
  const pending = await deps.supabase
    .from(WATCH_TABLE)
    .select(WATCH_COLUMNS)
    .not('pending_changes', 'eq', '{}')
    .limit(BIN_WATCH_ROWS_PER_RUN)
  if (pending.error) {
    console.error('bin-watch: read pending failed:', pending.error.message)
    return { ...summary, ok: false, reason: 'read_pending_failed' }
  }
  const byUser = new Map<string, PendingRow[]>()
  const pendingRows = ((pending.data ?? []) as PendingRow[]).filter(r => (r.pending_changes ?? []).length > 0)
  const mailEligible = await eligibleUsers(deps, [...new Set(pendingRows.map(r => r.user_id))])
  for (const r of await withinLimit(pendingRows.filter(r => mailEligible.has(r.user_id)))) {
    const list = byUser.get(r.user_id)
    if (list) list.push(r)
    else byUser.set(r.user_id, [r])
  }
  summary.overLimit = overLimitIds.size
  const day = almatyDay(clock())

  for (const [userId, userRows] of byUser) {
    if (!mailEligible.has(userId)) continue
    if (elapsed() >= emailDeadline) { summary.mailsDeferred! += 1; continue }
    try {
      // Актуальные предупреждения: проблема могла пройти до отправки.
      const items: MailItem[] = []
      const resolvedIds: string[] = []
      const sentIds: string[] = []
      for (const r of userRows) {
        const base = parseSignals(r.baseline)
        const keys = stillActive((r.pending_changes ?? []).filter(isChangeKey), base)
        if (keys.length === 0) { resolvedIds.push(r.id); continue }
        sentIds.push(r.id)
        const last = r.last_result && typeof r.last_result === 'object' ? (r.last_result as { details?: unknown }).details : null
        items.push({ bin: r.bin, name: r.name, keys, details: parseDetails(last) })
      }
      if (resolvedIds.length) {
        await deps.supabase.from(WATCH_TABLE).update({ pending_changes: [] }).in('id', resolvedIds)
      }
      if (items.length === 0) continue

      const profile = await deps.loadProfile(userId)
      // Владелец выключил письма: предупреждения не копим, иначе включение вылило бы старьё.
      if (!profile || !wantsNotification({ ...profile, email: profile.email || 'x@x' }, BIN_WATCH_MAIL_EVENT, 'email')) {
        await deps.supabase.from(WATCH_TABLE).update({ pending_changes: [] }).in('id', sentIds)
        summary.mailsSkipped!++
        continue
      }
      const identity = await deps.resolveIdentity(userId)
      if (!identity.confirmed) { summary.mailsSkipped!++; continue }
      const email = identity.email || profile.email
      if (!email) { summary.mailsSkipped!++; continue }

      // Слот суток занимаем ДО отправки: параллельный/повторный прогон второго письма не пошлёт.
      const claim = await deps.supabase.from(MAIL_LOG_TABLE).insert({ user_id: userId, day })
      if (claim.error) {
        // 23505: сегодня уже писали. Предупреждения остаются на завтра.
        if (claim.error.code !== '23505') console.error('bin-watch: mail claim failed:', claim.error.message)
        summary.mailsDeferred!++
        continue
      }
      let sent = false
      try {
        sent = await deps.sendMail({ userId, email }, items, day)
      } catch (e) {
        console.error('bin-watch: send failed:', e instanceof Error ? e.message : e)
      }
      if (!sent) {
        // Адрес подавлен/негоден или сбой: освобождаем слот, завтра попробуем снова.
        await deps.supabase.from(MAIL_LOG_TABLE).delete().eq('user_id', userId).eq('day', day)
        summary.mailsSkipped!++
        continue
      }
      summary.mailsSent!++
      const { error: clearError } = await deps.supabase.from(WATCH_TABLE).update({ pending_changes: [] }).in('id', sentIds)
      if (clearError) console.error('bin-watch: clear pending failed:', clearError.message)
    } catch (e) {
      console.error('bin-watch: user failed:', e instanceof Error ? e.message : e)
    }
  }
  return summary
}

export type { ChangeKey }
