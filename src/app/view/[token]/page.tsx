'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { formatDate, formatDateSafe } from '@/lib/date'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { getActivePlan } from '@/lib/plan'
import { useLanguage } from '@/components/LanguageProvider'
import { historyDict } from '@/lib/i18n/history'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import SignatureSection from '@/components/SignatureSection'

// Flat solid-fill status badges -- same approved treatment used across the
// app (dashboard/history/invoice-detail's statusFill), swapped in here for
// the old soft-tint bg-x-100/text-x-700 map so a payer sees the same status
// language as the invoice owner does.
const statusFill: Record<string, string> = {
  paid: 'var(--nav-success)',
  sent: 'var(--nav-accent)',
  viewed: 'var(--nav-teal)',
  overdue: 'var(--nav-critical)',
  draft: 'var(--nav-text-muted)',
  cancelled: 'var(--nav-text-muted)',
}

function LogoMark() {
  return (
    <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
  )
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L16 10" />
    </svg>
  )
}

function SadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 15c1-1.3 2.5-2 4-2s3 .7 4 2" />
      <path d="M9 9h.01M15 9h.01" />
    </svg>
  )
}

// How long an untouched QR is shown before it is retired for a fresh one.
// Kaspi's own window is ~5 minutes; the founder asked for a minute, and
// /kaspi-api and /upgrade already work this way.
const IDLE_QR_MS = 60_000

export default function PublicInvoice() {
  const { token: rawToken } = useParams()
  // useParams can hand back string | string[] | undefined; every use below
  // (and the API path it's interpolated into) wants a plain string.
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken ?? ''
  const { lang } = useLanguage()
  const t = historyDict[lang]
  const tFlow = invoiceFlowDict[lang]
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [kaspiPayment, setKaspiPayment] = useState<
    { qr_token: string; payment_link: string; status: string; expires_at?: string | null; live?: string } | null
  >(null)
  // Kaspi's own 'Wait' status: the payer is on the confirmation screen. While
  // it holds, neither the idle timer nor the countdown may replace the code.
  const [kaspiScanning, setKaspiScanning] = useState(false)
  const kaspiScanningRef = useRef(false)
  const kaspiCreatedAtRef = useRef<number>(0)
  // A Kaspi QR is only good for a few minutes. Nothing here said so, so a payer
  // who left the tab open came back to a code their Kaspi app answered with
  // "QR-код не распознан" and no hint that anything was wrong. The 5s poll
  // already replaces a spent code (the API mints a fresh one); this is what
  // makes the deadline visible while it runs.
  const [kaspiSecondsLeft, setKaspiSecondsLeft] = useState<number | null>(null)
  const [kaspiPaymentLoading, setKaspiPaymentLoading] = useState(true)
  const [kaspiQrDataUrl, setKaspiQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [marked, setMarked] = useState(false)

  useEffect(() => {
    async function load() {
      // Server-side lookup by token (2026-09-04). The browser no longer
      // queries Supabase directly here: doing so required an RLS policy that
      // let anonymous clients read every invoice/profile/bank row carrying a
      // share token, which turned out to be dumpable wholesale with the
      // public anon key. See src/app/api/public/invoice/[token]/route.ts.
      const res = await fetch(`/api/public/invoice/${encodeURIComponent(token)}`)
      if (!res.ok) { setLoading(false); return }
      const { invoice: inv, profile: loadedProfile, bank: loadedBank } = await res.json()
      if (!inv) { setLoading(false); return }
      setInvoice(inv)

      // Fired immediately, in parallel with the profile/bank queries below
      // rather than after them — this hits Kaspi's own API to mint a live QR,
      // which is the slowest thing on this page, so every millisecond it
      // isn't queued behind unrelated Supabase reads is visible to the payer.
      // Best-effort, non-blocking — a Kaspi lookup failure shouldn't stop the
      // invoice itself from rendering; the client still has bank requisites.
      fetch(`/api/kaspi/invoice-payment?token=${token}`)
        .then(r => r.json())
        .then((data) => {
          kaspiCreatedAtRef.current = Date.now()
          setKaspiPayment(data.payment || null)
        })
        .catch(() => {})
        .finally(() => setKaspiPaymentLoading(false))

      // The sent -> viewed flip now happens server-side inside the route
      // above (it needs to write, and there is no public UPDATE policy), so
      // only the owner's notification is left to fire from here.
      if (inv.status === 'viewed') {
        // Best-effort — viewing the invoice shouldn't block on this.
        fetch('/api/notify-viewed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: inv.id }),
        }).catch(() => {})
      }

      // Profile (with signature/stamp) and bank requisites come back with the
      // invoice in one response -- picked server-side by the same rules as
      // before: the invoice's own bank if it has one, otherwise the owner's
      // main account.
      setProfile(loadedProfile)
      setBank(loadedBank)

      setLoading(false)
    }
    load()
  }, [])

  // Generated client-side (same 'qrcode' package already used for the ЭЦП
  // verification QR) rather than sending this single-use payment link to a
  // third-party QR-rendering API on every anonymous page view.
  useEffect(() => {
    if (!kaspiPayment?.payment_link) { setKaspiQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(kaspiPayment.payment_link, { width: 120, margin: 1 })
      .then((url) => { if (!cancelled) setKaspiQrDataUrl(url) })
      .catch(() => {}) // No QR image — the plain link still works.
    return () => { cancelled = true }
  }, [kaspiPayment?.payment_link])

  // Ticks the visible deadline down, showing the nearer of Kaspi's own expiry
  // and the 60s idle deadline -- the same number /kaspi-api shows, so the
  // countdown never reads "4:56" a second before the code is swapped out.
  // Purely informational: replacing a spent code is decided by the poll and
  // the idle timer below against Kaspi's real status, never by this hitting
  // zero, so a slow clock or a backgrounded tab can't discard a live QR.
  useEffect(() => {
    if (!kaspiPayment?.expires_at || kaspiPayment.status !== 'pending') { setKaspiSecondsLeft(null); return }
    const expiresAtMs = new Date(kaspiPayment.expires_at).getTime()
    const idleDeadlineMs = kaspiCreatedAtRef.current + IDLE_QR_MS
    const tick = () => {
      const kaspiLeft = Math.round((expiresAtMs - Date.now()) / 1000)
      const idleLeft = Math.round((idleDeadlineMs - Date.now()) / 1000)
      setKaspiSecondsLeft(Math.max(0, kaspiScanningRef.current ? kaspiLeft : Math.min(kaspiLeft, idleLeft)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [kaspiPayment?.expires_at, kaspiPayment?.status])

  // Retires a code nobody has touched after 60 seconds instead of making the
  // payer wait out Kaspi's full ~5 minutes -- the behaviour /kaspi-api has had
  // since the founder asked for it. Never fires while scanning is in progress.
  useEffect(() => {
    if (!kaspiPayment || kaspiPayment.status !== 'pending' || !token) return
    const link = kaspiPayment.payment_link
    const timeout = setTimeout(async () => {
      if (kaspiScanningRef.current) return
      try {
        const res = await fetch(`/api/kaspi/invoice-payment?token=${token}&idle=true`)
        const data = await res.json()
        // Guard against a timer left over from a code that has already been
        // replaced by the 5s poll.
        if (data.payment && data.payment.payment_link !== link) kaspiCreatedAtRef.current = Date.now()
        setKaspiPayment(data.payment || null)
      } catch {
        // The 5s poll keeps running; the next tick tries again.
      }
    }, IDLE_QR_MS)
    return () => clearTimeout(timeout)
  }, [kaspiPayment?.payment_link, kaspiPayment?.status, token])

  // Kaspi has no webhook to us, so the only way to learn a QR got paid is to
  // actively ask while the payer is here — this is what makes payment
  // confirmation instant and click-free without needing a frequent cron
  // (Vercel's free plan only allows once-a-day crons; see the daily
  // kaspi-poll cron for the safety net that catches everything this misses).
  // Capped at 150 polls (~12.5 min) so an abandoned tab doesn't poll forever.
  const kaspiPollCount = useRef(0)
  useEffect(() => {
    // Keeps polling while there is NO payment too. The server can briefly have
    // none to give -- the per-invoice mint cap is three a minute, so a page
    // that has churned through codes gets a null for a few seconds. Stopping
    // the poll there (the previous behaviour) made that gap permanent: the
    // Kaspi block disappeared and only a manual reload brought it back. The
    // 150-tick cap still stops an abandoned tab.
    if (kaspiPaymentLoading || invoice?.status === 'paid' || invoice?.status === 'cancelled' || !token) return
    if (kaspiPayment && kaspiPayment.status !== 'pending') return
    kaspiPollCount.current = 0
    const interval = setInterval(async () => {
      kaspiPollCount.current++
      if (kaspiPollCount.current > 150) { clearInterval(interval); return }
      try {
        const res = await fetch(`/api/kaspi/invoice-payment?token=${token}`)
        const data = await res.json()
        const scanning = data.payment?.live === 'scanning'
        setKaspiScanning(scanning)
        kaspiScanningRef.current = scanning
        // A replaced code restarts the 60s idle clock; the same one must not.
        setKaspiPayment((prev) => {
          if (data.payment && prev?.payment_link !== data.payment.payment_link) {
            kaspiCreatedAtRef.current = Date.now()
          }
          return data.payment || null
        })
        if (data.payment?.status === 'paid') {
          setInvoice((prev: any) => (prev ? { ...prev, status: 'paid' } : prev))
        }
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => clearInterval(interval)
    // kaspiPayment itself is deliberately not a dependency: the poll rewrites
    // it every tick, and depending on it would tear down and rebuild the
    // interval each time (resetting the 150-tick cap along with it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaspiPayment?.status, kaspiPaymentLoading, invoice?.status, token])

  async function markAsPaid() {
    if (!confirm(t.confirmPaymentConfirm)) return
    setMarking(true)
    // Goes through the server keyed by the share token: the browser has no
    // write access to invoices any more (and never really did -- the old
    // anon UPDATE was silently refused by RLS, so this button used to do
    // nothing at all for the recipient).
    await fetch(`/api/public/invoice/${encodeURIComponent(token)}/paid`, { method: 'POST' }).catch(() => {})
    setMarked(true)
    setMarking(false)
    // Best-effort — the client's "paid" confirmation shouldn't block on this.
    fetch('/api/notify-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invoice.id }),
    }).catch(() => {})
  }

  async function openPDF() {
    if (!invoice) return
    const invoiceServices = invoice.services || [{ name: t.defaultServiceName, qty: 1, price: invoice.amount }]
    const win = window.open('', '_blank')
    const html = await generateInvoicePDF({
      number: invoice.number,
      date: formatDate(invoice.created_at),
      clientName: invoice.client_name || '',
      clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '',
      clientAddress: invoice.client_address || '',
      contractNumber: invoice.contract_number || '',
      contractDate: invoice.contract_date ? formatDateSafe(invoice.contract_date) : undefined,
      knp: invoice.knp || '849',
      services: invoiceServices,
      total: Number(invoice.amount),
      note: displayNote || '',
      profile: {
        company_name: profile?.company_name || '',
        bin_iin: profile?.bin_iin || '',
        address: profile?.address || '',
        director_name: profile?.director_name || '',
        signature_url: profile?.signature_url || '',
        stamp_url: profile?.stamp_url || '',
      },
      bank: bank ? {
        bank_name: bank.bank_name,
        iik: bank.iik,
        bik: bank.bik,
        kbe: bank.kbe,
      } : undefined,
      dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
      showWatermark: !getActivePlan(profile).isActive,
      autoPrint: false,
    })
  if (win) { win.document.write(html); win.document.close() }
}
  if (loading) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--nav-bg)' }}>
      <p style={{ color: 'var(--nav-text-muted)' }}>{t.loadingLabel}</p>
    </main>
  )

  if (!invoice) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--nav-bg)' }}>
      <div className="text-center">
        <div className="flex justify-center mb-3" style={{ color: 'var(--nav-text-muted)' }}><SadIcon /></div>
        <p style={{ color: 'var(--nav-text-muted)' }}>{t.invoiceNotFoundLabel}</p>
      </div>
    </main>
  )

  const services = invoice.services || []
  const total = Number(invoice.amount)
  const statusLabels = t.statusLabels
  // Older invoices carry a static "Оплата в течение Nх дней" note from before
  // due-date-based notes existed -- always show the due-date-derived sentence
  // when a due date is on record, same as the owner's own invoice-detail view.
  const displayNote = invoice.due_date ? tFlow.paymentDueNote(formatDate(invoice.due_date)) : invoice.note

  return (
    <main className="min-h-screen pb-8" style={{ background: 'var(--nav-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-semibold text-sm" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>invoices.kz</span>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ background: statusFill[invoice.status] || statusFill.draft }}>
          {statusLabels[invoice.status] || statusLabels.draft}
        </span>
      </div>

      <div className="max-w-lg mx-auto p-4 pt-0 space-y-4">

        {/* Invoice header */}
        <div className="nav-glass nav-card-accent rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.invoiceForPaymentLabel}</div>
              <div className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{invoice.number}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(invoice.created_at)}</div>
              {invoice.due_date && (
                <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.dueDateLabel}: {formatDate(invoice.due_date)}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                {total.toLocaleString('ru-KZ')} ₸
              </div>
            </div>
          </div>

          {/* From */}
          <div className="pt-4 mb-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.fromLabel}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{profile?.company_name}</div>
            {profile?.bin_iin && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.binLabel(profile.bin_iin)}</div>}
            {profile?.address && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{profile.address}</div>}
            {profile?.phone && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{profile.phone}</div>}
          </div>

          {/* To */}
          <div className="pt-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.toLabel}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{invoice.client_name}</div>
            {invoice.client_bin && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.binLabel(invoice.client_bin)}</div>}
            {invoice.client_email && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{invoice.client_email}</div>}
          </div>
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div className="nav-glass nav-card-accent rounded-2xl overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{t.servicesHeaderLabel}</div>
            {services.map((s: any, i: number) => (
              <div key={i} className="flex justify-between px-4 py-3" style={{ borderBottom: i < services.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                <div>
                  <div className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{s.name}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    {s.qty} {s.unit || t.defaultUnitLabel} × {Number(s.price).toLocaleString('ru-KZ')} ₸
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                  {(s.qty * s.price).toLocaleString('ru-KZ')} ₸
                </div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3" style={{ borderTop: '1px solid var(--nav-border-soft)', background: 'var(--nav-surface-glass)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.totalDueLabel}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{total.toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
        )}

        {/* Note */}
        {displayNote && (
          <div className="nav-glass nav-card-accent rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.noteLabel}</div>
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{displayNote}</div>
          </div>
        )}

        {/* Kaspi payment — brief loading hint while the live QR is still being
            minted against Kaspi's own API (the slowest thing on this page),
            so the gap doesn't read as "there's no Kaspi option here". */}
        {kaspiPaymentLoading && !kaspiPayment && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
          <div className="nav-glass nav-card-accent rounded-2xl p-4 flex items-center gap-2">
            <div className="w-4 h-4 rounded-full animate-spin flex-shrink-0" style={{ border: '2px solid var(--nav-border-soft)', borderTopColor: 'var(--nav-accent)' }} />
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Проверяем возможность оплаты через Kaspi...</span>
          </div>
        )}

        {kaspiPayment && kaspiPayment.status === 'pending' && (
          <div className="nav-glass nav-card-accent rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-muted)' }}>Оплата через Kaspi</div>
            <div className="flex items-center gap-4 mb-4">
              {kaspiQrDataUrl && (
                <img
                  src={kaspiQrDataUrl}
                  alt="Kaspi QR"
                  className="w-28 h-28 flex-shrink-0 rounded-lg"
                />
              )}
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                Отсканируйте QR-код камерой телефона или нажмите кнопку ниже, чтобы оплатить через приложение Kaspi.
              </div>
            </div>
            <a
              href={kaspiPayment.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block text-center text-white rounded-xl py-3.5 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5"
              style={{ background: '#E4171F' }}
            >
              Оплатить через Kaspi
            </a>
            <div className="text-xs text-center mt-3 h-4" aria-live="polite" style={{ color: 'var(--nav-text-muted)' }}>
              {kaspiScanning
                ? 'Подтвердите оплату в приложении Kaspi…'
                : kaspiSecondsLeft === null
                  ? ''
                  : kaspiSecondsLeft > 0
                    ? `QR действителен ещё ${Math.floor(kaspiSecondsLeft / 60)}:${String(kaspiSecondsLeft % 60).padStart(2, '0')}`
                    : 'Обновляем код…'}
            </div>
            <div className="text-xs text-center mt-3" style={{ color: 'var(--nav-text-muted)' }}>
              Счёт подтвердится автоматически сразу после оплаты — обновлять страницу не нужно.
            </div>
          </div>
        )}

        {/* Bank details */}
        {bank && (
          <div className="nav-glass nav-card-accent rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.paymentDetailsHeader}</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.bankLabel}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--nav-text-primary)' }}>{bank.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.iikLabel}</span>
                <span className="text-xs font-medium font-mono" style={{ color: 'var(--nav-text-primary)' }}>{bank.iik}</span>
              </div>
              {bank.bik && (
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.bikLabel}</span>
                  <span className="text-xs font-medium font-mono" style={{ color: 'var(--nav-text-primary)' }}>{bank.bik}</span>
                </div>
              )}
              {bank.kbe && (
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.kbeLabel}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--nav-text-primary)' }}>{bank.kbe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Инструкция */}
        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && !marked && (
          <div className="nav-glass nav-card-accent rounded-2xl p-4">
            <div className="text-sm font-medium mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.howToPayHeader}</div>
            <div className="space-y-2">
              {[
                { step: '1', text: t.step1Text },
                { step: '2', text: t.step2Text },
                { step: '3', text: t.step3Text },
              ].map(item => (
                <div key={item.step} className="flex gap-2 items-start">
                  <div className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold" style={{ background: 'var(--nav-accent)' }}>
                    {item.step}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Коннекторы — оплата и соцсети. Static kaspi_pay_link is the old
            manual-link fallback — shown only when there's no live Kaspi
            Cashier QR on this invoice, so the payer never sees two
            competing "pay via Kaspi" buttons. */}
        {(!(kaspiPayment && kaspiPayment.status === 'pending') && profile?.kaspi_pay_link || profile?.halyk_pay_link || profile?.website || profile?.social_links?.length > 0) && (
          <div className="nav-glass nav-card-accent rounded-2xl p-4 space-y-3">
            {!(kaspiPayment && kaspiPayment.status === 'pending') && profile?.kaspi_pay_link && (
              <a href={profile.kaspi_pay_link} target="_blank" rel="noopener noreferrer"
                className="w-full text-white rounded-xl py-3.5 font-medium text-sm flex items-center justify-center gap-2 block text-center transition-transform duration-150 hover:-translate-y-0.5"
                style={{ background: '#F5A623' }}>
                {t.payViaKaspiButton}
              </a>
            )}
            {profile?.halyk_pay_link && (
              <a href={profile.halyk_pay_link} target="_blank" rel="noopener noreferrer"
                className="w-full text-white rounded-xl py-3.5 font-medium text-sm flex items-center justify-center gap-2 block text-center transition-transform duration-150 hover:-translate-y-0.5"
                style={{ background: 'var(--nav-success)' }}>
                {t.payViaHalykButton}
              </a>
            )}
            {(profile?.website || profile?.social_links?.length > 0) && (
              <div className="flex gap-2 flex-wrap pt-1">
                {profile?.website && (
                   <a href={profile.website.startsWith('http') ? profile.website : 'https://' + profile.website} target="_blank"
                    className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                    {t.websiteLinkLabel}
                  </a>
                )}
                {(profile?.social_links || []).map((link: string, i: number) => {
                  const icons: Record<string, string> = { instagram: '📸', facebook: '👤', tiktok: '🎵', youtube: '▶️', telegram: '✈️', twitter: '🐦', linkedin: '💼', '2gis': '📍', whatsapp: '💬' }
                  const names: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', twitter: 'Twitter', linkedin: 'LinkedIn', '2gis': '2GIS', whatsapp: 'WhatsApp' }
                  const key = Object.keys(icons).find(k => link.includes(k)) || ''
                  return (
                    <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                      {icons[key] || '🔗'} {names[key] || t.linkFallbackLabel}
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
          <div className="space-y-3">
            {marked ? (
              <div className="nav-glass nav-card-accent rounded-2xl p-5 text-center">
                <div className="flex justify-center mb-2" style={{ color: 'var(--nav-success)' }}><CheckCircleIcon /></div>
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--nav-success)' }}>{t.paymentConfirmedThanksLabel}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.supplierNotifiedLabel}</div>
              </div>
            ) : (
              <>
                {/* Главная кнопка — открыть PDF */}
                <button
                  onClick={openPDF}
                  className="w-full rounded-xl py-4 font-medium text-sm flex items-center justify-center gap-2 transition-transform duration-150 hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  <DocIcon /> {t.openInvoicePdfButton}
                </button>

                {/* Вторая кнопка — подтвердить оплату */}
                <button
                  onClick={markAsPaid}
                  disabled={marking}
                  className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 disabled:hover:translate-y-0"
                  style={{ background: 'var(--nav-success)', color: '#fff' }}>
                  {marking ? t.processingButtonLabel : t.alreadyPaidButton}
                </button>
              </>
            )}
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="nav-glass nav-card-accent rounded-2xl p-5 text-center">
            <div className="flex justify-center mb-2" style={{ color: 'var(--nav-success)' }}><CheckCircleIcon /></div>
            <div className="text-sm font-medium" style={{ color: 'var(--nav-success)' }}>{t.invoicePaidLabel}</div>
            <button
              onClick={openPDF}
              className="mt-3 text-xs underline" style={{ color: 'var(--nav-accent)' }}>
              {t.openPdfLinkLabel}
            </button>
          </div>
        )}

        <SignatureSection mode="client" publicToken={token} documentId={invoice.id} documentTitle={`Счёт №${invoice.number}`} ownerCompanyName={profile?.company_name} />

        <div className="text-center py-4">
          <p className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.createdViaLabel}</p>
          <a href="https://invoices.kz" className="text-xs font-medium" style={{ color: 'var(--nav-accent)' }}>INVOICES.KZ</a>
        </div>
      </div>
    </main>
  )
}
