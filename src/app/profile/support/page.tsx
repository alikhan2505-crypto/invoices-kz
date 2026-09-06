'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import { supportDict } from '@/lib/i18n/support'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

export default function Support() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const s = supportDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  // Telegram support is included from the Basic plan up (see src/lib/plan.ts);
  // free users (incl. before the profile loads) see an /upgrade notice instead.
  const [canTelegramSupport, setCanTelegramSupport] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
        .eq('id', user.id)
        .single()
      const { plan, isActive } = getActivePlan(profile)
      setCanTelegramSupport(isActive && plan !== 'free')
    })()
  }, [])

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.supportHeaderLabel}</span>
        </motion.div>

        <motion.p {...fadeIn(1)} className="text-sm px-1" style={{ color: 'var(--nav-text-muted)' }}>
          {t.supportHoursText}
        </motion.p>

        <motion.div {...fadeIn(2)} className={`nav-glass rounded-2xl overflow-hidden ${CARD_HOVER}`}>
          {canTelegramSupport ? (
            <a href="https://t.me/invoiceskz_support"
              target="_blank"
              className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--nav-teal-soft), transparent)', color: 'var(--nav-teal)' }}>
                  <SendIcon />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.telegramContactLabel}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-success)' }}>{t.telegramResponseTimeLabel}</div>
                </div>
              </div>
              <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
            </a>
          ) : (
            <div className="flex items-center px-4 py-4" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
                  <SendIcon />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.telegramContactLabel}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    {s.telegramGatedNotice}{' '}
                    <Link href="/upgrade" className="underline" style={{ color: 'var(--nav-accent)' }}>{s.upgradeLinkLabel}</Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          <a href="mailto:support@invoices.kz"
            className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-[var(--nav-surface-glass)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--nav-magenta-soft), transparent)', color: 'var(--nav-magenta)' }}>
                <MailIcon />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.emailContactLabel}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.emailResponseTimeLabel}</div>
              </div>
            </div>
            <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
          </a>
        </motion.div>

        {/* FAQ */}
        <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.faqHeaderLabel}</div>
          {t.faqItems.map((item, i, arr) => (
            <details key={i} className="group px-4" style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
              <summary className="py-3.5 text-sm font-medium cursor-pointer list-none flex items-center justify-between" style={{ color: 'var(--nav-text-primary)' }}>
                {item.q}
                <span className="transition-transform group-open:rotate-90" style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
              </summary>
              <p className="text-sm pb-3.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
            </details>
          ))}
        </motion.div>

      </div>
    </main>
    </DesktopShell>
  )
}
