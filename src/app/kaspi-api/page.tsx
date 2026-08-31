'use client'
import { useState, useEffect } from 'react'
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
  // Kept so an expired/discarded QR can be replaced with one click for the
  // same amount, instead of sending the founder back up to re-pick a preset.
  const [kaspiLastTopupAmount, setKaspiLastTopupAmount] = useState<number | null>(null)
  const [kaspiTopupJustExpired, setKaspiTopupJustExpired] = useState(false)
  const [kaspiSending, setKaspiSending] = useState(false)
  const [kaspiVerifying, setKaspiVerifying] = useState(false)
  const [kaspiDisconnecting, setKaspiDisconnecting] = useState(false)
  const [kaspiToppingUp, setKaspiToppingUp] = useState(false)
  const [kaspiError, setKaspiError] = useState('')
  const [kaspiRecentTopups, setKaspiRecentTopups] = useState<{ amount: number, status: string, createdAt: string }[]>([])
  type KaspiPeriodStat = { count: number, amount: number, total: number, conversionRate: number | null }
  const [kaspiStats, setKaspiStats] = useState<{ last24h: KaspiPeriodStat, last30d: KaspiPeriodStat, allTime: KaspiPeriodStat } | null>(null)
  const [kaspiOperations, setKaspiOperations] = useState<{ id: string, orderNumber: string, amount: number, direction: string, category: string, clientName: string | null, matchedInvoiceNumber: string | null, operationDate: string }[]>([])
  const [kaspiPendingMatches, setKaspiPendingMatches] = useState<{ id: string, invoiceNumber: string | null, clientName: string | null, invoiceClientName: string | null, matchedAmount: number, matchedDate: string }[]>([])
  const [kaspiDirectionFilter, setKaspiDirectionFilter] = useState<'all' | 'in' | 'out'>('all')
  const [kaspiCategoryFilter, setKaspiCategoryFilter] = useState<'all' | 'platform' | 'other'>('all')
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
      } else if (data.status === 'expired') {
        // A Kaspi payment QR is only valid a few minutes (Kaspi's own
        // ExpireDate, confirmed ~5 min live) AND Kaspi can discard it earlier
        // on its own side (QrTokenDiscarded, mapped to 'expired' the same as
        // a time-out in checkStatus()) -- e.g. after an incomplete scan/open
        // attempt. Either way Kaspi's own scanner then shows a raw "QR-код не
        // распознан" with no way back to us, so surface a clear local retry
        // instead of leaving a dead QR on screen with only the generic error
        // banner at the top of the card.
        clearInterval(interval)
        setKaspiTopupPending(null)
        setKaspiTopupJustExpired(true)
      }
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaspiTopupPending?.topup_id])

  // Live countdown shown under the QR so the founder knows up front when it
  // will go stale, instead of finding out only after Kaspi's own scanner
  // rejects it. Purely informational -- expiry is still decided by the
  // 5s status poll above (Kaspi's real clock, not this tab's), but reaching
  // 0 here also flips the local retry prompt immediately rather than
  // waiting up to 5s more for the next poll.
  useEffect(() => {
    if (!kaspiTopupPending?.expires_at) { setKaspiTopupSecondsLeft(null); return }
    const expiresAtMs = new Date(kaspiTopupPending.expires_at).getTime()
    const tick = () => {
      const secondsLeft = Math.round((expiresAtMs - Date.now()) / 1000)
      setKaspiTopupSecondsLeft(Math.max(0, secondsLeft))
      if (secondsLeft <= 0) setKaspiTopupJustExpired(true)
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

  async function loadKaspiOperations(direction = kaspiDirectionFilter, category = kaspiCategoryFilter) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/kaspi/operations?direction=${direction}&category=${category}`, {
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

  async function startTopup(amount: number) {
    setKaspiError('')
    setKaspiTopupJustExpired(false)
    setKaspiLastTopupAmount(amount)
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
        setKaspiTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link, expires_at: data.expires_at })
      } else if (data.error === 'invalid_amount') {
        setKaspiError(t.kaspiErrorInvalidAmount(data.min || MIN_TOPUP_AMOUNT))
      } else {
        setKaspiError(t.kaspiErrorGeneric)
      }
    } finally {
      setKaspiToppingUp(false)
    }
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      {/* cashier-dev-theme scopes the --nav-* tokens below to the dark
          developer palette (see globals.css) -- only this inner content
          area goes dark; DesktopShell's card and SiteNav's menu strip
          above stay on the normal light app chrome. min-h-screen here
          matches the loaded content's wrapper below so the dark background
          fills the whole page instead of leaving the light page-surface
          showing around a small dark loading box. */}
      <div className="cashier-dev-theme min-h-screen lg:min-h-full" style={{ background: 'var(--nav-bg)' }}>
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
                  <th className="py-2 font-normal">{t.kaspiColCategory}</th>
                </tr>
              </thead>
              <tbody>
                {kaspiOperations.map(op => (
                  <tr key={op.id} style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{new Date(op.operationDate).toLocaleString('ru-KZ')}</td>
                    <td className="py-2 pr-3 font-medium" style={{ color: 'var(--nav-text-primary)' }}>{op.amount.toLocaleString('ru-KZ')} ₸</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.direction === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--nav-text-secondary)' }}>{op.matchedInvoiceNumber || op.clientName || '—'}</td>
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
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
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
          <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiCommissionHint}</p>
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
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.kaspiConversionStatsTitle}</div>
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

              {kaspiTopupPending && (
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--nav-accent-soft)' }}>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.kaspiTopupPendingHint}</p>
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
                  {kaspiTopupSecondsLeft !== null && (
                    <p className="text-[11px] text-center mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.kaspiTopupSecondsLeftLabel(kaspiTopupSecondsLeft)}
                    </p>
                  )}
                </div>
              )}

              {kaspiTopupJustExpired && (
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--nav-teal)' }}>{t.kaspiTopupExpiredError}</p>
                  <button onClick={() => startTopup(kaspiLastTopupAmount ?? 0)}
                    disabled={kaspiToppingUp}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {kaspiToppingUp ? t.kaspiTopupStartingLabel : t.kaspiTopupRetryButton}
                  </button>
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
