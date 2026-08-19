'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { contractsDict } from '@/lib/i18n/contracts'
import Skeleton from '@/components/Skeleton'

type Contract = {
  id: string
  title: string
  client_name: string | null
  client_email: string | null
  file_url: string
  created_at: string
}

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same input treatment as src/app/create/page.tsx's form fields.
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

// Flat solid-fill status badges -- same approved treatment as dashboard/page.tsx's statusFill.
const statusFill: Record<string, string> = {
  signed: 'var(--nav-success)',
  awaiting_client: 'var(--nav-accent)',
  not_sent: 'var(--nav-text-muted)',
}

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
function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 8l5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function ContractIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m9 16 2 1.5L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Contracts() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = contractsDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw

  const [contracts, setContracts] = useState<Contract[]>([])
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', client_name: '', client_email: '' })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: c } = await supabase.from('contracts').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setContracts(c || [])

    if (c && c.length > 0) {
      const { data: sigs } = await supabase
        .from('document_signatures')
        .select('document_id, status')
        .eq('document_type', 'contract')
        .in('document_id', c.map(x => x.id))
      const map: Record<string, string> = {}
      for (const s of sigs || []) map[s.document_id] = s.status
      setStatuses(map)
    }
    setLoading(false)
  }

  function resetForm() {
    setForm({ title: '', client_name: '', client_email: '' })
    setFile(null)
    setShowForm(false)
  }

  async function saveContract() {
    if (!form.title) { alert(t.titleRequiredAlert); return }
    if (!file) { alert(t.fileRequiredAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const path = `contracts/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('signed-documents').upload(path, file, { contentType: 'application/pdf' })
    if (uploadError) { alert(t.errorPrefix(uploadError.message)); setSaving(false); return }
    const fileUrl = supabase.storage.from('signed-documents').getPublicUrl(path).data.publicUrl

    const { error } = await supabase.from('contracts').insert({
      user_id: user.id,
      title: form.title,
      client_name: form.client_name || null,
      client_email: form.client_email || null,
      file_url: fileUrl,
    })
    if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }

    resetForm()
    await load()
    setSaving(false)
  }

  async function deleteContract(id: string) {
    if (!confirm(t.deleteContractConfirm)) return
    await supabase.from('contracts').delete().eq('id', id)
    setContracts(prev => prev.filter(c => c.id !== id))
  }

  function statusBadge(id: string) {
    const status = statuses[id]
    if (status === 'signed') return { text: t.statusSigned, fill: statusFill.signed }
    if (status === 'awaiting_client') return { text: t.statusAwaitingClient, fill: statusFill.awaiting_client }
    return { text: t.statusNotSent, fill: statusFill.not_sent }
  }

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          <motion.div
            className="flex items-center justify-between gap-3 mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push('/profile')}
                aria-label={backLabel(lang)}
                className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
                style={{ color: 'var(--nav-text-muted)' }}
              >
                <ChevronLeftIcon />
              </button>
              <h2 className="text-xl font-bold truncate" style={{ color: 'var(--nav-text-primary)' }}>{t.headerLabel}</h2>
            </div>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                <PlusIcon />
                {t.uploadButton}
              </button>
            )}
          </motion.div>

          {showForm && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 space-y-3"
            >
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.newContractTitle}</div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.titleFieldLabel}</label>
                <input
                  className={inputClass}
                  placeholder={t.titleFieldPlaceholder}
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.clientNameFieldLabel}</label>
                <input
                  className={inputClass}
                  placeholder={t.clientNameFieldPlaceholder}
                  value={form.client_name}
                  onChange={e => setForm({ ...form, client_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.clientEmailFieldLabel}</label>
                <input
                  className={inputClass}
                  placeholder={t.clientEmailFieldPlaceholder}
                  type="email"
                  value={form.client_email}
                  onChange={e => setForm({ ...form, client_email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.fileFieldLabel}</label>
                <label
                  className="flex flex-col items-center gap-2 rounded-xl py-6 text-center cursor-pointer transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ border: '1.5px dashed var(--nav-border)' }}
                >
                  <span style={{ color: 'var(--nav-text-muted)' }}><UploadIcon /></span>
                  <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>
                    {file ? t.fileChosenLabel(file.name) : t.chooseFileButton}
                  </span>
                  <input type="file" accept="application/pdf" className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={resetForm}
                  className="flex-1 nav-glass rounded-xl py-3 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.cancelButton}
                </button>
                <button onClick={saveContract} disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {saving ? t.savingLabel : t.saveButton}
                </button>
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="nav-glass rounded-2xl overflow-hidden">
              {[0, 1, 2].map(i => (
                <div key={i} className="px-4 py-3.5" style={{ borderBottom: i < 2 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <ContractIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.noContractsHint}</p>
              <p className="text-xs mt-1 px-6" style={{ color: 'var(--nav-text-muted)' }}>{t.noContractsSubHint}</p>
            </div>
          ) : (
            <div className="nav-glass rounded-2xl overflow-hidden">
              {contracts.map((c, i) => {
                const badge = statusBadge(c.id)
                return (
                  <motion.div key={c.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.3), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                    onClick={() => router.push(`/contract/${c.id}`)}
                    className="flex items-start justify-between px-4 py-3.5 cursor-pointer transition-colors hover:bg-[var(--nav-surface-glass)]"
                    style={{ borderBottom: i < contracts.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>{c.title}</div>
                      {c.client_name && <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{c.client_name}</div>}
                      <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(c.created_at)}</div>
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold text-white mt-1.5"
                        style={{ background: badge.fill }}>
                        {badge.text}
                      </span>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteContract(c.id) }}
                      aria-label={deleteLabel(lang)}
                      title={t.deleteButton}
                      className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ml-2 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
                      <XIcon />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
