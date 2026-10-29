// Напоминание в директе Instagram через ~2 часа после ответа на кодовое слово
// КОНТРАГЕНТ (решение основателя 29.10.2026): человек получил ссылку на проверку
// по БИН, но не открыл её и не ответил -- бот шлёт ОДНО короткое напоминание.
//
// ПО УМОЛЧАНИЮ ВЫКЛЮЧЕНО. Включается строкой в ai_agent_reply_templates агента с
// маркером @reminder (см. instagramSpecialTemplates.ts): пока строки нет, обработчик
// webhookHandler.ts отвечает ровно как раньше (ни токена, ни записей), а крон
// ничего не отправляет. Текст напоминания -- reply_text этой строки (правится в
// списке «Шаблоны»); пустой текст = DEFAULT_REMINDER_TEXT из кода. Выключить:
// удалить строку или заменить маркер на @reminder_off.
//
// КАК УЗНАТЬ, ОТКРЫЛ ЛИ ЧЕЛОВЕК ССЫЛКУ (атрибуция). Анонимный просмотр в
// tool_events с диалогом не связан. Поэтому в ссылках ответа (текст и кнопка на
// /go/dm-kontragent[-btn]) к адресу добавляется utm_content=<токен>: случайная
// непрозрачная строка из 16 символов (96 бит из crypto.randomBytes), по одной на
// ДИАЛОГ. Токен не выводится ни из id Instagram, ни из имени, ни из времени --
// узнать по нему человека нельзя, соответствие «токен -> диалог» лежит только в
// таблице ig_dm_reminders (RLS без политик, доступ service-role). Страница
// инструмента пишет utm_content в tool_events (колонка добавляется миграцией
// tool_events_utm_content.sql), и крон ищет любое событие с этим токеном: нашёл --
// человек ссылку открыл, напоминания не будет. Нет события -- не открыл (или
// запретил скрипты/блокирует аналитику: тогда напоминание уйдёт зря, это
// осознанная цена; обратной ошибки -- молчать тому, кто не открывал -- нет).
//
// ГАРАНТИИ.
//  - Одно напоминание на диалог за всё время: ig_dm_reminders.conversation_id UNIQUE.
//    Повторное КОНТРАГЕНТ строку не создаёт и переиспользует токен.
//  - Нет гонок: переход pending -> sending -- условный UPDATE (как claim в email_drips),
//    победить может только один вызов; после claim строка не возвращается в pending,
//    поэтому сбой отправки НЕ повторяется (см. runDmReminders).
//  - Ссылка могла не дойти: строка создаётся как 'prepared' и становится 'pending'
//    только после успешной отправки ответа (confirmReminderLinkSent).
//  - Окно Instagram 24 часа считается от последнего входящего, шлём не позже 22 часов.
//  - Любое новое входящее после ответа бота (в том числе повторное слово или
//    нажатие «готового вопроса») -- напоминания не будет.
//  - Предохранитель: не больше REMINDER_DAILY_LIMIT напоминаний за 24 часа на агента
//    и REMINDER_PER_RUN_LIMIT за один запуск крона.
//  - В логах только счётчики и коды причин: ни токена, ни id Instagram, ни имён, ни текстов.

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UTM_CONTENT_RE } from '@/lib/toolEvents/schema'
import { parseTemplateReplyText } from '@/lib/instagramButtonTemplate'
import { findSpecialTemplate, SPECIAL_TRIGGERS, type TemplateRow } from './instagramSpecialTemplates'

export const REMINDER_TABLE = 'ig_dm_reminders'

/** Через сколько после ответа бота можно напоминать. */
export const REMINDER_AFTER_MS = 2 * 3600_000
/** Позже этого срока от последнего входящего не шлём (окно Instagram -- 24 часа, 2 часа запаса). */
export const REMINDER_WINDOW_MAX_MS = 22 * 3600_000
/** Не больше напоминаний за 24 часа на агента (защита от лавины при баге). */
export const REMINDER_DAILY_LIMIT = 50
/** Не больше отправок за один запуск крона (без массовости). */
export const REMINDER_PER_RUN_LIMIT = 20
/** Сколько строк просматриваем за запуск. */
export const REMINDER_SCAN_LIMIT = 50
/**
 * Бюджет времени одного запуска. Отправки идут последовательно (каждая до 20 с по таймауту),
 * а функция Vercel живёт maxDuration=60 с: новую строку после бюджета не начинаем, остаток
 * подхватит следующий тик (через 10 минут, окно 22 часа это позволяет).
 */
export const REMINDER_TIME_BUDGET_MS = 30_000
/** Строка, застрявшая в 'sending' дольше этого (процесс убит между claim и markSent), -> failed/interrupted. */
export const REMINDER_STUCK_AFTER_MS = 10 * 60_000

/** Ссылки /go/<код>, которые получают токен. Остальные ответы агента не затрагиваются. */
export const REMINDER_TRACKED_GO_CODES = ['dm-kontragent-btn', 'dm-kontragent'] as const

/** Ссылка в напоминании -- отдельная кампания, чтобы отличать заходы по напоминанию (goLinks.ts). */
export const DEFAULT_REMINDER_TEXT =
  'Если проверка по БИН ещё нужна, ссылка здесь: https://invoices.kz/go/dm-kontragent-rem\n\n3 проверки в квартал бесплатно.'

// ---------------------------------------------------------------- чистая логика

/** 16 символов base64url (A-Za-z0-9_-), 96 бит случайности. */
export function newReminderToken(): string {
  return randomBytes(12).toString('base64url')
}

const TRACKED_LINK_RE = new RegExp(
  `https://invoices\\.kz/go/(?:${REMINDER_TRACKED_GO_CODES.join('|')})(?![A-Za-z0-9_-])(\\?[^\\s]*)?`,
  'g',
)

export function hasTrackedLink(text: string): boolean {
  return typeof text === 'string' && new RegExp(TRACKED_LINK_RE.source).test(text)
}

/** Добавляет utm_content=<токен> ко всем отслеживаемым ссылкам текста; остальной текст не меняет. */
export function withReminderToken(text: string, token: string): string {
  if (typeof text !== 'string' || !UTM_CONTENT_RE.test(token)) return text
  return text.replace(TRACKED_LINK_RE, (url, query: string | undefined) => {
    if (query && /[?&]utm_content=/.test(query)) return url
    return `${url}${query ? '&' : '?'}utm_content=${token}`
  })
}

export interface ReplyWithButton {
  reply_text: string
  button: { title: string; subtitle: string; buttonTitle: string; url: string } | null
}

/** Ответ шаблона содержит отслеживаемую ссылку (в тексте или на кнопке). */
export function replyHasTrackedLink(r: ReplyWithButton): boolean {
  return hasTrackedLink(r.reply_text) || (!!r.button && hasTrackedLink(r.button.url))
}

/** Тот же ответ, но со ссылками, несущими токен (текст и кнопка). */
export function withTokenInReply<T extends ReplyWithButton>(r: T, token: string): T {
  return {
    ...r,
    reply_text: withReminderToken(r.reply_text, token),
    button: r.button ? { ...r.button, url: withReminderToken(r.button.url, token) } : null,
  }
}

export interface ReminderConfig {
  enabled: boolean
  text: string
}

/** Настройка из строк шаблонов агента: есть строка @reminder -- включено. */
export function reminderConfigFromRows(rows: TemplateRow[]): ReminderConfig {
  const row = findSpecialTemplate(rows, SPECIAL_TRIGGERS.reminder)
  if (!row) return { enabled: false, text: '' }
  const text = typeof row.reply_text === 'string' ? parseTemplateReplyText(row.reply_text).plainText.trim() : ''
  return { enabled: true, text: text || DEFAULT_REMINDER_TEXT }
}

export type ReminderSkipReason = 'replied' | 'expired' | 'visited'
export type ReminderDecision = { action: 'wait' } | { action: 'skip'; reason: ReminderSkipReason } | { action: 'send' }

export interface DecideInput {
  now: number
  /** Когда ушёл ответ со ссылкой. */
  linkSentAt: string
  /** Последнее входящее ВО ВРЕМЯ отправки ответа (строка из базы как есть). */
  baselineInboundAt: string
  /** Последнее входящее сейчас (null -- нет вообще). */
  latestInboundAt: string | null
  /** Есть событие tool_events с токеном диалога (или проверить не удалось). */
  visited: boolean
}

const ms = (iso: string) => Date.parse(iso)

/**
 * Порядок важен: новое входящее и истёкшее окно сильнее посещения (причина в статусе
 * точнее), «подождать» -- только если ничто из этого не сработало.
 */
export function decideReminder(i: DecideInput): ReminderDecision {
  const baseline = ms(i.baselineInboundAt)
  const sent = ms(i.linkSentAt)
  if (!Number.isFinite(baseline) || !Number.isFinite(sent)) return { action: 'skip', reason: 'expired' }
  // Любое входящее строго позже базового -- человек написал снова (слово, кнопка, вопрос).
  if (i.latestInboundAt && ms(i.latestInboundAt) > baseline) return { action: 'skip', reason: 'replied' }
  // Окно считаем от последнего входящего: за 22 часа до его конца отправку уже не начинаем.
  if (i.now - baseline >= REMINDER_WINDOW_MAX_MS) return { action: 'skip', reason: 'expired' }
  if (i.visited) return { action: 'skip', reason: 'visited' }
  if (i.now - sent < REMINDER_AFTER_MS) return { action: 'wait' }
  return { action: 'send' }
}

// ---------------------------------------------------------------- база: сторона ответа

let attributionCache: { ok: boolean; at: number } | null = null

/** Только для тестов. */
export function resetAttributionCache(): void {
  attributionCache = null
}

/**
 * Готова ли атрибуция: колонка tool_events.utm_content существует. Без неё токен в ссылке
 * ничего бы не дал, а крон принял бы каждого за «не открывавшего». Успех кешируем на 10
 * минут, отказ на минуту (после применения миграции подхватится быстро).
 */
export async function attributionReady(db: SupabaseClient, now = Date.now()): Promise<boolean> {
  if (attributionCache && now - attributionCache.at < (attributionCache.ok ? 600_000 : 60_000)) return attributionCache.ok
  const { error } = await db.from('tool_events').select('utm_content').limit(1)
  attributionCache = { ok: !error, at: now }
  if (error) console.error('dm-reminder: tool_events.utm_content is not available (code', error.code ?? 'unknown', ')')
  return !error
}

/** Время последнего входящего сообщения диалога (строка из базы как есть) или null. */
export async function latestInboundAt(db: SupabaseClient, conversationId: string): Promise<string | null> {
  const { data } = await db.from('ai_agent_messages').select('created_at')
    .eq('conversation_id', conversationId).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const at = (data as { created_at?: unknown } | null)?.created_at
  return typeof at === 'string' ? at : null
}

/**
 * Перед отправкой ответа на слово: токен диалога для ссылок или null (тогда ответ уходит
 * как раньше, без токена). Строку создаёт как 'prepared' -- напоминанием она станет только
 * после confirmReminderLinkSent. Повторный вызов в том же диалоге отдаёт тот же токен.
 * Не бросает: сбой трекинга не должен мешать ответу клиенту.
 */
export async function prepareReminderTracking(db: SupabaseClient, args: { agentId: string; conversationId: string }): Promise<string | null> {
  try {
    if (!(await attributionReady(db))) return null
    const nowIso = new Date().toISOString()
    const { error } = await db.from(REMINDER_TABLE).upsert(
      { agent_id: args.agentId, conversation_id: args.conversationId, token: newReminderToken(), status: 'prepared', link_sent_at: nowIso, last_inbound_at: nowIso },
      { onConflict: 'conversation_id', ignoreDuplicates: true },
    )
    if (error) {
      console.error('dm-reminder: prepare failed (code', error.code ?? 'unknown', ')')
      return null
    }
    const { data } = await db.from(REMINDER_TABLE).select('token').eq('conversation_id', args.conversationId).maybeSingle()
    const token = (data as { token?: unknown } | null)?.token
    return typeof token === 'string' && UTM_CONTENT_RE.test(token) ? token : null
  } catch (err) {
    console.error('dm-reminder: prepare threw:', err instanceof Error ? err.name : 'error')
    return null
  }
}

/**
 * Ответ со ссылкой ушёл: 'prepared' -> 'pending', и отсчёт 2 часов идёт отсюда. Базовое
 * «последнее входящее» фиксируется здесь же. Не бросает. Если строка уже pending/sent/...
 * (повторное слово в том же диалоге), ничего не меняется.
 */
export async function confirmReminderLinkSent(db: SupabaseClient, conversationId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString()
    const latest = await latestInboundAt(db, conversationId)
    const { error } = await db.from(REMINDER_TABLE)
      .update({ status: 'pending', link_sent_at: nowIso, last_inbound_at: latest ?? nowIso })
      .eq('conversation_id', conversationId).eq('status', 'prepared')
    if (error) console.error('dm-reminder: confirm failed (code', error.code ?? 'unknown', ')')
  } catch (err) {
    console.error('dm-reminder: confirm threw:', err instanceof Error ? err.name : 'error')
  }
}

// ---------------------------------------------------------------- крон: сторона напоминания

export interface ReminderRow {
  id: string
  agent_id: string
  conversation_id: string
  token: string
  link_sent_at: string
  last_inbound_at: string
}

export interface ReminderConversation {
  external_thread_id: string
  channel: string
  source: string | null
  paused_for_human: boolean
}

/** Всё, что крон делает с базой; боевая реализация -- dmReminderStore.ts, в тестах -- поддельная. */
export interface ReminderStore {
  /** pending, у которых окно уже закрыто (последнее входящее старше 22 часов), -> skipped/expired. */
  expireStale(nowIso: string): Promise<void>
  /**
   * Застрявшие в 'sending' дольше REMINDER_STUCK_AFTER_MS -> failed/interrupted (повтора нет:
   * сообщение могло уйти). Возвращает, сколько строк закрыто, чтобы потери были видны в сводке.
   */
  reapStuck(nowIso: string): Promise<number>
  /** Агенты с включённым напоминанием и их текст. */
  loadAgentConfigs(): Promise<Map<string, ReminderConfig>>
  /** Готовые к отправке pending ТОЛЬКО указанных агентов (выключенные и упёршиеся в лимит не занимают голову очереди). */
  listDue(nowIso: string, limit: number, agentIds: string[]): Promise<ReminderRow[]>
  conversation(id: string): Promise<ReminderConversation | null>
  latestInboundAt(conversationId: string): Promise<string | null>
  /** Было ли событие с этим токеном. При ошибке чтения ВЕРНУТЬ true (не уверены -- молчим). */
  hasVisit(token: string): Promise<boolean>
  markSkipped(id: string, reason: string): Promise<void>
  /** Сколько напоминаний агента взято в работу с sinceIso. */
  countClaimsSince(agentId: string, sinceIso: string): Promise<number>
  /** Атомарно pending -> sending. true только у единственного победителя. */
  claim(id: string, nowIso: string): Promise<boolean>
  markSent(id: string, nowIso: string): Promise<void>
  markFailed(id: string, reason: string): Promise<void>
  logOutbound(conversationId: string, text: string): Promise<void>
}

export interface ReminderDeps {
  store: ReminderStore
  /** Существует ли колонка tool_events.utm_content (иначе посещения не определить). */
  attributionReady(): Promise<boolean>
  /** Может ли агент сейчас отвечать (включён, у владельца Про). */
  agentCanReply(agentId: string): Promise<boolean>
  /** Подключение Instagram агента или null. */
  loadConnection(agentId: string): Promise<{ connectionId: string; externalAccountId: string; accessToken: string } | null>
  /** Отправка обычного текста (токен -- только заголовком Authorization). Бросает при отказе Meta. */
  sendText(conn: { externalAccountId: string; accessToken: string }, recipientId: string, text: string): Promise<void>
  /** Реакция на отказ отправки (например, пометить токен просроченным при 401). Не должна бросать. */
  onSendError?(connectionId: string, err: unknown): Promise<void>
  now?: () => number
  /** Реальные часы для бюджета времени запуска (в тестах подменяются). */
  clock?: () => number
}

export interface ReminderRunSummary {
  disabled?: boolean
  attributionReady?: boolean
  scanned: number
  sent: number
  failed: number
  /** Строки, оставленные из-за суточного лимита, достигнутого по ходу запуска. */
  capped: number
  /** Агенты, уже упёршиеся в суточный лимит до выборки. */
  cappedAgents: number
  /** Строки 'sending', закрытые как failed/interrupted (процесс был убит посреди отправки). */
  stuck: number
  /** Запуск остановлен по бюджету времени, остаток подхватит следующий тик. */
  timeBudgetHit?: boolean
  waiting: number
  skipped: Record<string, number>
}

/** Короткий код причины отказа без персональных данных: HTTP-статус и коды Meta. */
export function failureReason(err: unknown): string {
  const e = err as { status?: unknown; metaCode?: unknown; metaSubcode?: unknown } | null
  const parts = ['error']
  if (typeof e?.status === 'number') parts.push(`http${e.status}`)
  if (typeof e?.metaCode === 'number') parts.push(`code${e.metaCode}`)
  if (typeof e?.metaSubcode === 'number') parts.push(`sub${e.metaSubcode}`)
  return parts.join(':')
}

/**
 * Один проход крона. Ничего не бросает наружу из-за одной строки: сбой строки считается и
 * идёт дальше. ОШИБКА ОТПРАВКИ НЕ ПОВТОРЯЕТСЯ: после claim строка уходит в 'failed' и обратно
 * не возвращается. Причины: почти все отказы Meta постоянные (окно закрыто, токен просрочен,
 * пользователь недоступен), а при таймауте (status 0) сообщение могло дойти, и повтор дал бы
 * второе напоминание -- хуже одного потерянного. Сбой процесса между claim и markSent оставляет 'sending':
 * через REMINDER_STUCK_AFTER_MS такую строку закрывает reapStuck (failed/interrupted, счётчик
 * summary.stuck), повтора и дубля нет.
 */
export async function runDmReminders(deps: ReminderDeps): Promise<ReminderRunSummary> {
  const now = (deps.now ?? Date.now)()
  const clock = deps.clock ?? Date.now
  const startedAt = clock()
  const nowIso = new Date(now).toISOString()
  const summary: ReminderRunSummary = { scanned: 0, sent: 0, failed: 0, capped: 0, cappedAgents: 0, stuck: 0, waiting: 0, skipped: {} }
  const skip = (reason: string) => { summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1 }
  const { store } = deps

  await store.expireStale(nowIso)
  summary.stuck = await store.reapStuck(nowIso)

  const configs = await store.loadAgentConfigs()
  if (configs.size === 0) { summary.disabled = true; return summary }

  // Без колонки utm_content посещение определить нельзя: лучше промолчать, чем напомнить
  // всем, включая открывших. Строки остаются pending до применения миграции (или до
  // истечения окна, тогда их закроет expireStale).
  if (!(await deps.attributionReady())) { summary.attributionReady = false; return summary }

  // Суточный лимит считаем ДО выборки: агент, упёршийся в него, не попадает в список, и его
  // строки не занимают голову очереди (раньше они пропускались через continue и мешали остальным).
  const sinceIso = new Date(now - 24 * 3600_000).toISOString()
  const remaining = new Map<string, number>()
  for (const agentId of configs.keys()) {
    const claimed = await store.countClaimsSince(agentId, sinceIso)
    if (claimed >= REMINDER_DAILY_LIMIT) summary.cappedAgents++
    else remaining.set(agentId, REMINDER_DAILY_LIMIT - claimed)
  }
  if (remaining.size === 0) return summary

  const due = await store.listDue(nowIso, REMINDER_SCAN_LIMIT, [...remaining.keys()])

  // Результаты, зависящие только от агента, считаем один раз за запуск.
  const canReplyCache = new Map<string, Promise<boolean>>()
  const canReply = (agentId: string) => {
    let p = canReplyCache.get(agentId)
    if (!p) { p = deps.agentCanReply(agentId); canReplyCache.set(agentId, p) }
    return p
  }
  type Conn = Awaited<ReturnType<ReminderDeps['loadConnection']>>
  const connCache = new Map<string, Promise<Conn>>()
  const connection = (agentId: string) => {
    let p = connCache.get(agentId)
    if (!p) { p = deps.loadConnection(agentId); connCache.set(agentId, p) }
    return p
  }

  for (const row of due) {
    if (summary.sent + summary.failed >= REMINDER_PER_RUN_LIMIT) break
    if (clock() - startedAt >= REMINDER_TIME_BUDGET_MS) { summary.timeBudgetHit = true; break }
    summary.scanned++
    try {
      const cfg = configs.get(row.agent_id)
      if (!cfg) continue // выборка уже отфильтрована по агентам; защита от рассинхрона

      const conv = await store.conversation(row.conversation_id)
      if (!conv || conv.channel !== 'instagram' || conv.source !== 'dm') { await store.markSkipped(row.id, 'no_conversation'); skip('no_conversation'); continue }
      if (conv.paused_for_human) { await store.markSkipped(row.id, 'paused'); skip('paused'); continue }

      const [latest, visited] = await Promise.all([store.latestInboundAt(row.conversation_id), store.hasVisit(row.token)])
      const decision = decideReminder({ now, linkSentAt: row.link_sent_at, baselineInboundAt: row.last_inbound_at, latestInboundAt: latest, visited })
      if (decision.action === 'wait') { summary.waiting++; continue }
      if (decision.action === 'skip') { await store.markSkipped(row.id, decision.reason); skip(decision.reason); continue }

      if (!(await canReply(row.agent_id))) { await store.markSkipped(row.id, 'agent_off'); skip('agent_off'); continue }
      const conn = await connection(row.agent_id)
      if (!conn) { await store.markSkipped(row.id, 'no_connection'); skip('no_connection'); continue }

      if ((remaining.get(row.agent_id) ?? 0) <= 0) { summary.capped++; continue }

      if (!(await store.claim(row.id, nowIso))) continue // параллельный запуск успел раньше
      remaining.set(row.agent_id, (remaining.get(row.agent_id) ?? 0) - 1)

      try {
        await deps.sendText(conn, conv.external_thread_id, cfg.text)
      } catch (err) {
        const reason = failureReason(err)
        await store.markFailed(row.id, reason)
        summary.failed++
        skip(reason)
        // Подключение могли пометить просроченным: следующая строка этого агента перечитает его.
        connCache.delete(row.agent_id)
        try { await deps.onSendError?.(conn.connectionId, err) } catch { /* лог не важнее */ }
        continue
      }
      await store.markSent(row.id, nowIso)
      summary.sent++
      try { await store.logOutbound(row.conversation_id, cfg.text) } catch { /* сообщение ушло; журнал вторичен */ }
    } catch (err) {
      // Сбой чтения/записи по одной строке: считаем и идём дальше. Строка остаётся pending
      // (если сбой до claim) и будет рассмотрена в следующий тик, пока открыто окно.
      skip('row_error')
      console.error('dm-reminder: row failed:', err instanceof Error ? err.name : 'error')
    }
  }
  return summary
}
