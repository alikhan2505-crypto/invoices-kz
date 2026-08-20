'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { formatDateTime, formatDate, formatDateSafe } from '@/lib/date'
import { generateKP } from '@/lib/generateKP'
import { generateAVR } from '@/lib/generateAVR'
import { generateNakladnaya } from '@/lib/generateNakladnaya'
import { getActivePlan } from '@/lib/plan'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import InvoiceLivePreview from '@/components/InvoiceLivePreview'
import Skeleton from '@/components/Skeleton'
import SignatureSection from '@/components/SignatureSection'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Flat solid-fill status badges -- same approved treatment as
// dashboard/page.tsx and history/page.tsx's statusFill (a solid color +
// white text, replacing this page's old dot+colored-text style).
const statusFill: Record<string, string> = {
  paid: 'var(--nav-success)',
  sent: 'var(--nav-accent)',
  viewed: 'var(--nav-teal)',
  overdue: 'var(--nav-critical)',
  draft: 'var(--nav-text-muted)',
  cancelled: 'var(--nav-text-muted)',
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function LinkChainIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </svg>
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

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6 8.5 7 8.5-7" />
    </svg>
  )
}

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 3 4 4L9 19l-5 1 1-5Z" />
      <path d="m14.5 5.5 4 4" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 3.1 6.6 7.1.9-5.3 4.9 1.5 7-6.4-3.6-6.4 3.6 1.5-7-5.3-4.9 7.1-.9L12 2Z" />
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2.1 21 6l-4 3.9" />
      <path d="M3 12.5a9 9 0 0 1 15-6.7l3-.1" />
      <path d="m7 22-4-3.9L7 14" />
      <path d="M21 11.5a9 9 0 0 1-15 6.7l-3 .1" />
    </svg>
  )
}

function FolderCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L16 10" />
    </svg>
  )
}

function SendStatusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </svg>
  )
}

function ClockStatusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

function DraftStatusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function EyeStatusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const statusIconComp: Record<string, () => React.ReactElement> = {
  paid: CheckCircleIcon, sent: SendStatusIcon, overdue: ClockStatusIcon, draft: DraftStatusIcon, viewed: EyeStatusIcon,
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export default function InvoicePage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const statusLabel: Record<string, { text: string; color: string; dot: string }> = {
    paid:    { text: t.statusLabelPaid,    color: 'text-green-600',  dot: 'bg-green-500' },
    sent:    { text: t.statusLabelSent,    color: 'text-blue-600',   dot: 'bg-blue-400' },
    overdue: { text: t.statusLabelOverdue, color: 'text-red-600',    dot: 'bg-red-500' },
    draft:   { text: t.statusLabelDraft,   color: 'text-gray-500',   dot: 'bg-gray-300' },
    viewed:  { text: t.statusLabelViewed,  color: 'text-purple-600', dot: 'bg-purple-400' },
  }
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [kaspiPayment, setKaspiPayment] = useState<{ qr_token: string; payment_link: string; status: string } | null>(null)
  const [refreshingKaspi, setRefreshingKaspi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [showSignModal, setShowSignModal] = useState(false)
  const [pendingDocAction, setPendingDocAction] = useState<((withSign: boolean) => void) | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  const [upgradePlan, setUpgradePlan] = useState<'basic' | 'pro'>('basic')
  const [kpCount, setKpCount] = useState(0)
  const [avrCount, setAvrCount] = useState(0)
  const [naklCount, setNaklCount] = useState(0)
  // Ref для хранения открытого окна — открывается в модале (прямой клик пользователя)
  const pdfWinRef = useRef<Window | null>(null)


  useEffect(() => { loadInvoice() }, [])

  async function refreshKaspiLink() {
    if (!invoice?.public_token) return
    setRefreshingKaspi(true)
    try {
      const res = await fetch(`/api/kaspi/invoice-payment?token=${invoice.public_token}`)
      if (res.ok) {
        const data = await res.json()
        setKaspiPayment(data.payment || null)
        // A manual refresh can itself be the moment the payment settles
        // (the route live-checks Kaspi on every call) — reload the whole
        // invoice so status/История reflect it immediately, not just after
        // the next full page load.
        if (data.payment?.status === 'paid') await loadInvoice()
      }
    } catch {
      // Network hiccup — leave the current (possibly stale) link showing
      // rather than clearing it; the button stays available to try again.
    } finally {
      setRefreshingKaspi(false)
    }
  }

  // Mirrors /view/[token]'s payer-facing poll: the owner looking at their own
  // invoice while a Kaspi payment is pending sees status/История update the
  // moment the customer pays, instead of needing a manual reload (the gap
  // reported live — the История card only reflected "Оплачен" after F5).
  // Capped at 150 polls (~12.5 min) so a tab left open doesn't poll forever.
  const kaspiPollCount = useRef(0)
  useEffect(() => {
    if (!kaspiPayment || kaspiPayment.status !== 'pending' || !invoice?.public_token) return
    kaspiPollCount.current = 0
    const interval = setInterval(async () => {
      kaspiPollCount.current++
      if (kaspiPollCount.current > 150) { clearInterval(interval); return }
      try {
        const res = await fetch(`/api/kaspi/invoice-payment?token=${invoice.public_token}`)
        const data = await res.json()
        setKaspiPayment(data.payment || null)
        if (data.payment?.status === 'paid') await loadInvoice()
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [kaspiPayment?.status, invoice?.public_token])

  async function loadInvoice() {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
    setInvoice(inv)
    if (inv?.client_email) setEmailTo(inv.client_email)

    // .limit(1) is load-bearing: resending an invoice can leave more than one
    // 'pending' row for it, and .maybeSingle() answers >1 row with a PGRST116
    // error and null data — which used to make the Kaspi link silently vanish
    // from this page after a perfectly normal resend.
    const { data: kaspiPaymentData } = await supabase
      .from('kaspi_payment_requests')
      .select('qr_token, payment_link, status')
      .eq('invoice_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setKaspiPayment(kaspiPaymentData || null)

    const { data: logsData } = await supabase
      .from('invoice_logs').select('*').eq('invoice_id', id)
      .order('created_at', { ascending: false })
    setLogs(logsData || [])

    const [{ count: kp }, { count: avr }, { count: nakl }] = await Promise.all([
      supabase.from('kp_documents').select('*', { count: 'exact', head: true }).eq('invoice_id', id),
      supabase.from('avr_documents').select('*', { count: 'exact', head: true }).eq('invoice_id', id),
      supabase.from('nakladnaya_documents').select('*', { count: 'exact', head: true }).eq('invoice_id', id),
    ])
    setKpCount(kp || 0)
    setAvrCount(avr || 0)
    setNaklCount(nakl || 0)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      if (inv?.bank_id) {
        const { data: b } = await supabase.from('bank_accounts').select('*').eq('id', inv.bank_id).single()
        setBank(b)
      } else {
        const { data: b } = await supabase.from('bank_accounts').select('*').eq('user_id', user.id).eq('is_main', true).single()
        setBank(b)
      }
    }
    setLoading(false)
  }

  function showUpgrade(message: string, plan: 'basic' | 'pro') {
    setUpgradeMessage(message)
    setUpgradePlan(plan)
    setShowUpgradeModal(true)
  }

  function askSignature(action: (withSign: boolean) => void) {
    setPendingDocAction(() => action)
    setShowSignModal(true)
  }

  function buildProfile(withSign: boolean) {
    const ap = getActivePlan(profile)
    return {
      company_name: profile.company_name || '',
      bin_iin: profile.bin_iin || '',
      address: profile.address || '',
      director_name: profile.director_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      signature_url: withSign && ap.canSign ? (profile.signature_url || '') : '',
      stamp_url: withSign && ap.canSign ? (profile.stamp_url || '') : '',
      logo_url: profile.logo_url || '',
    }
  }

  async function updateStatus(status: string) {
    setUpdating(true)
    await supabase.from('invoices').update({ status }).eq('id', id)
    await supabase.from('invoice_logs').insert({ invoice_id: id, status })
    await loadInvoice()
    setUpdating(false)
  }

  async function deleteInvoice() {
    if (!confirm(t.cancelInvoiceConfirm)) return
    await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id)
    await supabase.from('invoice_logs').insert({ invoice_id: id, status: 'cancelled' })
    router.push('/history')
  }

  async function duplicateInvoice() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: invoiceNumber, error: numberError } = await supabase.rpc('claim_invoice_number', { p_user_id: user.id })
    if (numberError) { alert(t.errorPrefix(numberError.message)); return }
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id, number: invoiceNumber, amount: invoice.amount,
      status: 'draft', client_name: invoice.client_name, client_bin: invoice.client_bin,
      client_email: invoice.client_email, client_phone: invoice.client_phone,
      client_address: invoice.client_address, services: invoice.services,
      note: invoice.note, contract_number: invoice.contract_number,
      contract_date: invoice.contract_date, created_at: new Date().toISOString(),
    }).select().single()
    if (error) { alert(t.errorPrefix(error.message)); return }
    await supabase.from('invoice_logs').insert({ invoice_id: data.id, status: 'draft' })
    router.push('/invoice/' + data.id)
  }

  async function copyPublicLink() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (data?.public_token) {
      const link = `https://invoices.kz/view/${data.public_token}`
      try {
        await navigator.clipboard.writeText(link)
        alert(t.linkCopiedMessage(link))
      } catch {
        const el = document.createElement('textarea')
        el.value = link
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        alert(t.linkCopiedMessage(link))
      }
    } else {
      alert(t.tokenNotFoundAlert)
    }
  }

  async function shareWhatsApp() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (!data?.public_token) { alert(t.genericErrorLabel); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = t.whatsappShareMessage(invoice.number, Number(invoice.amount).toLocaleString('ru-KZ'), link)
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
    await updateStatus('sent')
  }

  async function sendEmailConfirm() {
    if (!emailTo) { alert(t.enterEmailAddressAlert); return }
    setSendingEmail(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/send-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ invoiceId: id, overrideEmail: emailTo })
    })
    const data = await res.json()
    setSendingEmail(false)
    if (data.success) {
      alert(t.emailSentMessage(emailTo))
      setShowEmailModal(false)
      await loadInvoice()
    } else {
      alert(t.errorPrefix(data.error))
    }
  }

  async function sendReminder() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (!data?.public_token) { alert(t.genericErrorLabel); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = t.reminderMessage(invoice.client_name, invoice.number, Number(invoice.amount).toLocaleString('ru-KZ'), link)
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  async function openPDF(withSignature = true) {
    if (!invoice || !profile) return
    const win = pdfWinRef.current
    pdfWinRef.current = null
    const html = await generateInvoicePDF({
      number: invoice.number, date: formatDate(invoice.created_at),
      clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '', clientAddress: invoice.client_address || '',
      clientPhone: invoice.client_phone || '', contractNumber: invoice.contract_number || '',
      contractDate: displayContractDate,
      services: invoice.services || [],
      total: Number(invoice.amount), note: displayNote || '',
      autoPrint: false, vatType: profile?.vat_type,
      profile: buildProfile(withSignature),
      bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
      dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
      showWatermark: !ap.isActive,
    })
    if (win) { win.document.write(html); win.document.close() }
  }

  function calcServiceTotal(svcs: any[]) {
    return svcs.filter(s => !s.type || s.type === 'service').reduce((sum, s) => sum + s.qty * s.price, 0)
  }

  function calcProductTotal(svcs: any[]) {
    return svcs.filter(s => s.type === 'product').reduce((sum, s) => sum + s.qty * s.price, 0)
  }

  async function getNextNumber(type: 'kp' | 'avr' | 'nakladnaya', userId: string) {
    const { data, error } = await supabase.rpc('claim_doc_number', { p_user_id: userId, p_doc_type: type })
    if (error) throw error
    return data as string
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/history')} className="text-xl transition-colors" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>‹</button>
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="lg:flex lg:gap-6 lg:items-start">
      <div className="lg:flex-1 lg:min-w-0 space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <div className="hidden lg:block lg:w-[380px]">
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      </div>
      </div>
    </main>
    </DesktopShell>
  )

  if (!invoice) return (
    <main className="page-surface-in-shell min-h-screen flex items-center justify-center">
      <p style={{ color: 'var(--nav-text-muted)' }}>{t.invoiceNotFoundLabel}</p>
    </main>
  )

  const status = statusLabel[invoice.status] || statusLabel.draft
  const services = invoice.services || []
  const ap = getActivePlan(profile)
  // Older invoices carry a static "Оплата в течение Nх дней" note from
  // before due-date-based notes existed -- for display (and for regenerated
  // PDFs), always show the due-date-derived sentence when a due date is on
  // record, same as the create-page's live note. Falls back to whatever's
  // actually stored only when there's no due date to derive from.
  const displayNote = invoice.due_date ? t.paymentDueNote(formatDate(invoice.due_date)) : invoice.note
  const displayContractDate = invoice.contract_date ? formatDateSafe(invoice.contract_date) : undefined

  const serviceTotal = calcServiceTotal(services)
  const productTotal = calcProductTotal(services)
  const hasServices = serviceTotal > 0
  const hasProducts = productTotal > 0

  function DocButton({ label, icon, onClick, locked, lockedLabel, savedCount, disabled, disabledReason }: {
    label: string; icon: React.ReactNode; onClick: () => void; locked: boolean; lockedLabel: string
    savedCount: number; disabled?: boolean; disabledReason?: string
  }) {
    const isLocked = locked
    const isDisabled = !locked && disabled
    return (
      <button
        onClick={() => {
          if (isLocked) showUpgrade(lockedLabel, 'pro')
          else if (isDisabled) alert(disabledReason || t.unavailableLabel)
          else onClick()
        }}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ borderColor: 'var(--nav-border-soft)' }}>
        <div className="flex flex-col items-start gap-1">
          <span className="flex items-center gap-2" style={{ color: isLocked || isDisabled ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
            <span className="flex-shrink-0">{icon}</span>
            {label}
          </span>
          {savedCount > 0 && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--nav-success)' }}>
              <FolderCheckIcon /> {t.savedToTaxLabel(savedCount)}
            </span>
          )}
          {isDisabled && disabledReason && (
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{disabledReason}</span>
          )}
        </div>
        {isLocked ? (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
            <LockIcon /> {t.proBadge}
          </span>
        ) : isDisabled ? (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>—</span>
        ) : (
          <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
        )}
      </button>
    )
  }

  function LockedButton({ label, icon, onClick, locked, lockedLabel }: {
    label: string; icon: React.ReactNode; onClick: () => void; locked: boolean; lockedLabel: string
  }) {
    return (
      <button
        onClick={locked ? () => showUpgrade(lockedLabel, lockedLabel === t.proLockedLabel ? 'pro' : 'basic') : onClick}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ borderColor: 'var(--nav-border-soft)' }}>
        <span className="flex items-center gap-2" style={{ color: locked ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
          <span className="flex-shrink-0">{icon}</span>
          {label}
        </span>
        {locked ? (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
            <LockIcon /> {lockedLabel === t.proLockedLabel ? t.proBadge : t.basicBadge}
          </span>
        ) : (
          <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
        )}
      </button>
    )
  }

  const StatusIcon = statusIconComp[invoice.status] || DraftStatusIcon

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/history')} className="text-xl transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={backLabel(lang)}>‹</button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.invoiceHeaderTitle(invoice.number)}</h2>
      </div>
      <div className="lg:flex lg:gap-6 lg:items-start">
      <div className="lg:flex-1 lg:min-w-0 space-y-4">

        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-5 text-center ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="text-3xl font-bold mb-1 tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
            {Number(invoice.amount).toLocaleString('ru-KZ')} ₸
          </div>
          <div className="text-sm mb-3" style={{ color: 'var(--nav-text-muted)' }}>{invoice.client_name || t.noClientLabel}</div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: statusFill[invoice.status] || statusFill.draft }}>
            <StatusIcon />
            {status.text}
          </span>
          {invoice.due_date && (
            <div className="text-xs mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.dueDateLabel}: {formatDate(invoice.due_date)}</div>
          )}
        </motion.div>

        {/* 4 кнопки действий */}
        <motion.div
          className="grid grid-cols-4 gap-2"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
        >
          <button onClick={shareWhatsApp}
            className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}>
            <div className="flex justify-center mb-1" style={{ color: 'var(--nav-success)' }}><ChatIcon /></div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.whatsappButtonLabel}</div>
          </button>
          <button onClick={copyPublicLink}
            className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}>
            <div className="flex justify-center mb-1" style={{ color: 'var(--nav-teal)' }}><LinkChainIcon /></div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.linkButtonLabel}</div>
          </button>
          {/* PDF — окно открывается в кнопке модала (прямой клик пользователя) */}
          <button onClick={() => askSignature(openPDF)}
            className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}>
            <div className="flex justify-center mb-1" style={{ color: 'var(--nav-accent)' }}><DocIcon /></div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.pdfButtonLabel}</div>
          </button>
          <button
            onClick={() => ap.canEmail
              ? setShowEmailModal(true)
              : showUpgrade(t.emailUpgradeMessage, 'basic')
            }
            className={`nav-glass rounded-xl p-3 text-center relative ${CARD_HOVER}`}>
            <div className="flex justify-center mb-1" style={{ color: 'var(--nav-magenta)' }}><MailIcon /></div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.emailLabel}</div>
            {!ap.canEmail && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'var(--nav-text-muted)', color: 'var(--nav-surface-chrome)' }}>
                <LockIcon size={9} />
              </span>
            )}
          </button>
        </motion.div>

        {kaspiPayment && (
          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.08 }}
          >
            <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-muted)' }}>Оплата через Kaspi</div>
            <a
              href={kaspiPayment.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block text-center text-white rounded-xl py-3 text-sm font-medium"
              style={{ background: '#E4171F' }}
            >
              Ссылка на оплату Kaspi →
            </a>
            {/* Kaspi QR codes expire. This asks the same endpoint the payer's
                page uses, which hands back the live link or mints a fresh one
                if the old one has run out. */}
            <button onClick={refreshKaspiLink} disabled={refreshingKaspi}
              className="w-full mt-2 rounded-xl py-2.5 text-sm font-medium transition-colors hover:bg-[var(--nav-border-soft)]"
              style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
              {refreshingKaspi ? 'Обновляем...' : 'Обновить ссылку'}
            </button>
          </motion.div>
        )}

        {ap.canEcp ? (
        <SignatureSection
          mode="owner"
          documentId={invoice.id}
          documentTitle={`Счёт №${invoice.number}`}
          ownerCompanyName={profile?.company_name}
          getHtml={async () => generateInvoicePDF({
            number: invoice.number, date: formatDate(invoice.created_at),
            clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
            clientEmail: invoice.client_email || '', clientAddress: invoice.client_address || '',
            clientPhone: invoice.client_phone || '', contractNumber: invoice.contract_number || '',
            contractDate: displayContractDate,
            services: invoice.services || [],
            total: Number(invoice.amount), note: displayNote || '',
            autoPrint: true, vatType: profile?.vat_type,
            // No scanned signature/stamp image here — the document is about
            // to be cryptographically signed with a real ЭЦП, which would
            // otherwise sit confusingly next to a static picture implying a
            // second, unrelated "signature".
            profile: buildProfile(false),
            bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
            kaspiPayLink: profile?.kaspi_pay_link || undefined,
            viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
            dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
            showWatermark: !ap.isActive,
          })}
        />
        ) : (
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}><PenIcon /></div>
            <div className="text-sm font-medium flex-1" style={{ color: 'var(--nav-text-primary)' }}>{t.ecpSectionLabel}</div>
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
              <LockIcon /> {t.proBadge}
            </span>
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.proLockedLabel}</div>
          <button onClick={() => showUpgrade(t.ecpProUpgradeMessage, 'pro')}
            className="w-full rounded-xl py-2.5 text-sm font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {t.goToPlansButton}
          </button>
        </motion.div>
        )}

        {services.length > 0 && (
          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl overflow-hidden ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.12 }}
          >
            <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{t.servicesAndGoodsHeader}</div>
            {services.map((s: any, i: number) => (
              <div key={i} className="flex justify-between px-4 py-3 border-b" style={{ borderColor: i < services.length - 1 ? 'var(--nav-border-soft)' : 'transparent' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{s.name}</div>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={s.type === 'product'
                        ? { background: 'var(--nav-success-soft)', color: 'var(--nav-success)' }
                        : { background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}
                    >
                      {t.serviceTypeBadge(s.type)}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{s.qty} {s.unit || 'шт'} × {Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
                <div className="text-sm font-medium tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(s.qty * s.price).toLocaleString('ru-KZ')} ₸</div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-glass)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.totalLabel}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{Number(invoice.amount).toLocaleString('ru-KZ')} ₸</span>
            </div>
          </motion.div>
        )}

        {displayNote && (
          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.14 }}
          >
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.noteHeader}</div>
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{displayNote}</div>
          </motion.div>
        )}

        {bank && (
          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.16 }}
          >
            <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.bankDetailsHeader}</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--nav-text-muted)' }}>{t.bankNameFieldLabel}</span>
                <span className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{bank.bank_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--nav-text-muted)' }}>{t.iikFieldLabel}</span>
                <span className="font-mono text-xs" style={{ color: 'var(--nav-text-primary)' }}>{bank.iik}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--nav-text-muted)' }}>{t.bikFieldLabel}</span>
                <span className="font-mono text-xs" style={{ color: 'var(--nav-text-primary)' }}>{bank.bik}</span>
              </div>
              {bank.kbe && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--nav-text-muted)' }}>{t.kbeFieldLabel}</span>
                  <span style={{ color: 'var(--nav-text-primary)' }}>{bank.kbe}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* История */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-4 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.18 }}
        >
          <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.historyHeader}</div>
          {logs.length === 0 ? (
            <div className="text-xs text-center py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.noEntriesLabel}</div>
          ) : (
            <div className="space-y-0">
              {logs.map((log, i) => {
                const s = statusLabel[log.status] || statusLabel.draft
                const LogIcon = statusIconComp[log.status] || DraftStatusIcon
                const fill = statusFill[log.status] || statusFill.draft
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: fill }}></span>
                      {i < logs.length - 1 && <div className="w-px flex-1 min-h-[24px] my-1" style={{ background: 'var(--nav-border-soft)' }}></div>}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--nav-text-primary)' }}>
                        <span style={{ color: fill }}><LogIcon /></span>
                        {s.text}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{formatDateTime(log.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Изменить статус */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl overflow-hidden ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
        >
          <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{t.changeStatusHeader}</div>
          {t.statusChangeOptions.filter(s => s.status !== invoice.status).map((s, i, arr) => (
            <button key={s.status} onClick={() => updateStatus(s.status)} disabled={updating}
              className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-left transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
              <span style={{ color: 'var(--nav-text-primary)' }}>{s.label}</span>
              <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
            </button>
          ))}
        </motion.div>

        {/* Действия */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl overflow-hidden ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.22 }}
        >
          <button onClick={() => router.push('/invoice/' + id + '/edit')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border-soft)' }}>
            <span>{t.editButtonLabel}</span>
            <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
          </button>

          <button onClick={duplicateInvoice}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border-soft)' }}>
            <span>{t.duplicateButtonLabel}</span>
            <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
          </button>

          {/* Открывает /create предзаполненным этим счётом (клиент, услуги,
              договор), но с сегодняшней датой и заново вычисленным сроком
              оплаты -- в отличие от «Дублировать», даёт проверить/поправить
              счёт перед созданием. */}
          <button onClick={() => router.push('/create?repeat=' + id)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border-soft)' }}>
            <span className="flex items-center gap-2"><RepeatIcon />{t.repeatInvoiceButtonLabel}</span>
            <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
          </button>

          {/* КП */}
          <DocButton
            label={t.kpDocLabel}
            icon={<ClipboardIcon />}
            locked={!ap.canKpAvrNakl}
            lockedLabel={t.proLockedLabel}
            savedCount={kpCount}
            onClick={async () => {
              if (!profile) return
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const kpNumber = await getNextNumber('kp', user.id)
              const today = new Date()
              today.setDate(today.getDate() + 30)
              const validUntil = prompt(t.kpValidUntilPrompt, today.toLocaleDateString('ru-KZ'))
              if (!validUntil) return
              await supabase.from('kp_documents').insert({
                user_id: user.id, invoice_id: id, number: kpNumber,
                date: formatDate(invoice.created_at), valid_until: validUntil,
                client_name: invoice.client_name, client_bin: invoice.client_bin,
                total: Number(invoice.amount), services: invoice.services,
                note: invoice.note, vat_type: profile?.vat_type || 'no_vat',
              })
              setKpCount(prev => prev + 1)
              // Окно открывается ВНУТРИ callback модала — прямой клик пользователя
              askSignature((withSign) => {
                const win = pdfWinRef.current
                pdfWinRef.current = null
                generateKP({
                  number: kpNumber, date: formatDate(invoice.created_at), validUntil,
                  clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
                  services: invoice.services || [], total: Number(invoice.amount),
                  note: invoice.note || '', vatType: profile?.vat_type || 'no_vat',
                  profile: buildProfile(withSign),
                  bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
                }, win)
              })
            }}
          />

          {/* АВР */}
          <DocButton
            label={t.avrDocLabel}
            icon={<DocIcon />}
            locked={!ap.canKpAvrNakl}
            lockedLabel={t.proLockedLabel}
            savedCount={avrCount}
            disabled={!hasServices}
            disabledReason={t.noServicesInInvoiceLabel}
            onClick={async () => {
              if (!profile) return
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const avrNumber = await getNextNumber('avr', user.id)
              const contractNumber = prompt(t.avrContractNumberPrompt, invoice.contract_number || '')
              const contractDate = prompt(t.avrContractDatePrompt, invoice.contract_date || formatDate(invoice.created_at))
              await supabase.from('avr_documents').insert({
                user_id: user.id, invoice_id: id, number: avrNumber,
                date: formatDate(invoice.created_at),
                contract_number: contractNumber || null,
                contract_date: contractDate || null,
                client_name: invoice.client_name, client_bin: invoice.client_bin,
                client_address: invoice.client_address,
                total: serviceTotal,
                services: invoice.services?.filter((s: any) => !s.type || s.type === 'service'),
                vat_type: profile?.vat_type || 'no_vat',
              })
              setAvrCount(prev => prev + 1)
              // Окно открывается ВНУТРИ callback модала — прямой клик пользователя
              askSignature((withSign) => {
                const win = pdfWinRef.current
                pdfWinRef.current = null
                generateAVR({
                  number: avrNumber, date: formatDate(invoice.created_at),
                  contractNumber: contractNumber || undefined,
                  contractDate: contractDate || undefined,
                  clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
                  clientAddress: invoice.client_address || '',
                  services: invoice.services?.filter((s: any) => !s.type || s.type === 'service') || [],
                  total: serviceTotal,
                  vatType: profile?.vat_type || 'no_vat',
                  profile: buildProfile(withSign),
                }, win)
              })
            }}
          />

          {/* Накладная */}
          <DocButton
            label={t.nakladnayaDocLabel}
            icon={<BoxIcon />}
            locked={!ap.canKpAvrNakl}
            lockedLabel={t.proLockedLabel}
            savedCount={naklCount}
            disabled={!hasProducts}
            disabledReason={t.noProductsInInvoiceLabel}
            onClick={async () => {
              if (!profile) return
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const naklNumber = await getNextNumber('nakladnaya', user.id)
              await supabase.from('nakladnaya_documents').insert({
                user_id: user.id, invoice_id: id, number: naklNumber,
                date: formatDate(invoice.created_at),
                client_name: invoice.client_name, client_bin: invoice.client_bin,
                total: productTotal,
                services: invoice.services?.filter((s: any) => s.type === 'product'),
                vat_type: profile?.vat_type || 'no_vat',
              })
              setNaklCount(prev => prev + 1)
              // Окно открывается ВНУТРИ callback модала — прямой клик пользователя
              askSignature((withSign) => {
                const win = pdfWinRef.current
                pdfWinRef.current = null
                generateNakladnaya({
                  number: naklNumber, date: formatDate(invoice.created_at),
                  clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
                  services: invoice.services?.filter((s: any) => s.type === 'product') || [],
                  total: productTotal,
                  vatType: profile?.vat_type || 'no_vat',
                  profile: buildProfile(withSign),
                }, win)
              })
            }}
          />

          {/* Шаблон */}
          <LockedButton
            label={t.saveAsTemplateLabel}
            icon={<StarIcon />}
            locked={!ap.canTemplates}
            lockedLabel={t.proLockedLabel}
            onClick={async () => {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const name = prompt(t.templateNamePrompt, invoice.client_name + ' — ' + invoice.number)
              if (!name) return
              const { error } = await supabase.from('templates').insert({
                user_id: user.id, name,
                client_name: invoice.client_name, client_bin: invoice.client_bin,
                client_email: invoice.client_email, services: invoice.services,
                amount: invoice.amount,
              })
              if (error) { alert(t.errorPrefix(error.message)); return }
              alert(t.templateSavedAlert)
            }}
          />

          <button onClick={sendReminder}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm border-b transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border-soft)' }}>
            <span>{t.remindPaymentButtonLabel}</span>
            <span style={{ color: 'var(--nav-text-muted)' }}><ChevronIcon /></span>
          </button>

          <LockedButton
            label={invoice.recurring_active ? t.recurringEnabledLabel : t.recurringMonthlyLabel}
            icon={<RepeatIcon />}
            locked={!ap.canRecurring}
            lockedLabel={t.proLockedLabel}
            onClick={async () => {
              if (invoice.recurring_active) {
                await supabase.from('invoices').update({ recurring_active: false }).eq('id', id)
                await loadInvoice()
                alert(t.recurringDisabledAlert)
              } else {
                const until = prompt(t.recurringUntilPrompt, '01.12.2026')
                if (!until) return
                const parts = until.split('.')
                if (parts.length !== 3) { alert(t.invalidDateFormatAlert); return }
                if (!invoice.client_email) { alert(t.clientNoEmailAlert); return }
                const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
                await supabase.from('invoices').update({ recurring_active: true, recurring_until: isoDate }).eq('id', id)
                await loadInvoice()
                alert(t.recurringEnabledUntilMessage(until))
              }
            }}
          />

          <button onClick={deleteInvoice}
            className="w-full flex items-center px-4 py-3.5 text-sm transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-critical)' }}>
            {t.cancelInvoiceButtonLabel}
          </button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
        className="hidden lg:block lg:w-[380px] lg:sticky lg:top-[65px]"
      >
        <InvoiceLivePreview
          invoiceNumber={invoice.number}
          date={formatDate(invoice.created_at)}
          dueDate={invoice.due_date ? formatDate(invoice.due_date) : undefined}
          companyName={profile?.company_name || ''}
          companyBin={profile?.bin_iin || ''}
          clientName={invoice.client_name || ''}
          clientBin={invoice.client_bin || ''}
          services={invoice.services || []}
          note={displayNote || ''}
          vatType={profile?.vat_type || 'no_vat'}
          total={Number(invoice.amount)}
        />
      </motion.div>
      </div>
      </div>

      {/* Модал апгрейда */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                <LockIcon size={22} />
              </div>
              <div className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.upgradeNeededTitle}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{upgradeMessage}</div>
            </div>
            <div className="space-y-2">
              <button onClick={() => { setShowUpgradeModal(false); router.push('/upgrade') }}
                className="w-full rounded-xl py-4 font-medium text-sm" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.goToPlansButton}
              </button>
              <button onClick={() => setShowUpgradeModal(false)}
                className="w-full text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.cancelButton}</button>
            </div>
          </div>
        </div>
      )}

      {/* Модал Email */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--nav-magenta-soft)', color: 'var(--nav-magenta)' }}>
                <MailIcon />
              </div>
              <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.sendInvoiceEmailModalTitle}</div>
              <div className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.changeEmailIfNeededSubtitle}</div>
            </div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.recipientEmailLabel}</label>
            <input className="w-full rounded-lg px-3 py-3 text-sm outline-none mb-4 transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
              placeholder={t.emailPlaceholder} type="email"
              value={emailTo} onChange={e => setEmailTo(e.target.value)} style={{ color: 'var(--nav-text-primary)' }} />
            <div className="space-y-2">
              <button onClick={sendEmailConfirm} disabled={sendingEmail}
                className="w-full rounded-xl py-4 text-sm font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {sendingEmail ? t.sendingButtonLabel : t.sendButtonLabel}
              </button>
              <button onClick={() => setShowEmailModal(false)}
                className="w-full text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.cancelButton}</button>
            </div>
          </div>
        </div>
      )}

      {/* Модал подписи — здесь открываем window.open (прямой клик пользователя → iOS не блокирует) */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-3xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                <PenIcon size={18} />
              </div>
              <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.documentFormatModalTitle}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.chooseDownloadVariantSubtitle}</div>
            </div>
            <div className="space-y-3 mb-4">
              <button onClick={() => {
                if (!ap.canSign) {
                  setShowSignModal(false)
                  showUpgrade(t.pdfSignUpgradeMessage, 'basic')
                  return
                }
                pdfWinRef.current = window.open('', '_blank')
                setShowSignModal(false)
                if (pendingDocAction) pendingDocAction(true)
              }}
                className="w-full rounded-xl py-4 text-sm font-medium relative"
                style={ap.canSign ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
                {t.withSignatureButtonLabel}
                {!ap.canSign && <span className="absolute top-1 right-2 text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.basicPlusBadge}</span>}
              </button>
              <button onClick={() => {
                pdfWinRef.current = window.open('', '_blank')
                setShowSignModal(false)
                if (pendingDocAction) pendingDocAction(false)
              }}
                className="w-full rounded-xl py-4 text-sm font-medium border-2"
                style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-primary)' }}>
                {t.withoutSignatureButtonLabel}
              </button>
            </div>
            <button onClick={() => setShowSignModal(false)}
              className="w-full text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.cancelButton}</button>
          </div>
        </div>
      )}

    </main>
    </DesktopShell>
  )
}
