'use client'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const BUILD_DATE = new Date().toLocaleDateString('ru-KZ', {
  day: 'numeric', month: 'long', year: 'numeric'
})

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
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9Z" />
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
function DocumentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  )
}

export default function About() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  const contactItems = [
    { icon: <GlobeIcon />, colorVar: '--nav-accent', label: t.websiteLabel, value: 'invoices.kz', action: () => window.open('https://invoices.kz', '_blank') },
    { icon: <SendIcon />, colorVar: '--nav-teal', label: t.supportLabel, value: 'Telegram', action: () => window.open('https://t.me/invoiceskz_support', '_blank') },
    { icon: <MailIcon />, colorVar: '--nav-magenta', label: t.emailLabel, value: 'support@invoices.kz', action: () => window.open('mailto:support@invoices.kz') },
  ]

  const docItems = [
    { label: t.privacyPolicyLabel, href: '/privacy' },
    { label: t.termsOfUseLabel, href: '/terms' },
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
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.aboutHeaderLabel}</span>
        </motion.div>

        <motion.div {...fadeIn(1)} className={`nav-glass nav-card-accent rounded-2xl p-8 text-center ${CARD_HOVER}`}>
          <div className="text-3xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>INVOICES.KZ</div>
          <div className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.appTaglineLabel}</div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.versionLabel}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: 'var(--nav-success)', color: '#fff' }}>
              {t.updatedLabel(BUILD_DATE)}
            </span>
          </div>
        </motion.div>

        <motion.div {...fadeIn(2)} className="nav-glass rounded-2xl overflow-hidden py-1">
          {contactItems.map((item, i, arr) => (
            <div key={item.label}
              onClick={item.action}
              className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 hover:translate-x-1 hover:bg-[var(--nav-surface-glass)]"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, var(${item.colorVar}-soft), transparent)`, color: `var(${item.colorVar})` }}>
                  {item.icon}
                </span>
                <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{item.label}</span>
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </motion.div>

        <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.documentsSectionLabel}</div>
          {docItems.map((item, i, arr) => (
            <div key={item.label}
              onClick={() => router.push(item.href)}
              className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 hover:translate-x-1 hover:bg-[var(--nav-surface-glass)]"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
              <span className="text-sm flex items-center gap-2" style={{ color: 'var(--nav-text-primary)' }}>
                <span style={{ color: 'var(--nav-text-muted)' }}><DocumentIcon /></span>
                {item.label}
              </span>
              <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
            </div>
          ))}
        </motion.div>

        <motion.div {...fadeIn(4)} className="text-center py-4">
          <div className="text-2xl mb-2">🇰🇿</div>
          <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.madeInKazakhstanLabel}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.copyrightLabel}</div>
        </motion.div>

      </div>
    </main>
    </DesktopShell>
  )
}
