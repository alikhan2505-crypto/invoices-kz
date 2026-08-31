'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, closeLabel } from '@/lib/a11yLabels'
import { miscDict } from '@/lib/i18n/misc'
import { getActivePlan } from '@/lib/plan'
import { PLAN_PRICES, type BillingPeriod } from '@/lib/plans/pricing'
import { consumePendingUpgrade } from '@/lib/pendingUpgrade'

export default function Upgrade() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = miscDict[lang]
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState('')
  const [promoError, setPromoError] = useState('')
  const [plan, setPlan] = useState('free')
  const [userId, setUserId] = useState('')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; amount: number; plan: string; period: BillingPeriod } | null>(null)
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [submitting, setSubmitting] = useState(false)
  const [qrToken, setQrToken] = useState('')
  const [extTranId, setExtTranId] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [payPhone, setPayPhone] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  // True once a phone payment request has been sent for the CURRENT QR
  // modal session -- swaps the QR/"open Kaspi" UI for a short status note
  // while the same extTranId poll below keeps checking (create-phone reuses
  // it as the new payment_id, so the poll doesn't need to change).
  const [phoneRequested, setPhoneRequested] = useState(false)
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
  useEffect(() => {
    const pending = consumePendingUpgrade()
    if (!pending) return
    setPeriod(pending.period)
    requestAnimationFrame(() => {
      document.getElementById(`plan-${pending.plan}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  // Live-polls the in-house Kaspi rail's own settlement status by order_id,
  // in parallel with checkPaymentStatus's profile-based check above — this
  // one settles the payment_requests row itself (via /api/payment/status),
  // so it works even if the profile poll's timing window is missed.
  useEffect(() => {
    if (!extTranId) return
    let cancelled = false
    let polls = 0
    const interval = setInterval(async () => {
      polls++
      if (polls > 150 || cancelled) { clearInterval(interval); return }
      const { data: { session } } = await supabase.auth.getSession()
      try {
        const res = await fetch(`/api/payment/status?order_id=${extTranId}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (data.status === 'paid' && !cancelled) {
          clearInterval(interval)
          router.push('/profile?upgraded=1')
        }
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [extTranId])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setPlan(getActivePlan(p).plan)
  }

  async function reloadPlan() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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

  async function openModal(planName: string, amount: number, planKey: string, billingPeriod: BillingPeriod) {
    setSelectedPlan({ name: planName, amount, plan: planKey, period: billingPeriod })
    setQrToken('')
    setExtTranId('')
    setStep('pending')
    setPhoneRequested(false)
    setShowModal(true)
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = user
        ? await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single()
        : { data: null }
      baselineExpiresRef.current = p?.plan === planKey && p?.plan_expires_at ? new Date(p.plan_expires_at).getTime() : 0

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, plan: planKey, period: billingPeriod })
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        alert(data.error === 'already_pending' ? t.alreadyPendingAlert : t.errorPrefix(data.error || t.tryAgainDefault))
        setShowModal(false)
        setSubmitting(false)
        return
      }

      setQrToken(data.qr_token)
      setExtTranId(data.ext_tran_id)

      if (isMobile) {
        window.location.href = data.qr_token
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

  function ConnectButton({ planName, amount, planKey, dark }: {
    planName: string; amount: number; planKey: string; dark?: boolean
  }) {
    const suffix = period === 'annual' ? t.perYearSuffix : t.perMonthSuffix
    return (
      <button onClick={() => openModal(planName, amount, planKey, period)}
        className={`w-full rounded-xl py-3.5 font-medium text-sm ${dark
          ? 'bg-[#2DC48D] text-white'
          : 'border-2 border-[#1C2056] text-[#1C2056]'
        }`}>
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
  function RenewButton({ planName, amount, planKey, dark }: {
    planName: string; amount: number; planKey: string; dark?: boolean
  }) {
    return (
      <button onClick={() => openModal(planName, amount, planKey, period)}
        className={`w-full rounded-xl py-3 font-medium text-sm ${dark
          ? 'bg-white/10 text-white border border-white/20'
          : 'border-2 border-[#1C2056] text-[#1C2056]'
        }`}>
        {t.renewButtonLabel(period)}
      </button>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.pageTitle}</span>
      </div>

      <div className="max-w-lg mx-auto p-6 flex-1">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-2xl font-bold text-[#1C2056] mb-2">{t.heroTitle}</h1>
          <p className="text-gray-400 text-sm">{t.heroSubtitle}</p>
        </div>

        {/* Promo */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <div className="text-sm font-medium text-[#1C2056] mb-3">{t.promoSectionLabel}</div>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] uppercase"
              placeholder={t.promoPlaceholder}
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); setPromoSuccess('') }}
            />
            <button onClick={applyPromo} disabled={promoLoading}
              className="bg-[#1C2056] text-white px-4 py-2.5 rounded-lg text-sm font-medium">
              {promoLoading ? t.applyingButtonLabel : t.applyButtonLabel}
            </button>
          </div>
          {promoError && <p className="text-xs text-red-500 mt-2">{promoError}</p>}
          {promoSuccess && <p className="text-xs text-[#2DC48D] mt-2 font-medium">{promoSuccess}</p>}
        </div>

        {/* Billing period toggle */}
        <div className="bg-gray-100 rounded-2xl p-1 flex gap-1 mb-6">
          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            aria-pressed={period === 'monthly'}
            className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
              period === 'monthly' ? 'bg-white text-[#1C2056] shadow-sm' : 'text-gray-500'
            }`}
          >
            {t.monthlyToggleLabel}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('annual')}
            aria-pressed={period === 'annual'}
            className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              period === 'annual' ? 'bg-white text-[#1C2056] shadow-sm' : 'text-gray-500'
            }`}
          >
            {t.annualToggleLabel}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#2DC48D] text-white whitespace-nowrap">
              {t.annualBadgeLabel}
            </span>
          </button>
        </div>

        {/* Free */}
        <div className={`bg-white border-2 rounded-2xl p-6 mb-4 ${plan === 'free' ? 'border-[#1C2056]' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056] text-lg">{t.freePlanName}</div>
            {plan === 'free' && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{t.currentBadge}</span>}
          </div>
          <div className="text-3xl font-bold text-[#1C2056] mb-4">0 ₸</div>
          <ul className="space-y-2">
            {t.freeFeatures.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Basic */}
        <div id="plan-basic" className={`bg-white border-2 rounded-2xl p-6 mb-4 ${plan === 'basic' ? 'border-[#1C2056]' : 'border-[#1C2056]/20'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056] text-lg">{t.basicPlanName}</div>
            {plan === 'basic'
              ? <span className="text-xs bg-[#1C2056] text-white px-2 py-1 rounded-full">{t.currentBadge}</span>
              : <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{t.popularBadge}</span>}
          </div>
          <div className="text-3xl font-bold text-[#1C2056] mb-4">
            {PLAN_PRICES.basic[period].toLocaleString('ru-KZ')} ₸<span className="text-sm font-normal text-gray-400">{period === 'annual' ? t.perYearSuffix : t.perMonthSuffix}</span>
          </div>
          <ul className="space-y-2 mb-5">
            {t.basicFeatures.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'basic' && plan !== 'pro' && <ConnectButton planName={t.basicPlanName} amount={PLAN_PRICES.basic[period]} planKey="basic" />}
          {plan === 'basic' && (
            <div>
              <div className="text-center text-sm text-gray-400 py-1">{t.activeLabel}</div>
              <RenewButton planName={t.basicPlanName} amount={PLAN_PRICES.basic[period]} planKey="basic" />
            </div>
          )}
          {plan === 'pro' && <div className="text-center text-sm text-gray-400 py-2">{t.higherPlanNotice}</div>}
        </div>

        {/* Pro */}
        <div id="plan-pro" className={`rounded-2xl p-6 mb-6 bg-[#1C2056] ${plan === 'pro' ? 'ring-2 ring-[#2DC48D]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-white text-lg">{t.proPlanName}</div>
            {plan === 'pro'
              ? <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">{t.currentBadge}</span>
              : <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">{t.maxBadge}</span>}
          </div>
          <div className="text-3xl font-bold text-white mb-4">
            {PLAN_PRICES.pro[period].toLocaleString('ru-KZ')} ₸<span className="text-sm font-normal text-white/60">{period === 'annual' ? t.perYearSuffix : t.perMonthSuffix}</span>
          </div>
          <ul className="space-y-2 mb-5">
            {t.proFeatures.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'pro' && <ConnectButton planName={t.proPlanName} amount={PLAN_PRICES.pro[period]} planKey="pro" dark />}
          {plan === 'pro' && (
            <div>
              <div className="text-center text-sm text-white/60 py-1">{t.activeLabel}</div>
              <RenewButton planName={t.proPlanName} amount={PLAN_PRICES.pro[period]} planKey="pro" dark />
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          {t.questionsText}{' '}
          <a href="https://t.me/invoiceskz_support" target="_blank" className="text-[#1C2056] underline">
            {t.telegramLinkLabel}
          </a>
        </p>
      </div>

      {/* Modal QR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">

            {submitting && (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="font-semibold text-[#1C2056] mb-1">{t.creatingPaymentLabel}</div>
                <div className="text-xs text-gray-400">{t.pleaseWaitLabel}</div>
              </div>
            )}

            {!submitting && step === 'pending' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="font-semibold text-[#1C2056]">{t.paymentForLabel(selectedPlan?.name || '')}</div>
                  <button onClick={() => {
                    clearInterval(statusInterval.current)
                    setShowModal(false)
                  }} className="back-btn text-gray-400 text-xl" aria-label={closeLabel(lang)}>✕</button>
                </div>

                {phoneRequested ? (
                  <div className="text-center py-6">
                    <div className="text-4xl mb-3">📲</div>
                    <div className="text-sm text-gray-500">{t.phoneRequestPendingNote}</div>
                  </div>
                ) : isMobile ? (
                  <div className="text-center py-4">
                    <div className="text-5xl mb-4">📱</div>
                    <div className="font-semibold text-[#1C2056] mb-2">{t.redirectingKaspiLabel}</div>
                    <div className="text-sm text-gray-400 mb-4">
                      {t.appNotOpenedHint}
                    </div>
                    <a href={qrToken} target="_blank"
                      className="block w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-3">
                      {t.openKaspiButton}
                    </a>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-px bg-gray-100"></div>
                      <span className="text-xs text-gray-400">{t.orLabel}</span>
                      <div className="flex-1 h-px bg-gray-100"></div>
                    </div>
                    <button onClick={() => setShowPhoneModal(true)}
                      className="w-full border border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                      {t.sendPhoneRequestButton}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="font-semibold text-[#1C2056] mb-1">{t.scanQrTitle}</div>
                    <div className="text-xs text-gray-400 mb-4">{t.otherMethodHint}</div>
                    {qrToken && (
                      <div className="flex justify-center mb-4">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrToken)}`}
                          alt={t.qrCodeAltText}
                          className="rounded-xl border border-gray-100"
                          width={200}
                          height={200}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <a href={qrToken} target="_blank"
                        className="text-xs text-gray-400 underline">
                        {t.openLinkDirectlyLabel}
                      </a>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-gray-100"></div>
                        <span className="text-xs text-gray-400">{t.orLabel}</span>
                        <div className="flex-1 h-px bg-gray-100"></div>
                      </div>
                      <button onClick={() => setShowPhoneModal(true)}
                        className="w-full border border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                        {t.sendPhoneRequestButton}
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl px-4 py-3 mt-4 mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t.toPayLabel}</span>
                  <span className="text-sm font-bold text-[#1C2056]">{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸{selectedPlan?.period === 'annual' ? t.perYearSuffix : t.perMonthSuffix}</span>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-3">
                  <div className="w-3 h-3 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin"></div>
                  {checkingStatus ? t.checkingPaymentLabel : t.awaitingConfirmationLabel}
                </div>

                <button onClick={() => checkPaymentStatus(selectedPlan?.plan || '')}
                  className="w-full border border-gray-200 text-gray-500 rounded-xl py-3 text-sm">
                  {t.checkManuallyButton}
                </button>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-6">
                <div className="text-5xl mb-4">🎉</div>
                <div className="font-bold text-[#1C2056] text-xl mb-2">{t.paymentSuccessTitle}</div>
                <div className="text-sm text-gray-400 mb-6">
                  {t.planActivatedPrefixLabel}<strong>{selectedPlan?.name}</strong>{t.planActivatedSuffixLabel}
                </div>
                <div className="bg-green-50 rounded-2xl p-4 mb-6">
                  <div className="text-sm text-green-700">{t.subscriptionActiveLabel(selectedPlan?.period ?? 'monthly')}</div>
                </div>
                <button onClick={() => {
                  setShowModal(false)
                  router.push('/dashboard')
                }}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
                  {t.goToWorkButton}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Модал ввода телефона */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-[#1C2056]">{t.phonePaymentTitle}</div>
              <button onClick={() => setShowPhoneModal(false)} className="back-btn text-gray-400 text-xl" aria-label={closeLabel(lang)}>✕</button>
            </div>

            <div className="bg-blue-50 rounded-2xl p-4 mb-5">
              <div className="text-xs text-gray-500 leading-relaxed">
                {t.phoneInstructionText}
              </div>
            </div>

            <label className="text-xs text-gray-500 mb-1 block">{t.phoneNumberLabel}</label>
            <input
              className="w-full border rounded-lg px-3 py-3 text-sm outline-none focus:border-[#1C2056] mb-3"
              placeholder="+7 777 123 45 67"
              value={payPhone}
              onChange={e => setPayPhone(formatPhone(e.target.value))}
              type="tel"
              maxLength={16}
            />

            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">{t.toPayLabel}</span>
              <span className="text-sm font-bold text-[#1C2056]">{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸{selectedPlan?.period === 'annual' ? t.perYearSuffix : t.perMonthSuffix}</span>
            </div>

            <button onClick={createPhonePayment} disabled={phoneSubmitting}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-2">
              {t.sendKaspiRequestButton(phoneSubmitting)}
            </button>
            <button onClick={() => setShowPhoneModal(false)}
              className="w-full text-gray-400 text-sm py-2">
              {t.cancelButton}
            </button>
          </div>
        </div>
      )}

    </main>
  )
}