// Лимиты бесплатных инструментов /tools по IP — общий счётчик
// tool_kontragent_checks (key, day, count). Им пользуются:
//   - /api/tools/kontragent      — 3 проверки контрагента на IP в квартал;
//   - /api/tools/kp/quota        — 3 коммерческих предложения на IP в квартал;
//   - /api/tools/name-lookup     — название по БИН/ИИН для /tools/kp, schet, avr,
//                                  nakladnaya: 3 живых запроса в реестр на IP в квартал
//                                  НА КАЖДОЕ ПОЛЕ КАЖДОГО ИНСТРУМЕНТА (КП-поставщик 3,
//                                  КП-клиент 3, Счёт-поставщик 3, … — решение основателя
//                                  14.10.2026). Поиск по нашему кэшу счётчик не трогает.
// Сырой IP в базу не пишем — только sha256 от строки с пространством имён и
// кварталом. Колонка day = день последнего списания; по ней считается общий
// дневной предохранитель квоты КГД/egov.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const COUNTER_TABLE = 'tool_kontragent_checks'

/** Общий дневной предохранитель живых походов в реестры (КГД: 40 запросов/мин на токен). */
export const REGISTRY_DAILY_GLOBAL = 300

/** КП: бесплатных предложений на IP в квартал (решение основателя 14.10.2026). */
export const KP_QUARTER_LIMIT = 3
/** Поиск названия по БИН/ИИН: живых запросов в реестр на IP в квартал — на одно поле одного инструмента. */
export const NAME_LOOKUP_QUARTER_LIMIT = 3

/**
 * Строки счётчика помечены видимым префиксом. Сами КП (kp:) реестры не трогают,
 * поэтому дневной предохранитель их не считает. Живые поиски названия (lookup:)
 * — считает, они тратят ту же квоту, что и проверка контрагента. Ключи самой
 * проверки контрагента — голый sha256 без двоеточия (см. weekly-digest).
 */
export const KP_CLAIM_PREFIX = 'kp:'
export const NAME_LOOKUP_PREFIX = 'lookup:'

/** Инструменты и поля, для которых работает поиск названия, — белый список. */
export const NAME_LOOKUP_TOOLS = ['kp', 'schet', 'avr', 'nakladnaya'] as const
export const NAME_LOOKUP_ROLES = ['seller', 'client'] as const
export type NameLookupTool = (typeof NAME_LOOKUP_TOOLS)[number]
export type NameLookupRole = (typeof NAME_LOOKUP_ROLES)[number]

/** tool/role из тела запроса — только из белого списка, иначе null (роут отвечает 400). */
export function parseNameLookupTarget(tool: unknown, role: unknown): { tool: NameLookupTool; role: NameLookupRole } | null {
  const okTool = (NAME_LOOKUP_TOOLS as readonly unknown[]).includes(tool)
  const okRole = (NAME_LOOKUP_ROLES as readonly unknown[]).includes(role)
  return okTool && okRole ? { tool: tool as NameLookupTool, role: role as NameLookupRole } : null
}

const ALMATY_OFFSET_MS = 5 * 3600_000 // Казахстан — единый UTC+5

/** Календарный день по Алматы: '2026-10-14'. */
export function almatyDay(now = Date.now()): string {
  return new Date(now + ALMATY_OFFSET_MS).toISOString().slice(0, 10)
}

/** Квартал по Алматы: '2026-Q4'. Обнуляется 1 января, 1 апреля, 1 июля и 1 октября. */
export function almatyQuarter(now = Date.now()): string {
  const d = new Date(now + ALMATY_OFFSET_MS)
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

/** Первый день следующего квартала по Алматы: '2027-01-01' — когда счётчик обнулится. */
export function nextQuarterStart(now = Date.now()): string {
  const d = new Date(now + ALMATY_OFFSET_MS)
  const startMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 3
  const year = d.getUTCFullYear() + (startMonth >= 12 ? 1 : 0)
  const month = startMonth % 12
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/**
 * Ключ счётчика КП. Хэшируется строка с пространством имён ('kp|ip|квартал'),
 * так что с ключами контрагента (sha256('ip|квартал')) она не совпадёт никогда,
 * а видимый префикс отделяет строки для предохранителя.
 */
export function kpClaimKey(ip: string, quarter: string): string {
  return KP_CLAIM_PREFIX + sha256Hex(`kp|${ip}|${quarter}`)
}

/** Ключ счётчика живых поисков названия: свой на каждую пару инструмент+поле. */
export function nameLookupKey(tool: NameLookupTool, role: NameLookupRole, ip: string, quarter: string): string {
  return NAME_LOOKUP_PREFIX + sha256Hex(`lookup|${tool}|${role}|${ip}|${quarter}`)
}

/** Сколько осталось при used из limit; никогда не меньше нуля. */
export function remainingOf(used: number, limit: number): number {
  return Math.max(0, limit - Math.max(0, Math.floor(used || 0)))
}

/** IP посетителя: первый адрес из x-forwarded-for (Vercel ставит его всегда). */
export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}

/** Название из ответа реестра/кэша — только непустая строка, лишние пробелы убраны. */
export function cleanCompanyName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const s = name.replace(/\s+/g, ' ').trim()
  return s || null
}

export type CounterRead = { ok: true; used: number } | { ok: false }

/** Текущее значение счётчика. ok:false — счётчик не читается (роут отвечает отказом). */
export async function readCounter(supabase: SupabaseClient, key: string): Promise<CounterRead> {
  const { data, error } = await supabase.from(COUNTER_TABLE).select('count').eq('key', key).maybeSingle()
  if (error) {
    console.error('toolQuota: counter read failed:', error.message)
    return { ok: false }
  }
  return { ok: true, used: (data as { count?: number } | null)?.count ?? 0 }
}

/** Записать счётчик; false — запись не удалась (уже залогировано). */
export async function writeCounter(supabase: SupabaseClient, key: string, count: number, now = Date.now()): Promise<boolean> {
  const { error } = await supabase.from(COUNTER_TABLE).upsert({ key, day: almatyDay(now), count })
  if (error) console.error('toolQuota: counter write failed:', error.message)
  return !error
}

export type CounterClaim = 'claimed' | 'raced' | 'error'

/**
 * Атомарно занять слот: count used → used+1, только если в базе всё ещё used
 * (compare-and-swap). Обычный read→write (writeCounter) пропускает пачку
 * параллельных запросов: все читают used=0 и все идут в реестр. 'raced' —
 * слот перехватил параллельный запрос, надо перечитать счётчик.
 */
export async function claimCounterSlot(supabase: SupabaseClient, key: string, used: number, now = Date.now()): Promise<CounterClaim> {
  const day = almatyDay(now)
  const { data, error } = await supabase.from(COUNTER_TABLE)
    .update({ day, count: used + 1 }).eq('key', key).eq('count', used).select('key')
  if (error) {
    console.error('toolQuota: counter claim failed:', error.message)
    return 'error'
  }
  if ((data ?? []).length > 0) return 'claimed'
  if (used !== 0) return 'raced'
  // Строки ещё нет — первая попытка в квартале. Первичный ключ по key не даст
  // вставить её дважды: проигравший параллельный запрос получит 23505.
  const ins = await supabase.from(COUNTER_TABLE).insert({ key, day, count: 1 })
  if (!ins.error) return 'claimed'
  if (ins.error.code === '23505') return 'raced'
  console.error('toolQuota: counter claim insert failed:', ins.error.message)
  return 'error'
}

/**
 * Нагрузка на реестры за сегодня: сумма счётчиков строк, списанных сегодня
 * (проверки контрагента и живые поиски названия lookup:), кроме КП-строк
 * (они реестры не трогают). Завышает счёт (квартальные счётчики
 * целиком) — это безопасная сторона. Ошибку чтения трактуем как 0, как и раньше
 * в /api/tools/kontragent: сам лимит на IP уже прочитан успешно.
 */
export async function registryLoadToday(supabase: SupabaseClient, now = Date.now()): Promise<number> {
  const { data } = await supabase
    .from(COUNTER_TABLE)
    .select('count')
    .eq('day', almatyDay(now))
    .not('key', 'like', `${KP_CLAIM_PREFIX}%`)
  return ((data ?? []) as Array<{ count: number | null }>).reduce((sum, r) => sum + (r.count || 0), 0)
}
