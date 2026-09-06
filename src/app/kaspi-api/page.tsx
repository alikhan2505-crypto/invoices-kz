'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { acquiringDict } from '@/lib/i18n/acquiring'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'

// Matches MIN_TOPUP in src/app/api/kaspi/wallet/topup/route.ts — kept here
// too so the button can refuse an obviously-too-small amount before ever
// hitting the API (the server still enforces it independently). Ported
// verbatim from the old /profile/acquiring page's Kaspi Cashier card, which
// this page is extracted from (2026-08-19: Kaspi API split into its own
// standalone section, same as Kaspi Bot and AI-агент).
const MIN_TOPUP_AMOUNT = 1000

// The PDF statement export below builds an HTML string it hands to
// html2pdf.js -- op.clientName is the PAYER's own display name on Kaspi's
// side (not something invoices.kz controls), so it must be escaped before
// interpolation the same as any other untrusted string reaching innerHTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function KaspiApiPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  const [kaspiConnected, setKaspiConnected] = useState(false)
  const [kaspiStatus, setKaspiStatus] = useState<string | null>(null)
  const [kaspiPhone, setKaspiPhone] = useState('')
  const [kaspiOtp, setKaspiOtp] = useState('')
  const [kaspiProcessId, setKaspiProcessId] = useState<string | null>(null)
  const [kaspiApiToken, setKaspiApiToken] = useState<string | null>(null)
  const [kaspiWebhookSecret, setKaspiWebhookSecret] = useState<string | null>(null)
  const [kaspiRegenerating, setKaspiRegenerating] = useState(false)
  const [kaspiWalletBalance, setKaspiWalletBalance] = useState(0)
  const [kaspiTopupAmount, setKaspiTopupAmount] = useState<number | null>(null)
  const [kaspiTopupCustom, setKaspiTopupCustom] = useState('')
  const [kaspiTopupPending, setKaspiTopupPending] = useState<{ topup_id: string, payment_link: string, expires_at: string } | null>(null)
  const [kaspiTopupQrDataUrl, setKaspiTopupQrDataUrl] = useState<string | null>(null)
  const [kaspiTopupSecondsLeft, setKaspiTopupSecondsLeft] = useState<number | null>(null)
  // Kept so an expired/discarded QR is silently replaced with a fresh one
  // for the same amount (see the status-poll effect below), instead of
  // sending the founder back up to re-pick a preset.
  const [kaspiLastTopupAmount, setKaspiLastTopupAmount] = useState<number | null>(null)
  // Pushed-to-phone top-up, the same alternative /upgrade offers. No QR is
  // involved, so kaspiPhoneSent keeps the countdown and the idle/terminal
  // refresh paths (which only make sense for a scannable code) out of it.
  // Deliberately NOT the kaspiPhone above: that one is the merchant's login
  // number for the OTP connect flow, which clears and re-fills on its own.
  const [topupPhone, setTopupPhone] = useState('')
  const [kaspiPhoneOpen, setKaspiPhoneOpen] = useState(false)
  const [kaspiPhoneSending, setKaspiPhoneSending] = useState(false)
  const [kaspiPhoneSent, setKaspiPhoneSent] = useState(false)
  // True once Kaspi reports the push declined/rejected (or it lapsed
  // unanswered) -- a dedicated screen with a "Повторить" button rather than
  // a transient error line under the amount picker.
  const [kaspiPhoneDeclined, setKaspiPhoneDeclined] = useState(false)
  // True once Kaspi's own status reports 'scanning' (its 'Wait' status) --
  // the customer has already opened the QR and is looking at the
  // confirmation screen in their app. Purely informational: the QR is only
  // ever replaced once Kaspi itself reports a terminal 'expired' status
  // (see the poll below), never on a blind timer, so this never gates
  // anything -- it just lets the UI say "confirming" instead of a generic
  // countdown while a real payment attempt may be in progress.
  const [kaspiTopupScanning, setKaspiTopupScanning] = useState(false)
  // Always mirrors kaspiTopupScanning -- read from the 60s idle-refresh
  // timeout below, which needs the LIVE value at fire time, not whatever
  // kaspiTopupScanning was when that effect was set up (its dependency
  // array can't include kaspiTopupScanning without also resetting the
  // 60s clock every time scanning flips).
  const kaspiTopupScanningRef = useRef(false)
  // Incremented on every startTopup() call; a call whose async work
  // resolves after a newer one has already started drops its own result
  // instead of overwriting it -- closes a real race where an auto-refresh
  // triggered by the status poll and a manual "Пополнить" click (or the
  // idle-refresh below) could land in either order and silently show the
  // wrong amount as pending (founder's exact repro: expected 10 000,
  // history showed a leftover 87 777 from an overlapping auto-refresh).
  const kaspiTopupGeneration = useRef(0)
  // When the current kaspiTopupPending was created, for the countdown
  // below to cap its displayed number at the ~60s idle-refresh boundary
  // instead of Kaspi's real (and much longer) ExpireDate -- see that
  // effect's own comment for why showing the real ~5 min was confusing.
  const kaspiTopupCreatedAtRef = useRef(0)
  const [kaspiSending, setKaspiSending] = useState(false)
  const [kaspiVerifying, setKaspiVerifying] = useState(false)
  const [kaspiDisconnecting, setKaspiDisconnecting] = useState(false)
  const [kaspiToppingUp, setKaspiToppingUp] = useState(false)
  const [kaspiError, setKaspiError] = useState('')
  const [kaspiRecentTopups, setKaspiRecentTopups] = useState<{ amount: number, status: string, createdAt: string }[]>([])
  type KaspiPeriodStat = { count: number, amount: number, total: number, conversionRate: number | null }
  const [kaspiStats, setKaspiStats] = useState<{ last24h: KaspiPeriodStat, last30d: KaspiPeriodStat, allTime: KaspiPeriodStat } | null>(null)
  const [kaspiOperations, setKaspiOperations] = useState<{ id: string, orderNumber: string, amount: number, direction: string, category: string, clientName: string | null, matchedInvoiceNumber: string | null, operationDate: string, commissionAmount: number | null }[]>([])
  const [kaspiPendingMatches, setKaspiPendingMatches] = useState<{ id: string, invoiceNumber: string | null, clientName: string | null, invoiceClientName: string | null, matchedAmount: number, matchedDate: string }[]>([])
  const [kaspiDirectionFilter, setKaspiDirectionFilter] = useState<'all' | 'in' | 'out'>('all')
  const [kaspiCategoryFilter, setKaspiCategoryFilter] = useState<'all' | 'platform' | 'other'>('all')
  // Period picker for the statement -- empty means "no lower/upper bound"
  // (today's default view, unchanged from before this feature existed).
  const [kaspiPeriodFrom, setKaspiPeriodFrom] = useState('')
  const [kaspiPeriodTo, setKaspiPeriodTo] = useState('')
  const [kaspiExporting, setKaspiExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const [kaspiConfirmingMatchId, setKaspiConfirmingMatchId] = useState<string | null>(null)
  const [kaspiSyncing, setKaspiSyncing] = useState(false)
  const [kaspiSyncError, setKaspiSyncError] = useState('')
  const [kaspiLastSyncedAt, setKaspiLastSyncedAt] = useState<string | null>(null)

  useEffect(() => {
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
      } else if (data.status === 'scanning') {
        // Kaspi's 'Wait' status -- the customer already opened the QR and is
        // looking at the confirmation screen. Never treat this as expired.
        setKaspiTopupScanning(true)
      } else if (data.status === 'expired' || data.status === 'failed') {
        // A Kaspi payment QR is only valid a few minutes (Kaspi's own
        // ExpireDate, confirmed ~5 min live) AND Kaspi can discard it earlier
        // on its own side (QrTokenDiscarded, mapped to 'expired' the same as
        // a time-out in checkStatus()) -- e.g. after an incomplete scan/open
        // attempt. 'failed' covers the sibling case: the customer scanned
        // (status went 'scanning') and then cancelled/backed out or the
        // payment was rejected (Kaspi's CancelledByUser/NotConfirmedByUser/
        // InsufficientFunds/etc) -- founder's own repro: scanning, then
        // closing the confirmation screen, left the page showing the exact
        // same "QR-код готов" text as if nothing had happened, on a QR that
        // was already just as dead as an expired one. Either way Kaspi's own
        // scanner would show a raw "QR-код не распознан" on any re-scan, so
        // silently request a fresh QR for the same amount the instant Kaspi
        // confirms the old one is gone. This is a terminal-status refresh,
        // not a blind timer -- it only ever fires once Kaspi itself has
        // said the old QR is dead, so it can never yank a QR out from under
        // a customer who's genuinely still mid-scan on it. (The separate
        // idle-refresh effect below DOES use a timer, but only while
        // scanning has never started -- see its own comment.)
        clearInterval(interval)
        setKaspiTopupPending(null)
        setKaspiTopupScanning(false)
        // A pushed phone request has no QR to reissue -- the owner declined it
        // or let it lapse in their Kaspi app. Say so and let them choose again
        // instead of silently pushing another request at their phone.
        if (kaspiPhoneSent) { setKaspiPhoneSent(false); setKaspiPhoneDeclined(true); return }
        startTopup(kaspiLastTopupAmount ?? 0)
      } else {
        setKaspiTopupScanning(false)
      }
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaspiTopupPending?.topup_id])

  useEffect(() => {
    kaspiTopupScanningRef.current = kaspiTopupScanning
  }, [kaspiTopupScanning])

  // Shortens the effective wait on an UNSCANNED QR from Kaspi's own ~5-minute
  // expiry down to ~1 minute of visible inactivity (founder's explicit ask:
  // "время ожидания давай не 5 минут, а 1 минуту"). Reads
  // kaspiTopupScanningRef (not the kaspiTopupScanning state) so this timer
  // doesn't need scanning in its dependency array -- adding it would reset
  // the 60s clock every time scanning flips, which is the opposite of what
  // this needs. Safety: exactly like the terminal-status refresh above,
  // this NEVER fires once scanning has been seen for this topup, even if it
  // later flips back to not-scanning (e.g. a cancelled attempt, which the
  // 5s poll above already catches near-instantly via 'failed') -- a QR
  // someone has genuinely engaged with is never proactively replaced here.
  useEffect(() => {
    // A pushed phone request has no QR and no idle deadline -- it sits in the
    // owner's Kaspi app until they act on it.
    if (!kaspiTopupPending || kaspiPhoneSent) return
    const topupId = kaspiTopupPending.topup_id
    const timeout = setTimeout(async () => {
      if (kaspiTopupScanningRef.current) return
      // force=true settles this row NOW instead of leaving it 'pending' in
      // the DB for up to 24h until the next daily cron sweep -- without
      // this, every idle-refresh cycle orphaned a 'pending' history row
      // that never visibly resolved to "Истёк" (founder's own repro: a
      // history list full of "Ожидает" rows that "should" have expired by
      // now). Still checks the REAL Kaspi status first (never just assumes
      // dead) so a payment that completes in this exact instant is still
      // credited instead of being discarded.
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/kaspi/wallet/topup-status?topup_id=${topupId}&force=true`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.status === 'paid') {
        setKaspiTopupPending(null)
        load()
        return
      }
      // 'scanning' can in principle land here too (the customer started
      // scanning in the exact instant this timeout fired, just ahead of the
      // scanning ref) -- leave the QR alone and let the normal 5s poll
      // above keep driving it, exactly like the ref check does.
      if (data.status === 'scanning') { setKaspiTopupScanning(true); return }
      setKaspiTopupPending(null)
      startTopup(kaspiLastTopupAmount ?? 0)
    }, 60000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaspiTopupPending?.topup_id])

  // Live countdown shown under the QR so the founder knows up front when it
  // will go stale, instead of finding out only after Kaspi's own scanner
  // rejects it. Purely informational -- expiry (and the automatic refresh
  // above) is decided solely by the 5s status poll, i.e. Kaspi's own real
  // clock, never by this countdown reaching 0. Capped at the ~60s
  // idle-refresh boundary (not Kaspi's real ~5min ExpireDate): showing the
  // longer real number was confusing since the idle-refresh silently
  // replaces an unscanned QR well before it, so the countdown used to read
  // "4:56" right as the page was about to swap in a new QR at 0:01 -- the
  // founder's own "время стоит опять 5 мин" report.
  useEffect(() => {
    if (!kaspiTopupPending?.expires_at) { setKaspiTopupSecondsLeft(null); return }
    const expiresAtMs = new Date(kaspiTopupPending.expires_at).getTime()
    const idleDeadlineMs = kaspiTopupCreatedAtRef.current + 60000
    const tick = () => {
      const kaspiSecondsLeft = Math.round((expiresAtMs - Date.now()) / 1000)
      const idleSecondsLeft = Math.round((idleDeadlineMs - Date.now()) / 1000)
      setKaspiTopupSecondsLeft(Math.max(0, Math.min(kaspiSecondsLeft, idleSecondsLeft)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [kaspiTopupPending?.expires_at])

  // Generated client-side (same 'qrcode' package already used for /view/[token]'s
  // Kaspi QR and the ЭЦП verification QR) so the founder can scan and pay
  // without leaving this page for pay.kaspi.kz -- the plain link below still
  // works as a fallback (and is the only option on the same device that's
  // trying to scan its own screen).
  useEffect(() => {
    if (!kaspiTopupPending?.payment_link) { setKaspiTopupQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(kaspiTopupPending.payment_link, { width: 160, margin: 1 })
      .then((url) => { if (!cancelled) setKaspiTopupQrDataUrl(url) })
      .catch(() => {}) // No QR image -- the plain link still works.
    return () => { cancelled = true }
  }, [kaspiTopupPending?.payment_link])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Remember this page so /login (or /auth/callback, for the OAuth/
      // magic-link paths) can send the user back here instead of defaulting
      // to /dashboard -- same mechanism as /kaspi-api/docs's own guard, see
      // src/lib/postLoginRedirect.ts.
      setPostLoginRedirect('/kaspi-api')
      router.push('/login')
      return
    }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    const { data: { session } } = await supabase.auth.getSession()

    // Same reasoning as the old /profile/acquiring page this was extracted
    // from: kaspi_connections has no client-facing RLS policy, and the Kaspi
    // Pay Cashier section is open to every plan, so this is fetched
    // unconditionally.
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
        setKaspiStats(data.stats ?? null)
      }
    } catch (e: any) {
      console.error('Kaspi dashboard fetch error:', e.message)
    }

    await loadKaspiOperations()

    setLoading(false)
  }

  async function loadKaspiOperations(direction = kaspiDirectionFilter, category = kaspiCategoryFilter, from = kaspiPeriodFrom, to = kaspiPeriodTo) {
    const { data: { session } } = await supabase.auth.getSession()
    const params = new URLSearchParams({ direction, category })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/kaspi/operations?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setKaspiOperations(data.operations || [])
      setKaspiPendingMatches(data.pendingMatches || [])
      setKaspiLastSyncedAt(data.lastSyncedAt ?? null)
    }
  }

  async function syncKaspiStatement() {
    setKaspiSyncError('')
    setKaspiSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        setKaspiSyncError(t.kaspiSyncErrorHint)
        return
      }
      // A sync can pay off an invoice and charge commission, not just add
      // rows to the table -- reloading everything keeps the wallet balance
      // and top-up history honest too, not just the operations list.
      await load()
    } catch (e: any) {
      setKaspiSyncError(t.kaspiSyncErrorHint)
    } finally {
      setKaspiSyncing(false)
    }
  }

  // Excel goes through a server route (fetchKaspiOperations there has no
  // 200-row cap, so a wide period export isn't limited to what's currently
  // on screen). PDF is generated client-side instead, from the currently
  // loaded/filtered kaspiOperations -- html2pdf.js (already this codebase's
  // one established HTML->PDF path, see signDocument.ts) needs a real DOM
  // element to render, which is simplest to build from data already in the
  // page rather than adding a second, unproven server-side PDF pipeline.
  async function exportKaspiStatement(format: 'xlsx' | 'pdf') {
    setKaspiExporting(format)
    try {
      if (format === 'xlsx') {
        const { data: { session } } = await supabase.auth.getSession()
        const params = new URLSearchParams({ direction: kaspiDirectionFilter, category: kaspiCategoryFilter })
        if (kaspiPeriodFrom) params.set('from', kaspiPeriodFrom)
        if (kaspiPeriodTo) params.set('to', kaspiPeriodTo)
        const res = await fetch(`/api/kaspi/operations/export?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        })
        if (!res.ok) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `kaspi_vypiska_${new Date().toISOString().slice(0, 10)}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } else {
        const html2pdf = (await import('html2pdf.js')).default
        const rows = kaspiOperations.map(op => `
          <tr>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${new Date(op.operationDate).toLocaleString('ru-KZ')}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.amount.toLocaleString('ru-KZ')} ₸</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.direction === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.matchedInvoiceNumber ? escapeHtml(op.matchedInvoiceNumber) : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.clientName ? escapeHtml(op.clientName) : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.commissionAmount !== null ? `${op.commissionAmount.toLocaleString('ru-KZ')} ₸` : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #ddd;">${op.category === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}</td>
          </tr>`).join('')
        const html = `
          <div style="font-family:Arial,sans-serif;color:#111;padding:16px;">
            <h2 style="margin:0 0 12px;">${t.kaspiHistoryTitle}</h2>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr style="text-align:left;background:#f3f4f6;">
                  <th style="padding:4px 8px;">${t.kaspiColDate}</th>
                  <th style="padding:4px 8px;">${t.kaspiColAmount}</th>
                  <th style="padding:4px 8px;">${t.kaspiColDirection}</th>
                  <th style="padding:4px 8px;">${t.kaspiColInvoice}</th>
                  <th style="padding:4px 8px;">${t.kaspiColClient}</th>
                  <th style="padding:4px 8px;">${t.kaspiColCommission}</th>
                  <th style="padding:4px 8px;">${t.kaspiColCategory}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
        const root = document.createElement('div')
        root.innerHTML = html
        await html2pdf()
          .set({ margin: 8, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } })
          .from(root)
          .save(`kaspi_vypiska_${new Date().toISOString().slice(0, 10)}.pdf`)
      }
    } finally {
      setKaspiExporting(null)
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

  // Same formatting as the phone field in /profile/requisites -- keeps the
  // input's shape consistent across the app rather than accepting anything a
  // user happens to type before it's sent to Kaspi's own entrance API.
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
        // kaspiProcessId is already gone server-side.
        setKaspiError(data.error === 'invalid_otp' ? t.kaspiErrorInvalidOtp : t.kaspiErrorGeneric)
        setKaspiProcessId(null)
        return
      }
      setKaspiApiToken(data.apiToken)
      setKaspiWebhookSecret(data.webhookSecret ?? null)
      setKaspiConnected(true)
      setKaspiStatus('active')
      setKaspiProcessId(null)
    } finally {
      setKaspiVerifying(false)
    }
  }

  async function regenerateKaspiCredentials() {
    if (!confirm(t.kaspiRegenerateConfirm)) return
    setKaspiError('')
    setKaspiRegenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/regenerate-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.apiToken) {
        setKaspiError(t.kaspiErrorGeneric)
        return
      }
      setKaspiApiToken(data.apiToken)
      setKaspiWebhookSecret(data.webhookSecret ?? null)
    } finally {
      setKaspiRegenerating(false)
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
      setKaspiWebhookSecret(null)
    } finally {
      setKaspiDisconnecting(false)
    }
  }

  function formatKzPhone(value: string) {
    const digits = value.replace(/\D/g, '').replace(/^8/, '7')
    if (!digits) return ''
    let out = '+7'
    if (digits.length > 1) out += ' ' + digits.slice(1, 4)
    if (digits.length > 4) out += ' ' + digits.slice(4, 7)
    if (digits.length > 7) out += ' ' + digits.slice(7, 9)
    if (digits.length > 9) out += ' ' + digits.slice(9, 11)
    return out
  }

  async function sendTopupToPhone(amount: number) {
    if (amount < MIN_TOPUP_AMOUNT) return
    setKaspiPhoneSending(true)
    setKaspiError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/wallet/topup-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ amount, phone: topupPhone }),
      })
      const data = await res.json()
      if (res.ok) {
        setKaspiPhoneSent(true)
        setKaspiPhoneDeclined(false)
        setKaspiPhoneOpen(false)
        // No expires_at: a pushed request has no scannable code and no local
        // deadline, so the countdown and refresh effects skip it.
        setKaspiTopupPending({ topup_id: data.topup_id, payment_link: '', expires_at: '' })
      } else if (data.error === 'invalid_phone') {
        setKaspiError(t.kaspiTopupPhoneInvalid)
      } else if (data.error === 'invalid_amount') {
        setKaspiError(t.kaspiErrorInvalidAmount(data.min || MIN_TOPUP_AMOUNT))
      } else {
        setKaspiError(t.kaspiErrorGeneric)
      }
    } catch {
      setKaspiError(t.kaspiErrorGeneric)
    }
    setKaspiPhoneSending(false)
  }

  // A pushed phone request has no Kaspi-side expiry of its own (unlike a QR's
  // ~5 minutes), so without an explicit way out the founder was stuck waiting
  // on the poll to notice a decline -- or, if the push is never touched at
  // all, stuck until the daily cron finally sweeps it a day later. force=true
  // asks Kaspi for the real status first and only then closes the row, so a
  // request paid in this exact instant is still credited rather than
  // discarded.
  async function cancelPhoneTopup() {
    const topupId = kaspiTopupPending?.topup_id
    kaspiTopupGeneration.current++
    setKaspiTopupPending(null)
    setKaspiPhoneSent(false)
    setKaspiError('')
    if (!topupId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/kaspi/wallet/topup-status?topup_id=${topupId}&force=true`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.status === 'paid') load()
    } catch (e: any) {
      console.error('Cancel phone topup: force-settle failed:', e.message)
    }
  }

  async function startTopup(amount: number) {
    // Claim this as the current attempt before the first await -- any
    // earlier call (a stale auto/idle-refresh, a doubled click) whose
    // response lands after this one is now stale and must not overwrite
    // what this call is about to set. See kaspiTopupGeneration's own
    // comment for the bug this closes.
    const myGeneration = ++kaspiTopupGeneration.current
    setKaspiError('')
    setKaspiLastTopupAmount(amount)
    setKaspiTopupScanning(false)
    // A QR attempt supersedes any pushed phone request still on screen.
    setKaspiPhoneSent(false)
    setKaspiPhoneDeclined(false)
    setKaspiToppingUp(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/wallet/topup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (myGeneration !== kaspiTopupGeneration.current) return
      if (res.ok) {
        kaspiTopupCreatedAtRef.current = Date.now()
        setKaspiTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link, expires_at: data.expires_at })
      } else if (data.error === 'invalid_amount') {
        setKaspiError(t.kaspiErrorInvalidAmount(data.min || MIN_TOPUP_AMOUNT))
      } else {
        setKaspiError(t.kaspiErrorGeneric)
      }
    } finally {
      if (myGeneration === kaspiTopupGeneration.current) setKaspiToppingUp(false)
    }
  }

  // Explicit escape hatch for the amount picker being hidden while a topup
  // is pending (see the render below) -- lets the founder back out of an
  // amount he didn't mean to start instead of waiting out the up-to-60s
  // idle-refresh. Bumping the generation here also discards any in-flight
  // startTopup() response for the cancelled attempt.
  function cancelTopup() {
    kaspiTopupGeneration.current++
    setKaspiTopupPending(null)
    setKaspiTopupScanning(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      {/* cashier-dev-theme scopes the --nav-* tokens below to the dark
          developer palette (see globals.css) -- only this inner content
          area goes dark; DesktopShell's card and SiteNav's menu strip
          above stay on the normal light app chrome. Unconditional
          min-h-screen (not lg:min-h-full) -- <main> above only has its own
          min-height, not a definite height, so a percentage-based min-h-full
          resolves to 0 at the lg breakpoint per CSS's percentage-height
          rules, collapsing this div to its text's intrinsic height and
          leaving the app's light ambient background showing below it. */}
      <div className="cashier-dev-theme min-h-screen" style={{ background: 'var(--nav-bg)' }}>
        <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
      </div>
    </main>
    </DesktopShell>
  )

  // 2. Kaspi statement ("Выписка") — every transaction on the connected
  // account, not just ones minted through our own links, plus the manual
  // "sync now" refresh (the daily cron alone is too slow to feel real-time
  // for a customer checking right after a sale). Shown once there's a live
  // connection or something left over from before (a disconnected-but-
  // unresolved case still renders).
  const kaspiStatementSection = (kaspiConnected || kaspiOperations.length > 0 || kaspiPendingMatches.length > 0) && (
    <>
      {kaspiPendingMatches.length > 0 && (
        <div className="nav-glass rounded-2xl p-4" style={{ background: 'var(--nav-accent-soft)' }}>
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.kaspiPendingMatchesTitle}</div>
          {kaspiPendingMatches.map(pm => (
            <div key={pm.id} className="flex items-center justify-between py-2 gap-2" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                <div>{pm.matchedAmount.toLocaleString('ru-KZ')} ₸ — {t.kaspiPendingMatchCandidate}: {pm.invoiceNumber} ({pm.invoiceClientName || '—'})</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiPendingMatchPayerLabel}: {pm.clientName || '—'}</div>
              </div>
              <button onClick={() => confirmKaspiPendingMatch(pm.id)} disabled={kaspiConfirmingMatchId === pm.id}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold flex-shrink-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.kaspiConfirmMatchButton}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="nav-glass nav-card-accent rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.kaspiHistoryTitle}</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>
              {kaspiLastSyncedAt ? t.kaspiLastSyncedLabel(new Date(kaspiLastSyncedAt).toLocaleString('ru-KZ')) : t.kaspiNeverSyncedLabel}
            </span>
            <button onClick={syncKaspiStatement} disabled={kaspiSyncing || !kaspiConnected}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 flex-shrink-0"
              style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
              {kaspiSyncing ? t.kaspiSyncingLabel : t.kaspiSyncButton}
            </button>
          </div>
        </div>
        {kaspiSyncError && <p className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{kaspiSyncError}</p>}
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'in', 'out'] as const).map(d => (
            <button key={d} onClick={() => { setKaspiDirectionFilter(d); loadKaspiOperations(d, kaspiCategoryFilter) }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={kaspiDirectionFilter === d
                ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
              {d === 'all' ? t.kaspiFilterAll : d === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}
            </button>
          ))}
          {(['all', 'platform', 'other'] as const).map(c => (
            <button key={c} onClick={() => { setKaspiCategoryFilter(c); loadKaspiOperations(kaspiDirectionFilter, c) }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={kaspiCategoryFilter === c
                ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
              {c === 'all' ? t.kaspiFilterAll : c === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input type="date" value={kaspiPeriodFrom} max={kaspiPeriodTo || undefined}
            onChange={e => { setKaspiPeriodFrom(e.target.value); loadKaspiOperations(kaspiDirectionFilter, kaspiCategoryFilter, e.target.value, kaspiPeriodTo) }}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }} />
          <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>—</span>
          <input type="date" value={kaspiPeriodTo} min={kaspiPeriodFrom || undefined}
            onChange={e => { setKaspiPeriodTo(e.target.value); loadKaspiOperations(kaspiDirectionFilter, kaspiCategoryFilter, kaspiPeriodFrom, e.target.value) }}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }} />
          {(kaspiPeriodFrom || kaspiPeriodTo) && (
            <button onClick={() => { setKaspiPeriodFrom(''); setKaspiPeriodTo(''); loadKaspiOperations(kaspiDirectionFilter, kaspiCategoryFilter, '', '') }}
              className="text-xs underline flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>
              {t.kaspiPeriodResetButton}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => exportKaspiStatement('xlsx')} disabled={kaspiExporting !== null || kaspiOperations.length === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 flex-shrink-0"
            style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
            {kaspiExporting === 'xlsx' ? t.kaspiExportingLabel : t.kaspiExportExcelButton}
          </button>
          <button onClick={() => exportKaspiStatement('pdf')} disabled={kaspiExporting !== null || kaspiOperations.length === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 flex-shrink-0"
            style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
            {kaspiExporting === 'pdf' ? t.kaspiExportingLabel : t.kaspiExportPdfButton}
          </button>
        </div>

        {kaspiOperations.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiHistoryEmptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: 'var(--nav-text-muted)', borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColDate}</th>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColAmount}</th>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColDirection}</th>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColInvoice}</th>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColClient}</th>
                  <th className="py-2 pr-3 font-normal">{t.kaspiColCommission}</th>
                  <th className="py-2 font-normal">{t.kaspiColCategory}</th>
                </tr>
              </thead>
              <tbody>
                {kaspiOperations.map(op => (
                  <tr key={op.id} style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{new Date(op.operationDate).toLocaleString('ru-KZ')}</td>
                    <td className="py-2 pr-3 font-medium" style={{ color: 'var(--nav-text-primary)' }}>{op.amount.toLocaleString('ru-KZ')} ₸</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.direction === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.matchedInvoiceNumber || '—'}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.clientName || '—'}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.commissionAmount !== null ? `${op.commissionAmount.toLocaleString('ru-KZ')} ₸` : '—'}</td>
                    <td className="py-2" style={{ color: 'var(--nav-text-secondary)' }}>{op.category === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      {/* cashier-dev-theme (see globals.css): scopes --nav-* to the dark
          developer palette shared with /kaspi-api/docs and the public
          /cashier-api landing, so Connection and Documentation read as one
          product under the shared «Подключение | Документация API» menu
          strip above (rendered by SiteNav, outside this dark wrapper --
          the menu itself deliberately keeps its normal light app chrome). */}
      <div className="cashier-dev-theme min-h-screen lg:min-h-full" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-6 pb-12">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>Kaspi Cashier API</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-muted)' }}>Приём оплат Kaspi Pay на вашем сайте — токен, вебхуки, документация</p>

        {/* Kaspi Pay Cashier — deliberately NOT plan-gated: connecting a
            Cashier is free on every plan, only usage is monetized via the
            wallet balance (see /api/kaspi/pay, invoicePayment.ts). */}
        <div className="nav-glass nav-card-accent rounded-2xl p-5">
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.kaspiSectionTitle}</div>
          {!kaspiConnected && <p className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiIntroText}</p>}
          <p className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiCommissionHint}</p>
          {/* Founder feedback (2026-09-01): after connecting, kaspiIntroText's
              own "автоматически получать ссылки на оплату для своих счетов"
              disappears (it's gated on !kaspiConnected above), leaving no
              visible confirmation that Счета already auto-uses this
              connection -- getOrCreateKaspiPaymentForInvoice (invoicePayment.ts)
              mints a Kaspi Pay link for every invoice purely off this
              connection existing, no per-invoice toggle. Shown unconditionally
              (not gated on kaspiConnected) so it answers the question before
              connecting too. */}
          <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiInvoiceAutoNote}</p>
          {profile?.is_admin && (
            <p className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>{t.kaspiPlatformConnectionNote}</p>
          )}
          {kaspiError && <p className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{kaspiError}</p>}

          {kaspiConnected ? (
            <>
              {kaspiApiToken && (
                <>
                  <div className="text-xs mb-2" style={{ color: 'var(--nav-teal)' }}>{t.kaspiTokenShownOnceWarning}</div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiApiTokenLabel}</div>
                  <div className="rounded-xl p-3 text-xs font-mono break-all mb-3" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>{kaspiApiToken}</div>
                  <button onClick={() => navigator.clipboard.writeText(kaspiApiToken)}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {t.kaspiCopyTokenButton}
                  </button>
                </>
              )}
              {kaspiWebhookSecret && (
                <>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiWebhookSecretLabel}</div>
                  <div className="rounded-xl p-3 text-xs font-mono break-all mb-3" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>{kaspiWebhookSecret}</div>
                  <button onClick={() => navigator.clipboard.writeText(kaspiWebhookSecret)}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {t.kaspiCopyTokenButton}
                  </button>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiWebhookSecretHint}</p>
                </>
              )}

              {kaspiStatus === 'error' && (
                <div className="text-xs mb-3" style={{ color: 'var(--nav-teal)' }}>{t.kaspiConnectionErrorHint}</div>
              )}

              <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>
                {t.kaspiWalletBalanceLabel}: {kaspiWalletBalance.toLocaleString('ru-KZ')} ₸
              </div>
              {kaspiWalletBalance <= 0 && (
                <div className="text-xs mb-2" style={{ color: 'var(--nav-teal)' }}>{t.kaspiInsufficientBalanceHint}</div>
              )}

              {kaspiStats && (
                <div className="rounded-xl p-3 mb-3 mt-2" style={{ background: 'var(--nav-surface-glass)' }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.kaspiConversionStatsTitle}</div>
                  {/* Founder feedback (2026-09-01): "не понял, за 24ч было 2
                      платежа а тут нет данных" -- this counts ONLY
                      kaspi_payment_requests (customer paid an invoice/API
                      link), deliberately excluding kaspi_wallet_topups (see
                      /api/kaspi/dashboard's rollup()) -- the founder's 2
                      recent "payments" were both wallet top-ups, so 0 here is
                      correct, just unexplained without this line. */}
                  <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiConversionStatsHint}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      [t.kaspiStatsTodayLabel, kaspiStats.last24h],
                      [t.kaspiStatsMonthLabel, kaspiStats.last30d],
                      [t.kaspiStatsAllTimeLabel, kaspiStats.allTime],
                    ] as const).map(([label, s]) => (
                      <div key={label} className="text-center">
                        <div className="text-[10px] mb-1" style={{ color: 'var(--nav-text-muted)' }}>{label}</div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                          {s.conversionRate !== null ? `${Math.round(s.conversionRate * 100)}%` : '—'}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>
                          {s.total > 0 ? `${s.count}/${s.total}` : t.kaspiConversionNoDataLabel}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!kaspiTopupPending && !kaspiPhoneDeclined && (
                <>
                  {/* Founder feedback (2026-09-01), 3rd recurrence of the same
                      confusion (Выписка commission column, wallet widget
                      history, now here): a top-up itself is never
                      commission-bearing (creditWallet in wallet.ts credits
                      the full amount) -- only a REAL customer payment settled
                      via checkAndSettleKaspiPayment debits the 2%. Spelled
                      out explicitly right where the amount is chosen, not
                      just implied by kaspiCommissionHint above. */}
                  <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupNoFeeHint}</p>
                  <div className="text-xs mb-1 mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupPresetsLabel}</div>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {[1000, 5000, 10000, 50000].map(amount => (
                      <button key={amount}
                        onClick={() => { setKaspiTopupAmount(amount); setKaspiTopupCustom('') }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={kaspiTopupAmount === amount
                          ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                          : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                        {amount.toLocaleString('ru-KZ')} ₸
                      </button>
                    ))}
                  </div>
                  <input value={kaspiTopupCustom}
                    onChange={e => { setKaspiTopupCustom(e.target.value.replace(/\D/g, '')); setKaspiTopupAmount(null) }}
                    placeholder={t.kaspiTopupCustomPlaceholder} type="text" inputMode="numeric"
                    className="w-full py-2 text-sm outline-none mb-1 bg-transparent"
                    style={{ borderBottom: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }} />
                  {kaspiTopupCustom !== '' && Number(kaspiTopupCustom) < MIN_TOPUP_AMOUNT && (
                    <div className="text-xs mb-2" style={{ color: 'var(--nav-teal)' }}>{t.kaspiErrorInvalidAmount(MIN_TOPUP_AMOUNT)}</div>
                  )}
                  <button onClick={() => startTopup((kaspiTopupAmount ?? Number(kaspiTopupCustom)) || 0)}
                    disabled={kaspiToppingUp || !((kaspiTopupAmount ?? Number(kaspiTopupCustom)) >= MIN_TOPUP_AMOUNT)}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3 disabled:opacity-50"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {kaspiToppingUp ? t.kaspiTopupStartingLabel : t.kaspiTopupButton}
                  </button>

                  {/* The QR above assumes a second device to scan with. On the
                      phone that actually has Kaspi installed there is nothing
                      to point a camera at, so offer the pushed request the
                      subscription page has always had. */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupOrLabel}</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                  </div>

                  {kaspiPhoneOpen ? (
                    <>
                      <input value={topupPhone}
                        onChange={e => setTopupPhone(formatKzPhone(e.target.value))}
                        placeholder={t.kaspiTopupPhonePlaceholder} type="tel" inputMode="tel"
                        className="w-full py-2 text-sm outline-none mb-2 bg-transparent"
                        style={{ borderBottom: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }} />
                      <button
                        onClick={() => sendTopupToPhone((kaspiTopupAmount ?? Number(kaspiTopupCustom)) || 0)}
                        disabled={kaspiPhoneSending
                          || !((kaspiTopupAmount ?? Number(kaspiTopupCustom)) >= MIN_TOPUP_AMOUNT)
                          || topupPhone.replace(/\D/g, "").length !== 11}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3 disabled:opacity-50"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {kaspiPhoneSending ? t.kaspiTopupPhoneSending : t.kaspiTopupPhoneSend}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setKaspiPhoneOpen(true)}
                      disabled={!((kaspiTopupAmount ?? Number(kaspiTopupCustom)) >= MIN_TOPUP_AMOUNT)}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3 border disabled:opacity-50"
                      style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-accent)', background: 'transparent' }}>
                      {t.kaspiTopupPhoneButton}
                    </button>
                  )}
                </>
              )}

              {!kaspiTopupPending && kaspiPhoneDeclined && (
                <div className="rounded-xl p-4 mb-3 text-center" style={{ background: 'var(--nav-accent-soft)' }}>
                  <div className="text-2xl mb-2">🚫</div>
                  <p className="text-sm mb-3" style={{ color: 'var(--nav-text-primary)' }}>
                    {t.kaspiTopupPhoneDeclinedLabel}
                  </p>
                  <button onClick={() => { setKaspiPhoneDeclined(false); setKaspiPhoneOpen(true) }}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {t.kaspiTopupPhoneRetryButton}
                  </button>
                </div>
              )}

              {kaspiTopupPending && kaspiPhoneSent && (
                <div className="rounded-xl p-4 mb-3 text-center" style={{ background: 'var(--nav-accent-soft)' }}>
                  <div className="text-2xl mb-2">📲</div>
                  <p className="text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                    {t.kaspiTopupPhoneSentTitle(topupPhone)}
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                    {t.kaspiTopupPhoneSentHint}
                  </p>
                  <button onClick={cancelPhoneTopup}
                    className="w-full text-center text-[11px] underline"
                    style={{ color: 'var(--nav-text-muted)' }}>
                    {t.kaspiTopupPhoneCancelButton}
                  </button>
                </div>
              )}

              {kaspiTopupPending && !kaspiPhoneSent && (
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--nav-accent-soft)' }}>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                    {kaspiTopupScanning ? t.kaspiTopupScanningLabel : t.kaspiTopupPendingHint}
                  </p>
                  {kaspiTopupQrDataUrl && (
                    <div className="flex justify-center mb-3">
                      <img src={kaspiTopupQrDataUrl} alt="Kaspi QR" className="w-40 h-40 rounded-lg" style={{ background: '#fff', padding: 8 }} />
                    </div>
                  )}
                  <a href={kaspiTopupPending.payment_link} target="_blank" rel="noopener noreferrer"
                    className="w-full rounded-xl py-2.5 text-sm font-semibold block text-center"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {t.kaspiTopupPayLinkLabel}
                  </a>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupPayLinkHint}</p>
                  {kaspiTopupSecondsLeft !== null && !kaspiTopupScanning && (
                    <p className="text-[11px] text-center mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.kaspiTopupSecondsLeftLabel(kaspiTopupSecondsLeft)}
                    </p>
                  )}
                  {!kaspiTopupScanning && (
                    <>
                      <button onClick={cancelTopup}
                        className="w-full text-center text-[11px] mt-2 underline"
                        style={{ color: 'var(--nav-text-muted)' }}>
                        {t.kaspiTopupCancelButton}
                      </button>

                      {/* Same divider-plus-button treatment the amount-picker
                          screen uses for this choice (see below) -- without
                          this, this screen was the only one of the three
                          payment surfaces where switching to the phone
                          alternative wasn't offered directly next to the QR. */}
                      <div className="flex items-center gap-2 my-2">
                        <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                        <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupOrLabel}</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                      </div>
                      <button onClick={() => { cancelTopup(); setKaspiPhoneOpen(true) }}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold border"
                        style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-accent)', background: 'transparent' }}>
                        {t.kaspiTopupPhoneButton}
                      </button>
                    </>
                  )}
                </div>
              )}

              {kaspiRecentTopups.length > 0 && (
                <>
                  <div className="text-xs mb-2 mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiTopupHistoryTitle}</div>
                  <div className="mb-3 -mx-1 max-h-40 overflow-y-auto">
                    {kaspiRecentTopups.map((tp, i) => {
                      const statusLabel = tp.status === 'paid' ? t.kaspiStatusPaid
                        : tp.status === 'pending' ? t.kaspiStatusPending
                        : tp.status === 'expired' ? t.kaspiStatusExpired
                        : t.kaspiStatusFailed
                      const statusColor = tp.status === 'paid' ? 'var(--nav-success)' : tp.status === 'pending' ? 'var(--nav-accent)' : 'var(--nav-text-muted)'
                      return (
                        <div key={tp.createdAt + i} className="flex items-center justify-between px-1 py-2" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                          <div>
                            <div className="text-xs" style={{ color: 'var(--nav-text-primary)' }}>{tp.amount.toLocaleString('ru-KZ')} ₸</div>
                            <div className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>{new Date(tp.createdAt).toLocaleString('ru-KZ')}</div>
                          </div>
                          <div className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <button onClick={regenerateKaspiCredentials} disabled={kaspiRegenerating}
                className="w-full rounded-xl py-2.5 text-sm font-semibold mb-3"
                style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                {kaspiRegenerating ? t.kaspiRegeneratingLabel : t.kaspiRegenerateButton}
              </button>

              <button onClick={disconnectKaspi} disabled={kaspiDisconnecting}
                className="w-full rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                {kaspiDisconnecting ? t.kaspiDisconnectingLabel : t.kaspiDisconnectButton}
              </button>
            </>
          ) : !kaspiProcessId ? (
            <>
              <label className="block text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiPhoneLabel}</label>
              <input value={kaspiPhone} onChange={e => setKaspiPhone(formatKaspiPhone(e.target.value))} placeholder={t.kaspiPhonePlaceholder}
                type="tel" maxLength={16}
                className="w-full py-2 text-sm outline-none mb-3 bg-transparent"
                style={{ borderBottom: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }} />
              <button onClick={sendKaspiCode} disabled={kaspiSending || !kaspiPhone}
                className="w-full rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {kaspiSending ? t.kaspiSendingCodeLabel : t.kaspiSendCodeButton}
              </button>
            </>
          ) : (
            <>
              <label className="block text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiOtpLabel}</label>
              <input value={kaspiOtp} onChange={e => setKaspiOtp(e.target.value)} placeholder={t.kaspiOtpPlaceholder}
                type="text" inputMode="numeric" maxLength={6}
                className="w-full py-2 text-sm outline-none mb-3 bg-transparent"
                style={{ borderBottom: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }} />
              <button onClick={verifyKaspiCode} disabled={kaspiVerifying || !kaspiOtp}
                className="w-full rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {kaspiVerifying ? t.kaspiVerifyingLabel : t.kaspiVerifyButton}
              </button>
            </>
          )}

          <p className="text-xs text-center mt-3 mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiDocsHint}</p>
          <button onClick={() => router.push('/kaspi-api/docs')}
            className="w-full text-xs underline text-center py-2" style={{ color: 'var(--nav-accent)' }}>
            {t.kaspiDocsLinkLabel}
          </button>
        </div>
      </div>

      {kaspiStatementSection && (
        <div className="max-w-3xl mx-auto px-6 pb-16 space-y-3">
          {kaspiStatementSection}
        </div>
      )}
      </div>
    </main>
    </DesktopShell>
  )
}
