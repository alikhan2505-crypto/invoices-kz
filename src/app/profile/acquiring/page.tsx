'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import { parseStatementFile, AcquiringParseError } from '@/lib/acquiringParse'
import { findMatches, AcquiringMatch, OpenInvoice } from '@/lib/acquiringMatch'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { acquiringDict } from '@/lib/i18n/acquiring'
import Skeleton from '@/components/Skeleton'

interface BccConnection {
  iban: string
  last_checked_at: string
  status: string
}

interface BccPendingMatch {
  id: string
  invoice_id: string
  matched_amount: number
  matched_date: string | null
  matched_description: string | null
  invoices: { id: string, number: string, client_name: string | null, client_bin: string | null, amount: number } | null
}

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
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function BankIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M4 21V10M20 21V10M2 10l10-6 10 6M6 21v-6M10 21v-6M14 21v-6M18 21v-6" />
    </svg>
  )
}
function ApiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4" />
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <path d="M6 10H3M6 14H3M21 10h-3M21 14h-3" />
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
function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 8l5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export default function AcquiringPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [matches, setMatches] = useState<AcquiringMatch[]>([])
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [fileName, setFileName] = useState('')

  const [bccConnection, setBccConnection] = useState<BccConnection | null>(null)
  const [bccPending, setBccPending] = useState<BccPendingMatch[]>([])
  const [bccConnecting, setBccConnecting] = useState(false)
  const [bccDisconnecting, setBccDisconnecting] = useState(false)
  const [bccMessage, setBccMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const bccStatus = params.get('bcc')
    if (bccStatus === 'connected') setBccMessage(t.bccConnectedMessage)
    if (bccStatus === 'error') setBccMessage(t.bccErrorMessage)
    if (bccStatus) window.history.replaceState(null, '', '/profile/acquiring')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    // bcc_connections has no client-side RLS policy — it's only ever
    // readable via a service-role client, so the connection status is
    // fetched through this authenticated route rather than queried
    // directly from the browser.
    //
    // Fetched for EVERY plan, not just Pro: a user whose Pro plan lapsed while
    // a connection is live still holds a real OAuth token against their bank,
    // and must be able to see it and disconnect it. /api/bcc/status is
    // deliberately not Pro-gated for the same reason.
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/bcc/status', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setBccConnection(data.connection as BccConnection | null)
      }
    } catch (e: any) {
      console.error('BCC status fetch error:', e.message)
    }

    if (getActivePlan(p).canAcquiring) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', user.id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      setOpenInvoices((invoices as OpenInvoice[]) || [])

      const { data: pending } = await supabase
        .from('bcc_pending_matches')
        .select('id, invoice_id, matched_amount, matched_date, matched_description, invoices(id, number, client_name, client_bin, amount)')
        .eq('user_id', user.id)
      setBccPending((pending as any[] as BccPendingMatch[]) || [])
    }

    setLoading(false)
  }

  async function connectBcc() {
    setBccMessage('')
    setBccConnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/bcc/connect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.authUrl) {
        setBccMessage(
          data.error === 'no_bin' ? t.bccErrorNoBin
            : data.error === 'not_pro' ? t.bccErrorNotPro
              : t.bccErrorGeneric
        )
        return
      }
      window.location.href = data.authUrl
    } finally {
      setBccConnecting(false)
    }
  }

  async function disconnectBcc() {
    setBccMessage('')
    setBccDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/bcc/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        setBccMessage(t.bccErrorGeneric)
        return
      }
      setBccConnection(null)
      setBccPending([])
    } finally {
      setBccDisconnecting(false)
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setMatches([])
    setUnmatchedCount(null)
    setFileName(file.name)
    setProcessing(true)
    try {
      const rows = await parseStatementFile(file)
      const found = findMatches(rows, openInvoices)
      setMatches(found)
      setUnmatchedCount(rows.length - new Set(found.map(m => m.row)).size)
    } catch (e: any) {
      setError(e instanceof AcquiringParseError ? t.parseErrorMessages[e.code] : (e?.message || String(e)))
    } finally {
      setProcessing(false)
    }
  }

  async function confirmPayment(match: AcquiringMatch) {
    setConfirmError('')
    setConfirmingId(match.invoice.id)
    try {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
      if (updateError) {
        setConfirmError(updateError.message || 'Ошибка при обновлении статуса счета')
        return
      }
      await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
      // Remove every OTHER candidate match for this same statement row too — a single payment
      // can only ever settle one invoice, so once one is confirmed the other candidates for
      // that row are no longer valid options.
      setMatches(prev => prev.filter(m => m.row !== match.row))
      setOpenInvoices(prev => prev.filter(i => i.id !== match.invoice.id))
    } finally {
      setConfirmingId(null)
    }
  }

  async function confirmBccMatch(pending: BccPendingMatch) {
    setConfirmError('')
    setConfirmingId(pending.invoice_id)
    try {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', pending.invoice_id)
      if (updateError) {
        setConfirmError(updateError.message || 'Ошибка при обновлении статуса счета')
        return
      }
      await supabase.from('invoice_logs').insert({ invoice_id: pending.invoice_id, status: 'paid' })

      // Deleted through an authenticated route, not directly: bcc_pending_matches
      // has a SELECT policy only, so a client-side .delete() is silently filtered
      // to zero rows and reports no error — the row would survive and reappear as
      // a phantom "confirm" card for an already-paid invoice on the next load.
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/bcc/pending/${pending.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        // The invoice IS paid at this point — keep the card on screen rather
        // than showing a false "done", so the user can retry the cleanup.
        setConfirmError(t.bccConfirmDeleteError)
        return
      }

      setBccPending(prev => prev.filter(p => p.id !== pending.id))
      setOpenInvoices(prev => prev.filter(i => i.id !== pending.invoice_id))
    } finally {
      setConfirmingId(null)
    }
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
        className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ color: 'var(--nav-text-muted)' }}
      >
        <ChevronLeftIcon />
      </button>
      <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.headerLabel}</h2>
    </motion.div>
  )

  if (loading) return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          {header}
          <div className="space-y-3">
            <div className="nav-glass rounded-2xl p-4"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-56" /></div>
            <div className="nav-glass rounded-2xl p-4"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-56" /></div>
          </div>
        </div>
      </main>
    </DesktopShell>
  )

  const ap = getActivePlan(profile)

  // Rendered in BOTH the Pro and the non-Pro branch below. A user whose Pro
  // plan lapsed while a BCC connection is live still has a real OAuth token
  // sitting against their bank account — the "Отключить" button has to stay
  // reachable for them, even though everything else here is behind the wall.
  const bccConnectedCard = bccConnection && (
    <div className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.bccSectionTitle}</div>
      <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.bccConnectedIbanLabel}: {bccConnection.iban}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.bccLastCheckedLabel}: {new Date(bccConnection.last_checked_at).toLocaleString('ru-KZ')}</div>
      {bccConnection.status === 'error' && (
        <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: '#D97706' }}>
          <AlertIcon />
          {t.bccConnectionErrorHint}
        </div>
      )}
      <button onClick={disconnectBcc} disabled={bccDisconnecting}
        className="w-full nav-glass rounded-xl py-2.5 text-sm font-medium mt-3 transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-60"
        style={{ color: 'var(--nav-text-secondary)' }}>
        {bccDisconnecting ? t.bccDisconnectingLabel : t.bccDisconnectButton}
      </button>
    </div>
  )

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          {header}

          <div className="space-y-4">
            {!ap.canAcquiring && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
                className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}
                  >
                    <BankIcon />
                  </span>
                  <div className="text-sm font-semibold flex-1" style={{ color: 'var(--nav-text-primary)' }}>{t.headerLabel}</div>
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                    <LockIcon size={10} />
                    {t.proBadge}
                  </span>
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.proLockedHint}</div>
                <button onClick={() => router.push('/upgrade')}
                  className="w-full rounded-xl py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.goToPlansButton}
                </button>
              </motion.div>
            )}

            {/* Kaspi Pay Cashier connection/wallet/statement moved out to its own
                standalone page (2026-08-19, founder: "Kaspi API выведен отдельно
                так же как Каспи кабинет и ИИ агент") — see /kaspi-api. This card
                just points there now instead of duplicating that whole UI here. */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
              onClick={() => router.push('/kaspi-api')}
              className={`nav-glass rounded-2xl p-4 cursor-pointer ${CARD_HOVER}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--nav-teal-soft), transparent)', color: 'var(--nav-teal)' }}
                >
                  <ApiIcon />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Kaspi Cashier API</div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>Подключение Kaspi Pay Cashier, API-токен, вебхуки и выписка теперь в своём разделе.</p>
                </div>
                <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
              </div>
            </motion.div>

            {!ap.canAcquiring ? (
              bccConnection && (
                <>
                  {bccMessage && <p className="text-xs px-1" style={{ color: 'var(--nav-accent)' }}>{bccMessage}</p>}
                  {bccConnectedCard}
                </>
              )
            ) : (
              <>
                {bccMessage && <p className="text-xs px-1" style={{ color: 'var(--nav-accent)' }}>{bccMessage}</p>}

                {bccConnection ? bccConnectedCard : (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.14 }}
                    className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}
                  >
                    <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.bccSectionTitle}</div>
                    <div className="flex items-center justify-between text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                      <span>{t.bccBinLabel}: {profile?.bin_iin || t.bccBinMissing}</span>
                      <button onClick={() => router.push('/profile/requisites')} className="font-medium underline" style={{ color: 'var(--nav-accent)' }}>
                        {t.bccEditBinLink}
                      </button>
                    </div>
                    <button onClick={connectBcc} disabled={bccConnecting}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {bccConnecting ? t.bccConnectingLabel : t.bccConnectButton}
                    </button>
                  </motion.div>
                )}

                {bccPending.length > 0 && (
                  <>
                    <div className="text-[11px] font-extrabold uppercase px-1" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
                      {t.bccPendingMatchesLabel(bccPending.length)}
                    </div>
                    {confirmError && <p className="text-xs" style={{ color: 'var(--nav-critical)' }}>{t.errorPrefix(confirmError)}</p>}
                    {bccPending.map(pending => pending.invoices && (
                      <div key={pending.id} className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}>
                        <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.invoiceLabel(pending.invoices.number)}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.clientLabel}: {pending.invoices.client_name || '—'}</div>
                        <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.amountLabel}: {Number(pending.invoices.amount).toLocaleString('ru-KZ')} ₸</div>
                        {pending.matched_date && <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.statementDateLabel}: {pending.matched_date}</div>}
                        {pending.matched_description && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.descriptionLabel}: {pending.matched_description}</div>}
                        <button onClick={() => confirmBccMatch(pending)} disabled={confirmingId === pending.invoice_id}
                          className="w-full rounded-xl py-2.5 text-sm font-semibold mt-3 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                          style={{ background: 'var(--nav-success)', color: 'white' }}>
                          {confirmingId === pending.invoice_id ? t.confirmingLabel : t.confirmPaymentButton}
                        </button>
                      </div>
                    ))}
                  </>
                )}

                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.18 }}
                  className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}
                >
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.introText}</p>
                  <label
                    className="flex flex-col items-center gap-2 rounded-xl py-6 text-center cursor-pointer transition-colors hover:bg-[var(--nav-surface-glass)]"
                    style={{ border: '1.5px dashed var(--nav-border)' }}
                  >
                    <span style={{ color: 'var(--nav-text-muted)' }}><UploadIcon /></span>
                    <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>
                      {fileName ? t.fileChosenLabel(fileName) : t.chooseFileButton}
                    </span>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
                  </label>
                  {processing && <p className="text-xs text-center mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.processingLabel}</p>}
                  {error && <p className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{t.errorPrefix(error)}</p>}
                </motion.div>

                {openInvoices.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.noOpenInvoicesHint}</p>
                  </div>
                )}

                {fileName && !processing && !error && (
                  <>
                    <div className="text-xs px-1" style={{ color: 'var(--nav-text-muted)' }}>
                      {matches.length > 0 ? t.matchesFoundLabel(matches.length) : t.noMatchesFoundHint}
                      {unmatchedCount !== null && unmatchedCount > 0 && (
                        <span> · {t.unmatchedRowsLabel(unmatchedCount)}</span>
                      )}
                    </div>

                    {confirmError && <p className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{t.errorPrefix(confirmError)}</p>}

                    {matches.map(match => {
                      const rowMatchCount = matches.filter(m => m.row === match.row).length
                      return (
                        <div key={`${match.invoice.id}-${match.row.date}-${match.row.amount}-${match.row.description}`} className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}>
                          <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.invoiceLabel(match.invoice.number)}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.clientLabel}: {match.invoice.client_name || '—'}</div>
                          <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.amountLabel}: {Number(match.invoice.amount).toLocaleString('ru-KZ')} ₸</div>
                          {match.row.date && <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.statementDateLabel}: {match.row.date}</div>}
                          {match.row.description && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.descriptionLabel}: {match.row.description}</div>}
                          {rowMatchCount > 1 && (
                            <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: '#D97706' }}>
                              <AlertIcon />
                              {t.multipleMatchesHint}
                            </div>
                          )}
                          <button onClick={() => confirmPayment(match)} disabled={confirmingId === match.invoice.id}
                            className="w-full rounded-xl py-2.5 text-sm font-semibold mt-3 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                            style={{ background: 'var(--nav-success)', color: 'white' }}>
                            {confirmingId === match.invoice.id ? t.confirmingLabel : t.confirmPaymentButton}
                          </button>
                        </div>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </DesktopShell>
  )
}
