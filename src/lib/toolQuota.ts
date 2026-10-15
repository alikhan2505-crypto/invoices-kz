// Лимиты бесплатных инструментов /tools по IP — общий счётчик
// tool_kontragent_checks (key, day, count). Им пользуются:
//   - /api/tools/kontragent      — 3 проверки контрагента на IP в квартал;
//   - /api/tools/kp/quota        — 3 коммерческих предложения на IP в квартал;
//   - /api/tools/name-lookup     — название по БИН/ИИН для /tools/kp, schet, avr,
//                                  nakladnaya: 3 живых запроса в реестр на IP в квартал
//                                  НА КАЖДОЕ ПОЛЕ КАЖДОГО ИНСТРУМЕНТА (КП-поставщик 3,
//                                  КП-клиент 3, Счёт-поставщик 3, … — решение основателя
//                                  14.10.2026). Поиск по нашему кэшу счётчик не трогает;
//   - /api/tools/waybills        — 5 склеек накладных Kaspi на IP в календарный месяц
//                                  всем, у кого нет Kaspi Bot: и без входа, и вошедшим
//                                  на Free/Базовом/триале (вход ничего не добавляет).
//                                  Без ограничений — только с доступом к Kaspi Bot
//                                  (Про или is_admin), см. waybillsUnlimited (решение
//                                  основателя 15.10.2026: «5 → сразу Про»).
// Сырой IP в базу не пишем — только sha256 от строки с пространством имён и
// кварталом. Колонка day = день последнего списания; по ней считается общий
// дневной предохранитель квоты КГД/egov.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasKaspiShopAccess, KASPI_SHOP_PROFILE_COLUMNS } from '@/lib/kaspiShop/planGate'

export const COUNTER_TABLE = 'tool_kontragent_checks'

/** Общий дневной предохранитель живых походов в реестры (КГД: 40 запросов/мин на токен). */
export const REGISTRY_DAILY_GLOBAL = 300

/** КП: бесплатных предложений на IP в квартал (решение основателя 14.10.2026). */
export const KP_QUARTER_LIMIT = 3
/** Поиск названия по БИН/ИИН: живых запросов в реестр на IP в квартал — на одно поле одного инструмента. */
export const NAME_LOOKUP_QUARTER_LIMIT = 3
/** Склейка накладных Kaspi: бесплатных склеек на IP в календарный месяц для всех без Kaspi Bot (решение основателя 15.10.2026). */
export const WAYBILLS_MONTH_LIMIT = 5

/**
 * Строки счётчика помечены видимым префиксом. Сами КП (kp:) реестры не трогают,
 * поэтому дневной предохранитель их не считает. Живые поиски названия (lookup:)
 * — считает, они тратят ту же квоту, что и проверка контрагента. Ключи самой
 * проверки контрагента — голый sha256 без двоеточия (см. weekly-digest).
 */
export const KP_CLAIM_PREFIX = 'kp:'
export const NAME_LOOKUP_PREFIX = 'lookup:'
/** Склейки накладных (wb:) реестры тоже не трогают — предохранитель их не считает. */
export const WAYBILLS_PREFIX = 'wb:'

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

/** Календарный месяц по Алматы: '2026-10'. */
export function almatyMonth(now = Date.now()): string {
  return new Date(now + ALMATY_OFFSET_MS).toISOString().slice(0, 7)
}

/** Первый день следующего месяца по Алматы: '2026-11-01'; после декабря — январь следующего года. */
export function nextMonthStart(now = Date.now()): string {
  const d = new Date(now + ALMATY_OFFSET_MS)
  const month = d.getUTCMonth() + 1
  const year = d.getUTCFullYear() + (month >= 12 ? 1 : 0)
  return `${year}-${String((month % 12) + 1).padStart(2, '0')}-01`
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

/**
 * IP для ключа лимита: IPv4 — как есть, IPv6 — только префикс /64. Провайдер
 * выдаёт абоненту целую /64, а privacy extensions меняют хвост адреса сами —
 * по полному адресу каждый новый хвост получал бы свежий лимит.
 * '::ffff:1.2.3.4' — это IPv4. Непарсящуюся строку возвращаем как есть.
 */
export function quotaIp(ip: string): string {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (!s.includes(':')) return s
  const halves = s.split('::')
  if (halves.length > 2) return s
  let v4 = null as string | null
  const toGroups = (part: string): string[] | null => {
    if (!part) return []
    const out: string[] = []
    for (const g of part.split(':')) {
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(g)) {
        // Встроенный IPv4 в хвосте адреса — две последние группы.
        v4 = g
        out.push('0', '0')
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null
      out.push(parseInt(g, 16).toString(16))
    }
    return out
  }
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  if (!head || !tail) return s
  const fill = 8 - head.length - tail.length
  if (halves.length === 2 ? fill < 1 : fill !== 0) return s
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail]
  if (v4 && groups.slice(0, 5).every(g => g === '0') && groups[5] === 'ffff') return v4
  return `${groups.slice(0, 4).join(':')}::/64`
}

/** Ключ счётчика склеек накладных: 'wb:' + sha256('wb|ip|месяц'), IPv6 — по /64 (см. quotaIp). */
export function waybillsKey(ip: string, month: string): string {
  return WAYBILLS_PREFIX + sha256Hex(`wb|${quotaIp(ip)}|${month}`)
}

/** Сколько осталось при used из limit; никогда не меньше нуля. */
export function remainingOf(used: number, limit: number): number {
  return Math.max(0, limit - Math.max(0, Math.floor(used || 0)))
}

/** IP посетителя: первый адрес из x-forwarded-for (Vercel ставит его всегда). */
export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}

/**
 * id вошедшего пользователя по заголовку Authorization: Bearer <access token>
 * (сессия Supabase из браузера). null — заголовка нет, токен невалиден или
 * Supabase не ответил: такой запрос считаем анонимным, а не роняем.
 */
export async function bearerUserId(supabase: SupabaseClient, headers: Headers): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec((headers.get('authorization') || '').trim())
  if (!m) return null
  try {
    const { data, error } = await supabase.auth.getUser(m[1])
    if (error) return null
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Склейка накладных без лимита — только тем, у кого есть Kaspi Bot:
 * hasKaspiShopAccess (Про или is_admin) по профилю владельца Bearer-токена.
 * Триал и Базовый — НЕ безлимит. Нет токена, невалидный токен, профиль не
 * прочитался или его нет — false: такой запрос считается по IP, как аноним.
 * Ошибка чтения никогда не даёт безлимит.
 */
export async function waybillsUnlimited(supabase: SupabaseClient, headers: Headers): Promise<boolean> {
  const userId = await bearerUserId(supabase, headers)
  if (!userId) return false
  try {
    const { data, error } = await supabase.from('profiles')
      .select(KASPI_SHOP_PROFILE_COLUMNS).eq('id', userId).maybeSingle()
    if (error) {
      console.error('toolQuota: waybills plan lookup failed:', error.message)
      return false
    }
    return hasKaspiShopAccess(data)
  } catch (e: any) {
    console.error('toolQuota: waybills plan lookup threw:', e?.message)
    return false
  }
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
 * Вернуть занятый слот: count used → used-1 (compare-and-swap). Для склейки
 * накладных: слот занимаем ДО склейки, а если она упала (битый PDF) — отдаём
 * обратно, чтобы неудача лимит не тратила. Параллельный запрос мог сдвинуть
 * счётчик — тогда перечитываем и пробуем ещё. false — не вернули (залогировано).
 */
export async function releaseCounterSlot(supabase: SupabaseClient, key: string, used: number, now = Date.now()): Promise<boolean> {
  let current = used
  for (let attempt = 0; attempt < 3; attempt++) {
    if (current <= 0) return true
    const { data, error } = await supabase.from(COUNTER_TABLE)
      .update({ day: almatyDay(now), count: current - 1 }).eq('key', key).eq('count', current).select('key')
    if (error) {
      console.error('toolQuota: counter release failed:', error.message)
      return false
    }
    if ((data ?? []).length > 0) return true
    const again = await readCounter(supabase, key)
    if (!again.ok) return false
    current = again.used
  }
  console.error('toolQuota: counter release gave up after retries')
  return false
}

/**
 * Нагрузка на реестры за сегодня: сумма счётчиков строк, списанных сегодня
 * (проверки контрагента и живые поиски названия lookup:), кроме КП-строк
 * и склеек накладных wb: (они реестры не трогают). Завышает счёт (квартальные счётчики
 * целиком) — это безопасная сторона. Ошибку чтения трактуем как 0, как и раньше
 * в /api/tools/kontragent: сам лимит на IP уже прочитан успешно.
 */
export async function registryLoadToday(supabase: SupabaseClient, now = Date.now()): Promise<number> {
  const { data } = await supabase
    .from(COUNTER_TABLE)
    .select('count')
    .eq('day', almatyDay(now))
    .not('key', 'like', `${KP_CLAIM_PREFIX}%`)
    .not('key', 'like', `${WAYBILLS_PREFIX}%`)
  return ((data ?? []) as Array<{ count: number | null }>).reduce((sum, r) => sum + (r.count || 0), 0)
}
