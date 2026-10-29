'use client'
// Карточка «Готовность к счёту» на /profile: три блока профиля, за каждый
// проверенный — 100 ₸ в кошелёк (решение основателя 15.10.2026).
//
// Тем, у кого блок уже заполнен правильно, но бонус ещё не получен (старые
// аккаунты), бонус запрашивается автоматически — один раз за сессию на блок,
// чтобы не долбить сервер при каждом заходе. Решает всегда сервер. Отказ
// запоминается вместе с причиной: при повторном заходе в той же сессии
// строка показывает причину, а не пустое «Заполнить». «Реестр не отвечает»
// не запоминается — следующий заход попробует снова.
//
// Строка, которую исправить нельзя (бонус за этот БИН уже получен другим
// аккаунтом), показывается без кнопки и не держит карточку открытой.
//
// Пока миграция не применена или аккаунт — админ, сервер отвечает
// available: false, и карточки нет вовсе.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { profileBonusDict } from '@/lib/i18n/profileBonus'
import { withReturnPath } from '@/lib/returnPath'
import { claimProfileBonus, takeProfileBonusStatus, showBonusToast, BONUS_TRIED_KEY as TRIED_KEY } from '@/lib/profileBonusClient'
import {
  PROFILE_BONUS_BLOCKS, PROFILE_BONUS_TENGE, isTerminalBonusReason, blockToFix,
  type BonusStatusResponse, type ProfileBonusBlock, type BonusIneligibleReason, type BonusClaimResponse,
} from '@/lib/profileBonus'

const EASE = [0.16, 1, 0.3, 1] as const

// Высота карточки с прошлого захода: пока сервер отвечает (до 5-9 с), на её месте
// держим пустую плашку такой же высоты, иначе карточка появляется позже остальных
// блоков и сдвигает колонку вниз. Нет подсказки (карточки не было) - ничего не держим.
const HEIGHT_HINT_KEY = 'ikz-bonus-card-h'
function readHeightHint(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_HINT_KEY))
    return v > 0 && v < 600 ? v : 0
  } catch { return 0 }
}

const BLOCK_HREF: Record<ProfileBonusBlock, string> = {
  requisites: withReturnPath('/profile/requisites', '/create'),
  bank: withReturnPath('/profile/banks', '/create'),
  // У страницы подписи нет возврата в /create — обычная ссылка.
  signature: '/profile/signature',
}

type RowState = { state: 'claimed' | 'ready' | 'missing' | 'checking'; reason?: BonusIneligibleReason }

/** undefined — в этой сессии не пробовали; иначе — чем кончилась попытка. */
function triedThisSession(block: ProfileBonusBlock): { reason?: BonusIneligibleReason } | undefined {
  try {
    const raw = sessionStorage.getItem(TRIED_KEY + block)
    if (raw === null) return undefined
    return raw === '1' ? {} : { reason: raw as BonusIneligibleReason }
  } catch { return undefined }
}
function markTried(block: ProfileBonusBlock, reason?: BonusIneligibleReason) {
  try { sessionStorage.setItem(TRIED_KEY + block, reason || '1') } catch {}
}
function forgetTried(block: ProfileBonusBlock) {
  try { sessionStorage.removeItem(TRIED_KEY + block) } catch {}
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

/** Ответ сервера → состояние строки (и запись о попытке в сессии). */
function rowFromClaim(block: ProfileBonusBlock, result: BonusClaimResponse | null): RowState {
  if (result?.credited || result?.alreadyClaimed) return { state: 'claimed' }
  if (result?.notEligible) {
    // Реестр не ответил или бонусы ещё не включены — попробуем снова в
    // следующий заход, причину показываем сейчас.
    if (result.reason === 'registry_unavailable' || result.reason === 'unavailable') forgetTried(block)
    else markTried(block, result.reason)
    return { state: 'missing', reason: result.reason }
  }
  // Сеть/сервер: можно повторить кнопкой или в следующей сессии.
  forgetTried(block)
  return { state: 'ready' }
}

function isDone(row: RowState): boolean {
  return row.state === 'claimed' || (row.state === 'missing' && isTerminalBonusReason(row.reason))
}

export default function ProfileBonusCard() {
  const { lang } = useLanguage()
  const t = profileBonusDict[lang]
  const reduceMotion = !!useReducedMotion()
  const [status, setStatus] = useState<BonusStatusResponse | null>(null)
  const [rows, setRows] = useState<Record<ProfileBonusBlock, RowState> | null>(null)
  // Все три закрыты прямо сейчас, на глазах — показываем короткое «всё
  // получено»; если всё было закрыто ещё до захода, карточки нет.
  const [completedNow, setCompletedNow] = useState(false)
  const rowsRef = useRef<Record<ProfileBonusBlock, RowState> | null>(null)
  const announcedRef = useRef(false)
  const cardRef = useRef<HTMLElement | null>(null)
  const [heightHint, setHeightHint] = useState(0)

  // До первой отрисовки, а не после неё: обычный эффект срабатывал уже после
  // того, как страница показала колонку без плашки, и плашка (замер 29.10:
  // +296 px у кнопки «Удалить аккаунт») сдвигала её через ~100 мс.
  useLayoutEffect(() => { setHeightHint(readHeightHint()) }, [])
  // Запомнить высоту показанной карточки; если карточки нет, подсказку сбросить.
  // Короткую плашку «всё получено» (div, а не section) не запоминаем: на следующем
  // заходе карточки уже не будет, и держать для неё место значило бы дать скачок вверх.
  useEffect(() => {
    if (!status || !rows) return
    try {
      const el = cardRef.current
      const h = el && el.tagName === 'SECTION' ? el.offsetHeight : 0
      if (h > 0) localStorage.setItem(HEIGHT_HINT_KEY, String(h))
      else localStorage.removeItem(HEIGHT_HINT_KEY)
    } catch {}
  })

  function applyRow(block: ProfileBonusBlock, next: RowState) {
    if (!rowsRef.current) return
    const current = { ...rowsRef.current, [block]: next }
    rowsRef.current = current
    setRows(current)
    if (PROFILE_BONUS_BLOCKS.every(b => isDone(current[b]))
      && PROFILE_BONUS_BLOCKS.some(b => current[b].state === 'claimed')) setCompletedNow(true)
  }

  async function claim(block: ProfileBonusBlock) {
    applyRow(block, { state: 'checking' })
    markTried(block)
    const result = await claimProfileBonus(block)
    if (result?.credited) showBonusToast(t.bonusToast(result.amount ?? PROFILE_BONUS_TENGE))
    applyRow(block, rowFromClaim(block, result))
  }

  useLayoutEffect(() => {
    let cancelled = false
    async function run() {
      const s = await takeProfileBonusStatus()
      if (cancelled) return
      if (!s || !s.available) {
        // Карточки не будет: убрать держащую место плашку и забыть подсказку.
        try { localStorage.removeItem(HEIGHT_HINT_KEY) } catch {}
        setHeightHint(0)
        return
      }
      const initial = Object.fromEntries(
        PROFILE_BONUS_BLOCKS.map(b => [b, { state: s.blocks[b].state, reason: s.blocks[b].reason }]),
      ) as Record<ProfileBonusBlock, RowState>
      const toClaim: ProfileBonusBlock[] = []
      for (const b of PROFILE_BONUS_BLOCKS) {
        if (initial[b].state !== 'ready') continue
        const tried = triedThisSession(b)
        if (!tried) { toClaim.push(b); initial[b] = { state: 'checking' } }
        // Уже пробовали в этой сессии: показать прошлую причину, а не «Заполнить».
        else if (tried.reason) initial[b] = { state: 'missing', reason: tried.reason }
      }
      rowsRef.current = initial
      // Всё было закрыто ещё до захода — «всё получено» не показываем. Выставляем
      // до setState: при синхронной отрисовке ниже рендер уже читает этот флаг.
      announcedRef.current = PROFILE_BONUS_BLOCKS.every(b => isDone(initial[b]))
      // Синхронно и до отрисовки: ответ часто уже готов (его просит страница, пока
      // грузит свои данные), и тогда карточка попадает в первый же кадр колонки, а не
      // появляется через 1-3 кадра и не сдвигает всё ниже на ~300 px.
      flushSync(() => { setStatus(s); setRows(initial) })

      // По одному: реквизиты и банк смотрят в один и тот же реестр.
      for (const block of toClaim) {
        markTried(block)
        const result = await claimProfileBonus(block)
        if (cancelled) return
        if (result?.credited) showBonusToast(t.bonusToast(result.amount ?? PROFILE_BONUS_TENGE))
        applyRow(block, rowFromClaim(block, result))
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status || !rows) {
    return heightHint > 0 ? <div aria-hidden="true" style={{ minHeight: heightHint }} /> : null
  }
  const allDone = PROFILE_BONUS_BLOCKS.every(b => isDone(rows[b]))
  if (allDone && (!completedNow || announcedRef.current)) return null

  const motionProps = {
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.4, ease: EASE },
  } as const

  if (allDone) {
    return (
      <motion.div {...motionProps} ref={cardRef as React.Ref<HTMLDivElement>} role="status" className="nav-glass rounded-2xl px-4 py-3 flex items-center gap-2 text-sm"
        style={{ color: 'var(--nav-text-secondary)' }}>
        <span style={{ color: 'var(--nav-success)' }}><CheckIcon /></span>
        {t.allClaimedLabel}
      </motion.div>
    )
  }

  const ctaClass = 'text-xs font-semibold px-3 min-h-[44px] inline-flex items-center rounded-xl flex-shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[color:var(--nav-accent)]'
  const ctaStyle = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }

  return (
    <motion.section {...motionProps} ref={cardRef as React.Ref<HTMLElement>} aria-labelledby="profile-bonus-title" className="nav-glass nav-card-accent rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 id="profile-bonus-title" className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.cardTitle}</h2>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--nav-text-muted)' }}>{t.cardWalletHint}</p>
      </div>
      <ul className="pb-1">
        {PROFILE_BONUS_BLOCKS.map(block => {
          const row = rows[block]
          const terminal = row.state === 'missing' && isTerminalBonusReason(row.reason)
          const reasonText = row.state === 'missing' && row.reason ? t.reasonTexts[row.reason] : undefined
          return (
            <li key={block} className="flex items-center justify-between gap-3 mx-2 px-2 py-2.5"
              style={{ borderTop: '1px solid var(--nav-border-soft)', opacity: terminal ? 0.7 : 1 }}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{t.blockLabels[block]}</span>
                  {!terminal && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                      style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                      {t.bonusAmountTag(status.amount)}
                    </span>
                  )}
                </span>
                {reasonText && (
                  <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--nav-text-muted)' }}>{reasonText}</span>
                )}
              </span>
              {row.state === 'claimed' ? (
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--nav-success)' }}>{t.claimedLabel}</span>
              ) : row.state === 'checking' ? (
                <span className="text-xs flex-shrink-0" aria-live="polite" style={{ color: 'var(--nav-text-muted)' }}>{t.checkingLabel}</span>
              ) : terminal ? null : row.state === 'ready' || row.reason === 'registry_unavailable' || row.reason === 'unavailable' ? (
                // Всё заполнено, бонус не дошёл (сеть, реестр) — повторить, а не «Заполнить».
                <button type="button" onClick={() => { void claim(block) }} className={ctaClass} style={ctaStyle}>
                  {t.claimLabel}
                </button>
              ) : (
                <Link href={BLOCK_HREF[blockToFix(block, row.reason)]} className={ctaClass} style={ctaStyle}>
                  {t.fillLabel}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </motion.section>
  )
}
