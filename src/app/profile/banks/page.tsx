'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, editLabel, deleteLabel } from '@/lib/a11yLabels'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Same input treatment as src/app/create/page.tsx's form fields.
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17l-6.1 3.5 1.5-6.8-5.2-4.7 6.9-.7Z" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
function CardIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export default function Banks() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('created_at')
    setAccounts(data || [])
    setLoading(false)
  }

  function startEdit(acc: any) {
    setEditingId(acc.id)
    setForm({ bank_name: acc.bank_name, iik: acc.iik, bik: acc.bik || '', kbe: acc.kbe || '19', currency: acc.currency || 'KZT' })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })
    setShowForm(false)
  }

  async function saveAccount() {
    if (!form.bank_name || !form.iik) { alert(t.fillBankNameAndIikAlert); return }
    if (!form.bik) { alert(t.fillBankBikAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (editingId) {
      const { error } = await supabase.from('bank_accounts').update({ ...form }).eq('id', editingId)
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    } else {
      const is_main = accounts.length === 0
      const { error } = await supabase.from('bank_accounts').insert({ ...form, user_id: user.id, is_main })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    }
    resetForm()
    loadAccounts()
    setSaving(false)
  }

  async function setMain(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('bank_accounts').update({ is_main: false }).eq('user_id', user.id)
    await supabase.from('bank_accounts').update({ is_main: true }).eq('id', id)
    loadAccounts()
  }

  async function deleteAccount(id: string) {
    if (!confirm(t.deleteAccountConfirm)) return
    await supabase.from('bank_accounts').delete().eq('id', id)
    loadAccounts()
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
              className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ color: 'var(--nav-text-muted)' }}
            >
              <ChevronLeftIcon />
            </button>
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.banksHeaderLabel}</h2>
          </motion.div>

          {loading ? (
            <div className="space-y-3 mb-4">
              {[0, 1].map(i => (
                <div key={i} className="nav-glass rounded-2xl p-4">
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          ) : accounts.length === 0 && !showForm ? (
            <div className="flex flex-col items-center text-center py-12">
              <CardIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.noAccountsLabel}</p>
            </div>
          ) : (
            <div className="space-y-3 mb-4">
              {accounts.map((acc, i) => (
                <motion.div
                  key={acc.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 + i * 0.05 }}
                  className={`rounded-2xl p-4 ${CARD_HOVER}`}
                  style={{
                    background: 'var(--nav-surface-chrome)',
                    border: acc.is_main ? '1.5px solid var(--nav-accent)' : '1px solid var(--nav-border-soft)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" style={{ color: 'var(--nav-text-primary)' }}>{acc.bank_name}</span>
                        {acc.is_main && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                            {t.mainBadgeLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-sm mt-1 tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{acc.iik}</div>
                      {acc.bik && <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.bikPrefixLabel(acc.bik)}</div>}
                      <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.currencyActiveLabel(acc.currency)}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!acc.is_main && (
                        <button onClick={() => setMain(acc.id)} title={t.setMainTitle}
                          className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                          style={{ color: 'var(--nav-text-muted)' }}>
                          <StarIcon filled={false} />
                        </button>
                      )}
                      {acc.is_main && (
                        <span className="w-8 h-8 flex items-center justify-center" style={{ color: 'var(--nav-accent)' }}>
                          <StarIcon filled />
                        </span>
                      )}
                      <button onClick={() => startEdit(acc)} title={t.editTitle} aria-label={editLabel(lang)}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
                        <PencilIcon />
                      </button>
                      <button onClick={() => deleteAccount(acc.id)} title={t.deleteTitle} aria-label={deleteLabel(lang)}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
                        <XIcon />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {showForm && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 space-y-3"
            >
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                {editingId ? t.editAccountHeading : t.newAccountHeading}
              </div>
              {[
                { key: 'bank_name', label: t.bankNameFieldLabel, placeholder: t.bankNamePlaceholder },
                { key: 'iik', label: t.iikFieldLabel, placeholder: t.iikPlaceholder },
                { key: 'bik', label: t.bikFieldLabel, placeholder: t.bikPlaceholder },
                { key: 'kbe', label: t.kbeFieldLabel, placeholder: t.kbePlaceholder },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{f.label}</label>
                  <input
                    className={inputClass}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.currencyFieldLabel}</label>
                <select
                  className={inputClass}
                  value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value })}>
                  <option>KZT</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>RUB</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={resetForm}
                  className="flex-1 nav-glass rounded-xl py-3 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.cancelButton}
                </button>
                <button onClick={saveAccount} disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {saving ? t.savingEllipsis : editingId ? t.saveButton : t.addLabel}
                </button>
              </div>
            </motion.div>
          )}

          {!showForm && (
            <motion.button
              onClick={() => setShowForm(true)}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.15 }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
            >
              <PlusIcon />
              {t.addAccountButton}
            </motion.button>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
