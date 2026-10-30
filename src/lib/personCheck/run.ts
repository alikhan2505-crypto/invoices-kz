// Серверная проверка физического лица по ИИН. Только открытые реестры:
//  - реестр должников Минюста (АИС ОИП) через data.egov.kz: «iinOrBin» принимает
//    ИИН человека так же, как БИН компании;
//  - если у человека есть ИП, то данные КГД (регистрация, неблагонадёжность,
//    налоговый долг, налоговый режим, реабилитация): тот же performBinLookup, что у
//    компаний, ИП в нём ищется по ИИН.
//
// Правило проекта: «не проверили» (null / 'unknown') никогда не превращается в
// «чисто». Незарегистрированный ИП ('none') - уверенный ответ реестров; когда
// реестры не ответили, это 'unknown'.
//
// Персональные данные: имена должников, исполнителей, взыскателей и категории
// взыскания не читаются (aisoip.ts отдаёт только агрегаты). ИИН в базу не пишется.
// Единственная запись - кэш bin_lookup_cache для найденных ИП, как у любой проверки.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BinLookupResult } from '@/lib/binLookup'
import { performBinLookup, type BinLookupOutcome } from '@/lib/binLookupServer'
import { fetchEnforcement } from '@/lib/binExtraChecks'
import type { EnforcementResult } from '@/lib/aisoip'
import { publicRehabilitation, type RehabilitationResult } from '@/lib/kgdRehabilitation'
import type { TaxRegime, UnreliableCategory } from '@/lib/kgdTaxpayer'
import { isPersonIin } from './iin'

export { isPersonIin }

export interface PublicEntrepreneur {
  name: string
  status: string | null
  registeredAt: string | null
  isVatPayer: boolean | null
  vatRegisteredAt: string | null
  isUnreliable: boolean | null
  unreliableCategories: UnreliableCategory[] | null
  totalArrear: number | null
  taxArrear: number | null
  taxRegimes: TaxRegime[] | null
  /** undefined = проверка не включена; null = не удалось проверить. */
  rehabilitation: RehabilitationResult | null | undefined
}

export type EntrepreneurState =
  | { state: 'found'; entrepreneur: PublicEntrepreneur }
  | { state: 'none' }
  | { state: 'unknown' }

export interface PersonCheckResult {
  iin: string
  entrepreneur: EntrepreneurState
  /** null = не удалось проверить. */
  enforcement: EnforcementResult | null
}

export interface PersonCheckDeps {
  lookup: (supabase: SupabaseClient, bin: string) => Promise<BinLookupOutcome>
  enforcement: (bin: string) => Promise<EnforcementResult | null>
}

const defaultDeps: PersonCheckDeps = {
  lookup: (supabase, bin) => performBinLookup(supabase, bin, { extras: true }),
  enforcement: fetchEnforcement,
}

/** Срез записи ИП, который уходит наружу: только перечисленные поля, без адреса, руководителя и ОКЭД. */
function toPublicEntrepreneur(c: BinLookupResult): PublicEntrepreneur {
  return {
    name: c.name,
    status: c.status,
    registeredAt: c.registeredAt,
    isVatPayer: c.isVatPayer,
    vatRegisteredAt: c.vatRegisteredAt,
    isUnreliable: c.isUnreliable,
    unreliableCategories: c.unreliableCategories ?? null,
    totalArrear: c.totalArrear,
    taxArrear: c.taxArrear,
    taxRegimes: c.taxRegimes ?? null,
    rehabilitation: publicRehabilitation(c.rehabilitation),
  }
}

/** ИИН должен быть проверен вызывающим (isPersonIin). */
export async function runPersonCheck(
  supabase: SupabaseClient,
  iin: string,
  deps: PersonCheckDeps = defaultDeps,
): Promise<PersonCheckResult> {
  const outcome = await deps.lookup(supabase, iin)
  if (outcome.found) {
    const c = outcome.company
    const e = c.enforcement
    return {
      iin,
      entrepreneur: { state: 'found', entrepreneur: toPublicEntrepreneur(c) },
      enforcement: e
        ? { found: e.found, count: e.count, activeCount: e.activeCount, totalAmount: e.totalAmount, earliestStart: e.earliestStart }
        : null,
    }
  }
  // Не ИП (или реестры не ответили): реестр должников спрашиваем отдельно, он не зависит от КГД.
  const enforcement = await deps.enforcement(iin)
  return {
    iin,
    entrepreneur: outcome.unavailable ? { state: 'unknown' } : { state: 'none' },
    enforcement: enforcement
      ? { found: enforcement.found, count: enforcement.count, activeCount: enforcement.activeCount, totalAmount: enforcement.totalAmount, earliestStart: enforcement.earliestStart }
      : null,
  }
}
