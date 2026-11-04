// Сохранение реквизитов из бесплатного инструмента в кабинет одним нажатием (03.11.2026).
// Логика над requisitesHandoff.ts: те же проверки БИН и ИИК, что на страницах «Реквизиты» и
// «Банковские счета», те же поля и тот же КБе по типу компании. Клиент supabase приходит
// параметром, чтобы функция проверялась без сети. Пустые поля профиля заполняются, заполненные
// не трогаются; банковский счёт добавляется только если в кабинете их ещё нет.

import { validateBinIin, validateIik } from '@/lib/kzIdentifiers'
import { autoKbe } from '@/lib/kbe'
import type { Requisites } from './requisites'
import { bankFromToolRequisites, fillProfileFromToolRequisites, type OwnProfileFields } from './requisitesHandoff'

/** Минимум клиента supabase, который нужен здесь (настоящий клиент подходит как есть). */
export interface SaveClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type ProfileLike = Partial<Record<keyof OwnProfileFields, string | null>> | null | undefined

export interface ToolRequisitesPlan {
  needProfile: boolean
  needBank: boolean
  profileFill: Partial<OwnProfileFields>
  bank: ReturnType<typeof bankFromToolRequisites>
}

const own = (p: ProfileLike): OwnProfileFields => ({
  company_name: p?.company_name || '', bin_iin: p?.bin_iin || '', address: p?.address || '',
  email: p?.email || '', phone: p?.phone || '', director_name: p?.director_name || '', accountant_name: p?.accountant_name || '',
})

/**
 * Что из сохранённого можно предложить: нужны ли профиль и банк кабинету и что именно подставится.
 * Профиль считается незаполненным, когда нет названия или БИН (как требует создание счёта).
 */
export function planToolRequisites(profile: ProfileLike, bankCount: number, req: Requisites): ToolRequisitesPlan {
  const current = own(profile)
  const needProfile = !current.company_name.trim() || !current.bin_iin.trim()
  const needBank = bankCount === 0
  const { next } = fillProfileFromToolRequisites(current, req)
  let profileFill: Partial<OwnProfileFields> = {}
  if (needProfile) {
    for (const k of Object.keys(next) as (keyof OwnProfileFields)[]) if (next[k] !== current[k]) profileFill[k] = next[k]
    // Сохранённый БИН не проходит проверку контрольной цифры (чужой черновик, опечатка, тестовое значение):
    // такое не предлагаем и не пишем, человек введёт верный в мастере.
    if (validateBinIin(profileFill.bin_iin ?? current.bin_iin)) profileFill = {}
  }
  let bank = needBank ? bankFromToolRequisites(req) : null
  // То же для ИИК: счёт с неверным номером в кабинет не кладём (мастер покажет поле для исправления).
  if (bank && validateIik(bank.iik)) bank = null
  return { needProfile, needBank, profileFill, bank }
}

/**
 * Есть ли что предложить: профиль вместе с названием и БИН, и/или целый банковский счёт.
 * Банк — только когда после сохранения у кабинета будут название и БИН (то же условие, что в
 * saveToolRequisites): иначе карточка обещала бы сохранение, которое ничего не пишет, и при этом
 * прятала бы мастер (04.11.2026, ревью: банк из бесплатного счёта при пустом или неверном БИН).
 */
export function hasToolOffer(plan: ToolRequisitesPlan, profile: ProfileLike): boolean {
  const cur = own(profile)
  const company = plan.profileFill.company_name ?? cur.company_name
  const bin = plan.profileFill.bin_iin ?? cur.bin_iin
  const hasCompany = !!company.trim() && !!bin.trim()
  const profileOffer = plan.needProfile && Object.keys(plan.profileFill).length > 0 && hasCompany
  return profileOffer || (!!plan.bank && hasCompany)
}

export type SaveToolResult =
  | { ok: true; savedProfile: boolean; savedBank: boolean }
  | { ok: false; reason: 'bin' | 'iik' | 'profile' | 'bank' | 'nothing' }

/** Записывает предложенное. Банк пишется только после успешного профиля (без БИН счёт всё равно не выставить). */
export async function saveToolRequisites(sb: SaveClient, userId: string, profile: ProfileLike, bankCount: number, req: Requisites): Promise<SaveToolResult> {
  const plan = planToolRequisites(profile, bankCount, req)
  if (!hasToolOffer(plan, profile)) return { ok: false, reason: 'nothing' }
  const cur = own(profile)
  const company = plan.profileFill.company_name ?? cur.company_name
  const bin = plan.profileFill.bin_iin ?? cur.bin_iin

  if (plan.needProfile && Object.keys(plan.profileFill).length > 0) {
    if (validateBinIin(bin)) return { ok: false, reason: 'bin' }
  }
  if (plan.bank && validateIik(plan.bank.iik)) return { ok: false, reason: 'iik' }

  let savedProfile = false
  if (plan.needProfile && Object.keys(plan.profileFill).length > 0) {
    const { data, error } = await sb.from('profiles').update(plan.profileFill).eq('id', userId).select('id')
    if (error || !data || data.length === 0) return { ok: false, reason: 'profile' }
    savedProfile = true
  }

  let savedBank = false
  if (plan.bank && company.trim() && bin.trim()) {
    const kbe = plan.bank.kbe || autoKbe({ name: company, bin })
    const { error } = await sb.from('bank_accounts').insert({
      user_id: userId, bank_name: plan.bank.bank_name, bik: plan.bank.bik, iik: plan.bank.iik, kbe, currency: 'KZT', is_main: true,
    })
    if (error) return { ok: false, reason: 'bank' }
    savedBank = true
  }
  // Ничего не записали — не «успех»: карточка иначе показывалась бы снова и снова.
  if (!savedProfile && !savedBank) return { ok: false, reason: 'nothing' }
  return { ok: true, savedProfile, savedBank }
}
