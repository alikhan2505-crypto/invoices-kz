'use client'
// Браузерная сторона бонуса за профиль: запрос начисления после сохранения
// блока и короткая всплывашка «+100 ₸ в кошелёк».
//
// Всплывашка — обычный элемент в document.body, а не React-состояние
// страницы: после сохранения реквизитов или банка страница часто сразу
// уводит обратно в /create (?next=), и сообщение должно пережить переход.

import { supabase } from '@/lib/supabase'
import type { BonusClaimResponse, BonusStatusResponse, ProfileBonusBlock } from '@/lib/profileBonus'
import { profileBonusDict } from '@/lib/i18n/profileBonus'
import { notifyWalletChanged } from '@/lib/walletSignal'

type Lang = 'ru' | 'kk' | 'en'

/** sessionStorage-ключ автопопытки карточки на /profile (ProfileBonusCard). */
export const BONUS_TRIED_KEY = 'profileBonusAutoClaimTried:'

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null
}

/** Никогда не бросает: бонус не должен ломать сохранение. */
export async function claimProfileBonus(block: ProfileBonusBlock): Promise<BonusClaimResponse | null> {
  try {
    const headers = await authHeader()
    if (!headers) return null
    const res = await fetch('/api/profile/bonus/claim', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ block }),
    })
    const result = (await res.json().catch(() => null)) as BonusClaimResponse | null
    // Бонус лёг на кошелёк — плашка с балансом должна обновиться сразу.
    if (result?.credited) notifyWalletChanged('profile-bonus')
    return result
  } catch {
    return null
  }
}

export async function fetchProfileBonusStatus(): Promise<BonusStatusResponse | null> {
  try {
    const headers = await authHeader()
    if (!headers) return null
    const res = await fetch('/api/profile/bonus/status', { headers, cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as BonusStatusResponse
  } catch {
    return null
  }
}

export function showBonusToast(text: string): void {
  if (typeof document === 'undefined') return
  // Две всплывашки подряд (реквизиты + банк) — друг над другом, а не одна на другой.
  const stacked = document.querySelectorAll('[data-bonus-toast]').length
  const el = document.createElement('div')
  el.setAttribute('data-bonus-toast', '')
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.textContent = text
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: `calc(${24 + stacked * 56}px + env(safe-area-inset-bottom, 0px))`,
    transform: reduce ? 'translateX(-50%)' : 'translate(-50%, 12px)',
    opacity: reduce ? '1' : '0',
    transition: reduce ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out',
    zIndex: '1000',
    maxWidth: 'calc(100vw - 32px)',
    padding: '12px 18px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.3',
    textAlign: 'center',
    background: 'var(--nav-accent, #2DC48D)',
    color: 'var(--nav-accent-ink, #ffffff)',
    boxShadow: '0 12px 30px -10px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  if (!reduce) {
    requestAnimationFrame(() => {
      el.style.opacity = '1'
      el.style.transform = 'translateX(-50%)'
    })
  }
  window.setTimeout(() => {
    el.style.opacity = '0'
    window.setTimeout(() => el.remove(), 250)
  }, 3200)
}

/** Сохранили блок — пробуем получить бонус и, если начислен, говорим об этом. */
export async function claimAndAnnounceBonus(block: ProfileBonusBlock, lang: Lang): Promise<BonusClaimResponse | null> {
  // Блок только что сохранили — прошлый отказ карточки на /profile устарел.
  try { sessionStorage.removeItem(BONUS_TRIED_KEY + block) } catch {}
  const result = await claimProfileBonus(block)
  if (result?.credited) showBonusToast(profileBonusDict[lang].bonusToast(result.amount ?? 100))
  return result
}
