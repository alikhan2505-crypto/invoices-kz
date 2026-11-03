// Лимиты на публичный push «оплата по телефону» со страницы счёта /view/[token]
// (POST /api/kaspi/invoice-payment-phone). Маршрут открыт без входа: плательщик
// вводит номер сам, и платформа шлёт на него настоящий push от кассы владельца
// счёта. Раньше держал только лимит на один счёт (3 push в час, считается по
// kaspi_payment_requests): тому, у кого есть публичные ссылки на много счетов,
// ничто не мешало заспамить чужой номер или выжечь Kaspi-подключения владельцев
// (аудит 02.11.2026, п. 4).
//
// Теперь поверх лимита на счёт действуют:
//  - на НОМЕР: не больше PHONE_HOURLY_LIMIT push в час на номер со ВСЕХ счетов;
//  - на IP:    не больше IP_HOURLY_LIMIT push в час с одного адреса.
// Лимиты и ключи счётчиков те же, что у phonePushLimits.ts (подписка и пополнение
// кошелька): номер получит от платформы не больше пары запросов в час, откуда бы
// их ни просили. Новой схемы не нужно -- строки tool_kontragent_checks.
//
// Два слоя:
//  1) в БД (windowLimits, compare-and-swap) -- общий для всех serverless-инстансов,
//     это настоящая защита;
//  2) в памяти инстанса -- дешёвый первый заслон (отказ без запросов в БД) и
//     страховка, если счётчик в БД не отвечает. Между инстансами память не
//     делится, поэтому одна она лимит не обеспечивает.
//
// Слот занимается ДО обращения к Kaspi. Возвращает его release(): маршрут зовёт
// её, когда push заведомо не уходил (счёт закрыт, нет денег на комиссию и т.п.) --
// иначе любой мог бы «выбить» чужой номер из лимита, не отправив ни одного push.
// Слот НОМЕРА защищает третьего человека, а слот IP -- владельцев счетов: запрос,
// не дошедший до push, всё равно мог сходить в Kaspi за статусом и в базу за
// кошельком, поэтому release({ keepIp: true }) возвращает только номер и оставляет
// слот адреса занятым (иначе цикл по счёту на потолке лимита ничего не стоил бы).
// Сбой самого Kaspi слот НЕ возвращает: неудачные попытки тоже считаются. Сбой
// счётчика в БД платёж не блокирует (лимит -- защита, а не повод не взять деньги).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { claimWindowSlot, releaseWindowSlot, windowKey, phoneLimitSubject, hourBucket } from '@/lib/windowLimits'
import { PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT, PUSH_PHONE_PREFIX, PUSH_IP_PREFIX } from './phonePushLimits'

const HOUR_MS = 3_600_000

/** Сколько секунд до начала следующего часового окна (окно -- по UTC, как у windowLimits). Не меньше 1. */
export function secondsToNextHour(now = Date.now()): number {
  const next = (hourBucket(now) + 1) * HOUR_MS
  return Math.max(1, Math.ceil((next - now) / 1000))
}

// Счётчики инстанса: ключ -> сколько слотов занято в текущем часовом окне.
// Новый час -- всё забываем. Больше 5000 ключей -- тоже (как у остальных
// лимитеров в памяти): рост ограничен, а настоящий лимит держит БД.
const memCounts = new Map<string, number>()
let memBucket = -1

function memClaim(key: string, limit: number, bucket: number): boolean {
  if (bucket !== memBucket) { memCounts.clear(); memBucket = bucket }
  if (memCounts.size > 5000) memCounts.clear()
  const used = memCounts.get(key) ?? 0
  if (used >= limit) return false
  memCounts.set(key, used + 1)
  return true
}

function memRelease(key: string, bucket: number): void {
  if (bucket !== memBucket) return
  const used = memCounts.get(key) ?? 0
  if (used <= 1) memCounts.delete(key)
  else memCounts.set(key, used - 1)
}

/** Только для тестов. */
export function resetInvoicePushMemory(): void {
  memCounts.clear()
  memBucket = -1
}

export type InvoicePushClaim =
  | { ok: true; release: (opts?: { keepIp?: boolean }) => Promise<void> }
  | { ok: false; scope: 'phone' | 'ip'; retryAfterSec: number }

/**
 * Занять слоты на номер и на IP под один push. ok:false -- лимит исчерпан
 * (маршрут отвечает 429 rate_limited с Retry-After = retryAfterSec).
 * ok:true -- release() возвращает занятые слоты, release({ keepIp: true }) только слот
 * номера (обе идемпотентны).
 *
 * Номер, в котором меньше 10 цифр, номером не является: push на него уйти не
 * может (createPhonePaymentForInvoice ответит invalid_phone), слотов не занимаем.
 */
export async function claimInvoicePushSlots(
  supabase: SupabaseClient,
  headers: Headers,
  phone: unknown,
  now = Date.now(),
): Promise<InvoicePushClaim> {
  const subject = phoneLimitSubject(phone)
  if (subject.length < 10) return { ok: true, release: async () => {} }

  const bucket = hourBucket(now)
  const retryAfterSec = secondsToNextHour(now)
  const ip = clientIp(headers)
  // 'unknown' -- IP не определился; один общий счётчик на всех заблокировал бы
  // всех, поэтому без адреса остаётся только лимит на номер.
  const ipSubject = ip === 'unknown' ? null : quotaIp(ip)

  const ipUndo: Array<() => Promise<void>> = []
  const phoneUndo: Array<() => Promise<void>> = []
  let phoneReleased = false
  let ipReleased = false
  const release = async (opts?: { keepIp?: boolean }) => {
    if (!phoneReleased) {
      phoneReleased = true
      for (const fn of phoneUndo.reverse()) await fn()
    }
    if (!opts?.keepIp && !ipReleased) {
      ipReleased = true
      for (const fn of ipUndo.reverse()) await fn()
    }
  }
  const blocked = async (scope: 'phone' | 'ip'): Promise<InvoicePushClaim> => {
    await release()
    return { ok: false, scope, retryAfterSec }
  }

  // Сначала IP: источник злоупотребления отсекается раньше, чем тронет
  // счётчик чужого номера (даже на миг).
  if (ipSubject) {
    const memKey = `ip:${ipSubject}`
    if (!memClaim(memKey, IP_HOURLY_LIMIT, bucket)) {
      console.error('Invoice phone push: per-IP hourly limit hit (instance memory)')
      return blocked('ip')
    }
    ipUndo.push(async () => memRelease(memKey, bucket))

    const dbKey = windowKey(PUSH_IP_PREFIX, ipSubject, bucket)
    const res = await claimWindowSlot(supabase, dbKey, IP_HOURLY_LIMIT)
    if (res.ok) ipUndo.push(() => releaseWindowSlot(supabase, dbKey))
    else if (res.reason === 'limit') {
      console.error('Invoice phone push: per-IP hourly limit hit')
      return blocked('ip')
    }
    // reason 'error' -- счётчик в БД не отвечает: пропускаем, держит память инстанса.
  }

  const memKey = `phone:${subject}`
  if (!memClaim(memKey, PHONE_HOURLY_LIMIT, bucket)) {
    console.error('Invoice phone push: per-phone hourly limit hit (instance memory)')
    return blocked('phone')
  }
  phoneUndo.push(async () => memRelease(memKey, bucket))

  const dbKey = windowKey(PUSH_PHONE_PREFIX, subject, bucket)
  const res = await claimWindowSlot(supabase, dbKey, PHONE_HOURLY_LIMIT)
  if (res.ok) phoneUndo.push(() => releaseWindowSlot(supabase, dbKey))
  else if (res.reason === 'limit') {
    console.error('Invoice phone push: per-phone hourly limit hit')
    return blocked('phone')
  }

  return { ok: true, release }
}
