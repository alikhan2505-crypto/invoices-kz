'use client'
import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { closeLabel } from '@/lib/a11yLabels'
import { miscDict } from '@/lib/i18n/misc'
import { supportDict } from '@/lib/i18n/support'
import { getActivePlan } from '@/lib/plan'
import { PLAN_PRICES, type BillingPeriod } from '@/lib/plans/pricing'
import { consumePendingUpgrade } from '@/lib/pendingUpgrade'
import { useAppDialog } from '@/components/AppDialog'
import { homeFor } from '@/lib/products'
import { formatDateNumeric } from '@/lib/date'
import { profileBonusDict } from '@/lib/i18n/profileBonus'
import type { PlanPaymentSplit } from '@/lib/plans/planActivation'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import { notifyWalletChanged } from '@/lib/walletSignal'

// How long an untouched QR is shown before it is retired for a fresh one.
// Kaspi's own window is ~5 minutes; /kaspi-api shortens the visible wait to a
// minute on the founder's ask, and this page follows it.
const IDLE_QR_MS = 60_000

// Admin, or a real paid Pro (trial/bonus are never 'pro' in getActivePlan):
// these get the "you already have it" card at the top of /upgrade.
function hasOwnedCard(p: { is_admin?: boolean | null } | null): boolean {
  if (!p) return false
  if (p.is_admin) return true
  const info = getActivePlan(p)
  return info.plan === 'pro' && !info.isTrial
}

// Same easing curve used across the redesigned cabinet (see
// src/app/profile/contracts/page.tsx) -- not a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Lift-on-hover used by the cabinet's buttons; off under reduced motion.
const PRESS = 'transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
// Same 1.5px border as BTN_OUTLINE (transparent) so a filled and an outlined
// CTA are the same height and line up across the plan row.
const BTN_PRIMARY: CSSProperties = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', border: '1.5px solid transparent' }
const BTN_OUTLINE: CSSProperties = { border: '1.5px solid var(--nav-accent)', color: 'var(--nav-accent)', background: 'transparent' }
const BTN_GHOST: CSSProperties = { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)', border: '1px solid var(--nav-border-soft)' }
// Inline background/colour (not bg-white): the legacy [data-theme="dark"]
// .bg-white override and the browser's default white field would otherwise
// fight the tokens in dark mode.
const inputClass = 'w-full rounded-lg px-3 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
// WebkitTextFillColor: globals.css paints every input's glyphs #111827 via
// -webkit-text-fill-color (beats `color` in Blink/WebKit), which is invisible
// on the dark surface when dark comes from the OS (no data-theme attribute).
const INPUT_STYLE: CSSProperties = { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)' }
const ROW_STYLE: CSSProperties = { background: 'var(--nav-surface-glass)' }

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  )
}
// Round status tile instead of an emoji: icon inherits `color`, fill is a soft token.
function StatusTile({ bg, color, children }: { bg: string; color: string; children: ReactNode }) {
  return (
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: bg, color }} aria-hidden="true">
      {children}
    </div>
  )
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

// Bottom sheet on a phone, centred dialog from lg up. Portalled to <body>:
// the page now sits inside DesktopShell / .page-surface-in-shell, whose
// backdrop-filter makes it the containing block for `position: fixed` -- an
// in-tree overlay would be pinned to the (tall) page, not the viewport.
// Module-level so it is never re-created (and its content remounted) on a
// re-render of the page.
function Sheet({ children, zClass, labelledBy, onBackdrop }: {
  children: ReactNode; zClass: string; labelledBy?: string; onBackdrop?: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={`fixed inset-0 ${zClass} flex items-end lg:items-center justify-center lg:p-6`}
      style={{ background: 'rgba(15, 17, 23, 0.55)' }}
      onClick={onBackdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="w-full max-w-lg lg:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl lg:rounded-3xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
        style={{ background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function SheetCloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
      style={{ color: 'var(--nav-text-muted)' }}>
      <XIcon />
    </button>
  )
}

function Spinner({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className={`${size === 'lg' ? 'w-10 h-10' : 'w-3 h-3'} border-2 rounded-full animate-spin flex-shrink-0`}
      style={{ borderColor: 'var(--nav-accent)', borderTopColor: 'transparent' }} aria-hidden="true" />
  )
}

function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px" style={{ background: 'var(--nav-border)' }} />
      <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--nav-border)' }} />
    </div>
  )
}

// The entrance `initial` is the same on the server and the client on purpose:
// `initial={reduceMotion ? false : ...}` (the pattern on /profile/contracts)
// renders differently once useReducedMotion() resolves on the client and
// trips a hydration mismatch. Reduced motion zeroes the duration instead.
// One price card. All three share the same 2px border so their content lines
// up across the desktop row; Pro alone gets the accent border, the soft
// accent wash and the top gradient bar (.nav-card-accent).
function PlanCard({ id, tone, current, index, reduceMotion, children }: {
  id?: string; tone: 'free' | 'basic' | 'pro'; current: boolean; index: number
  reduceMotion: boolean; children: ReactNode
}) {
  const style: CSSProperties = tone === 'pro'
    ? {
        border: '2px solid var(--nav-accent)',
        background: 'linear-gradient(180deg, var(--nav-accent-soft) 0%, transparent 55%), var(--nav-surface-chrome)',
        boxShadow: 'var(--nav-card-glow)',
      }
    : {
        border: `2px solid ${current ? 'var(--nav-accent)' : tone === 'basic' ? 'var(--nav-border)' : 'var(--nav-border-soft)'}`,
        background: 'var(--nav-surface-chrome)',
      }
  return (
    <motion.div id={id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : 0.06 + index * 0.05, duration: reduceMotion ? 0 : 0.35, ease: EASE }}
      className={`h-full flex flex-col rounded-2xl p-6 ${tone === 'pro' ? 'nav-card-accent' : ''}`}
      style={style}>
      {children}
    </motion.div>
  )
}

function PlanBadge({ solid, children }: { solid?: boolean; children: ReactNode }) {
  return (
    // Weight inline, not font-semibold: the legacy [data-theme="dark"]
    // span.font-semibold rule would force the text white with !important.
    <span className="text-xs px-2.5 py-1 rounded-full whitespace-nowrap"
      style={solid
        ? { fontWeight: 600, background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
        : { fontWeight: 600, background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
      {children}
    </span>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 flex-1">
      {items.map(f => (
        <li key={f} className="flex items-start gap-2 text-sm leading-snug" style={{ color: 'var(--nav-text-secondary)' }}>
          <span className="mt-px flex-shrink-0" style={{ color: 'var(--nav-success)' }}><CheckIcon /></span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Upgrade() {
  const router = useRouter()
  const { lang } = useLanguage()
  const reduceMotion = useReducedMotion()
  const t = miscDict[lang]
  // Shadows window.alert for this component -- see src/components/AppDialog.tsx.
  const { alert, dialogElement } = useAppDialog()
  const s = supportDict[lang]
  const tw = profileBonusDict[lang]
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState('')
  const [promoError, setPromoError] = useState('')
  const [plan, setPlan] = useState('free')
  // The whole profile row, for the "you already have it" card at the top
  // (Pro end date, is_admin, enabled_products for «В кабинет»).
  const [profile, setProfile] = useState<{ is_admin?: boolean | null; plan_expires_at?: string | null; enabled_products?: unknown } | null>(null)
  // Set once loadData() finished (with or without a profile) -- gates the
  // pending-plan scroll below.
  const [profileChecked, setProfileChecked] = useState(false)
  const [pendingScrollPlan, setPendingScrollPlan] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; amount: number; plan: string; period: BillingPeriod; useWallet?: boolean } | null>(null)
  // Оплата с кошелька (15.10.2026). walletChoice — выбор «целиком / частью /
  // только Kaspi» перед оплатой; walletPaid — сколько реально удержано с
  // кошелька под текущий Kaspi-платёж (сервер мог списать меньше, чем
  // показывали, если баланс успел измениться).
  const [walletChoice, setWalletChoice] = useState<{ name: string; amount: number; plan: string; period: BillingPeriod; split: PlanPaymentSplit } | null>(null)
  const [walletPaid, setWalletPaid] = useState(0)
  const [walletQuoteLoading, setWalletQuoteLoading] = useState(false)
  const [walletInfo, setWalletInfo] = useState<{ available: boolean; balance: number } | null>(null)
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [submitting, setSubmitting] = useState(false)
  const [qrToken, setQrToken] = useState('')
  const [extTranId, setExtTranId] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(false)
  // Kaspi gives a QR roughly five minutes. Nothing used to surface that: the
  // code silently died and the modal kept spinning "ожидаем подтверждение"
  // forever, so the customer either waited on a dead square or closed the
  // modal and hit `already_pending` on the retry. Now the deadline is shown
  // and a fresh QR is minted the moment the old one lapses.
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0)
  const [secondsLeft, setSecondsLeft] = useState<number>(0)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [refreshingQr, setRefreshingQr] = useState(false)
  const [qrScanning, setQrScanning] = useState(false)
  // Read by the idle timer, which must not list scanning in its deps: doing
  // so would restart the 60s clock every time the flag flips, defeating it.
  const scanningRef = useRef(false)
  // When the current QR was minted -- the 60s idle deadline counts from here,
  // not from Kaspi's ~5-minute ExpireDate.
  const qrCreatedAtRef = useRef<number>(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [payPhone, setPayPhone] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  // True once a phone payment request has been sent for the CURRENT QR
  // modal session -- swaps the QR/"open Kaspi" UI for a short status note
  // while the same extTranId poll below keeps checking (create-phone reuses
  // it as the new payment_id, so the poll doesn't need to change).
  const [phoneRequested, setPhoneRequested] = useState(false)
  // True once Kaspi reports the push declined/rejected (or it lapsed
  // unanswered) -- a dedicated screen with a "Повторить оплату" button
  // rather than leaving the "📲 Запрос отправлен" note up with nothing
  // having actually happened.
  const [phoneDeclined, setPhoneDeclined] = useState(false)
  const statusInterval = useRef<any>(null)
  // Snapshot of the renewer's plan_expires_at (ms) taken right before a
  // payment is created. For a renewer, p.plan === planKey && p.plan_expires_at
  // > now is ALREADY true at t=0 -- without this baseline, checkPaymentStatus
  // below would declare success 5s after opening the QR, before anything was
  // actually paid. 0 for a fresh purchase (no current plan_expires_at to beat).
  const baselineExpiresRef = useRef<number>(0)

  useEffect(() => {
    loadData()
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    return () => { if (statusInterval.current) clearInterval(statusInterval.current) }
  }, [])

  // Restores the period/plan the visitor picked on the landing page's
  // pricing CTA before /login sent them here with `period` defaulted back
  // to 'monthly'. Consumed (read + removed) exactly once so a stale value
  // can never be replayed on a later, unrelated visit.
  // The scroll to the picked plan waits for the profile: a Pro user or admin
  // gets the "you already have it" card at the very top instead, and
  // scrolling the price card to the centre would push that card off-screen
  // on a phone -- exactly the visitor who needs it (15.10.2026).
  useEffect(() => {
    const pending = consumePendingUpgrade()
    if (!pending) return
    setPeriod(pending.period)
    setPendingScrollPlan(pending.plan)
  }, [])

  useEffect(() => {
    if (!pendingScrollPlan || !profileChecked) return
    const target = pendingScrollPlan
    setPendingScrollPlan(null)
    if (hasOwnedCard(profile)) return
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById(`plan-${target}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    })
  }, [pendingScrollPlan, profileChecked, profile])

  // Live-polls the in-house Kaspi rail's own settlement status by order_id,
  // in parallel with checkPaymentStatus's profile-based check above — this
  // one settles the payment_requests row itself (via /api/payment/status),
  // so it works even if the profile poll's timing window is missed.

  // Draws the QR here instead of fetching an <img> from api.qrserver.com.
  // That third party received the Kaspi payment link in a query string on
  // every render, and when it was slow or down the customer got an empty
  // box with no explanation. The qrcode package is already a dependency and
  // is what every other QR in the app uses.
  useEffect(() => {
    if (!qrToken) { setQrDataUrl(''); return }
    let cancelled = false
    QRCode.toDataURL(qrToken, { width: 200, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl('') })
    return () => { cancelled = true }
  }, [qrToken])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      setPlan(getActivePlan(p).plan)
      void refreshWalletInfo()
    } finally {
      setProfileChecked(true)
    }
  }

  // Доступна ли оплата с кошелька и сколько на нём (вместе со своими
  // удержаниями под неоплаченный тариф — они вернутся перед новой покупкой).
  // Пока миграция не применена, сервер отвечает available: false — и ни
  // строки про кошелёк, ни выбора способа оплаты нет.
  async function refreshWalletInfo() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch('/api/payment/wallet?plan=pro&period=monthly', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        cache: 'no-store',
      })
      if (!res.ok) { setWalletInfo({ available: false, balance: 0 }); return }
      const q = await res.json()
      setWalletInfo({ available: !!q?.available, balance: Number(q?.balance) || 0 })
    } catch {
      // Не узнали — кошелёк просто не предлагаем.
    }
  }

  // Окно частичной оплаты закрыли (или перестали ждать) — закрыть платёж
  // сейчас, а не ночным кроном: сервер сначала спросит Kaspi (вдруг оплачено
  // в эту секунду), иначе пометит истёкшим и вернёт удержание на кошелёк.
  async function releaseWalletHold(orderId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/api/payment/status?order_id=${encodeURIComponent(orderId)}&force=true`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
    } catch {
      // Не дошло — вернёт следующая попытка оплаты или ночной крон.
    }
    await reloadPlan()
    await refreshWalletInfo()
    // Удержание вернулось (или оплата прошла) — баланс в плашке изменился.
    notifyWalletChanged('upgrade')
  }

  async function reloadPlan() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)
    setPlan(getActivePlan(p).plan)
  }

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  // Mints one Kaspi operation and wires the modal to it. Split out of
  // openModal so the expiry watcher below can mint a replacement without
  // reopening the modal or re-running the baseline snapshot.
  // `link` carries the fresh payment URL because React state updates are
  // async -- the mobile redirect needs the value in this tick and cannot read
  // it back off `qrToken`. `settled` means the server found the plan already
  // paid and the modal is now showing success, so the caller must leave it
  // open instead of treating the empty link as a failure.
  const requestPayment = useCallback(async (
    planKey: string,
    billingPeriod: BillingPeriod,
    useWallet = false,
  ): Promise<{ link: string; settled: boolean }> => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ userId, plan: planKey, period: billingPeriod, ...(useWallet ? { useWallet: true } : {}) })
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      // already_paid means the server settled a QR the customer had in fact
      // already paid -- the plan is now active, so show success rather than
      // an error telling them to try again.
      if (data.error === 'already_paid') {
        setStep('success')
        return { link: '', settled: true }
      }
      const walletError = data.error === 'wallet_changed' || data.error === 'wallet_covers_full' ? tw.walletErrors.changed
        : data.error === 'wallet_unavailable' ? tw.walletErrors.unavailable
        : typeof data.error === 'string' && data.error.startsWith('wallet_') ? tw.walletErrors.generic
        : null
      alert(walletError ?? (data.error === 'already_pending' ? t.alreadyPendingAlert : t.errorPrefix(data.error || t.tryAgainDefault)))
      return { link: '', settled: false }
    }

    setWalletPaid(Number(data.wallet_amount) || 0)
    // Часть суммы удержана с кошелька — плашка должна показать остаток.
    if (Number(data.wallet_amount) > 0) notifyWalletChanged('upgrade')
    setQrToken(data.qr_token)
    setExtTranId(data.ext_tran_id)
    setQrExpiresAt(data.expire_date ? new Date(data.expire_date).getTime() : 0)
    // A fresh code has never been scanned, and its idle clock starts now.
    setQrScanning(false)
    scanningRef.current = false
    qrCreatedAtRef.current = Date.now()
    return { link: data.qr_token as string, settled: false }
  }, [userId, t, tw])

  // Live-polls the in-house Kaspi rail's own settlement status by order_id.
  // Idle refresh is folded into this SAME recurring tick rather than a
  // separate one-shot 60s timer: the earlier design pushed the deadline into
  // the past and relied on a second effect to notice and reissue, and if
  // THAT one attempt was refused (a transient network hiccup, Kaspi briefly
  // unreachable), nothing ever rearmed it -- the modal was stuck reading
  // "Обновляем код…" until the customer gave up (founder's own repro,
  // 2026-09-05). A refusal here just gets retried on the next 5s tick, the
  // same recurring-tick safety net the wallet widget and /kaspi-api use.
  useEffect(() => {
    // phoneRequested is no longer a bail-out condition: this poll is the ONLY
    // thing that ever learns a phone push was declined (Kaspi's 'failed'/
    // 'expired'), so skipping it here meant a declined push left the modal
    // showing "📲 Запрос отправлен" forever, with nothing detecting it short
    // of the customer giving up and closing the modal. It's still read
    // inside the tick, both to keep the QR-only idle refresh out of the
    // phone-push case (there is no code to swap) and to branch the
    // expired/failed reaction to a "declined, try again" screen instead of a
    // silent QR reissue.
    if (!extTranId || !showModal || step !== 'pending') return
    let cancelled = false
    let polls = 0
    const interval = setInterval(async () => {
      polls++
      if (polls > 150 || cancelled) {
        clearInterval(interval)
        // Перестали ждать оплату с удержанием — вернуть его сейчас.
        if (!cancelled && selectedPlan?.useWallet) void releaseWalletHold(extTranId)
        return
      }
      const idleOverdue = !phoneRequested && !scanningRef.current
        && qrCreatedAtRef.current > 0
        && Date.now() - qrCreatedAtRef.current >= IDLE_QR_MS
      const { data: { session } } = await supabase.auth.getSession()
      try {
        const url = `/api/payment/status?order_id=${extTranId}${idleOverdue ? '&force=true' : ''}`
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (cancelled) return
        if (data.status === 'paid') {
          clearInterval(interval)
          router.push('/profile?upgraded=1')
        } else if (data.status === 'scanning') {
          // Kaspi's 'Wait': the customer is on the confirmation screen right
          // now. Recorded so neither refresh path pulls the QR out from
          // under them -- same guarantee /kaspi-api makes.
          setQrScanning(true)
          scanningRef.current = true
        } else if (data.status === 'expired' || data.status === 'failed') {
          // Kaspi can discard a QR before its stated ExpireDate on its own,
          // and 'failed' covers a scan the customer then cancelled -- both
          // leave a code its own scanner answers with "QR-код не распознан".
          //
          // Stops THIS interval outright instead of guarding re-entrancy with
          // a state flag: an earlier version gated the reissue on
          // `!refreshingQr` (a STATE value) and reset it in a `finally` block
          // behind `if (!cancelled)`. That was the actual bug the founder hit
          // three times: requestPayment succeeding calls setExtTranId, which
          // is this effect's OWN dependency, so its cleanup runs and flips
          // `cancelled` true BEFORE the finally block's check -- the reset
          // was silently skipped on every single successful reissue, so
          // `refreshingQr` got stuck `true` forever and permanently blocked
          // every later attempt behind its own guard. Clearing the interval
          // immediately (matching /kaspi-api's original, unrelated design)
          // sidesteps the whole class of bug: nothing can double-fire while
          // requestPayment is in flight, since a fresh interval only starts
          // once extTranId genuinely changes below.
          clearInterval(interval)
          setQrScanning(false)
          scanningRef.current = false
          if (phoneRequested) {
            // A pushed request has no code to swap -- only Kaspi's own
            // terminal status can tell us it was declined or timed out
            // unanswered. Surface that plainly instead of silently minting
            // a QR the customer never asked for.
            setPhoneRequested(false)
            setPhoneDeclined(true)
            return
          }
          setRefreshingQr(true)
          try {
            if (selectedPlan) await requestPayment(selectedPlan.plan, selectedPlan.period, !!selectedPlan.useWallet)
          } finally {
            setRefreshingQr(false)
          }
        } else {
          setQrScanning(false)
        }
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extTranId, showModal, step, phoneRequested, selectedPlan, requestPayment])

  // Purely cosmetic countdown -- shows the nearer of Kaspi's own deadline and
  // the 60s idle deadline, the same number /kaspi-api shows, so it never
  // reads "4:56" a moment before the poll above swaps the code out. Replacing
  // a spent code is decided entirely by the poll against Kaspi's real
  // status; this never mutates anything, so it can't race with it.
  useEffect(() => {
    if (!qrExpiresAt || !showModal || step !== 'pending' || phoneRequested) return
    const tick = () => {
      const kaspiLeft = Math.round((qrExpiresAt - Date.now()) / 1000)
      const idleLeft = scanningRef.current
        ? kaspiLeft
        : Math.round((qrCreatedAtRef.current + IDLE_QR_MS - Date.now()) / 1000)
      setSecondsLeft(Math.max(0, Math.min(kaspiLeft, idleLeft)))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [qrExpiresAt, showModal, step, phoneRequested])

  async function openModal(planName: string, amount: number, planKey: string, billingPeriod: BillingPeriod, useWallet = false) {
    setSelectedPlan({ name: planName, amount, plan: planKey, period: billingPeriod, useWallet })
    setWalletPaid(0)
    setQrToken('')
    setExtTranId('')
    setQrExpiresAt(0)
    setQrDataUrl('')
    setStep('pending')
    setPhoneRequested(false)
    setPhoneDeclined(false)
    setShowModal(true)
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = user
        ? await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single()
        : { data: null }
      baselineExpiresRef.current = p?.plan === planKey && p?.plan_expires_at ? new Date(p.plan_expires_at).getTime() : 0

      const { link, settled } = await requestPayment(planKey, billingPeriod, useWallet)
      if (!link) {
        // settled === true keeps the modal up on its success screen; only a
        // real failure closes it.
        if (!settled) setShowModal(false)
        setSubmitting(false)
        return
      }

      if (isMobile) {
        window.location.href = link
      }

      statusInterval.current = setInterval(() => checkPaymentStatus(planKey), 5000)

    } catch (e: any) {
      alert(t.errorPrefix(e.message || t.tryAgainDefault))
      setShowModal(false)
    }
    setSubmitting(false)
  }

  async function checkPaymentStatus(planKey: string) {
    setCheckingStatus(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single()
      if (p?.plan === planKey && p?.plan_expires_at) {
        const expiresAt = new Date(p.plan_expires_at)
        // Strictly-greater-than-baseline check: for a renewer, expiresAt was
        // already in the future before this payment existed, so "in the
        // future" alone can't tell a completed renewal apart from an
        // untouched, still-active plan. Only a plan_expires_at that moved
        // PAST the pre-payment snapshot proves this payment actually settled.
        if (expiresAt > new Date() && expiresAt.getTime() > baselineExpiresRef.current) {
          clearInterval(statusInterval.current)
          setPlan(p.plan)
          setStep('success')
        }
      }
    } catch {}
    setCheckingStatus(false)
  }

  async function createPhonePayment() {
    if (!payPhone || payPhone.length < 16) {
      alert(t.enterFullPhoneAlert)
      return
    }
    setPhoneSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/payment/create-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId,
          plan: selectedPlan?.plan,
          phone: payPhone.replace(/\s/g, ''),
          period: selectedPlan?.period,
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        if (data.error === 'already_paid') {
          // The pending QR had already been paid by the time the server
          // checked -- the plan is active now, so this is a success, not a
          // failure to retry. Both polls tied to the old QR must stop here:
          // clearInterval only kills the profile-based poll, while the
          // separate extTranId-keyed effect above keeps hitting
          // /api/payment/status for the OLD order_id and would find it
          // 'paid' ~5s later, calling router.push('/profile?upgraded=1')
          // right over this success screen. Resetting extTranId lets that
          // effect's cleanup stop it instead.
          clearInterval(statusInterval.current)
          setExtTranId('')
          setShowPhoneModal(false)
          await reloadPlan()
          setStep('success')
          setPhoneSubmitting(false)
          return
        }
        alert(data.error === 'already_pending' ? t.alreadyPendingAlert : t.errorPrefix(data.error || t.tryAgainDefault))
        setPhoneSubmitting(false)
        return
      }
      setShowPhoneModal(false)
      setPhoneRequested(true)
      setPhoneDeclined(false)
      // Without this, the phone-push path never started the same live poll
      // the QR path gets (data.payment_id is the same value the create-phone
      // route stored as payment_requests.order_id) -- it would otherwise
      // only ever settle via the once-daily cron, a silent regression from
      // xpayment's near-instant webhook.
      setExtTranId(data.payment_id)
    } catch (e: any) {
      alert(t.errorPrefix(e.message))
    }
    setPhoneSubmitting(false)
  }

  // Кнопка тарифа: есть деньги в кошельке — сначала спрашиваем, как платить
  // (сумму делит сервер, по PLAN_PRICES и текущему балансу); нет — сразу Kaspi.
  async function startPurchase(planName: string, amount: number, planKey: string, billingPeriod: BillingPeriod) {
    // Кошелёк недоступен (миграция не применена) или пуст — сразу Kaspi.
    if (!userId || !walletInfo?.available || walletInfo.balance < 1) { openModal(planName, amount, planKey, billingPeriod); return }
    setWalletQuoteLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/payment/wallet?plan=${planKey}&period=${billingPeriod}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const quote = res.ok ? await res.json() : null
      if (quote?.available && quote.split && quote.split.mode !== 'kaspi_only') {
        setWalletChoice({ name: planName, amount, plan: planKey, period: billingPeriod, split: quote.split })
        return
      }
    } catch {
      // Не смогли спросить про кошелёк — платим как обычно, через Kaspi.
    } finally {
      setWalletQuoteLoading(false)
    }
    openModal(planName, amount, planKey, billingPeriod)
  }

  async function payFullyFromWallet(choice: NonNullable<typeof walletChoice>) {
    setWalletChoice(null)
    setSelectedPlan({ name: choice.name, amount: choice.amount, plan: choice.plan, period: choice.period, useWallet: true })
    setWalletPaid(choice.amount)
    setQrToken('')
    setExtTranId('')
    setStep('pending')
    setShowModal(true)
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/payment/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ plan: choice.plan, period: choice.period }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.error === 'already_paid') {
        // Прошлый Kaspi-платёж, оказывается, оплачен — тариф уже продлён,
        // с кошелька ничего не списано.
        setWalletPaid(0)
        await reloadPlan()
        await refreshWalletInfo()
        setStep('success')
        return
      }
      if (!res.ok || !data.ok) {
        setShowModal(false)
        void refreshWalletInfo()
        notifyWalletChanged('upgrade')
        alert(data.error === 'insufficient_funds' ? tw.walletErrors.insufficient
          : data.error === 'busy' ? tw.walletErrors.busy
          : data.error === 'unavailable' ? tw.walletErrors.unavailable
          : tw.walletErrors.generic)
        return
      }
      await reloadPlan()
      await refreshWalletInfo()
      notifyWalletChanged('upgrade')
      setStep('success')
    } catch {
      setShowModal(false)
      alert(tw.walletErrors.generic)
    } finally {
      setSubmitting(false)
    }
  }

  async function applyPromo() {
    if (!promoCode.trim()) { setPromoError(t.enterPromoCodeError); return }
    setPromoLoading(true)
    setPromoError('')
    setPromoSuccess('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    // Server-side: `plan`/`plan_expires_at` are guarded by the
    // protect_profile_privileged_columns DB trigger, which silently reverts
    // writes from the browser client for any non-admin user -- redemption
    // must happen with the service-role client, see api/plan/promo/route.ts.
    try {
      const res = await fetch('/api/plan/promo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: promoCode.toUpperCase() }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        if (res.status === 409) {
          // Two distinct 409s share the status code: the code's own
          // used_count/max_uses is exhausted, or the caller already has an
          // active paid plan (refuse-if-active guard) -- distinguish them
          // by the `error` field, not the status alone.
          setPromoError(data.error === 'plan_active' ? t.promoPlanActiveError : t.promoAlreadyUsedError)
        } else {
          setPromoError(t.promoNotFoundError)
        }
        setPromoLoading(false)
        return
      }

      setPromoSuccess(t.promoActivatedMessage(data.plan === 'pro' ? t.proPlanName : t.basicPlanName, data.days))
      setPromoCode('')
      await reloadPlan()
    } catch {
      setPromoError(t.promoNotFoundError)
    }
    setPromoLoading(false)
  }

  // `primary` -- the highlighted Pro card's filled accent CTA; otherwise an
  // accent outline (Базовый). Tokens, not #1C2056, so dark mode works.
  function ConnectButton({ planName, amount, planKey, primary }: {
    planName: string; amount: number; planKey: string; primary?: boolean
  }) {
    const suffix = period === 'annual' ? t.perYearSuffix : t.perMonthSuffix
    return (
      <button type="button" onClick={() => startPurchase(planName, amount, planKey, period)} disabled={walletQuoteLoading}
        className={`w-full min-h-[48px] rounded-xl py-3.5 px-4 text-sm font-semibold disabled:opacity-60 ${PRESS}`}
        style={primary ? BTN_PRIMARY : BTN_OUTLINE}>
        {t.connectButtonLabel(amount.toLocaleString('ru-KZ'), suffix)}
      </button>
    )
  }

  // Shown instead of ConnectButton when the user's active plan already
  // equals this card's plan -- Kaspi Pay has no auto-renewal, so an active
  // subscriber's only way to add more time is to pay again. Reuses the same
  // openModal/period flow as a fresh purchase; settlePlanPayment.ts and
  // admin/page.tsx's activatePayment stack the new period on top of the
  // remaining days rather than restarting from today.
  function RenewButton({ planName, amount, planKey, id }: {
    planName: string; amount: number; planKey: string; id?: string
  }) {
    return (
      <button type="button" id={id} onClick={() => startPurchase(planName, amount, planKey, period)} disabled={walletQuoteLoading}
        className={`w-full min-h-[48px] rounded-xl py-3 px-4 text-sm font-semibold disabled:opacity-60 ${PRESS}`}
        style={BTN_OUTLINE}>
        {t.renewButtonLabel(period)}
      </button>
    )
  }

  // "You already have it" card (founder, 15.10.2026): a signed-in Pro user or
  // admin who ended up here -- e.g. via a stale post-login intent -- used to
  // see only the price cards with a small «Текущий» badge, a dead end. Admin
  // wins over plan (all features are open regardless of billing); Pro means a
  // real paid Pro (trial/bonus are Базовый in getActivePlan, never 'pro').
  const ownedCard: null | { kind: 'admin' } | { kind: 'pro'; until: string | null } =
    !hasOwnedCard(profile) ? null
    : profile?.is_admin ? { kind: 'admin' }
    : { kind: 'pro', until: profile?.plan_expires_at ? formatDateNumeric(profile.plan_expires_at) : null }

  // Только когда оплата с кошелька действительно доступна: обещать «оплатить
  // тариф кошельком» до применения миграции нельзя.
  const walletBalance = walletInfo?.available ? Math.max(0, Math.floor(walletInfo.balance)) : 0
  const walletInUse = !!selectedPlan?.useWallet && walletPaid > 0
  const kaspiToPay = selectedPlan ? Math.max(0, selectedPlan.amount - (walletInUse ? walletPaid : 0)) : 0

  // «Продлить» leads to the existing renew flow on the Pro card (period
  // toggle + price are right there) rather than opening a payment silently.
  function scrollToRenew() {
    const card = document.getElementById('plan-pro')
    card?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    ;(document.getElementById('renew-pro') as HTMLButtonElement | null)?.focus({ preventScroll: true })
  }

  // Opened straight from a link (new tab, email) there is no history entry to
  // go back to -- land on the profile, where «Тариф» lives, instead of nowhere.
  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/profile')
  }

  // ✕ on the payment sheet. Частичная оплата: удержание с кошелька вернуть сразу.
  function closeQrModal() {
    clearInterval(statusInterval.current)
    if (walletInUse && extTranId) void releaseWalletHold(extTranId)
    setShowModal(false)
  }

  const suffixFor = (p: BillingPeriod | undefined) => p === 'annual' ? t.perYearSuffix : t.perMonthSuffix
  const priceSuffix = suffixFor(period)

  return (
      <>
        <PageContainer variant="wide">
          {/* Шапка и баннер тарифа стоят в той же широкой колонке, что и сетка тарифов:
              стрелка и заголовок на одной линии с краем карточек. */}
          <PageHeader title={t.pageTitle} onBack={goBack} as="h1" />

          {ownedCard && (
            <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-6 max-w-xl mx-auto" role="status"
              style={{ boxShadow: 'var(--nav-card-glow)' }}>
              <div className="font-bold text-base mb-4" style={{ color: 'var(--nav-text-primary)' }}>
                {ownedCard.kind === 'admin' ? t.adminAccessTitle : t.proActiveTitle(ownedCard.until)}
              </div>
              <div className="flex flex-wrap gap-2">
                {ownedCard.kind === 'pro' && (
                  <button type="button" onClick={scrollToRenew}
                    className={`flex-1 min-w-[140px] min-h-[44px] rounded-xl text-sm font-semibold ${PRESS}`}
                    style={BTN_OUTLINE}>
                    {t.renewShortButton}
                  </button>
                )}
                <button type="button" onClick={() => router.push(homeFor(profile?.enabled_products))}
                  className={`flex-1 min-w-[140px] min-h-[44px] rounded-xl text-sm font-semibold ${PRESS}`}
                  style={BTN_PRIMARY}>
                  {t.toCabinetButton}
                </button>
              </div>
            </div>
          )}

          {/* Узкая колонка: промо, кошелёк, переключатель периода. */}
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-lg lg:text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.heroTitle}</h2>
              <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.heroSubtitle}</p>
            </div>

            {/* Promo */}
            {/* One line on a computer (label · field · button) to keep the
                plan row above the fold; label on top on a phone. */}
            <div className="nav-glass rounded-2xl p-4 mb-4">
              <div className="lg:flex lg:items-center lg:gap-4">
              <label htmlFor="upgrade-promo" className="block text-sm font-medium mb-3 lg:mb-0 lg:flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>{t.promoSectionLabel}</label>
              <div className="flex gap-2 lg:flex-1 lg:min-w-0">
                <input
                  id="upgrade-promo"
                  className={`${inputClass} flex-1 min-w-0 min-h-[44px] uppercase`}
                  style={INPUT_STYLE}
                  placeholder={t.promoPlaceholder}
                  value={promoCode}
                  autoComplete="off"
                  onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); setPromoSuccess('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !promoLoading) applyPromo() }}
                />
                <button type="button" onClick={applyPromo} disabled={promoLoading}
                  className={`flex-shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-semibold disabled:opacity-60 ${PRESS}`}
                  style={BTN_PRIMARY}>
                  {promoLoading ? t.applyingButtonLabel : t.applyButtonLabel}
                </button>
              </div>
              </div>
              {promoError && <p className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }} role="alert">{promoError}</p>}
              {promoSuccess && <p className="text-xs mt-2 font-medium" style={{ color: 'var(--nav-success)' }} role="status">{promoSuccess}</p>}
            </div>

            {walletBalance > 0 && (
              <div className="nav-glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-4 text-sm">
                <span style={{ color: 'var(--nav-text-secondary)' }}>{tw.walletBalanceLine(walletBalance.toLocaleString('ru-KZ'))}</span>
                <span className="text-xs text-right" style={{ color: 'var(--nav-text-muted)' }}>{tw.cardWalletHint}</span>
              </div>
            )}

            {/* Billing period toggle */}
            <div className="rounded-2xl p-1 flex gap-1 mb-6 lg:max-w-md lg:mx-auto"
              style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border-soft)' }}>
              {(['monthly', 'annual'] as const).map(p => {
                const on = period === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    aria-pressed={on}
                    className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 px-2 ${on ? 'shadow-sm' : ''}`}
                    style={on
                      ? { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }
                      : { color: 'var(--nav-text-muted)' }}
                  >
                    {p === 'monthly' ? t.monthlyToggleLabel : t.annualToggleLabel}
                    {p === 'annual' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ fontWeight: 700, background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }}>
                        {t.annualBadgeLabel}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Plans: stacked on a phone, one equal-height row from lg up. */}
          <div className="grid gap-4 lg:grid-cols-3 lg:gap-5 items-stretch mb-6 lg:max-w-[1400px] lg:mx-auto">
            {/* Free */}
            <PlanCard tone="free" current={plan === 'free'} index={0} reduceMotion={!!reduceMotion}>
              <div className="flex items-center justify-between gap-2 min-h-[28px] mb-3">
                <h3 className="font-bold text-lg" style={{ color: 'var(--nav-text-primary)' }}>{t.freePlanName}</h3>
                {plan === 'free' && <PlanBadge solid>{t.currentBadge}</PlanBadge>}
              </div>
              <div className="text-3xl font-bold tabular-nums whitespace-nowrap mb-5" style={{ color: 'var(--nav-text-primary)' }}>0 ₸</div>
              <FeatureList items={t.freeFeatures} />
            </PlanCard>

            {/* Basic */}
            <PlanCard id="plan-basic" tone="basic" current={plan === 'basic'} index={1} reduceMotion={!!reduceMotion}>
              <div className="flex items-center justify-between gap-2 min-h-[28px] mb-3">
                <h3 className="font-bold text-lg" style={{ color: 'var(--nav-text-primary)' }}>{t.basicPlanName}</h3>
                {plan === 'basic'
                  ? <PlanBadge solid>{t.currentBadge}</PlanBadge>
                  : <PlanBadge>{t.popularBadge}</PlanBadge>}
              </div>
              <div className="text-3xl font-bold tabular-nums whitespace-nowrap mb-5" style={{ color: 'var(--nav-text-primary)' }}>
                {PLAN_PRICES.basic[period].toLocaleString('ru-KZ')} ₸<span className="text-sm font-normal" style={{ color: 'var(--nav-text-muted)' }}>{priceSuffix}</span>
              </div>
              <FeatureList items={t.basicFeatures} />
              <div className="mt-6">
                {plan !== 'basic' && plan !== 'pro' && <ConnectButton planName={t.basicPlanName} amount={PLAN_PRICES.basic[period]} planKey="basic" />}
                {plan === 'basic' && (
                  <div>
                    <div className="text-center text-sm py-1 mb-1" style={{ color: 'var(--nav-success)' }}>{t.activeLabel}</div>
                    <RenewButton planName={t.basicPlanName} amount={PLAN_PRICES.basic[period]} planKey="basic" />
                  </div>
                )}
                {plan === 'pro' && <div className="text-center text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.higherPlanNotice}</div>}
              </div>
            </PlanCard>

            {/* Pro */}
            <PlanCard id="plan-pro" tone="pro" current={plan === 'pro'} index={2} reduceMotion={!!reduceMotion}>
              <div className="flex items-center justify-between gap-2 min-h-[28px] mb-3">
                <h3 className="font-bold text-lg" style={{ color: 'var(--nav-text-primary)' }}>{t.proPlanName}</h3>
                {plan === 'pro'
                  ? <PlanBadge solid>{t.currentBadge}</PlanBadge>
                  : <PlanBadge>{t.maxBadge}</PlanBadge>}
              </div>
              <div className="text-3xl font-bold tabular-nums whitespace-nowrap mb-5" style={{ color: 'var(--nav-text-primary)' }}>
                {PLAN_PRICES.pro[period].toLocaleString('ru-KZ')} ₸<span className="text-sm font-normal" style={{ color: 'var(--nav-text-muted)' }}>{priceSuffix}</span>
              </div>
              <FeatureList items={t.proFeatures} />
              <div className="mt-6">
                {plan !== 'pro' && <ConnectButton planName={t.proPlanName} amount={PLAN_PRICES.pro[period]} planKey="pro" primary />}
                {plan === 'pro' && (
                  <div>
                    <div className="text-center text-sm py-1 mb-1" style={{ color: 'var(--nav-success)' }}>{t.activeLabel}</div>
                    <RenewButton planName={t.proPlanName} amount={PLAN_PRICES.pro[period]} planKey="pro" id="renew-pro" />
                  </div>
                )}
              </div>
            </PlanCard>
          </div>

          <p className="text-center text-xs" style={{ color: 'var(--nav-text-muted)' }}>
            {plan !== 'free' ? (
              <>
                {t.questionsText}{' '}
                <a href="https://t.me/invoiceskz_support" target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: 'var(--nav-accent)' }}>
                  {t.telegramLinkLabel}
                </a>
              </>
            ) : (
              <>
                {s.upgradeFooterEmailPrefix}
                <a href="mailto:support@invoices.kz" className="underline font-medium" style={{ color: 'var(--nav-accent)' }}>
                  support@invoices.kz
                </a>
              </>
            )}
          </p>
        </PageContainer>

        {/* Modal QR */}
        {showModal && (
          <Sheet zClass="z-[70]" labelledBy={!submitting && step === 'pending' ? 'upgrade-pay-title' : undefined}>

            {submitting && (
              <div className="text-center py-8" role="status">
                <div className="flex justify-center mb-4"><Spinner /></div>
                <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{selectedPlan?.useWallet && !extTranId && walletPaid >= (selectedPlan?.amount ?? 0) ? tw.walletPayingLabel : t.creatingPaymentLabel}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.pleaseWaitLabel}</div>
              </div>
            )}

            {!submitting && step === 'pending' && (
              <>
                <div className="flex items-center justify-between gap-3 mb-4 -mt-2">
                  <div id="upgrade-pay-title" className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.paymentForLabel(selectedPlan?.name || '')}</div>
                  <SheetCloseButton onClick={closeQrModal} label={closeLabel(lang)} />
                </div>

                {phoneDeclined ? (
                  <div className="text-center py-6">
                    <StatusTile bg="var(--nav-surface-glass)" color="var(--nav-critical)"><XIcon /></StatusTile>
                    <div className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{t.phoneRequestDeclinedNote}</div>
                    <button type="button" onClick={() => selectedPlan && openModal(selectedPlan.name, selectedPlan.amount, selectedPlan.plan, selectedPlan.period)}
                      className={`w-full min-h-[48px] rounded-xl py-3.5 text-sm font-semibold ${PRESS}`}
                      style={BTN_PRIMARY}>
                      {t.retryPaymentButton}
                    </button>
                  </div>
                ) : phoneRequested ? (
                  <div className="text-center py-6">
                    <StatusTile bg="var(--nav-accent-soft)" color="var(--nav-accent)"><PhoneIcon /></StatusTile>
                    <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.phoneRequestPendingNote}</div>
                  </div>
                ) : isMobile ? (
                  <div className="text-center py-4">
                    <StatusTile bg="var(--nav-accent-soft)" color="var(--nav-accent)"><PhoneIcon /></StatusTile>
                    <div className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.redirectingKaspiLabel}</div>
                    <div className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.appNotOpenedHint}
                    </div>
                    <a href={qrToken} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center w-full min-h-[48px] rounded-xl py-3.5 text-sm font-semibold mb-3"
                      style={BTN_PRIMARY}>
                      {t.openKaspiButton}
                    </a>
                    {/* Пуш по телефону выпускает отдельный платёж на полную цену —
                        при частичной оплате кошельком его не предлагаем. */}
                    {!walletInUse && (
                      <div className="flex flex-col gap-3">
                        <OrDivider label={t.orLabel} />
                        <button type="button" onClick={() => setShowPhoneModal(true)}
                          className="w-full min-h-[48px] rounded-xl py-3 text-sm font-semibold"
                          style={BTN_OUTLINE}>
                          {t.sendPhoneRequestButton}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.scanQrTitle}</div>
                    <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.otherMethodHint}</div>
                    {/* Fixed 200x200 slot (no jump when the code arrives or is
                        re-minted); white plate so the code scans in dark mode. */}
                    <div className="flex justify-center mb-2">
                      <div className="w-[218px] h-[218px] rounded-xl p-2 flex items-center justify-center"
                        style={{ background: '#FFFFFF', border: '1px solid var(--nav-border-soft)' }}>
                        {qrDataUrl
                          ? <img src={qrDataUrl} alt={t.qrCodeAltText} width={200} height={200} className="block" />
                          : <Spinner size="sm" />}
                      </div>
                    </div>
                    <div className="text-xs mb-4 h-4" aria-live="polite">
                      {qrScanning ? (
                        <span style={{ color: 'var(--nav-success)' }}>{t.qrConfirmInApp}</span>
                      ) : refreshingQr ? (
                        <span style={{ color: 'var(--nav-text-muted)' }}>{t.qrRefreshing}</span>
                      ) : secondsLeft > 0 ? (
                        <span className="tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>
                          {t.qrValidFor(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-3">
                      <a href={qrToken} target="_blank" rel="noopener noreferrer"
                        className="text-xs underline" style={{ color: 'var(--nav-text-muted)' }}>
                        {t.openLinkDirectlyLabel}
                      </a>
                      {!walletInUse && (
                        <>
                          <OrDivider label={t.orLabel} />
                          <button type="button" onClick={() => setShowPhoneModal(true)}
                            className="w-full min-h-[48px] rounded-xl py-3 text-sm font-semibold"
                            style={BTN_OUTLINE}>
                            {t.sendPhoneRequestButton}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {walletInUse && (
                  <div className="rounded-xl px-4 py-3 mt-4 flex items-center justify-between" style={ROW_STYLE}>
                    <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{tw.fromWalletLabel}</span>
                    <span className="text-sm tabular-nums" style={{ fontWeight: 600, color: 'var(--nav-success)' }}>−{walletPaid.toLocaleString('ru-KZ')} ₸</span>
                  </div>
                )}
                <div className={`rounded-xl px-4 py-3 ${walletInUse ? 'mt-2' : 'mt-4'} mb-3 flex items-center justify-between`} style={ROW_STYLE}>
                  <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{walletInUse ? tw.viaKaspiLabel : t.toPayLabel}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(walletInUse ? kaspiToPay : selectedPlan?.amount ?? 0).toLocaleString('ru-KZ')} ₸{walletInUse ? '' : suffixFor(selectedPlan?.period)}</span>
                </div>
                {walletInUse && (
                  <p className="text-xs text-center -mt-1 mb-3" style={{ color: 'var(--nav-text-muted)' }}>{tw.walletHoldNote(walletPaid.toLocaleString('ru-KZ'))}</p>
                )}

                <div className="flex items-center justify-center gap-2 text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                  <Spinner size="sm" />
                  {checkingStatus ? t.checkingPaymentLabel : t.awaitingConfirmationLabel}
                </div>

                <button type="button" onClick={() => checkPaymentStatus(selectedPlan?.plan || '')}
                  className="w-full min-h-[48px] rounded-xl py-3 text-sm font-medium transition-colors"
                  style={BTN_GHOST}>
                  {t.checkManuallyButton}
                </button>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-6" role="status">
                <StatusTile bg="var(--nav-success-soft)" color="var(--nav-success)"><CheckIcon /></StatusTile>
                <div className="font-bold text-xl mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.paymentSuccessTitle}</div>
                <div className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.planActivatedPrefixLabel}<strong style={{ color: 'var(--nav-text-primary)' }}>{selectedPlan?.name}</strong>{t.planActivatedSuffixLabel}
                </div>
                <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--nav-success-soft)' }}>
                  <div className="text-sm" style={{ fontWeight: 500, color: 'var(--nav-success)' }}>{t.subscriptionActiveLabel(selectedPlan?.period ?? 'monthly')}</div>
                </div>
                <button type="button" onClick={() => {
                  setShowModal(false)
                  router.push('/dashboard')
                }}
                  className={`w-full min-h-[48px] rounded-xl py-4 text-sm font-semibold ${PRESS}`}
                  style={BTN_PRIMARY}>
                  {t.goToWorkButton}
                </button>
              </div>
            )}

          </Sheet>
        )}

        {/* Выбор: целиком с кошелька / частью / только Kaspi */}
        {walletChoice && (
          <Sheet zClass="z-[70]" labelledBy="wallet-choice-title" onBackdrop={() => setWalletChoice(null)}>
            <div className="flex items-center justify-between gap-3 mb-1 -mt-2">
              <div id="wallet-choice-title" className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{tw.walletChoiceTitle}</div>
              <SheetCloseButton onClick={() => setWalletChoice(null)} label={closeLabel(lang)} />
            </div>
            <div className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.paymentForLabel(walletChoice.name)} · <span className="tabular-nums">{walletChoice.amount.toLocaleString('ru-KZ')} ₸{suffixFor(walletChoice.period)}</span>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{tw.walletBalanceLine(walletBalance.toLocaleString('ru-KZ'))}</div>
            </div>
            <div className="flex flex-col gap-2">
              {walletChoice.split.mode === 'wallet_full' ? (
                <button type="button" onClick={() => payFullyFromWallet(walletChoice)}
                  className={`w-full min-h-[48px] rounded-xl text-sm font-semibold px-4 py-3 ${PRESS}`}
                  style={BTN_PRIMARY}>
                  {tw.payFullyFromWalletButton(walletChoice.split.wallet.toLocaleString('ru-KZ'))}
                </button>
              ) : (
                <button type="button" onClick={() => {
                    const c = walletChoice
                    setWalletChoice(null)
                    openModal(c.name, c.amount, c.plan, c.period, true)
                  }}
                  className={`w-full min-h-[48px] rounded-xl text-sm font-semibold px-4 py-3 leading-snug ${PRESS}`}
                  style={BTN_PRIMARY}>
                  {tw.payPartlyFromWalletButton(walletChoice.split.wallet.toLocaleString('ru-KZ'), walletChoice.split.kaspi.toLocaleString('ru-KZ'))}
                </button>
              )}
              <button type="button" onClick={() => {
                  const c = walletChoice
                  setWalletChoice(null)
                  openModal(c.name, c.amount, c.plan, c.period)
                }}
                className="w-full min-h-[48px] rounded-xl text-sm font-semibold px-4 py-3"
                style={BTN_OUTLINE}>
                {tw.payOnlyKaspiButton}
              </button>
            </div>
          </Sheet>
        )}

        {/* Модал ввода телефона (поверх окна оплаты) */}
        {showPhoneModal && (
          <Sheet zClass="z-[80]" labelledBy="phone-pay-title">
            <div className="flex items-center justify-between gap-3 mb-4 -mt-2">
              <div id="phone-pay-title" className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.phonePaymentTitle}</div>
              <SheetCloseButton onClick={() => setShowPhoneModal(false)} label={closeLabel(lang)} />
            </div>

            <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--nav-accent-soft)' }}>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.phoneInstructionText}
              </div>
            </div>

            <label htmlFor="upgrade-pay-phone" className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.phoneNumberLabel}</label>
            <input
              id="upgrade-pay-phone"
              className={`${inputClass} py-3 mb-3`}
              style={INPUT_STYLE}
              placeholder="+7 777 123 45 67"
              value={payPhone}
              onChange={e => setPayPhone(formatPhone(e.target.value))}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
            />

            <div className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between" style={ROW_STYLE}>
              <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.toPayLabel}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸{suffixFor(selectedPlan?.period)}</span>
            </div>

            <button type="button" onClick={createPhonePayment} disabled={phoneSubmitting}
              className={`w-full min-h-[48px] rounded-xl py-3.5 text-sm font-semibold mb-2 disabled:opacity-60 ${PRESS}`}
              style={BTN_PRIMARY}>
              {t.sendKaspiRequestButton(phoneSubmitting)}
            </button>
            <button type="button" onClick={() => setShowPhoneModal(false)}
              className="w-full min-h-[44px] text-sm py-2 rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ color: 'var(--nav-text-muted)' }}>
              {t.cancelButton}
            </button>
          </Sheet>
        )}
        {dialogElement}

      </>
  )
}