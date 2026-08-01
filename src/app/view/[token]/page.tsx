'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { useLanguage } from '@/components/LanguageProvider'
import { historyDict } from '@/lib/i18n/history'
import SignatureSection from '@/components/SignatureSection'

export default function PublicInvoice() {
  const { token } = useParams()
  const { lang } = useLanguage()
  const t = historyDict[lang]
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [kaspiPayment, setKaspiPayment] = useState<{ qr_token: string; payment_link: string; status: string } | null>(null)
  const [kaspiQrDataUrl, setKaspiQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [marked, setMarked] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*')
        .eq('public_token', token)
        .single()


      if (!inv) { setLoading(false); return }   
      setInvoice(inv)

      if (inv.status === 'sent') {
        await supabase.from('invoices')
          .update({ status: 'viewed', viewed_at: new Date().toISOString() })
          .eq('id', inv.id)
        // Best-effort — viewing the invoice shouldn't block on this.
        fetch('/api/notify-viewed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: inv.id }),
        }).catch(() => {})
      }

      // Загружаем полный профиль включая подпись и печать
      const { data: p } = await supabase
        .from('profiles')
        .select('company_name, bin_iin, address, phone, email, director_name, signature_url, stamp_url, kaspi_pay_link, halyk_pay_link, website, social_links')
        .eq('id', inv.user_id)
        .single()
      setProfile(p)

      // Берём банк из счёта если есть, иначе основной
      if (inv.bank_id) {
        const { data: b } = await supabase
          .from('bank_accounts').select('*').eq('id', inv.bank_id).single()
        setBank(b)
      } else {
        const { data: b } = await supabase
          .from('bank_accounts').select('*')
          .eq('user_id', inv.user_id)
          .eq('is_main', true).single()
        setBank(b)
      }

      // Best-effort, non-blocking — a Kaspi lookup failure shouldn't stop the
      // invoice itself from rendering; the client still has bank requisites.
      fetch(`/api/kaspi/invoice-payment?token=${token}`)
        .then(r => r.json())
        .then((data) => setKaspiPayment(data.payment || null))
        .catch(() => {})

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

  // Kaspi has no webhook to us, so the only way to learn a QR got paid is to
  // actively ask while the payer is here — this is what makes payment
  // confirmation instant and click-free without needing a frequent cron
  // (Vercel's free plan only allows once-a-day crons; see the daily
  // kaspi-poll cron for the safety net that catches everything this misses).
  // Capped at 150 polls (~12.5 min) so an abandoned tab doesn't poll forever.
  const kaspiPollCount = useRef(0)
  useEffect(() => {
    if (!kaspiPayment || kaspiPayment.status !== 'pending' || !token) return
    kaspiPollCount.current = 0
    const interval = setInterval(async () => {
      kaspiPollCount.current++
      if (kaspiPollCount.current > 150) { clearInterval(interval); return }
      try {
        const res = await fetch(`/api/kaspi/invoice-payment?token=${token}`)
        const data = await res.json()
        setKaspiPayment(data.payment || null)
        if (data.payment?.status === 'paid') {
          setInvoice((prev: any) => (prev ? { ...prev, status: 'paid' } : prev))
        }
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [kaspiPayment?.status, token])

  async function markAsPaid() {
    if (!confirm(t.confirmPaymentConfirm)) return
    setMarking(true)
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id)
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
      knp: invoice.knp || '849',
      services: invoiceServices,
      total: Number(invoice.amount),
      note: invoice.note || '',
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
      autoPrint: false,
    })
  if (win) { win.document.write(html); win.document.close() }
}
  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  if (!invoice) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">😕</div>
        <p className="text-gray-400">{t.invoiceNotFoundLabel}</p>
      </div>
    </main>
  )

  const services = invoice.services || []
  const total = Number(invoice.amount)

  const statusColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    sent: 'bg-blue-100 text-blue-700',
    overdue: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-600',
    viewed: 'bg-purple-100 text-purple-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  const statusLabels = t.statusLabels

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-[#1C2056] px-4 py-4 flex items-center justify-between">
        <span className="font-bold text-white text-lg">INVOICES.KZ</span>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[invoice.status] || statusColors.draft}`}>
          {statusLabels[invoice.status] || statusLabels.draft}
        </span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Invoice header */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">{t.invoiceForPaymentLabel}</div>
              <div className="text-xl font-bold text-[#1C2056]">{invoice.number}</div>
              <div className="text-xs text-gray-400 mt-1">{formatDate(invoice.created_at)}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[#1C2056]">
                {total.toLocaleString('ru-KZ')} ₸
              </div>
            </div>
          </div>

          {/* From */}
          <div className="border-t border-gray-100 pt-4 mb-3">
            <div className="text-xs text-gray-400 mb-1">{t.fromLabel}</div>
            <div className="text-sm font-medium text-[#1C2056]">{profile?.company_name}</div>
            {profile?.bin_iin && <div className="text-xs text-gray-400">{t.binLabel(profile.bin_iin)}</div>}
            {profile?.address && <div className="text-xs text-gray-400">{profile.address}</div>}
            {profile?.phone && <div className="text-xs text-gray-400">{profile.phone}</div>}
          </div>

          {/* To */}
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-400 mb-1">{t.toLabel}</div>
            <div className="text-sm font-medium text-[#1C2056]">{invoice.client_name}</div>
            {invoice.client_bin && <div className="text-xs text-gray-400">{t.binLabel(invoice.client_bin)}</div>}
            {invoice.client_email && <div className="text-xs text-gray-400">{invoice.client_email}</div>}
          </div>
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">{t.servicesHeaderLabel}</div>
            {services.map((s: any, i: number) => (
              <div key={i} className={`flex justify-between px-4 py-3 ${i < services.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="text-sm text-[#1C2056]">{s.name}</div>
                  <div className="text-xs text-gray-400">
                    {s.qty} {s.unit || t.defaultUnitLabel} × {Number(s.price).toLocaleString('ru-KZ')} ₸
                  </div>
                </div>
                <div className="text-sm font-medium text-[#1C2056]">
                  {(s.qty * s.price).toLocaleString('ru-KZ')} ₸
                </div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm font-bold text-[#1C2056]">{t.totalDueLabel}</span>
              <span className="text-sm font-bold text-[#1C2056]">{total.toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
        )}

        {/* Note */}
        {invoice.note && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t.noteLabel}</div>
            <div className="text-sm text-gray-600">{invoice.note}</div>
          </div>
        )}

        {/* Kaspi payment */}
        {kaspiPayment && kaspiPayment.status === 'pending' && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Оплата через Kaspi</div>
            <div className="flex items-center gap-4 mb-4">
              {kaspiQrDataUrl && (
                <img
                  src={kaspiQrDataUrl}
                  alt="Kaspi QR"
                  className="w-28 h-28 flex-shrink-0"
                />
              )}
              <div className="text-xs text-gray-500">
                Отсканируйте QR-код камерой телефона или нажмите кнопку ниже, чтобы оплатить через приложение Kaspi.
              </div>
            </div>
            <a
              href={kaspiPayment.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block text-center bg-[#E4171F] text-white rounded-xl py-3.5 font-medium text-sm"
            >
              Оплатить через Kaspi
            </a>
            <div className="text-xs text-gray-400 text-center mt-3">
              Счёт подтвердится автоматически сразу после оплаты — обновлять страницу не нужно.
            </div>
          </div>
        )}

        {/* Bank details */}
        {bank && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">{t.paymentDetailsHeader}</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">{t.bankLabel}</span>
                <span className="text-xs font-medium text-[#1C2056]">{bank.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">{t.iikLabel}</span>
                <span className="text-xs font-medium text-[#1C2056] font-mono">{bank.iik}</span>
              </div>
              {bank.bik && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">{t.bikLabel}</span>
                  <span className="text-xs font-medium text-[#1C2056] font-mono">{bank.bik}</span>
                </div>
              )}
              {bank.kbe && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">{t.kbeLabel}</span>
                  <span className="text-xs font-medium text-[#1C2056]">{bank.kbe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Инструкция */}
        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && !marked && (
          <div className="bg-blue-50 rounded-2xl p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-2">{t.howToPayHeader}</div>
            <div className="space-y-2">
              {[
                { step: '1', text: t.step1Text },
                { step: '2', text: t.step2Text },
                { step: '3', text: t.step3Text },
              ].map(item => (
                <div key={item.step} className="flex gap-2 items-start">
                  <div className="w-5 h-5 rounded-full bg-[#1C2056] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <span className="text-xs text-gray-600">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Коннекторы — оплата и соцсети. */}
        {(profile?.halyk_pay_link || profile?.website || profile?.social_links?.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            {profile?.halyk_pay_link && (
              <a href={profile.halyk_pay_link} target="_blank" rel="noopener noreferrer"
                className="w-full bg-green-500 text-white rounded-xl py-3.5 font-medium text-sm flex items-center justify-center gap-2 block text-center">
                {t.payViaHalykButton}
              </a>
            )}
            {(profile?.website || profile?.social_links?.length > 0) && (
              <div className="flex gap-2 flex-wrap pt-1">
                {profile?.website && (
                   <a href={profile.website.startsWith('http') ? profile.website : 'https://' + profile.website} target="_blank"
                    className="bg-gray-100 text-gray-600 rounded-lg px-3 py-1.5 text-xs">
                    {t.websiteLinkLabel}
                  </a>
                )}
                {(profile?.social_links || []).map((link: string, i: number) => {
                  const icons: Record<string, string> = { instagram: '📸', facebook: '👤', tiktok: '🎵', youtube: '▶️', telegram: '✈️', twitter: '🐦', linkedin: '💼', '2gis': '📍', whatsapp: '💬' }
                  const names: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', twitter: 'Twitter', linkedin: 'LinkedIn', '2gis': '2GIS', whatsapp: 'WhatsApp' }
                  const key = Object.keys(icons).find(k => link.includes(k)) || ''
                  return (
                    <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                      className="bg-gray-100 text-gray-600 rounded-lg px-3 py-1.5 text-xs">
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
              <div className="bg-green-50 rounded-2xl p-5 text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="text-sm font-medium text-green-700 mb-1">{t.paymentConfirmedThanksLabel}</div>
                <div className="text-xs text-green-600">{t.supplierNotifiedLabel}</div>
              </div>
            ) : (
              <>
                {/* Главная кнопка — открыть PDF */}
                <button
                  onClick={openPDF}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm flex items-center justify-center gap-2">
                  {t.openInvoicePdfButton}
                </button>

                {/* Вторая кнопка — подтвердить оплату */}
                <button
                  onClick={markAsPaid}
                  disabled={marking}
                  className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm">
                  {marking ? t.processingButtonLabel : t.alreadyPaidButton}
                </button>
              </>
            )}
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="bg-green-50 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm font-medium text-green-700">{t.invoicePaidLabel}</div>
            <button
              onClick={openPDF}
              className="mt-3 text-xs text-[#1C2056] underline">
              {t.openPdfLinkLabel}
            </button>
          </div>
        )}

        <SignatureSection mode="client" documentId={invoice.id} documentTitle={`Счёт №${invoice.number}`} ownerCompanyName={profile?.company_name} />

        <div className="text-center py-4">
          <p className="text-xs text-gray-400">{t.createdViaLabel}</p>
          <a href="https://invoices.kz" className="text-xs font-medium text-[#1C2056]">INVOICES.KZ</a>
        </div>
      </div>
    </main>
  )
}