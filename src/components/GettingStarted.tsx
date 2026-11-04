'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import ToolRequisitesOffer from '@/components/ToolRequisitesOffer'
import QuickRequisitesSetup from '@/components/QuickRequisitesSetup'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import { closeLabel } from '@/lib/a11yLabels'

// Быстрая настройка на дашборде (04.11.2026). Новый аккаунт после регистрации попадает именно сюда, а карточка с
// переносом реквизитов, мастер «компания → банк» и памятка «Начало работы» жили только в /create: человек их не
// видел, пока сам не нажимал «Создать счёт» (замечание основателя: «а где мастер адаптации?»).
// Те же компоненты и те же условия, что в /create: карточка переноса и мастер сами решают, показываться ли;
// памятка остаётся, пока не сделаны реквизиты, банк, подпись и первый счёт, и закрывается крестиком насовсем
// (тот же ключ onboarding_dismissed_<id>, что и в /create).

type SetupProfile = {
  company_name: string | null; bin_iin: string | null; address: string | null; email: string | null
  phone: string | null; director_name: string | null; accountant_name: string | null; signature_url: string | null
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export default function GettingStarted({ invoiceCount }: { invoiceCount: number }) {
  const { lang } = useLanguage()
  const router = useRouter()
  const t = invoiceFlowDict[lang]
  const [profile, setProfile] = useState<SetupProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [bankCount, setBankCount] = useState(0)
  const [banksLoaded, setBanksLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    try { setDismissed(localStorage.getItem('onboarding_dismissed_' + user.id) === '1') } catch { setDismissed(false) }
    const [{ data: p }, { count }] = await Promise.all([
      supabase.from('profiles').select('company_name, bin_iin, address, email, phone, director_name, accountant_name, signature_url').eq('id', user.id).single(),
      supabase.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setProfile((p as SetupProfile | null) ?? null)
    setProfileLoaded(true)
    // Неудачный подсчёт не равен «банков нет»: тогда карточки ниже просто не покажутся.
    if (count !== null) { setBankCount(count); setBanksLoaded(true) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  function dismiss() {
    setDismissed(true)
    if (userId) { try { localStorage.setItem('onboarding_dismissed_' + userId, '1') } catch {} }
  }

  const items = [
    { step: 1, title: t.onboardingStep1Title, desc: t.onboardingStep1Desc, done: !!(profile?.company_name && profile?.bin_iin), action: null as null | (() => void), btn: '' },
    { step: 2, title: t.onboardingStep2Title, desc: t.onboardingStep2Desc, done: bankCount > 0, action: null as null | (() => void), btn: '' },
    { step: 3, title: t.onboardingStep3Title, desc: t.onboardingStep3Desc, done: !!profile?.signature_url, action: () => router.push('/profile/signature'), btn: t.onboardingStep3Btn },
    { step: 4, title: t.onboardingStep4Title, desc: t.onboardingStep4Desc, done: invoiceCount > 0, action: null as null | (() => void), btn: '' },
  ]
  const setupIncomplete = profileLoaded && banksLoaded && items.slice(0, 3).some(i => !i.done)
  const showChecklist = setupIncomplete && invoiceCount === 0 && !dismissed

  return (
    <>
      <ToolRequisitesOffer profile={profile} profileLoaded={profileLoaded} bankCount={bankCount} banksLoaded={banksLoaded} onSaved={() => { void load() }} />
      <QuickRequisitesSetup profile={profile} profileLoaded={profileLoaded} bankCount={bankCount} banksLoaded={banksLoaded} onSaved={() => { void load() }} />

      {showChecklist && (
        <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.onboardingTitle}</div>
            <button onClick={dismiss} className="transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
          </div>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.step} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: item.done ? 'var(--nav-success-soft)' : 'var(--nav-surface-glass)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={item.done ? { background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' } : { background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
                  {item.done ? '✓' : item.step}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: item.done ? 'var(--nav-success)' : 'var(--nav-text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{item.desc}</div>
                </div>
                {!item.done && item.action && item.btn && (
                  <button onClick={item.action} className="text-xs font-semibold px-3 min-h-[44px] rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{item.btn}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
