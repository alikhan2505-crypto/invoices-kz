'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { profileContentDict } from '@/lib/i18n/profileContent'
import { supportDict } from '@/lib/i18n/support'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

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
function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9Z" />
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
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

// «Помощь и о сервисе» (15.10.2026): бывшие «Поддержка» и «О приложении»
// слиты в одну страницу. /profile/about теперь перенаправляет сюда, к якорю #about.
export default function Support() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const s = supportDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  // Telegram support is included from the Basic plan up (see src/lib/plan.ts);
  // free users see an /upgrade notice instead. null = the plan is not known
  // yet: the row shows a placeholder, not the notice, so a paying user never
  // sees "available on Basic and Pro" flash by.
  const [canTelegramSupport, setCanTelegramSupport] = useState<boolean | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCanTelegramSupport(false); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at, is_admin')
        .eq('id', user.id)
        .single()
      const { plan, isActive } = getActivePlan(profile)
      // Как на дашборде: админу Telegram-поддержка открыта всегда.
      setCanTelegramSupport(!!profile?.is_admin || (isActive && plan !== 'free'))
    })()
  }, [])

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  return (
    <>
      <PageContainer className="space-y-4">

        <PageHeader title={t.supportHeaderLabel} backHref="/profile" />

        {/* Две независимые колонки: слева часы, контакты, о сервисе и ссылки, справа
            FAQ. Последняя карточка каждой колонки тянется (flex-1), поэтому, когда
            раскрывается вопрос в FAQ, пустоты под левой колонкой не появляется.
            Ниже xl колонки «contents», и порядок блоков как прежде (часы, контакты,
            FAQ, о сервисе, ссылки): about и ссылки получают max-xl:order-1. */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <div className="contents xl:flex xl:flex-col xl:gap-4 xl:[&>:last-child]:flex-1">
        <motion.p {...fadeIn(1)} className="text-sm px-1" style={{ color: 'var(--nav-text-muted)' }}>
          {t.supportHoursText}
        </motion.p>

        <motion.div {...fadeIn(2)} className={`nav-glass rounded-2xl overflow-hidden ${CARD_HOVER}`}>
          {canTelegramSupport === null ? (
            <div className="flex items-center px-4 py-4" style={{ borderBottom: '1px solid var(--nav-border-soft)' }} aria-busy="true">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
                  <SendIcon />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.telegramContactLabel}</div>
                  <Skeleton className="h-3 w-40 mt-1.5" />
                </div>
              </div>
            </div>
          ) : canTelegramSupport ? (
            <a href="https://t.me/invoiceskz_support"
              target="_blank" rel="noopener noreferrer"
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

        {/* О сервисе — бывшая страница /profile/about */}
        <motion.div {...fadeIn(4)} id="about" className="max-xl:order-1 nav-glass nav-card-accent rounded-2xl p-6 text-center scroll-mt-24">
          <div className="text-2xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>INVOICES.KZ</div>
          <div className="text-sm mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.appTaglineLabel}</div>
          <span className="inline-block text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
            {t.versionLabel(process.env.NEXT_PUBLIC_BUILD_DATE || '')}
          </span>
        </motion.div>
        <motion.div {...fadeIn(5)} className="max-xl:order-1 nav-glass rounded-2xl overflow-hidden py-1 xl:flex xl:flex-col xl:justify-start">
          <a href="https://invoices.kz" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}>
                <GlobeIcon />
              </span>
              <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.websiteLabel}</span>
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>invoices.kz</span>
          </a>
          {[
            { label: t.privacyPolicyLabel, href: '/privacy' },
            { label: t.termsOfUseLabel, href: '/terms' },
            { label: t.dataDeletionLabel, href: '/data-deletion' },
          ].map((item, i, arr) => (
            <Link key={item.href} href={item.href}
              className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
              <span className="text-sm flex items-center gap-3" style={{ color: 'var(--nav-text-primary)' }}>
                <span className="w-8 flex justify-center" style={{ color: 'var(--nav-text-muted)' }}><DocumentIcon /></span>
                {item.label}
              </span>
              <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
            </Link>
          ))}
        </motion.div>
        </div>

        <div className="contents xl:flex xl:flex-col xl:gap-4 xl:[&>:last-child]:flex-1">
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
        </div>

        <motion.div {...fadeIn(6)} className="text-center py-4">
          <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.madeInKazakhstanLabel}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.copyrightLabel}</div>
        </motion.div>

      </PageContainer>
    </>
  )
}
