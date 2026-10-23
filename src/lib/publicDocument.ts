import { getActivePlan } from '@/lib/plan'

// Что публичные API /api/public/invoice|contract/[token] отдают наружу.
// Раньше: select('*') по счёту и профилю продавца -- в ответ уходили user_id,
// bank_id, email продавца и даты его тарифа (аудит 24.10, secrets-6/privacy-12).
// Теперь явные списки колонок: ровно то, что рисуют страницы /view/[token] и
// /contract-view/[token] и что нужно их PDF. Новая колонка в БД наружу сама
// не попадёт. Колонки, которых в таблице нет, сюда добавлять нельзя -- явный
// select с несуществующей колонкой роняет весь запрос.

/** Колонки счёта для публичной страницы. */
export const PUBLIC_INVOICE_COLUMNS =
  'id, number, status, amount, created_at, due_date, client_name, client_bin, client_email, client_address, contract_number, contract_date, services, note'
/** То же + user_id/bank_id: нужны серверу для поиска профиля и банка, наружу не уходят. */
export const INVOICE_SERVER_COLUMNS = `${PUBLIC_INVOICE_COLUMNS}, user_id, bank_id`

/** Публичные поля профиля продавца. email, тариф и is_admin сюда не входят. */
export const PUBLIC_PROFILE_COLUMNS =
  'company_name, bin_iin, address, phone, director_name, signature_url, stamp_url, kaspi_pay_link, halyk_pay_link, website, social_links'
/** Колонки, из которых считается водяной знак (наружу не уходят). */
export const PLAN_PROFILE_COLUMNS = 'plan, plan_expires_at, bonus_expires_at, trial_expires_at, is_admin'

/** Публичные реквизиты банковского счёта: ровно то, что печатается в счёте. */
export const PUBLIC_BANK_COLUMNS = 'bank_name, iik, bik, kbe'

/** Публичные колонки договора. file_url и user_id не отдаются никогда. */
export const PUBLIC_CONTRACT_COLUMNS = 'id, title, created_at'

/** Счёт без служебных user_id/bank_id. */
export function toPublicInvoice<T extends Record<string, unknown>>(invoice: T): Omit<T, 'user_id' | 'bank_id'> {
  const { user_id: _u, bank_id: _b, ...rest } = invoice
  return rest as Omit<T, 'user_id' | 'bank_id'>
}

/**
 * Профиль продавца для публичной страницы + флаг водяного знака. Тариф и
 * is_admin участвуют только в расчёте showWatermark (админский аккаунт без
 * водяного знака, как и в его собственных PDF), наружу уходит один boolean.
 */
export function splitPublicProfile(row: Record<string, unknown> | null): {
  profile: Record<string, unknown> | null
  showWatermark: boolean
} {
  if (!row) return { profile: null, showWatermark: true }
  const showWatermark = !getActivePlan(row).isActive
  const profile: Record<string, unknown> = {}
  for (const col of PUBLIC_PROFILE_COLUMNS.split(',').map(c => c.trim())) {
    if (col in row) profile[col] = row[col]
  }
  return { profile, showWatermark }
}
