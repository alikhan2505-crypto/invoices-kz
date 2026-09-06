'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same rounded-bordered field treatment used by src/app/create/page.tsx's form
// inputs -- adopted here instead of this page's old underline-only style so
// every text field in the app now shares one visual language.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export default function InvoiceSettings() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState({
    invoice_prefix: 'INV-',
    invoice_next_number: '0001',
    default_currency: 'KZT',
    default_due_days: '3',
    default_note: '',
    vat_type: 'no_vat',
    kp_prefix: 'КП-',
    kp_next_number: '1',
    avr_prefix: 'АВР-',
    avr_next_number: '1',
    nakladnaya_prefix: 'НАК-',
    nakladnaya_next_number: '1',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setSettings({
          invoice_prefix: data.invoice_prefix || 'INV-',
          invoice_next_number: data.invoice_next_number || '0001',
          default_currency: data.default_currency || 'KZT',
          default_due_days: data.default_due_days || '3',
          default_note: data.default_note || '',
          vat_type: data.vat_type || 'no_vat',
          kp_prefix: data.kp_prefix || 'КП-',
          kp_next_number: String(data.kp_next_number || 1),
          avr_prefix: data.avr_prefix || 'АВР-',
          avr_next_number: String(data.avr_next_number || 1),
          nakladnaya_prefix: data.nakladnaya_prefix || 'НАК-',
          nakladnaya_next_number: String(data.nakladnaya_next_number || 1),
        })
      }
      setLoaded(true)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      ...settings,
      kp_next_number: parseInt(settings.kp_next_number) || 1,
      avr_next_number: parseInt(settings.avr_next_number) || 1,
      nakladnaya_next_number: parseInt(settings.nakladnaya_next_number) || 1,
    })
    if (error) alert(t.errorPrefix(error.message))
    else { alert(t.savedAlert); router.push('/profile') }
    setSaving(false)
  }

  const vatLabels: Record<string, { label: string; desc: string }> = {
    no_vat: { label: t.vatNoLabel, desc: t.vatNoDesc },
    vat_0: { label: t.vat0Label, desc: t.vat0Desc },
    vat_16: { label: t.vat16Label, desc: t.vat16Desc },
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  if (!loaded) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 flex items-center justify-center" style={{ minHeight: '50vh' }}>
        <p style={{ color: 'var(--nav-text-muted)' }}>{t.loadingLabel}</p>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.invoiceSettingsLabel}</span>
        </motion.div>

        {/* Нумерация счетов */}
        <motion.div {...fadeIn(1)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.invoiceNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="INV-" value={settings.invoice_prefix}
                onChange={e => setSettings({ ...settings, invoice_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="0001" value={settings.invoice_next_number}
                onChange={e => setSettings({ ...settings, invoice_next_number: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.defaultCurrencyFieldLabel}</label>
            <select className={INPUT_CLS}
              value={settings.default_currency}
              onChange={e => setSettings({ ...settings, default_currency: e.target.value })}>
              <option>KZT</option>
              <option>USD</option>
              <option>EUR</option>
              <option>RUB</option>
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.defaultDueDaysFieldLabel}</label>
            <input type="number" className={INPUT_CLS}
              placeholder="3" value={settings.default_due_days}
              onChange={e => setSettings({ ...settings, default_due_days: e.target.value })} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.defaultNoteFieldLabel}</label>
            <textarea className={`${INPUT_CLS} resize-none`}
              rows={3} placeholder={t.defaultNotePlaceholder}
              value={settings.default_note}
              onChange={e => setSettings({ ...settings, default_note: e.target.value })} />
          </div>
        </motion.div>

        {/* Нумерация КП */}
        <motion.div {...fadeIn(2)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.kpNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="КП-" value={settings.kp_prefix}
                onChange={e => setSettings({ ...settings, kp_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input type="number" className={INPUT_CLS}
                placeholder="1" value={settings.kp_next_number}
                onChange={e => setSettings({ ...settings, kp_next_number: e.target.value })} />
            </div>
          </div>
        </motion.div>

        {/* Нумерация АВР */}
        <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.avrNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="АВР-" value={settings.avr_prefix}
                onChange={e => setSettings({ ...settings, avr_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input type="number" className={INPUT_CLS}
                placeholder="1" value={settings.avr_next_number}
                onChange={e => setSettings({ ...settings, avr_next_number: e.target.value })} />
            </div>
          </div>
        </motion.div>

        {/* Нумерация Накладной */}
        <motion.div {...fadeIn(4)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.nakladnayaNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="НАК-" value={settings.nakladnaya_prefix}
                onChange={e => setSettings({ ...settings, nakladnaya_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input type="number" className={INPUT_CLS}
                placeholder="1" value={settings.nakladnaya_next_number}
                onChange={e => setSettings({ ...settings, nakladnaya_next_number: e.target.value })} />
            </div>
          </div>
        </motion.div>

        {/* НДС */}
        <motion.div {...fadeIn(5)} className="nav-glass rounded-2xl p-4">
          <div className="text-[11px] font-extrabold uppercase mb-3" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.vatStatusSectionLabel}</div>
          <div className="space-y-2">
            {Object.entries(vatLabels).map(([key, val]) => (
              <div key={key} onClick={() => setSettings({ ...settings, vat_type: key })}
                className="flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-colors"
                style={settings.vat_type === key
                  ? { background: 'var(--nav-accent-soft)', borderColor: 'var(--nav-accent)' }
                  : { borderColor: 'var(--nav-border-soft)' }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: settings.vat_type === key ? 'var(--nav-accent)' : 'var(--nav-text-secondary)' }}>
                    {val.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{val.desc}</div>
                </div>
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={settings.vat_type === key
                    ? { borderColor: 'var(--nav-accent)', background: 'var(--nav-accent)' }
                    : { borderColor: 'var(--nav-border)' }}>
                  {settings.vat_type === key && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--nav-accent-ink)' }}></div>}
                </div>
              </div>
            ))}
          </div>
          {settings.vat_type === 'vat_16' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.vat16InfoText}
            </div>
          )}
          {settings.vat_type === 'vat_0' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.vat0InfoText}
            </div>
          )}
          {settings.vat_type === 'no_vat' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
              {t.noVatInfoText}
            </div>
          )}
        </motion.div>

        <motion.button {...fadeIn(6)} onClick={save} disabled={saving}
          className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {saving ? t.savingEllipsis : t.saveSettingsButton}
        </motion.button>

      </div>
    </main>
    </DesktopShell>
  )
}
