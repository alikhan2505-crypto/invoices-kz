// Серверная часть проверки по БИН, вынесенная из /api/bin-lookup, когда
// появился второй потребитель — публичный /api/tools/kontragent. Оба роута
// зовут performBinLookup(): кэш 24 часа в bin_lookup_cache, реестр ЮЛ egov,
// КГД как фолбэк для ИП, НДС и риски параллельно, дозаполнение дыр в кэше.
//
// Ключи (EGOV_API_KEY, KGD_PORTAL_TOKEN, KGD_PERSONAL_ACCOUNT_TOKEN) живут
// только здесь, на сервере: соглашение egov запрещает передавать ключ кому-то
// ещё, а токены КГД выданы вручную на один аккаунт.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  toLookupResult, fromKgdTaxpayer, egovQuery, lookupVatStatus,
  type BinLookupResult,
} from '@/lib/binLookup'
import {
  parseTaxpayer, parseLiquidation, parseTaxDebt,
  KGD_TAXPAYER_URL, KGD_LIQUIDATION_URL, KGD_DEBT_URL,
  KGD_TAXPAYER_TYPES,
  type UnreliableCategory,
} from '@/lib/kgdTaxpayer'
import { fetchUnreliableDetail, fetchTaxRegime, fetchEnforcement } from '@/lib/binExtraChecks'
import { fetchRehabilitation } from '@/lib/kgdRehabilitation'

// A registry row is re-fetched after this. Companies get renamed, liquidated
// and registered for VAT, and a stale name printed on an invoice is worse
// than a slow lookup -- but the register itself only refreshes daily, so
// anything shorter would just spend requests.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// 'error' — реестр не ответил (сеть, таймаут, не 2xx), в отличие от null —
// «ответил, такого нет». Различие нужно бонусу за реквизиты: недоступный
// реестр — это «попробуйте позже», а не «компания не найдена».
type SourceAnswer = BinLookupResult | null | 'error'

/** The legal-entity register. Rich, but holds no sole proprietors. */
async function lookUpInEgov(bin: string): Promise<SourceAnswer> {
  const key = process.env.EGOV_API_KEY
  if (!key) {
    console.error('bin-lookup: EGOV_API_KEY is not set')
    return 'error'
  }
  try {
    const url = `https://data.egov.kz/api/v4/gbd_ul/v1?source=${encodeURIComponent(egovQuery(bin))}&apiKey=${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) throw new Error(`egov responded ${res.status}`)
    const records = await res.json()
    return toLookupResult(bin, Array.isArray(records) ? records : [])
  } catch (e) {
    console.error('bin-lookup: egov request failed:', e instanceof Error ? e.message : e)
    return 'error'
  }
}

/** КГД. The only official source that covers ИП, at the cost of detail. */
async function lookUpInKgd(bin: string): Promise<SourceAnswer> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token) {
    // Без токена ИП проверить нечем — это «реестр недоступен», а не «нет такого».
    console.error('bin-lookup: KGD_PORTAL_TOKEN is not set')
    return 'error'
  }
  let failed = false
  for (const taxpayerType of KGD_TAXPAYER_TYPES) {
    try {
      const url = `${KGD_TAXPAYER_URL}?taxpayerCode=${encodeURIComponent(bin)}&taxpayerType=${taxpayerType}`
      const res = await fetch(url, {
        headers: { 'X-Portal-Token': token },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) {
        // Только 404 — уверенное «не нашли» для этого типа плательщика. Всё
        // остальное (401/403 — протух или сменился токен, 400, 429, 5xx) —
        // КГД не ответил по существу: «попробуйте позже», а не «не найден».
        if (res.status !== 404) {
          failed = true
          console.error('bin-lookup: КГД responded', res.status, 'for taxpayerType', taxpayerType)
        }
        continue
      }
      if (res.status === 204) continue
      const taxpayer = parseTaxpayer(await res.json())
      if (taxpayer) return fromKgdTaxpayer(bin, taxpayer)
    } catch (e) {
      failed = true
      console.error('bin-lookup: КГД request failed:', e instanceof Error ? e.message : e)
    }
  }
  return failed ? 'error' : null
}

/**
 * The risk checks КГД lets us make with the tokens we have.
 *
 * All answer null when nothing was learned, and the caller keeps that
 * distinct from a clean result all the way to the screen: a seller shown
 * silence because a request timed out would read it as "counterparty is
 * fine", which is the one wrong thing this feature could do.
 */
async function checkRisk(bin: string): Promise<{
  unreliable: boolean | null
  unreliableCategories: UnreliableCategory[] | null
  liquidating: boolean | null
  totalArrear: number | null
  taxArrear: number | null
}> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token) return { unreliable: null, unreliableCategories: null, liquidating: null, totalArrear: null, taxArrear: null }
  const headers = { 'X-Portal-Token': token }

  // Неблагонадёжные: тот же один запрос, но с категориями (бездействующий,
  // банкрот, недействительная регистрация). Флаг `listed` остаётся прежним
  // булевым значением для кэша и для /create.
  const unreliable = fetchUnreliableDetail(bin)

  const liquidating = (async () => {
    try {
      const res = await fetch(`${KGD_LIQUIDATION_URL}?taxpayerCode=${encodeURIComponent(bin)}`, {
        headers,
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return null
      return parseLiquidation(await res.json())
    } catch (e) {
      console.error('bin-lookup: КГД liquidation check failed:', e instanceof Error ? e.message : e)
      return null
    }
  })()

  // Tax arrears need a second credential of their own: personalAccountToken,
  // issued separately. Despite the name it is not limited to our own
  // account -- verified against three unrelated taxpayers -- so this really
  // does answer "does my counterparty owe the state anything".
  const debt = (async () => {
    const accountToken = process.env.KGD_PERSONAL_ACCOUNT_TOKEN
    if (!accountToken) return null
    try {
      const url = `${KGD_DEBT_URL}?taxpayerCode=${encodeURIComponent(bin)}&personalAccountToken=${encodeURIComponent(accountToken)}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
      if (!res.ok) return null
      return parseTaxDebt(await res.json())
    } catch (e) {
      console.error('bin-lookup: КГД debt check failed:', e instanceof Error ? e.message : e)
      return null
    }
  })()

  const [u, l, d] = await Promise.all([unreliable, liquidating, debt])
  return {
    unreliable: u ? u.listed : null,
    unreliableCategories: u ? u.categories : null,
    liquidating: l,
    totalArrear: d ? d.totalArrear : null,
    taxArrear: d ? d.taxArrear : null,
  }
}

/**
 * unavailable: true — ни один реестр не смог ответить «нет» уверенно (сеть,
 * таймаут). Старые потребители смотрят только на found и ведут себя как
 * раньше.
 */
export type BinLookupOutcome = { found: false; unavailable?: boolean } | { found: true; company: BinLookupResult }

/**
 * Полный цикл проверки по БИН: кэш → (при промахе) egov → КГД → НДС и риски
 * параллельно → запись в кэш. У свежей строки кэша дозаполняются только дыры
 * (НДС/риски, закэшированные до появления этих полей), identity-поля заново
 * не запрашиваются.
 */
/**
 * Проверки 25.10.2026, которых нет в таблице кэша: налоговый режим и реестр
 * должников Минюста. Спрашиваются каждый раз заново, параллельно и независимо:
 * сбой одного даёт null в своём поле и не трогает остальные.
 */
async function checkExtras(supabase: SupabaseClient, bin: string) {
  // Реабилитация (26.10.2026): чтение одной строки суточной выгрузки КГД из нашей
  // базы, без сети. undefined = таблицы нет, фича спит; null = не проверили.
  const [taxRegimes, enforcement, rehabilitation] = await Promise.all([
    fetchTaxRegime(bin), fetchEnforcement(bin), fetchRehabilitation(supabase, bin),
  ])
  return { taxRegimes, enforcement, rehabilitation }
}

export interface PerformBinLookupOptions {
  /**
   * Также спросить налоговый режим, реестр должников и категории
   * неблагонадёжных. Нужно только показу рисков: публичному
   * /api/tools/kontragent и /api/bin-lookup?extras=1 (вторым, ленивым запросом
   * с /create). Остальным (подстановка названия, реквизиты профиля, бонус за
   * реквизиты, поиск по названию) лишние запросы к egov и КГД ни к чему, а
   * повторы Минюста растягивают ответ до ~9 с.
   */
  extras?: boolean
}

export async function performBinLookup(
  supabase: SupabaseClient,
  bin: string,
  options: PerformBinLookupOptions = {},
): Promise<BinLookupOutcome> {
  const { data: cached } = await supabase
    .from('bin_lookup_cache')
    .select('*')
    .eq('bin', bin)
    .maybeSingle()

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    const company: BinLookupResult = {
      bin: cached.bin,
      name: cached.name,
      address: cached.address,
      director: cached.director,
      activity: cached.activity,
      status: cached.status,
      registeredAt: cached.registered_at,
      source: cached.source,
      isVatPayer: cached.is_vat_payer,
      vatRegisteredAt: cached.vat_registered_at,
      isUnreliable: cached.is_unreliable,
      isLiquidating: cached.is_liquidating,
      totalArrear: cached.total_arrear,
      taxArrear: cached.tax_arrear,
    }

    // A fresh row can still be missing its VAT status: it was cached before
    // the VAT lookup existed, or КГД was unreachable at the time. Left alone
    // that gap would persist for the whole cache lifetime, so it is filled
    // in on the next read instead of waiting for the row to expire. The
    // identity fields are not re-fetched -- only the hole is.
    const missingVat = company.isVatPayer === null || company.isVatPayer === undefined
    // Every КГД-derived field is checked, not just the first one. Listing
    // them one at a time is how the tax-arrear column stayed empty after it
    // shipped: rows cached earlier already had a VAT answer and a risk
    // answer, so neither flag fired and the new column was never filled.
    const missingRisk = [company.isUnreliable, company.isLiquidating, company.totalArrear]
      .some(value => value === null || value === undefined)
    if (missingVat || missingRisk) {
      const [vat, risk] = await Promise.all([
        missingVat ? lookupVatStatus(bin) : Promise.resolve(undefined),
        missingRisk ? checkRisk(bin) : Promise.resolve(null),
      ])
      const patch: Record<string, unknown> = {}
      if (vat) {
        company.isVatPayer = vat.isVatPayer
        company.vatRegisteredAt = vat.registeredAt
        patch.is_vat_payer = vat.isVatPayer
        patch.vat_registered_at = vat.registeredAt
      }
      if (risk) {
        company.isUnreliable = risk.unreliable
        company.unreliableCategories = risk.unreliableCategories
        company.isLiquidating = risk.liquidating
        company.totalArrear = risk.totalArrear
        company.taxArrear = risk.taxArrear
        patch.is_unreliable = risk.unreliable
        patch.is_liquidating = risk.liquidating
        patch.total_arrear = risk.totalArrear
        patch.tax_arrear = risk.taxArrear
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('bin_lookup_cache').update(patch).eq('bin', bin)
        if (error) console.error('bin-lookup: backfill failed:', error.message)
      }
    }

    if (options.extras) {
      // Категории неблагонадёжных в кэше не хранятся. «Нет в списке» значит
      // категорий нет; «в списке» значит перечитываем список (редкий случай);
      // неизвестно (null) остаётся неизвестным. Если risk уже прочитан выше
      // (дозаполнение дыры), категории у него есть.
      const needCategories = company.isUnreliable === true && company.unreliableCategories === undefined
      const [extra, detail] = await Promise.all([
        checkExtras(supabase, bin),
        needCategories ? fetchUnreliableDetail(bin) : Promise.resolve(undefined),
      ])
      company.taxRegimes = extra.taxRegimes
      company.enforcement = extra.enforcement
      company.rehabilitation = extra.rehabilitation
      if (company.isUnreliable === false) company.unreliableCategories = []
      else if (needCategories) company.unreliableCategories = detail ? detail.categories : null
      else if (company.unreliableCategories === undefined) company.unreliableCategories = null
    }

    return { found: true, company }
  }

  // The register first: when it has the company it answers with an address,
  // a director and an activity, none of which КГД publishes. КГД is the
  // fallback that covers everyone the register cannot -- sole proprietors,
  // who are simply absent from it.
  const egov = await lookUpInEgov(bin)
  const kgd = egov && egov !== 'error' ? null : await lookUpInKgd(bin)
  const company = egov && egov !== 'error' ? egov : (kgd && kgd !== 'error' ? kgd : null)
  if (!company) {
    return egov === 'error' || kgd === 'error' ? { found: false, unavailable: true } : { found: false }
  }

  // Run together: three independent КГД calls, and the user is waiting.
  const [vat, risk, extra] = await Promise.all([
    lookupVatStatus(bin),
    checkRisk(bin),
    // Режим и реестр должников не зависят от результата рисков; категории
    // неблагонадёжных уже пришли вместе с рисками, второй раз не спрашиваем.
    options.extras ? checkExtras(supabase, bin) : Promise.resolve(null),
  ])
  if (vat) {
    company.isVatPayer = vat.isVatPayer
    company.vatRegisteredAt = vat.registeredAt
  }
  company.isUnreliable = risk.unreliable
  company.isLiquidating = risk.liquidating
  company.totalArrear = risk.totalArrear
  company.taxArrear = risk.taxArrear
  if (extra) {
    company.unreliableCategories = risk.unreliable === false ? [] : risk.unreliableCategories
    company.taxRegimes = extra.taxRegimes
    company.enforcement = extra.enforcement
    company.rehabilitation = extra.rehabilitation
  }

  const { error: cacheError } = await supabase.from('bin_lookup_cache').upsert({
    bin: company.bin,
    name: company.name,
    address: company.address,
    director: company.director,
    activity: company.activity,
    status: company.status,
    registered_at: company.registeredAt,
    source: company.source,
    is_vat_payer: company.isVatPayer,
    vat_registered_at: company.vatRegisteredAt,
    is_unreliable: company.isUnreliable,
    is_liquidating: company.isLiquidating,
    total_arrear: company.totalArrear,
    tax_arrear: company.taxArrear,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'bin' })
  // A cache miss costs a request next time; not worth failing the lookup
  // someone is waiting on.
  if (cacheError) console.error('bin-lookup: cache write failed:', cacheError.message)

  return { found: true, company }
}
