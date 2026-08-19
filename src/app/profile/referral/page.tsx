'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// ---- icons (2px stroke, inline SVG -- no emoji) ----

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function GiftIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="4" />
      <path d="M12 9v12M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
      <path d="M12 9C10 5 6 5 6 7.5A2.5 2.5 0 0 0 8.5 9M12 9c2-4 6-4 6-1.5A2.5 2.5 0 0 1 15.5 9" />
    </svg>
  )
}
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}
function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.01 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.08-1.33A9.94 9.94 0 0 0 12.01 22C17.53 22 22 17.52 22 12S17.53 2 12.01 2Zm5.62 14.13c-.24.67-1.39 1.28-1.92 1.35-.49.07-1.11.1-1.79-.11-.41-.13-.94-.3-1.62-.6-2.84-1.23-4.7-4.1-4.84-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.41-.07.64.49.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.29-.13.57.17.28.75 1.23 1.61 1.99 1.11.98 2.04 1.29 2.32 1.43.28.14.44.12.61-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.64-.14.26.09 1.66.78 1.94.93.28.14.47.21.53.33.07.12.07.68-.17 1.35Z" />
    </svg>
  )
}

export default function Referral() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [profile, setProfile] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  async function copyLink() {
    const link = `https://invoices.kz/login?ref=${profile?.referral_code}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareWhatsApp() {
    const link = `https://invoices.kz/login?ref=${profile?.referral_code}`
    const text = t.whatsAppShareMessage(link)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  const steps = [
    { step: '1', text: t.referralStep1 },
    { step: '2', text: t.referralStep2 },
    { step: '3', text: t.referralStep3 },
    { step: '4', text: t.referralStep4 },
  ]

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.referralHeaderLabel}</span>
        </motion.div>

        <motion.div {...fadeIn(1)} className={`nav-glass nav-card-accent rounded-2xl p-6 text-center ${CARD_HOVER}`}>
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}>
            <GiftIcon />
          </div>
          <div className="text-xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.referralBannerTitle}</div>
          <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>
            {t.referralBannerDescBefore} <span className="font-bold" style={{ color: 'var(--nav-success)' }}>{t.referralBannerBonusBold}</span> {t.referralBannerDescAfter}
          </div>
        </motion.div>

        <motion.div {...fadeIn(2)} className="grid grid-cols-2 gap-3">
          <div className={`nav-glass rounded-2xl p-4 text-center ${CARD_HOVER}`}>
            <div className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{profile?.referral_count || 0}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.invitedFriendsLabel}</div>
          </div>
          <div className={`nav-glass rounded-2xl p-4 text-center ${CARD_HOVER}`}>
            <div className="text-2xl font-bold" style={{ color: 'var(--nav-success)' }}>
              {profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date()
                ? Math.ceil((new Date(profile.bonus_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : (profile?.referral_count || 0) * 7}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.bonusDaysLabel}</div>
          </div>
        </motion.div>

        <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl p-5">
          <div className="text-sm font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.yourReferralLinkLabel}</div>
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between mb-3" style={{ background: 'var(--nav-bg)' }}>
            <span className="text-xs truncate" style={{ color: 'var(--nav-text-secondary)' }}>
              invoices.kz/login?ref={profile?.referral_code}
            </span>
            <button onClick={copyLink}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ml-2 flex-shrink-0 transition-colors"
              style={{ background: copied ? 'var(--nav-success)' : 'var(--nav-accent)', color: copied ? '#fff' : 'var(--nav-accent-ink)' }}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? t.copiedLabel : t.copyLinkButton}
            </button>
          </div>
          <button onClick={shareWhatsApp}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
            style={{ background: '#25D366' }}>
            <WhatsAppIcon />
            {t.shareWhatsAppButton}
          </button>
        </motion.div>

        <motion.div {...fadeIn(4)} className="nav-glass rounded-2xl p-5">
          <div className="text-sm font-medium mb-4" style={{ color: 'var(--nav-text-primary)' }}>{t.howItWorksLabel}</div>
          <div className="space-y-3">
            {steps.map(item => (
              <div key={item.step} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {item.step}
                </div>
                <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </main>
    </DesktopShell>
  )
}
