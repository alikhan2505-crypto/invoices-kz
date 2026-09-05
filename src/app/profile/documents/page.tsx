'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { formatDate } from '@/lib/date'
import { getActivePlan } from '@/lib/plan'
import { generateNakladnaya } from '@/lib/generateNakladnaya'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

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
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function LockIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-text-muted)' }}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
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

export default function Documents() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'kp' | 'avr' | 'nakladnaya'>('kp')
  const [kpList, setKpList] = useState<any[]>([])
  const [avrList, setAvrList] = useState<any[]>([])
  const [naklList, setNaklList] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    const ap = getActivePlan(p)
    if (!ap.canKpAvrNakl) {
      setLoading(false)
      return
    }

    const [{ data: kp }, { data: avr }, { data: nakl }] = await Promise.all([
      supabase.from('kp_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('avr_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('nakladnaya_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    setKpList(kp || [])
    setAvrList(avr || [])
    setNaklList(nakl || [])
    setLoading(false)
  }

  async function deleteDoc(id: string, table: string) {
    if (!confirm(t.deleteDocumentConfirm)) return
    setBusyDocId(id)
    await supabase.from(table).delete().eq('id', id)
    await load()
    setBusyDocId(null)
  }

  async function openNakl(doc: any) {
    const win = window.open('', '_blank')
    setBusyDocId(doc.id)
    await generateNakladnaya({
      number: doc.number,
      date: doc.date,
      clientName: doc.client_name,
      clientBin: doc.client_bin,
      services: doc.services,
      total: doc.total,
      vatType: doc.vat_type,
      profile: profile,
    }, win)
    setBusyDocId(null)
  }

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
        className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ color: 'var(--nav-text-muted)' }}
      >
        <ChevronLeftIcon />
      </button>
      <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.documentsHeaderLabel}</h2>
    </motion.div>
  )

  if (loading) return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          {header}
          <div className="nav-glass rounded-2xl overflow-hidden">
            {[0, 1, 2].map(i => (
              <div key={i} className="px-4 py-3.5" style={{ borderBottom: i < 2 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                <Skeleton className="h-4 w-40 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </DesktopShell>
  )

  const ap = getActivePlan(profile)

  if (!ap.canKpAvrNakl) {
    return (
      <DesktopShell>
        <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
          <SiteNav />
          <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
            {header}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
              className="nav-glass nav-card-accent rounded-2xl p-8 text-center"
            >
              <div className="flex justify-center mb-4"><LockIcon /></div>
              <div className="font-bold text-base mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.documentsLockedTitle}</div>
              <div className="text-sm mb-6 max-w-xs mx-auto" style={{ color: 'var(--nav-text-muted)' }}>
                {t.documentsLockedDesc}
              </div>
              <button onClick={() => router.push('/upgrade')}
                className="px-6 py-3 rounded-xl text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.goToPlansButton}
              </button>
            </motion.div>
          </div>
        </main>
      </DesktopShell>
    )
  }

  const tabs = [
    { key: 'kp', label: t.kpTabLabel, count: kpList.length },
    { key: 'avr', label: t.avrTabLabel, count: avrList.length },
    { key: 'nakladnaya', label: t.nakladnayaTabLabel, count: naklList.length },
  ]

  const currentList = tab === 'kp' ? kpList : tab === 'avr' ? avrList : naklList

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          {header}

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
            className="rounded-2xl p-4 mb-4 flex gap-3"
            style={{ background: 'var(--nav-accent-soft)' }}
          >
            <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--nav-accent)' }}><InfoIcon /></span>
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.documentsInfoBannerTitle}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                {t.documentsInfoBannerBody}
              </div>
            </div>
          </motion.div>

          <motion.div
            className="flex gap-2 mb-4"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.08 }}
          >
            {tabs.map(tabItem => (
              <button key={tabItem.key} onClick={() => setTab(tabItem.key as any)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                style={{
                  background: tab === tabItem.key ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
                  color: tab === tabItem.key ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)',
                }}>
                {tabItem.label}
                {tabItem.count > 0 && (
                  <span className="ml-1" style={{ opacity: tab === tabItem.key ? 0.75 : 1 }}>
                    ({tabItem.count})
                  </span>
                )}
              </button>
            ))}
          </motion.div>

          {currentList.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <DocumentIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.noDocumentsLabel}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                {t.createDocsHint(tab)}
              </p>
            </div>
          ) : (
            <div className="nav-glass rounded-2xl overflow-hidden">
              {currentList.map((doc, i) => (
                <motion.div key={doc.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.3), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                  className="px-4 py-3.5"
                  style={{ borderBottom: i < currentList.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.docNumberLabel(doc.number)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
                          {formatDate(doc.created_at)}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--nav-text-secondary)' }}>{doc.client_name}</div>
                      {doc.contract_number && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.docContractNumberLabel(doc.contract_number)}</div>
                      )}
                      {doc.valid_until && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.docValidUntilLabel(doc.valid_until)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm font-bold mr-1 tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                        {Number(doc.total).toLocaleString('ru-KZ')} ₸
                      </span>
                      {tab === 'nakladnaya' && (
                        <button
                          onClick={() => openNakl(doc)}
                          disabled={busyDocId === doc.id}
                          aria-label={t.openNakladnayaAriaLabel}
                          title={t.openTitleLabel}
                          className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-40"
                          style={{ color: 'var(--nav-accent)' }}>
                          <EyeIcon />
                        </button>
                      )}
                      <button
                        onClick={() => deleteDoc(doc.id, tab === 'kp' ? 'kp_documents' : tab === 'avr' ? 'avr_documents' : 'nakladnaya_documents')}
                        disabled={busyDocId === doc.id}
                        aria-label={deleteLabel(lang)}
                        title={t.deleteTitleLabel}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)] disabled:opacity-40"
                        style={{ color: 'var(--nav-text-muted)' }}>
                        <XIcon />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {currentList.length > 0 && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.15 }}
              className="rounded-xl px-4 py-3 mt-4 flex items-center justify-between"
              style={{ background: 'var(--nav-accent)' }}
            >
              <span className="text-sm" style={{ color: 'var(--nav-accent-ink)', opacity: 0.8 }}>{t.totalDocumentsLabel(currentList.length)}</span>
              <span className="font-bold" style={{ color: 'var(--nav-accent-ink)' }}>
                {currentList.reduce((sum, d) => sum + Number(d.total), 0).toLocaleString('ru-KZ')} ₸
              </span>
            </motion.div>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
