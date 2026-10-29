// Серверная часть бонуса за заполненный профиль: всё перепроверяется по
// базе, реестру и хранилищу — то, что прислал браузер, не используется.
// Решения «положен / не положен» — чистые функции в profileBonus.ts.
//
// Атомарность и идемпотентность держит функция claim_profile_bonus в базе:
// строка права в profile_bonus_grants, пополнение кошелька и запись
// 'profile_bonus' в wallet_ledger — одной транзакцией. Уникальные
// ограничения таблицы:
//  * unique (user_id, block) — один бонус за блок на аккаунт, даже при
//    гонке двух запросов;
//  * unique (block, bin) — реквизиты и банк платятся один раз на БИН на
//    все аккаунты сразу.
// Если ответ базы потерялся по дороге (сеть, таймаут) уже после COMMIT,
// повторный запрос получит «уже получено» — двойного начисления нет.
//
// Пока миграция profile_bonus_wallet_plan.sql не применена, таблицы и
// функции нет — и status, и claim отвечают «недоступно», ничего не начисляя.

import { createClient } from '@supabase/supabase-js'
import { performBinLookup } from '@/lib/binLookupServer'
import { digitsOnly } from '@/lib/kzIdentifiers'
import { checkSignatureImageBuffer } from '@/lib/signatureImageCheck'
import {
  PROFILE_BONUS_TENGE, PROFILE_BONUS_BLOCKS,
  decideRequisitesBonus, decideBankBonus, decideSignatureBonus, pickBestImageCheck,
  requisitesPrecheck, bankPrecheck, storageObjectFromUrl,
  type ProfileBonusBlock, type BonusDecision, type RegistryAnswer, type ImageCheck,
  type BonusStatusResponse, type BonusClaimResponse, type AccountFacts, type SignatureImageKind,
} from '@/lib/profileBonus'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BONUS_NOTES: Record<ProfileBonusBlock, string> = {
  requisites: 'Бонус: реквизиты компании',
  bank: 'Бонус: банковский счёт',
  signature: 'Бонус: подпись или печать',
}

interface ProfileRow {
  is_admin: boolean | null
  deleted_at: string | null
  bin_iin: string | null
  company_name: string | null
  signature_url: string | null
  stamp_url: string | null
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202'
    || /does not exist|Could not find the (table|function)/i.test(error.message || '')
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin, deleted_at, bin_iin, company_name, signature_url, stamp_url')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`profile read failed: ${error.message}`)
  return (data as ProfileRow | null) ?? null
}

function accountFacts(profile: ProfileRow): AccountFacts {
  return { isAdmin: profile.is_admin === true, deleted: !!profile.deleted_at }
}

/** null — таблицы ещё нет (миграция не применена). */
async function loadGrantedBlocks(userId: string): Promise<Set<ProfileBonusBlock> | null> {
  const { data, error } = await supabase.from('profile_bonus_grants').select('block').eq('user_id', userId)
  if (isMissingRelation(error)) return null
  if (error) throw new Error(`bonus grants read failed: ${error.message}`)
  return new Set((data || []).map(r => r.block as ProfileBonusBlock))
}

async function registryAnswer(bin: string): Promise<RegistryAnswer> {
  try {
    const result = await performBinLookup(supabase, bin)
    if (result.found) return 'found'
    return result.unavailable ? 'unavailable' : 'notfound'
  } catch (e) {
    console.error('profile bonus: registry lookup failed:', e instanceof Error ? e.message : e)
    return 'unavailable'
  }
}

async function loadBankAccounts(userId: string) {
  const { data, error } = await supabase.from('bank_accounts').select('iik, bik').eq('user_id', userId)
  if (error) throw new Error(`bank accounts read failed: ${error.message}`)
  return data || []
}

/** Скачивает картинку сервером из своего бакета и проверяет, что она не пустая. */
async function checkOneImage(url: string | null, userId: string): Promise<ImageCheck> {
  if (!url) return 'missing'
  const object = storageObjectFromUrl(url, userId)
  if (!object) return 'invalid'
  const { data, error } = await supabase.storage.from(object.bucket).download(object.path)
  if (error || !data) return 'missing'
  return checkSignatureImageBuffer(Buffer.from(await data.arrayBuffer()))
}

/** Годится подпись ИЛИ печать; из двух ответов берётся лучший. */
async function checkSignatureImages(profile: ProfileRow, userId: string): Promise<{ check: ImageCheck; kind: SignatureImageKind }> {
  const [signature, stamp] = await Promise.all([
    checkOneImage(profile.signature_url, userId),
    checkOneImage(profile.stamp_url, userId),
  ])
  return pickBestImageCheck([{ check: signature, kind: 'signature' }, { check: stamp, kind: 'stamp' }])
}

async function decide(block: ProfileBonusBlock, userId: string, profile: ProfileRow): Promise<BonusDecision> {
  const account = accountFacts(profile)
  if (block === 'signature') {
    // Админа/удалённого отсекаем до скачивания картинок.
    const early = decideSignatureBonus(account, 'ok')
    if (!early.eligible) return early
    const best = await checkSignatureImages(profile, userId)
    return decideSignatureBonus(account, best.check, best.kind)
  }
  if (block === 'requisites') {
    const pre = decideRequisitesBonus(account, profile, 'found')
    if (!pre.eligible) return pre
    return decideRequisitesBonus(account, profile, await registryAnswer(digitsOnly(profile.bin_iin)))
  }
  const accounts = await loadBankAccounts(userId)
  const pre = decideBankBonus(account, profile, accounts, 'found')
  if (!pre.eligible) return pre
  return decideBankBonus(account, profile, accounts, await registryAnswer(digitsOnly(profile.bin_iin)))
}

export interface ClaimOutcome { status: number; body: BonusClaimResponse & { error?: string } }

export async function claimProfileBonus(userId: string, block: ProfileBonusBlock): Promise<ClaimOutcome> {
  const profile = await loadProfile(userId)
  if (!profile) return { status: 404, body: { notEligible: true, reason: 'deleted' } }

  const granted = await loadGrantedBlocks(userId)
  if (granted === null) return { status: 503, body: { notEligible: true, reason: 'unavailable' } }
  if (granted.has(block)) return { status: 200, body: { alreadyClaimed: true } }

  const decision = await decide(block, userId, profile)
  if (!decision.eligible) {
    // Реестр не ответил — «попробуйте позже», а не окончательный отказ.
    const status = decision.reason === 'registry_unavailable' ? 503 : 200
    return { status, body: { notEligible: true, reason: decision.reason } }
  }

  const { data, error } = await supabase.rpc('claim_profile_bonus', {
    p_user_id: userId,
    p_block: block,
    p_bin: decision.bin ?? '',
    p_amount: PROFILE_BONUS_TENGE,
    p_note: BONUS_NOTES[block],
  })
  if (error) {
    if (isMissingRelation(error)) return { status: 503, body: { notEligible: true, reason: 'unavailable' } }
    // Ответ мог потеряться уже после COMMIT — повтор безопасен: функция
    // ответит «уже получено», а не начислит ещё раз.
    console.error('profile bonus: claim_profile_bonus failed for', userId, block, ':', error.message)
    return { status: 500, body: { error: 'claim_failed' } }
  }
  const result = (data ?? {}) as { status?: string; balance?: number | string; reason?: string }
  switch (result.status) {
    case 'credited':
      return { status: 200, body: { credited: true, amount: PROFILE_BONUS_TENGE, balance: Number(result.balance ?? 0) } }
    case 'already_claimed':
      return { status: 200, body: { alreadyClaimed: true } }
    case 'bin_already_rewarded':
      return { status: 200, body: { notEligible: true, reason: 'bin_already_rewarded' } }
    case 'not_eligible':
      return { status: 200, body: { notEligible: true, reason: result.reason === 'admin' ? 'admin' : 'deleted' } }
    default:
      console.error('profile bonus: unexpected claim_profile_bonus answer for', userId, block, ':', JSON.stringify(data))
      return { status: 500, body: { error: 'claim_failed' } }
  }
}

/** Этот БИН уже получил бонус за блок — на другом (или удалённом) аккаунте. */
async function binAlreadyRewarded(userId: string, block: ProfileBonusBlock, bin: string | null): Promise<boolean> {
  if (!bin) return false
  const { data, error } = await supabase
    .from('profile_bonus_grants')
    .select('user_id')
    .eq('block', block)
    .eq('bin', bin)
    .limit(1)
  if (error) {
    console.error('profile bonus: (block, bin) lookup failed:', error.message)
    return false
  }
  return !!data && data.length > 0 && data[0].user_id !== userId
}

/**
 * Для карточки «Готовность к счёту»: claimed — получено; ready — поля
 * заполнены и выглядят правильно (полная проверка — при claim); missing —
 * чего-то не хватает (reason — чего; bin_already_rewarded — исправить нельзя,
 * этот БИН уже получил бонус). Без реестра и без скачивания картинок:
 * страница профиля открывается часто; поиск по (block, bin) идёт по индексу.
 */
export async function getProfileBonusStatus(userId: string): Promise<BonusStatusResponse> {
  const unavailable: BonusStatusResponse = {
    available: false,
    amount: PROFILE_BONUS_TENGE,
    blocks: {
      requisites: { state: 'missing' },
      bank: { state: 'missing' },
      signature: { state: 'missing' },
    },
  }
  // База в Сингапуре, функция в США: каждый последовательный запрос стоит ~250 мс,
  // а три чтения друг от друга не зависят, поэтому идут одним заходом. Счета
  // читаем всегда: нужны они только если банковый бонус ещё не получен, но
  // лишнее чтение по индексу дешевле лишнего захода туда и обратно.
  const [profile, granted, accountsRead] = await Promise.all([
    loadProfile(userId),
    loadGrantedBlocks(userId),
    loadBankAccounts(userId).then(rows => ({ rows, error: null as Error | null }), (error: Error) => ({ rows: [], error })),
  ])
  if (!profile) return unavailable
  const account = accountFacts(profile)
  if (account.isAdmin || account.deleted) return unavailable
  if (granted === null) return unavailable
  if (accountsRead.error && !granted.has('bank')) throw accountsRead.error

  const accounts = granted.has('bank') ? [] : accountsRead.rows
  const result: BonusStatusResponse = { ...unavailable, available: true, blocks: { ...unavailable.blocks } }
  // Проверки по (block, bin) тоже независимы: реквизиты и банк спрашиваем вместе.
  await Promise.all(PROFILE_BONUS_BLOCKS.map(async block => {
    if (granted.has(block)) { result.blocks[block] = { state: 'claimed' }; return }
    let pre: BonusDecision
    if (block === 'requisites') pre = requisitesPrecheck(profile)
    else if (block === 'bank') {
      const bank = bankPrecheck(accounts)
      pre = bank.eligible ? requisitesPrecheck(profile) : bank
    } else {
      pre = profile.signature_url || profile.stamp_url
        ? { eligible: true, bin: null }
        : { eligible: false, reason: 'signature_missing' }
    }
    if (pre.eligible && block !== 'signature' && (await binAlreadyRewarded(userId, block, pre.bin))) {
      result.blocks[block] = { state: 'missing', reason: 'bin_already_rewarded' }
      return
    }
    result.blocks[block] = pre.eligible ? { state: 'ready' } : { state: 'missing', reason: pre.reason }
  }))
  return result
}
