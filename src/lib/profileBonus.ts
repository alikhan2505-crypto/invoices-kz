// Бонус за заполненный профиль (решение основателя 15.10.2026): по 100 ₸ в
// кошелёк за каждый проверенный блок — реквизиты, банковский счёт, подпись
// или печать. Здесь только чистые решения «положен ли бонус» по уже
// собранным фактам; сбор фактов из базы, реестра и хранилища — в
// profileBonusServer.ts, вызовы из браузера — в profileBonusClient.ts.

import { validateBinIin, validateIik, digitsOnly } from './kzIdentifiers'

export const PROFILE_BONUS_TENGE = 100
export const PROFILE_BONUS_BLOCKS = ['requisites', 'bank', 'signature'] as const
export type ProfileBonusBlock = typeof PROFILE_BONUS_BLOCKS[number]

export function isProfileBonusBlock(value: unknown): value is ProfileBonusBlock {
  return typeof value === 'string' && (PROFILE_BONUS_BLOCKS as readonly string[]).includes(value)
}

export type BonusIneligibleReason =
  | 'admin'
  | 'deleted'
  | 'company_name_missing'
  | 'bin_missing'
  | 'bin_invalid'
  | 'bin_not_in_registry'
  | 'registry_unavailable'
  | 'bin_already_rewarded'
  | 'bank_missing'
  | 'iik_invalid'
  | 'bik_missing'
  | 'signature_missing'
  | 'signature_invalid'
  | 'signature_blank'
  | 'stamp_blank'
  | 'image_too_dark'
  | 'unavailable'

export type BonusDecision =
  | { eligible: true; bin: string | null }
  | { eligible: false; reason: BonusIneligibleReason }

export interface AccountFacts {
  isAdmin: boolean
  deleted: boolean
}

function accountBlock(account: AccountFacts): BonusDecision | null {
  if (account.deleted) return { eligible: false, reason: 'deleted' }
  if (account.isAdmin) return { eligible: false, reason: 'admin' }
  return null
}

/** Дешёвая часть проверки реквизитов — без похода в реестр. */
export function requisitesPrecheck(profile: { bin_iin?: string | null; company_name?: string | null }): BonusDecision {
  const binError = validateBinIin(profile.bin_iin)
  if (binError === 'empty') return { eligible: false, reason: 'bin_missing' }
  if (binError) return { eligible: false, reason: 'bin_invalid' }
  if (!(profile.company_name || '').trim()) return { eligible: false, reason: 'company_name_missing' }
  return { eligible: true, bin: digitsOnly(profile.bin_iin) }
}

export type RegistryAnswer = 'found' | 'notfound' | 'unavailable'

/**
 * Реквизиты: БИН/ИИН сходится по контрольной цифре И компания есть в
 * госреестре, название заполнено. Реестр недоступен — отказ без начисления
 * (позже можно повторить), а не «не найдено».
 */
export function decideRequisitesBonus(
  account: AccountFacts,
  profile: { bin_iin?: string | null; company_name?: string | null },
  registry: RegistryAnswer,
): BonusDecision {
  const blocked = accountBlock(account)
  if (blocked) return blocked
  const pre = requisitesPrecheck(profile)
  if (!pre.eligible) return pre
  if (registry === 'unavailable') return { eligible: false, reason: 'registry_unavailable' }
  if (registry === 'notfound') return { eligible: false, reason: 'bin_not_in_registry' }
  return pre
}

export interface BankAccountFacts { iik?: string | null; bik?: string | null }

/** Есть ли счёт с правильным ИИК и заполненным БИК; без реестра. */
export function bankPrecheck(accounts: BankAccountFacts[]): BonusDecision {
  if (accounts.length === 0) return { eligible: false, reason: 'bank_missing' }
  const withValidIik = accounts.filter(a => validateIik(a.iik) === null)
  if (withValidIik.length === 0) return { eligible: false, reason: 'iik_invalid' }
  if (!withValidIik.some(a => (a.bik || '').trim())) return { eligible: false, reason: 'bik_missing' }
  return { eligible: true, bin: null }
}

/**
 * Банковский счёт: хотя бы один счёт с ИИК, прошедшим mod-97, и БИК.
 * Бонус привязан к проверенному БИН профиля (тот же реестр), чтобы один и
 * тот же БИН не получал его на нескольких аккаунтах.
 */
export function decideBankBonus(
  account: AccountFacts,
  profile: { bin_iin?: string | null; company_name?: string | null },
  accounts: BankAccountFacts[],
  registry: RegistryAnswer,
): BonusDecision {
  const blocked = accountBlock(account)
  if (blocked) return blocked
  const bank = bankPrecheck(accounts)
  if (!bank.eligible) return bank
  const requisites = decideRequisitesBonus(account, profile, registry)
  if (!requisites.eligible) return requisites
  return { eligible: true, bin: requisites.bin }
}

/**
 * blank — на картинке почти ничего нет; dark — картинка почти вся тёмная
 * (печать сфотографирована при плохом свете, фон не вырезался).
 */
export type ImageCheck = 'ok' | 'missing' | 'invalid' | 'blank' | 'dark'
export type SignatureImageKind = 'signature' | 'stamp'

/**
 * kind — какая из двух картинок дала этот ответ: «нарисуйте заново» уместно
 * только для нарисованной подписи, для печати — «сфотографируйте ещё раз».
 */
export function decideSignatureBonus(account: AccountFacts, image: ImageCheck, kind: SignatureImageKind = 'signature'): BonusDecision {
  const blocked = accountBlock(account)
  if (blocked) return blocked
  if (image === 'missing') return { eligible: false, reason: 'signature_missing' }
  if (image === 'invalid') return { eligible: false, reason: 'signature_invalid' }
  if (image === 'dark') return { eligible: false, reason: 'image_too_dark' }
  if (image === 'blank') return { eligible: false, reason: kind === 'stamp' ? 'stamp_blank' : 'signature_blank' }
  return { eligible: true, bin: null }
}

/** Из ответов по подписи и печати — лучший (годится любая из двух). */
export function pickBestImageCheck(
  results: { check: ImageCheck; kind: SignatureImageKind }[],
): { check: ImageCheck; kind: SignatureImageKind } {
  const order: ImageCheck[] = ['ok', 'dark', 'blank', 'invalid', 'missing']
  const sorted = [...results].sort((a, b) => order.indexOf(a.check) - order.indexOf(b.check))
  return sorted[0] ?? { check: 'missing', kind: 'signature' }
}

// ---- проверка картинки подписи/печати ----

export const MIN_SIGNATURE_FILE_BYTES = 300
export const MIN_SIGNATURE_SIDE_PX = 24
// Сколько «чернильных» пикселей (заметно темнее белого фона после заливки
// прозрачного белым) должно быть на картинке, уменьшенной до 256 px по
// большей стороне. Считается штуками, а не долей площади: доля отсекала
// короткие настоящие подписи (инициалы, один росчерк) на широком холсте.
// Точка или клик — единицы пикселей; росчерк в ~100 px на холсте 600×200 —
// около 45.
export const MIN_INK_PIXELS = 40
// Почти вся картинка тёмная — фон не вырезался (фото в полутьме).
export const MAX_INK_RATIO = 0.9
const INK_THRESHOLD = 200

/**
 * Оценивает уже уменьшенную картинку в оттенках серого (один байт на пиксель,
 * прозрачное залито белым). Пустой холст подписи — это прозрачный PNG,
 * который после заливки весь белый.
 */
export function assessInkCoverage(gray: ArrayLike<number>): 'ok' | 'blank' | 'dark' {
  const total = gray.length
  if (total === 0) return 'blank'
  let ink = 0
  let min = 255
  let max = 0
  for (let i = 0; i < total; i++) {
    const v = gray[i]
    if (v < INK_THRESHOLD) ink++
    if (v < min) min = v
    if (v > max) max = v
  }
  // Почти однотонная картинка: светлая — пустая, тёмная — «слишком тёмная».
  if (max - min < 24) return min < INK_THRESHOLD ? 'dark' : 'blank'
  if (ink / total > MAX_INK_RATIO) return 'dark'
  if (ink < MIN_INK_PIXELS) return 'blank'
  return 'ok'
}

/**
 * Путь объекта в хранилище по публичной ссылке из profiles.signature_url /
 * stamp_url — только из «своих» бакетов и только из папки самого
 * пользователя. Чужая ссылка или произвольный адрес — null (сервер такое не
 * скачивает: никаких запросов по адресу, присланному пользователем).
 */
export function storageObjectFromUrl(
  url: string | null | undefined,
  userId: string,
): { bucket: 'signatures' | 'stamps'; path: string } | null {
  if (!url) return null
  const match = url.match(/\/storage\/v1\/object\/public\/(signatures|stamps)\/([^?#]+)/)
  if (!match) return null
  let path: string
  try { path = decodeURIComponent(match[2]) } catch { return null }
  if (!path.startsWith(`${userId}/`) || path.includes('..')) return null
  return { bucket: match[1] as 'signatures' | 'stamps', path }
}

// ---- состояние для карточки «Готовность к счёту» ----

export type BonusBlockState = 'claimed' | 'ready' | 'missing'

/**
 * Причины, которые пользователь исправить не может: бонус за этот БИН уже
 * выдан другому аккаунту. Карточка показывает такую строку без кнопки и
 * не считает её «недоделанной».
 */
export function isTerminalBonusReason(reason: BonusIneligibleReason | undefined): boolean {
  return reason === 'bin_already_rewarded' || reason === 'admin' || reason === 'deleted'
}

/**
 * Какую страницу открыть, чтобы исправить причину. У банковского блока
 * причина бывает «реквизитной» (нет или неверный БИН) — тогда вести надо в
 * реквизиты, а не в банки.
 */
export function blockToFix(block: ProfileBonusBlock, reason: BonusIneligibleReason | undefined): ProfileBonusBlock {
  if (block !== 'bank') return block
  switch (reason) {
    case 'bin_missing':
    case 'bin_invalid':
    case 'company_name_missing':
    case 'bin_not_in_registry':
      return 'requisites'
    default:
      return 'bank'
  }
}

export interface BonusStatusResponse {
  available: boolean
  amount: number
  blocks: Record<ProfileBonusBlock, { state: BonusBlockState; reason?: BonusIneligibleReason }>
}

export interface BonusClaimResponse {
  credited?: boolean
  amount?: number
  balance?: number
  alreadyClaimed?: boolean
  notEligible?: boolean
  reason?: BonusIneligibleReason
}
