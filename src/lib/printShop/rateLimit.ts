// src/lib/printShop/rateLimit.ts
// Лимиты публичной витрины брелков (/print). Аудит 24.10.2026, abuse-cost-8:
// заказ создаётся без входа (парсинг шрифта + построение геометрии = CPU, плюс
// строка в БД), а GET /payment по id заказа выпускает настоящий платёж Kaspi на
// кассе основателя. Раньше лимит стоял только на ОДИН заказ (MINT_LIMIT), а не
// на общее число.
//
// Счётчики — та же таблица tool_kontragent_checks (key, day, count), что у
// /tools (src/lib/toolQuota.ts): новой схемы не нужно. Сырой IP и телефон в
// базу не пишем — только sha256 от строки с пространством имён и окном.
// Окно (час/сутки по Алматы) зашито в сам ключ: новый час = новая строка.
//
// Префикс ключа 'kp:' взят нарочно: registryLoadToday (дневной предохранитель
// квоты КГД) исключает строки kp:/wb:/schet:… — реестров эти счётчики не
// трогают, и без правки toolQuota.ts они не раздуют его сумму. Ключ — хэш с
// пространством имён 'print|…', с настоящими КП-счётчиками ('kp|ip|квартал')
// он совпасть не может. weekly-digest пропускает ключи с двоеточием.
// Старые часовые строки не чистятся (по 1 строке на IP/час/область); если
// таблица разрастётся — удалять по day < now() - 30 дней и префиксу kp:.

import type { SupabaseClient } from '@supabase/supabase-js'
import { almatyDay, claimCounterSlot, quotaIp, readCounter, releaseCounterSlot, sha256Hex } from '@/lib/toolQuota'

/** Заказов с одного IP в час (решение аудита: 5/час). */
export const PRINT_ORDER_IP_HOURLY_LIMIT = 5
/** Заказов на один номер телефона в сутки (3/сутки). */
export const PRINT_ORDER_PHONE_DAILY_LIMIT = 3
/** Попыток оформления с IP в час, дошедших до тяжёлой сборки геометрии (CPU), — включая неудачные (400 «другой шрифт»). */
export const PRINT_ORDER_ATTEMPT_IP_HOURLY_LIMIT = 30
/** Новых платежей Kaspi на один IP в час (живой покупатель перевыпускает QR редко: только после истечения). */
export const PRINT_PAYMENT_IP_HOURLY_LIMIT = 6
/** Новых платежей Kaspi по ВСЕМ заказам витрины в час — предохранитель единственного мерчанта. */
export const PRINT_PAYMENT_GLOBAL_HOURLY_LIMIT = 30
/** Запросов GET /payment с одного IP в минуту (покупатель опрашивает раз в 3 с = 20/мин). Только в памяти, best-effort. */
export const PRINT_PAYMENT_REQUESTS_PER_MINUTE = 60
/** Новый платёж Kaspi выпускается только заказам не старше этого (уже выпущенный pending отдаётся и дальше). */
export const PRINT_ORDER_PAYABLE_MS = 2 * 60 * 60 * 1000

/** Брошенные pending-заказы старше этого срока можно удалять (крона для витрины пока нет, см. отчёт). */
export const PRINT_STALE_PENDING_MS = 7 * 24 * 60 * 60 * 1000

export const PRINT_LIMIT_PREFIX = 'kp:'

export type PrintLimitScope = 'attempt-ip' | 'order-ip' | 'order-phone' | 'pay-ip' | 'pay-global'

/** Час по UTC: '2026-10-24T13'. Час в ключе — только корзина, часовой пояс неважен. */
export function hourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13)
}

/** Сутки по Алматы — как у остальных суточных счётчиков. */
export function dayBucket(now = Date.now()): string {
  return almatyDay(now)
}

/** Ключ счётчика: 'kp:' + sha256('print|область|субъект|окно'). Субъект — IP (IPv6 по /64) или номер. */
export function printLimitKey(scope: PrintLimitScope, subject: string, bucket: string): string {
  const s = scope.endsWith('-ip') ? quotaIp(subject) : subject
  return PRINT_LIMIT_PREFIX + sha256Hex(`print|${scope}|${s}|${bucket}`)
}

export type PrintSlotClaim =
  | { status: 'claimed'; used: number }
  | { status: 'limit' }
  | { status: 'unavailable' }

/**
 * Без списания: можно ли ещё занять слот. 'unavailable' — счётчик не читается
 * (вызывающий отвечает отказом: лимит — защита денег, раздавать без него нельзя).
 */
export async function peekPrintLimit(supabase: SupabaseClient, key: string, limit: number): Promise<'ok' | 'limit' | 'unavailable'> {
  const counter = await readCounter(supabase, key)
  if (!counter.ok) return 'unavailable'
  return counter.used >= limit ? 'limit' : 'ok'
}

/**
 * Атомарно занять слот (compare-and-swap, как в /api/tools/waybills): пачка
 * параллельных запросов не проходит вся по одному прочитанному used. На 'raced'
 * перечитываем счётчик; за limit+1 попыток либо занимаем, либо упираемся в лимит.
 * used в 'claimed' — значение счётчика ПОСЛЕ занятия (для releasePrintSlot).
 */
export async function claimPrintSlot(supabase: SupabaseClient, key: string, limit: number): Promise<PrintSlotClaim> {
  const first = await readCounter(supabase, key)
  if (!first.ok) return { status: 'unavailable' }
  let used = first.used
  if (used >= limit) return { status: 'limit' }
  for (let attempt = 0; attempt <= limit; attempt++) {
    const claim = await claimCounterSlot(supabase, key, used)
    if (claim === 'error') return { status: 'unavailable' }
    if (claim === 'claimed') return { status: 'claimed', used: used + 1 }
    const again = await readCounter(supabase, key)
    if (!again.ok) return { status: 'unavailable' }
    used = again.used
    if (used >= limit) return { status: 'limit' }
  }
  return { status: 'unavailable' }
}

/** Вернуть слот, если действие, ради которого его заняли, не состоялось (ошибка записи / Kaspi). */
export async function releasePrintSlot(supabase: SupabaseClient, key: string, usedAfter: number): Promise<void> {
  await releaseCounterSlot(supabase, key, usedAfter)
}

/**
 * Хватает ли платёжному запросу «возраста» заказа: новый платёж Kaspi
 * выпускается только pending-заказу не старше PRINT_ORDER_PAYABLE_MS. Нет
 * даты (или она не парсится) — считаем заказ непригодным: безопаснее отказать.
 */
export function isOrderPayable(order: { status: string; created_at?: string | null }, now = Date.now()): boolean {
  if (order.status !== 'pending') return false
  const created = order.created_at ? Date.parse(order.created_at) : NaN
  if (!Number.isFinite(created)) return false
  return now - created <= PRINT_ORDER_PAYABLE_MS
}

// Лимит запросов в минуту на IP для GET /payment: только в памяти инстанса
// (как rateLimited в /api/tools/waybills). Это защита от бомбёжки опроса и
// живых проверок статуса в Kaspi; деньги защищены счётчиками в БД выше.
const requestHits = new Map<string, number[]>()

export function paymentRequestRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (requestHits.get(ip) || []).filter(t => now - t < 60_000)
  recent.push(now)
  requestHits.set(ip, recent)
  if (requestHits.size > 5000) requestHits.clear()
  return recent.length > PRINT_PAYMENT_REQUESTS_PER_MINUTE
}

/** Только для тестов. */
export function resetPaymentRequestHits(): void {
  requestHits.clear()
}
