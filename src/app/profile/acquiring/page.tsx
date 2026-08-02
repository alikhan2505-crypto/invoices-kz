'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { parseStatementFile, AcquiringParseError } from '@/lib/acquiringParse'
import { findMatches, AcquiringMatch, OpenInvoice } from '@/lib/acquiringMatch'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { acquiringDict } from '@/lib/i18n/acquiring'

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

export default function AcquiringPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]

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

  const [kaspiConnected, setKaspiConnected] = useState(false)
  const [kaspiStatus, setKaspiStatus] = useState<string | null>(null)
  const [kaspiPhone, setKaspiPhone] = useState('')
  const [kaspiOtp, setKaspiOtp] = useState('')
  const [kaspiProcessId, setKaspiProcessId] = useState<string | null>(null)
  const [kaspiApiToken, setKaspiApiToken] = useState<string | null>(null)
  const [kaspiWalletBalance, setKaspiWalletBalance] = useState(0)
  const [kaspiTopupAmount, setKaspiTopupAmount] = useState<number | null>(null)
  const [kaspiTopupCustom, setKaspiTopupCustom] = useState('')
  const [kaspiTopupPending, setKaspiTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)
  const [kaspiSending, setKaspiSending] = useState(false)
  const [kaspiVerifying, setKaspiVerifying] = useState(false)
  const [kaspiDisconnecting, setKaspiDisconnecting] = useState(false)
  const [kaspiToppingUp, setKaspiToppingUp] = useState(false)
  const [kaspiError, setKaspiError] = useState('')
  const [kaspiRecentTopups, setKaspiRecentTopups] = useState<{ amount: number, status: string, createdAt: string }[]>([])
  const [kaspiOperations, setKaspiOperations] = useState<{ id: string, orderNumber: string, amount: number, direction: string, category: string, clientName: string | null, matchedInvoiceNumber: string | null, operationDate: string }[]>([])
  const [kaspiPendingMatches, setKaspiPendingMatches] = useState<{ id: string, invoiceNumber: string | null, clientName: string | null, matchedAmount: number, matchedDate: string }[]>([])
  const [kaspiDirectionFilter, setKaspiDirectionFilter] = useState<'all' | 'in' | 'out'>('all')
  const [kaspiCategoryFilter, setKaspiCategoryFilter] = useState<'all' | 'platform' | 'other'>('all')
  const [kaspiConfirmingMatchId, setKaspiConfirmingMatchId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const bccStatus = params.get('bcc')
    if (bccStatus === 'connected') setBccMessage(t.bccConnectedMessage)
    if (bccStatus === 'error') setBccMessage(t.bccErrorMessage)
    if (bccStatus) window.history.replaceState(null, '', '/profile/acquiring')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same 5s-polling pattern used elsewhere in this codebase (e.g. /view/[token]
  // polling /api/kaspi/invoice-payment) — the wallet topup itself settles via
  // Kaspi's own webhook/cron, so this just picks up the result and refreshes
  // the dashboard once it lands rather than requiring a manual page reload.
  useEffect(() => {
    if (!kaspiTopupPending) return
    let polls = 0
    const interval = setInterval(async () => {
      // Capped at 150 polls (~12.5 min), matching /view/[token]'s same
      // 5s-interval pattern — an abandoned tab with a pending top-up
      // shouldn't poll forever.
      polls++
      if (polls > 150) { clearInterval(interval); return }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/kaspi/wallet/topup-status?topup_id=${kaspiTopupPending.topup_id}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.status === 'paid') {
        clearInterval(interval)
        setKaspiTopupPending(null)
        load()
      } else if (data.status === 'expired') {
        // A Kaspi payment QR is only valid for a few minutes (the same as
        // scanning one generated directly in the Kaspi Pay app) — without
        // this, closing the sheet and coming back later left the UI silently
        // polling a dead link forever with no feedback at all.
        clearInterval(interval)
        setKaspiTopupPending(null)
        setKaspiError(t.kaspiTopupExpiredError)
      }
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaspiTopupPending?.topup_id])

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

    // Same reasoning as /api/bcc/status above: kaspi_connections has no
    // client-facing RLS policy, and the Kaspi Pay Cashier section is open to
    // every plan (unlike the BCC/Excel-import sections above), so this is
    // fetched unconditionally rather than gated behind canAcquiring.
    try {
      const res = await fetch('/api/kaspi/dashboard', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setKaspiConnected(!!data.connected)
        setKaspiStatus(data.status ?? null)
        setKaspiWalletBalance(data.walletBalance ?? 0)
        setKaspiRecentTopups(data.recentTopups ?? [])
      }
    } catch (e: any) {
      console.error('Kaspi dashboard fetch error:', e.message)
    }

    await loadKaspiOperations()

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

  async function loadKaspiOperations(direction = kaspiDirectionFilter, category = kaspiCategoryFilter) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/kaspi/operations?direction=${direction}&category=${category}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setKaspiOperations(data.operations || [])
      setKaspiPendingMatches(data.pendingMatches || [])
    }
  }

  async function confirmKaspiPendingMatch(pendingMatchId: string) {
    setKaspiConfirmingMatchId(pendingMatchId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/kaspi/pending-matches/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingMatchId }),
      })
      await loadKaspiOperations()
    } finally {
      setKaspiConfirmingMatchId(null)
    }
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

  // Same formatting as the phone field in /profile/requisites and the old
  // /profile/kaspi-pay page — keeps the input's shape consistent across the
  // app rather than accepting anything a user happens to type before it's
  // sent to Kaspi's own entrance API.
  function formatKaspiPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  async function sendKaspiCode() {
    setKaspiError('')
    setKaspiSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: kaspiPhone }),
      })
      const data = await res.json()
      if (!res.ok || !data.processId) {
        setKaspiError(t.kaspiErrorGeneric)
        return
      }
      setKaspiProcessId(data.processId)
    } finally {
      setKaspiSending(false)
    }
  }

  async function verifyKaspiCode() {
    setKaspiError('')
    setKaspiVerifying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: kaspiProcessId, otp: kaspiOtp }),
      })
      const data = await res.json()
      if (!res.ok || !data.apiToken) {
        // invalid_otp means the code was wrong — the user can retry with a
        // new one. Anything else means Kaspi-side pairing may have already
        // succeeded but this attempt is now dead either way, since
        // kaspiProcessId is already gone server-side — see the equivalent
        // comment in the old /profile/kaspi-pay page this was ported from.
        setKaspiError(data.error === 'invalid_otp' ? t.kaspiErrorInvalidOtp : t.kaspiErrorGeneric)
        setKaspiProcessId(null)
        return
      }
      setKaspiApiToken(data.apiToken)
      setKaspiConnected(true)
      setKaspiStatus('active')
      setKaspiProcessId(null)
    } finally {
      setKaspiVerifying(false)
    }
  }

  async function disconnectKaspi() {
    setKaspiDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/kaspi/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setKaspiConnected(false)
      setKaspiStatus(null)
      setKaspiApiToken(null)
    } finally {
      setKaspiDisconnecting(false)
    }
  }

  async function startTopup(amount: number) {
    setKaspiError('')
    setKaspiToppingUp(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/wallet/topup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (res.ok) {
        setKaspiTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
      } else {
        setKaspiError(t.kaspiErrorGeneric)
      }
    } finally {
      setKaspiToppingUp(false)
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

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  const ap = getActivePlan(profile)

  // Rendered in BOTH the Pro and the non-Pro branch below. A user whose Pro
  // plan lapsed while a BCC connection is live still has a real OAuth token
  // sitting against their bank account — the "Отключить" button has to stay
  // reachable for them, even though everything else here is behind the wall.
  const bccConnectedCard = bccConnection && (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="text-sm font-medium text-[#1C2056] mb-2">{t.bccSectionTitle}</div>
      <div className="text-xs text-gray-500">{t.bccConnectedIbanLabel}: {bccConnection.iban}</div>
      <div className="text-xs text-gray-400">{t.bccLastCheckedLabel}: {new Date(bccConnection.last_checked_at).toLocaleString('ru-KZ')}</div>
      {bccConnection.status === 'error' && (
        <div className="text-xs text-amber-600 mt-2">{t.bccConnectionErrorHint}</div>
      )}
      <button onClick={disconnectBcc} disabled={bccDisconnecting}
        className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium mt-3">
        {bccDisconnecting ? t.bccDisconnectingLabel : t.bccDisconnectButton}
      </button>
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#1C2056]/5 flex items-center justify-center text-xl">🏦</div>
                <div className="text-sm font-medium text-[#1C2056] flex-1">{t.headerLabel}</div>
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  🔒 {t.proBadge}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-3">{t.proLockedHint}</div>
              <button onClick={() => router.push('/upgrade')}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {t.goToPlansButton}
              </button>
            </div>

            {bccConnection && (
              <>
                {bccMessage && <p className="text-xs text-[#1C2056] px-1">{bccMessage}</p>}
                {bccConnectedCard}
              </>
            )}
          </>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            {bccMessage && <p className="text-xs text-[#1C2056] px-1">{bccMessage}</p>}

            {bccConnection ? bccConnectedCard : (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="text-sm font-medium text-[#1C2056] mb-2">{t.bccSectionTitle}</div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span>{t.bccBinLabel}: {profile?.bin_iin || t.bccBinMissing}</span>
                  <button onClick={() => router.push('/profile/requisites')} className="text-[#1C2056] font-medium underline">
                    {t.bccEditBinLink}
                  </button>
                </div>
                <button onClick={connectBcc} disabled={bccConnecting}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {bccConnecting ? t.bccConnectingLabel : t.bccConnectButton}
                </button>
              </div>
            )}

            {bccPending.length > 0 && (
              <>
                <div className="text-xs text-gray-400 px-1">{t.bccPendingMatchesLabel(bccPending.length)}</div>
                {confirmError && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(confirmError)}</p>}
                {bccPending.map(pending => pending.invoices && (
                  <div key={pending.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(pending.invoices.number)}</div>
                    <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {pending.invoices.client_name || '—'}</div>
                    <div className="text-xs text-gray-500">{t.amountLabel}: {Number(pending.invoices.amount).toLocaleString('ru-KZ')} ₸</div>
                    {pending.matched_date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {pending.matched_date}</div>}
                    {pending.matched_description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {pending.matched_description}</div>}
                    <button onClick={() => confirmBccMatch(pending)} disabled={confirmingId === pending.invoice_id}
                      className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                      {confirmingId === pending.invoice_id ? t.confirmingLabel : t.confirmPaymentButton}
                    </button>
                  </div>
                ))}
              </>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="block border-2 border-dashed border-gray-200 rounded-xl py-4 text-center cursor-pointer">
                <span className="text-sm text-[#1C2056]">
                  {fileName ? t.fileChosenLabel(fileName) : t.chooseFileButton}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              </label>
              {processing && <p className="text-xs text-gray-400 text-center mt-2">{t.processingLabel}</p>}
              {error && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(error)}</p>}
            </div>

            {openInvoices.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">{t.noOpenInvoicesHint}</p>
              </div>
            )}

            {fileName && !processing && !error && (
              <>
                <div className="text-xs text-gray-400 px-1">
                  {matches.length > 0 ? t.matchesFoundLabel(matches.length) : t.noMatchesFoundHint}
                  {unmatchedCount !== null && unmatchedCount > 0 && (
                    <span> · {t.unmatchedRowsLabel(unmatchedCount)}</span>
                  )}
                </div>

                {confirmError && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(confirmError)}</p>}

                {matches.map(match => {
                  const rowMatchCount = matches.filter(m => m.row === match.row).length
                  return (
                    <div key={`${match.invoice.id}-${match.row.date}-${match.row.amount}-${match.row.description}`} className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(match.invoice.number)}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {match.invoice.client_name || '—'}</div>
                      <div className="text-xs text-gray-500">{t.amountLabel}: {Number(match.invoice.amount).toLocaleString('ru-KZ')} ₸</div>
                      {match.row.date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {match.row.date}</div>}
                      {match.row.description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {match.row.description}</div>}
                      {rowMatchCount > 1 && <div className="text-xs text-amber-600 mt-1">{t.multipleMatchesHint}</div>}
                      <button onClick={() => confirmPayment(match)} disabled={confirmingId === match.invoice.id}
                        className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                        {confirmingId === match.invoice.id ? t.confirmingLabel : t.confirmPaymentButton}
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}

        {/* Kaspi Pay Cashier — deliberately NOT gated behind ap.canAcquiring
            (unlike the BCC/Excel-import sections above): connecting a
            Cashier is free on every plan, only usage is monetized via the
            wallet balance (see /api/kaspi/pay, invoicePayment.ts). Rendered
            in both the locked and unlocked branches for that reason. */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-2">{t.kaspiSectionTitle}</div>
          {!kaspiConnected && <p className="text-xs text-gray-500 mb-2">{t.kaspiIntroText}</p>}
          <p className="text-xs text-gray-500 mb-3">{t.kaspiCommissionHint}</p>
          {profile?.is_admin && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-3">{t.kaspiPlatformConnectionNote}</p>
          )}
          {kaspiError && <p className="text-xs text-red-500 mb-2">{kaspiError}</p>}

          {kaspiConnected ? (
            <>
              {kaspiApiToken && (
                <>
                  <div className="text-xs text-amber-600 mb-2">{t.kaspiTokenShownOnceWarning}</div>
                  <div className="bg-gray-50 rounded-xl p-3 text-xs font-mono break-all mb-3">{kaspiApiToken}</div>
                  <button onClick={() => navigator.clipboard.writeText(kaspiApiToken)}
                    className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium mb-3">
                    {t.kaspiCopyTokenButton}
                  </button>
                </>
              )}

              {kaspiStatus === 'error' && (
                <div className="text-xs text-amber-600 mb-3">{t.kaspiConnectionErrorHint}</div>
              )}

              <div className="text-xs text-gray-500 mb-1">
                {t.kaspiWalletBalanceLabel}: {kaspiWalletBalance.toLocaleString('ru-KZ')} ₸
              </div>
              {kaspiWalletBalance <= 0 && (
                <div className="text-xs text-amber-600 mb-2">{t.kaspiInsufficientBalanceHint}</div>
              )}

              <div className="text-xs text-gray-500 mb-1 mt-2">{t.kaspiTopupPresetsLabel}</div>
              <div className="flex gap-2 flex-wrap mb-2">
                {[1000, 5000, 10000, 50000].map(amount => (
                  <button key={amount}
                    onClick={() => { setKaspiTopupAmount(amount); setKaspiTopupCustom('') }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${kaspiTopupAmount === amount ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                    {amount.toLocaleString('ru-KZ')} ₸
                  </button>
                ))}
              </div>
              <input value={kaspiTopupCustom}
                onChange={e => { setKaspiTopupCustom(e.target.value.replace(/\D/g, '')); setKaspiTopupAmount(null) }}
                placeholder={t.kaspiTopupCustomPlaceholder} type="text" inputMode="numeric"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
              <button onClick={() => startTopup((kaspiTopupAmount ?? Number(kaspiTopupCustom)) || 0)}
                disabled={kaspiToppingUp || !(kaspiTopupAmount || kaspiTopupCustom)}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium mb-3 disabled:opacity-50">
                {kaspiToppingUp ? t.kaspiTopupStartingLabel : t.kaspiTopupButton}
              </button>

              {kaspiTopupPending && (
                <div className="bg-blue-50 rounded-xl p-3 mb-3">
                  <p className="text-xs text-gray-600 mb-2">{t.kaspiTopupPendingHint}</p>
                  <a href={kaspiTopupPending.payment_link} target="_blank" rel="noopener noreferrer"
                    className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium block text-center">
                    {t.kaspiTopupPayLinkLabel}
                  </a>
                </div>
              )}

              {kaspiRecentTopups.length > 0 && (
                <>
                  <div className="text-xs text-gray-500 mb-2 mt-2">{t.kaspiTopupHistoryTitle}</div>
                  <div className="mb-3 -mx-1 max-h-40 overflow-y-auto">
                    {kaspiRecentTopups.map((tp, i) => {
                      const statusLabel = tp.status === 'paid' ? t.kaspiStatusPaid
                        : tp.status === 'pending' ? t.kaspiStatusPending
                        : tp.status === 'expired' ? t.kaspiStatusExpired
                        : t.kaspiStatusFailed
                      const statusColor = tp.status === 'paid' ? 'text-green-600' : tp.status === 'pending' ? 'text-blue-600' : 'text-gray-400'
                      return (
                        <div key={tp.createdAt + i} className="flex items-center justify-between px-1 py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <div className="text-xs text-[#1C2056]">{tp.amount.toLocaleString('ru-KZ')} ₸</div>
                            <div className="text-[10px] text-gray-400">{new Date(tp.createdAt).toLocaleString('ru-KZ')}</div>
                          </div>
                          <div className={`text-xs font-medium ${statusColor}`}>{statusLabel}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <button onClick={disconnectKaspi} disabled={kaspiDisconnecting}
                className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
                {kaspiDisconnecting ? t.kaspiDisconnectingLabel : t.kaspiDisconnectButton}
              </button>
            </>
          ) : !kaspiProcessId ? (
            <>
              <label className="block text-xs text-gray-500 mb-1">{t.kaspiPhoneLabel}</label>
              <input value={kaspiPhone} onChange={e => setKaspiPhone(formatKaspiPhone(e.target.value))} placeholder={t.kaspiPhonePlaceholder}
                type="tel" maxLength={16}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
              <button onClick={sendKaspiCode} disabled={kaspiSending || !kaspiPhone}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {kaspiSending ? t.kaspiSendingCodeLabel : t.kaspiSendCodeButton}
              </button>
            </>
          ) : (
            <>
              <label className="block text-xs text-gray-500 mb-1">{t.kaspiOtpLabel}</label>
              <input value={kaspiOtp} onChange={e => setKaspiOtp(e.target.value)} placeholder={t.kaspiOtpPlaceholder}
                type="text" inputMode="numeric" maxLength={6}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
              <button onClick={verifyKaspiCode} disabled={kaspiVerifying || !kaspiOtp}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {kaspiVerifying ? t.kaspiVerifyingLabel : t.kaspiVerifyButton}
              </button>
            </>
          )}

          <button onClick={() => router.push('/profile/kaspi-pay/docs')}
            className="w-full text-xs text-[#1C2056] underline text-center py-2 mt-2">
            {t.kaspiDocsLinkLabel}
          </button>
        </div>
      </div>

      {/* Breaks out of the max-w-lg column above -- this section is a wide,
          filterable dashboard table and deliberately isn't confined to the
          narrow mobile-first form column the rest of the page uses.
          Gated on kaspiConnected (not rendered unconditionally like an
          earlier version of this section had it): a non-Pro or
          never-connected user has no Kaspi activity to show, and would
          otherwise see an empty table with filter chips sitting right
          under the "Про" lock card above. */}
      {kaspiConnected && (
      <div className="px-4 pb-4 space-y-3">
        {kaspiPendingMatches.length > 0 && (
          <div className="bg-amber-50 rounded-2xl shadow-sm p-4 -mx-1 sm:mx-0 sm:max-w-3xl">
            <div className="text-sm font-medium text-[#1C2056] mb-2">{t.kaspiPendingMatchesTitle}</div>
            {kaspiPendingMatches.map(pm => (
              <div key={pm.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                <div className="text-xs text-gray-600">
                  {pm.matchedAmount.toLocaleString('ru-KZ')} ₸ — {t.kaspiPendingMatchCandidate}: {pm.invoiceNumber} ({pm.clientName || '—'})
                </div>
                <button onClick={() => confirmKaspiPendingMatch(pm.id)} disabled={kaspiConfirmingMatchId === pm.id}
                  className="bg-[#1C2056] text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                  {t.kaspiConfirmMatchButton}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4 -mx-1 sm:mx-0 sm:max-w-3xl">
          <div className="text-sm font-medium text-[#1C2056] mb-3">{t.kaspiHistoryTitle}</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            {(['all', 'in', 'out'] as const).map(d => (
              <button key={d} onClick={() => { setKaspiDirectionFilter(d); loadKaspiOperations(d, kaspiCategoryFilter) }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${kaspiDirectionFilter === d ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                {d === 'all' ? t.kaspiFilterAll : d === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}
              </button>
            ))}
            {(['all', 'platform', 'other'] as const).map(c => (
              <button key={c} onClick={() => { setKaspiCategoryFilter(c); loadKaspiOperations(kaspiDirectionFilter, c) }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${kaspiCategoryFilter === c ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                {c === 'all' ? t.kaspiFilterAll : c === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}
              </button>
            ))}
          </div>

          {kaspiOperations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">{t.kaspiHistoryEmptyLabel}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 text-left border-b border-gray-100">
                    <th className="py-2 pr-3 font-normal">{t.kaspiColDate}</th>
                    <th className="py-2 pr-3 font-normal">{t.kaspiColAmount}</th>
                    <th className="py-2 pr-3 font-normal">{t.kaspiColDirection}</th>
                    <th className="py-2 pr-3 font-normal">{t.kaspiColInvoice}</th>
                    <th className="py-2 font-normal">{t.kaspiColCategory}</th>
                  </tr>
                </thead>
                <tbody>
                  {kaspiOperations.map(op => (
                    <tr key={op.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 text-gray-500">{new Date(op.operationDate).toLocaleString('ru-KZ')}</td>
                      <td className="py-2 pr-3 text-[#1C2056] font-medium">{op.amount.toLocaleString('ru-KZ')} ₸</td>
                      <td className="py-2 pr-3 text-gray-500">{op.direction === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}</td>
                      <td className="py-2 pr-3 text-gray-500">{op.matchedInvoiceNumber || op.clientName || '—'}</td>
                      <td className="py-2 text-gray-500">{op.category === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}
    </main>
  )
}
