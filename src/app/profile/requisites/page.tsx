'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileCoreDict } from '@/lib/i18n/profileCore'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Same input treatment as src/app/create/page.tsx's form fields -- token
// borders/focus ring, no remount-on-keystroke (plain controlled input).
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  maxLength?: number
}) {
  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{label}</label>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        type={type}
        maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

export default function Requisites() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    company_name: '', bin_iin: '', address: '', email: '', phone: '',
    director_name: '', accountant_name: ''
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile({ ...profile, ...data })
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...profile })
    if (error) alert(t.errorPrefix(error.message))
    else { alert(t.savedAlert); router.push('/profile') }
    setSaving(false)
  }

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
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
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.requisitesHeaderLabel}</h2>
          </motion.div>

          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl p-5 space-y-4 ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
          >
            <Field label={t.companyNameFieldLabel} placeholder={t.companyNamePlaceholder}
              value={profile.company_name} onChange={v => setProfile({ ...profile, company_name: v })} />

            <Field label={t.binIinFieldLabel} placeholder={t.binIinPlaceholder}
              value={profile.bin_iin} onChange={v => setProfile({ ...profile, bin_iin: v })} />

            <Field label={t.legalAddressFieldLabel} placeholder={t.legalAddressPlaceholder}
              value={profile.address} onChange={v => setProfile({ ...profile, address: v })} />

            <Field label={t.emailFieldLabel} placeholder={t.emailPlaceholder}
              value={profile.email} onChange={v => setProfile({ ...profile, email: v })} />

            <Field label={t.phoneFieldLabel} placeholder={t.phonePlaceholder} type="tel" maxLength={16}
              value={profile.phone} onChange={v => setProfile({ ...profile, phone: formatPhone(v) })} />

            <Field label={t.directorNameFieldLabel} placeholder={t.personNamePlaceholder}
              value={profile.director_name} onChange={v => setProfile({ ...profile, director_name: v })} />

            <Field label={t.accountantNameFieldLabel} placeholder={t.personNamePlaceholder}
              value={profile.accountant_name} onChange={v => setProfile({ ...profile, accountant_name: v })} />
          </motion.div>

          <motion.button
            onClick={save}
            disabled={saving}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.14 }}
            className="w-full rounded-xl py-3.5 text-sm font-semibold mt-4 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
          >
            {saving ? t.savingEllipsis : t.saveChangesButton}
          </motion.button>
        </div>
      </main>
    </DesktopShell>
  )
}
