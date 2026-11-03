// Реквизиты из бесплатных документов /tools переезжают в кабинет (03.11.2026).
// Человек сделал бесплатный счёт, КП, акт или накладную: реквизиты своей компании он уже
// вписал, и они лежат в его браузере (requisites.ts, ключ tools-supplier-requisites). После
// регистрации кабинет требует те же самые реквизиты и банковский счёт (без них счёт не
// выставить), и человек вводил их второй раз. Здесь чистые функции, которые подставляют
// сохранённое в ПУСТЫЕ поля профиля и в форму нового банковского счёта. Ничего не сохраняется
// само: человек проверяет и нажимает «Сохранить» сам. Данные не уходят из браузера до этого.

import { findBankByBik, OTHER_BANK } from '@/lib/kazakhstanBanks'
import { digitsOnly, normalizeIik } from '@/lib/kzIdentifiers'
import type { Requisites } from './requisites'

export interface OwnProfileFields {
  company_name: string
  bin_iin: string
  address: string
  email: string
  phone: string
  director_name: string
  accountant_name: string
}

const blank = (v: string | null | undefined): boolean => !(v ?? '').trim()

/**
 * Профиль + сохранённые реквизиты инструмента -> профиль с заполненными пустыми полями.
 * Уже заполненное не трогаем никогда. БИН берём только если это ровно 12 цифр.
 */
export function fillProfileFromToolRequisites(
  current: OwnProfileFields,
  req: Requisites,
): { next: OwnProfileFields; filled: number } {
  const next = { ...current }
  let filled = 0
  const put = (key: keyof OwnProfileFields, value: string | null | undefined) => {
    const v = (value ?? '').trim()
    if (v && blank(next[key])) { next[key] = v; filled++ }
  }
  const bin = digitsOnly(req.binIin)
  put('company_name', req.companyName)
  put('bin_iin', bin.length === 12 ? bin : '')
  put('address', req.address)
  put('director_name', req.director)
  put('email', req.email)
  put('phone', req.phone)
  return { next, filled }
}

export interface ToolBankAccount {
  bank_name: string
  bik: string
  iik: string
  /** Пусто, если КБе в инструменте не правили руками: кабинет подставит его сам по типу компании. */
  kbe: string
}

/** Банковский счёт из реквизитов инструмента; null, если нет названия банка, БИК или ИИК. */
export function bankFromToolRequisites(req: Requisites): ToolBankAccount | null {
  // В поле выбора банка «другой банк» хранится служебным значением OTHER_BANK, а БИК лежит в отдельном поле.
  const listed = req.bankBik && req.bankBik !== OTHER_BANK ? req.bankBik : ''
  const bik = (listed || req.otherBankBik || '').trim().toUpperCase()
  const iik = normalizeIik(req.iik)
  if (!bik || !iik) return null
  const known = findBankByBik(bik)
  const bankName = (known?.name || req.otherBankName || '').trim()
  if (!bankName) return null
  return { bank_name: bankName, bik: known?.bik || bik, iik, kbe: (req.kbe || '').trim() }
}
