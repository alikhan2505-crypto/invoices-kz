'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import { getActivePlan } from '@/lib/plan'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function StarIcon({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-accent-ink)' }}>
      <path d="m12 2 2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17l-6.1 3.5 1.5-6.8-5.2-4.7 6.9-.7Z" />
    </svg>
  )
}
function DocumentIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function Templates() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: p }, { data: tData }] = await Promise.all([
      supabase.from('profiles').select('plan, plan_expires_at, trial_expires_at, bonus_expires_at').eq('id', user.id).single(),
      supabase.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setProfile(p)
    setTemplates(tData || [])
    setLoading(false)
  }

  async function deleteTemplate(id: string) {
    if (!confirm(t.deleteTemplateConfirm)) return
    await supabase.from('templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(tpl => tpl.id !== id))
  }

  // Was reading the raw profiles.plan column directly, so an EXPIRED pro
  // plan (plan_expires_at in the past, plan column left at 'pro' for
  // historical record -- see getActivePlan's own comment) still unlocked
  // this page's Pro-only template features (confirmed live 2026-08-21:
  // ИП ВЕКТОР's plan expired 2026-07-12 but templates stayed unlocked).
  // getActivePlan is the one source of truth for expiry everywhere else.
  const isPro = getActivePlan(profile).canTemplates

  const header = (
    <motion.div
      className="flex items-center gap-3 mb-5"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
    >
      <button
        onClick={() => router.push('/profile')}
        aria-label={backLabel(lang)}
        className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ color: 'var(--nav-text-muted)' }}
      >
        <ChevronLeftIcon />
      </button>
      <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.templatesHeaderLabel}</h2>
    </motion.div>
  )

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          {header}

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[0, 1].map(i => (
                <div key={i} className="nav-glass rounded-2xl p-4">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-full mb-3" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : !isPro ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
              className="nav-glass nav-card-accent rounded-2xl p-8 text-center"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--nav-accent)' }}>
                <StarIcon size={26} />
              </div>
              <div className="font-bold text-base mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.proOnlyTitle}</div>
              <div className="text-sm mb-5 max-w-xs mx-auto" style={{ color: 'var(--nav-text-muted)' }}>
                {t.proOnlyDesc}
              </div>
              <button onClick={() => router.push('/upgrade')}
                className="px-6 py-3 rounded-xl text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.upgradeToProButton}
              </button>
            </motion.div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <DocumentIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.noTemplatesLabel}</p>
              <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--nav-text-muted)' }}>
                {t.noTemplatesHint}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {templates.map((tpl, i) => (
                <motion.div
                  key={tpl.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.05, 0.3) }}
                  className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 cursor-pointer flex-1" onClick={() => router.push('/create?template=' + tpl.id)}>
                      <div className="font-semibold text-sm mb-1 truncate" style={{ color: 'var(--nav-text-primary)' }}>{tpl.name}</div>
                      {tpl.client_name && (
                        <div className="text-xs mb-1 truncate" style={{ color: 'var(--nav-text-muted)' }}>{t.templateClientLabel(tpl.client_name)}</div>
                      )}
                      {tpl.services && tpl.services.length > 0 && (
                        <div className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>
                          {tpl.services.map((s: any) => s.name).join(', ')}
                        </div>
                      )}
                      <div className="text-sm font-semibold mt-2" style={{ color: 'var(--nav-accent)' }}>
                        {Number(tpl.amount).toLocaleString('ru-KZ')} ₸
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      aria-label={deleteLabel(lang)}
                      className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
                      <XIcon />
                    </button>
                  </div>
                  <button
                    onClick={() => router.push('/create?template=' + tpl.id)}
                    className="w-full mt-3 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                    style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                    {t.useTemplateButton}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
