'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'

export default function Onboarding() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = authDict[lang]
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState('')
  const [refCode, setRefCode] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [accountType, setAccountType] = useState<'ИП' | 'ТОО' | 'Физлицо'>('ИП')
  const [form, setForm] = useState({ company_name: '', bin_iin: '', email: '' })
  const [bank, setBank] = useState({ bank_name: '', iik: '', bik: '', kbe: '19' })
  const [returningUser, setReturningUser] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refFromUrl = params.get('ref')
    if (refFromUrl) localStorage.setItem('referral_code', refFromUrl)
    const ref = refFromUrl || localStorage.getItem('referral_code') || ''
    setRefCode(ref)

    const promoFromUrl = params.get('promo')
    if (promoFromUrl) localStorage.setItem('promo_code', promoFromUrl)
    const promoFromStorage = localStorage.getItem('promo_code')
    const promo = promoFromUrl || promoFromStorage || ''
    setPromoCode(promo)

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/account/check-returning', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json().catch(() => null)
        if (data?.returning) setReturningUser(true)
      } catch {}
    })

  }, [])

  async function saveStep1() {
    if (!form.company_name) { alert(t.companyNameRequiredError); return }
    if (!form.bin_iin) { alert(t.binRequiredError); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    // Non-privileged fields only -- trial_expires_at/bonus_expires_at are
    // guarded by the protect_profile_privileged_columns DB trigger and must
    // be granted server-side via /api/onboarding/grant below, which relies
    // on this upsert having already created the profile row.
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      company_name: form.company_name,
      bin_iin: form.bin_iin,
      email: form.email || user.email,
      account_type: accountType,
    })
    if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      // Without a real access token, /api/onboarding/grant below would be
      // called with a literal "Bearer undefined" header, get a 401, and
      // (previously) fail silently -- costing the user their 7-day trial
      // with no visible error and no chance to retry.
      alert(t.errorPrefix('Missing session, please try again'))
      setSaving(false)
      return
    }

    if (refCode) {
      try {
        await fetch('/api/referral', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: user.id, referralCode: refCode })
        })
      } catch {}
      localStorage.removeItem('referral_code')
    }

    // Grants the 7-day trial (and promo bonus, if any) -- must succeed
    // before advancing to step 2. The previous fire-and-forget try/catch
    // swallowed every failure (network error, 401, 500) and always advanced
    // the step regardless, so a user could lose the trial silently.
    const requestGrant = () => fetch('/api/onboarding/grant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ promoCode: promoCode || undefined })
    })

    let grantRes: Response
    try {
      grantRes = await requestGrant()
    } catch {
      // Transient network hiccup -- retry once before giving up.
      try {
        grantRes = await requestGrant()
      } catch (e: any) {
        alert(t.errorPrefix(e?.message || 'Network error'))
        setSaving(false)
        return
      }
    }

    if (!grantRes.ok) {
      const data = await grantRes.json().catch(() => ({}) as any)
      alert(t.errorPrefix(data.error || `HTTP ${grantRes.status}`))
      setSaving(false)
      return
    }
    if (promoCode) localStorage.removeItem('promo_code')

    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: `🆕 <b>Новый пользователь!</b>\n👤 ${form.company_name}\n🔢 БИН: ${form.bin_iin}\n📧 ${user?.email}${refCode ? '\n🎁 Реферал: ' + refCode : ''}`
        })
      })
    } catch {}
    setSaving(false)
    setStep(2)
  }

  async function saveStep2() {
    if (bank.iik && bank.bank_name && bank.bik) {
      setSaving(true)
      await supabase.from('bank_accounts').insert({
        user_id: userId,
        bank_name: bank.bank_name,
        iik: bank.iik,
        bik: bank.bik,
        kbe: bank.kbe,
        is_main: true,
      })
      setSaving(false)
    }
    setStep(3)
  }

  async function finish() {
    router.push('/dashboard')
  }

  const steps = [
    { n: 1, label: t.stepCompanyLabel },
    { n: 2, label: t.stepBankLabel },
    { n: 3, label: t.stepSignatureLabel },
  ]

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-[#1C2056] mb-1">INVOICES.KZ</div>
          <p className="text-sm text-gray-400">{t.onboardingSubtitle}</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.n ? 'bg-[#2DC48D] text-white' :
                  step === s.n ? 'bg-[#1C2056] text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className={`text-xs ${step === s.n ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-px mb-4 ${step > s.n ? 'bg-[#2DC48D]' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">{t.step1Title}</h2>
            <p className="text-xs text-gray-400 mb-5">{t.step1Subtitle}</p>

            {returningUser && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 text-center">
                <span className="text-xs text-green-700">{t.returningUserBanner}</span>
              </div>
            )}

            {refCode && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 text-center">
                <span className="text-xs text-green-700">{t.referralBonusNotice}</span>
              </div>
            )}

            {promoCode && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-center">
                <span className="text-xs text-blue-700">{t.promoCodeNoticePrefix} <b>{promoCode}</b> {t.promoCodeNoticeSuffix}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-2 block">{t.accountTypeLabel}</label>
              <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-xl">
                {(['ИП', 'ТОО', 'Физлицо'] as const).map(type => (
                  <button key={type} onClick={() => setAccountType(type)}
                    className={`py-2 rounded-lg text-sm font-medium transition ${accountType === type ? 'bg-white text-[#1C2056] shadow-sm' : 'text-gray-400'}`}>
                    {t.accountTypeName(type)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {t.companyNameFieldLabel(accountType)}
                </label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={t.companyNamePlaceholder(accountType)}
                  value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.binIinLabel}</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={t.binIinPlaceholder} value={form.bin_iin}
                  onChange={e => setForm({ ...form, bin_iin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.notificationEmailLabel}</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={t.notificationEmailPlaceholder} value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            <button onClick={saveStep1} disabled={saving}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
              {saving ? t.savingButton : t.nextButton}
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">{t.step2Title}</h2>
            <p className="text-xs text-gray-400 mb-5">{t.step2Subtitle}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.bankNameLabel}</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={t.bankNamePlaceholder} value={bank.bank_name}
                  onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.iikLabel}</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={t.iikPlaceholder} value={bank.iik}
                  onChange={e => setBank({ ...bank, iik: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.bikLabel}</label>
                  <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                    placeholder={t.bikPlaceholder} value={bank.bik}
                    onChange={e => setBank({ ...bank, bik: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.kbeLabel}</label>
                  <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                    placeholder={t.kbePlaceholder} value={bank.kbe}
                    onChange={e => setBank({ ...bank, kbe: e.target.value })} />
                </div>
              </div>
            </div>

            <button onClick={saveStep2} disabled={saving}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mb-3">
              {saving ? t.savingButton : t.nextButton}
            </button>
            <button onClick={() => setStep(3)}
              className="w-full text-gray-400 text-sm py-2">
              {t.skipButton}
            </button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">{t.step3Title}</h2>
            <p className="text-xs text-gray-400 mb-5">{t.step3Subtitle}</p>

            <div className="bg-gray-50 rounded-2xl p-5 mb-6 space-y-3">
              {[
                { icon: '✍️', title: t.signatureItemTitle, desc: t.signatureItemDesc },
                { icon: '🔵', title: t.stampItemTitle, desc: t.stampItemDesc },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-[#1C2056]">{item.title}</div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#2DC48D]/10 rounded-xl p-4 mb-6 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <div className="text-sm font-medium text-[#1C2056]">{t.trialActivatedMessage}</div>
              <div className="text-xs text-gray-400 mt-1">{t.proFeaturesUnlockedMessage}</div>
            </div>

            <button onClick={() => router.push('/profile/signature')}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mb-3">
              {t.addSignatureButton}
            </button>
            <button onClick={finish}
              className="w-full text-gray-400 text-sm py-2">
              {t.skipToAppButton}
            </button>
          </div>
        )}

      </div>
    </main>
  )
}