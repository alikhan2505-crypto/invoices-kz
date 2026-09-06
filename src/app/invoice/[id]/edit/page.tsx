'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import InvoiceLivePreview from '@/components/InvoiceLivePreview'
import Skeleton from '@/components/Skeleton'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

export default function EditInvoice() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])

  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [services, setServices] = useState<any[]>([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)
  const vatType = profile?.vat_type || 'no_vat'
  const vatAmount = vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(total / 1.16) : total

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: inv }, { data: p }, { data: c }] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).single(),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('*').eq('user_id', user.id).order('name'),
      ])

      if (!inv) { router.push('/history'); return }

      setClientName(inv.client_name || '')
      setClientBin(inv.client_bin || '')
      setClientEmail(inv.client_email || '')
      setClientAddress(inv.client_address || '')
      setClientPhone(inv.client_phone || '')
      setContractNumber(inv.contract_number || '')
      setContractDate(inv.contract_date || '')
      setDueDate(inv.due_date || '')
      setNote(inv.note || '')
      setInvoiceNumber(inv.number || '')
      setInvoiceDate(inv.created_at ? new Date(inv.created_at).toLocaleDateString('ru-KZ') : '')

      if (inv.services && inv.services.length > 0) {
        setServices(inv.services.map((s: any) => ({ ...s, type: s.type || 'service' })))
      }

      setProfile(p)
      setClients(c || [])

      if (inv.bank_id) {
        const { data: b } = await supabase.from('bank_accounts').select('*').eq('id', inv.bank_id).single()
        setBank(b)
      } else {
        const { data: b } = await supabase.from('bank_accounts').select('*').eq('user_id', user.id).eq('is_main', true).single()
        setBank(b)
      }

      setLoading(false)
    }
    load()
  }, [])

  function addService() {
    setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }, ...services])
  }
  function removeService(idx: number) { setServices(services.filter((_, i) => i !== idx)) }
  function updateService(idx: number, field: string, value: any) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServices(updated)
  }

  // Автозаполнение из справочника клиентов
  function handleBinChange(bin: string) {
    setClientBin(bin)
    if (bin.length === 12) {
      const found = clients.find(c => c.bin_iin === bin)
      if (found) {
        setClientName(found.name)
        setClientEmail(found.email || '')
        setClientAddress(found.address || '')
      }
    }
  }

  async function save() {
    if (!clientName) { alert(t.enterClientNameAlert); return }
    if (!clientBin) { alert(t.enterBinIinAlert); return }
    if (services.some(s => !s.name || s.price === 0)) {
      alert(t.fillAllServicesAlert); return
    }

    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_address: clientAddress,
      client_phone: clientPhone,
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      due_date: dueDate || null,
      services,
      amount: total,
      note: note || null,
    }).eq('id', id)

    if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    setSaving(false)
    router.push('/invoice/' + id)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => router.push('/invoice/' + id)} className="text-xl transition-colors" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>‹</button>
        <Skeleton className="h-6 w-32" />
      </div>
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/invoice/' + id)} className="text-xl transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={backLabel(lang)}>‹</button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.editInvoiceHeaderTitle}</h2>
      </div>
      <div className="lg:flex lg:gap-6 lg:items-start">
      <div className="lg:flex-1 lg:min-w-0 space-y-4">

        {/* Client */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-5 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE }}
        >
          <h3 className="font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.clientDataHeader}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.companyNameLabel}</label>
              <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                placeholder={t.companyNamePlaceholder} value={clientName}
                onChange={e => setClientName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.binIinLabel}</label>
                <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                  placeholder={t.binIinPlaceholder} value={clientBin}
                  onChange={e => handleBinChange(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.emailLabel}</label>
                <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                  placeholder={t.emailPlaceholder} value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.addressLabelEdit}</label>
              <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                placeholder={t.addressPlaceholder} value={clientAddress}
                onChange={e => setClientAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.buyerPhoneLabel}</label>
              <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                placeholder={t.buyerPhonePlaceholderEdit} value={clientPhone}
                onChange={e => setClientPhone(e.target.value)} />
            </div>
          </div>
        </motion.div>

        {/* Contract */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-5 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
        >
          <h3 className="font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.contractHeader}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractNumberLabelEdit}</label>
              <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                placeholder={t.contractNumberPlaceholderEdit} value={contractNumber}
                onChange={e => setContractNumber(e.target.value)} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractDateLabel}</label>
              <input className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
                placeholder={t.contractDatePlaceholder} value={contractDate}
                onChange={e => setContractDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.dueDateLabel}</label>
            <input type="date" className={inputClass} style={{ color: 'var(--nav-text-primary)' }}
              value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </motion.div>

        {/* Services */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-5 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.servicesHeader}</h3>
            <button onClick={addService}
              className="text-xs font-semibold rounded-lg px-3 py-1" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {t.addButton}
            </button>
          </div>
          <div className="space-y-4" id="services-list">
            {services.map((svc, idx) => (
              <div key={idx} className="rounded-xl p-3 space-y-2 border border-[color:var(--nav-border-soft)]">
                {/* Переключатель */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateService(idx, 'type', 'service')}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition"
                    style={(svc.type || 'service') === 'service' ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                    {t.serviceToggleLabel}
                  </button>
                  <button type="button" onClick={() => updateService(idx, 'type', 'product')}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition"
                    style={svc.type === 'product' ? { background: 'var(--nav-success)', color: '#fff' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                    {t.productToggleLabel}
                  </button>
                </div>
                <div className="flex gap-2 items-start">
                  <input
                    className={`flex-1 ${inputClass}`}
                    style={{ color: 'var(--nav-text-primary)' }}
                    placeholder={t.serviceNamePlaceholder}
                    value={svc.name}
                    onChange={e => updateService(idx, 'name', e.target.value)}
                  />
                  {services.length > 1 && (
                    <button onClick={() => removeService(idx)} className="mt-1.5 transition-colors" style={{ color: 'var(--nav-text-muted)' }} aria-label={deleteLabel(lang)}><XIcon /></button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.codeLabel}</label>
                    <input className={inputClass.replace('px-3', 'px-2')} style={{ color: 'var(--nav-text-primary)' }}
                      placeholder={t.codePlaceholder} value={svc.code || ''}
                      onChange={e => updateService(idx, 'code', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.qtyLabel}</label>
                    <input className={inputClass.replace('px-3', 'px-2')} style={{ color: 'var(--nav-text-primary)' }}
                      type="number" placeholder={t.qtyPlaceholder} value={svc.qty || ''}
                      onChange={e => updateService(idx, 'qty', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.unitLabel}</label>
                    <select className={`${inputClass.replace('px-3', 'px-2')} bg-transparent`} style={{ color: 'var(--nav-text-primary)' }}
                      value={svc.unit || 'шт'}
                      onChange={e => updateService(idx, 'unit', e.target.value)}>
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.priceLabel}</label>
                    <input className={inputClass.replace('px-3', 'px-2')} style={{ color: 'var(--nav-text-primary)' }}
                      type="number" placeholder={t.pricePlaceholder} value={svc.price || ''}
                      onChange={e => updateService(idx, 'price', Number(e.target.value))} />
                  </div>
                </div>
                {svc.name && svc.price > 0 && (
                  <div className="text-xs text-right tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>
                    {t.perLineTotal((svc.qty * svc.price).toLocaleString('ru-KZ'))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Note */}
        <motion.div
          className={`nav-glass nav-card-accent rounded-2xl p-5 ${CARD_HOVER}`}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.15 }}
        >
          <h3 className="font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.noteHeader}</h3>
          <textarea
            className={`${inputClass} resize-none`}
            style={{ color: 'var(--nav-text-primary)' }}
            placeholder={t.notePlaceholder}
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </motion.div>

        {/* Total */}
        <motion.div
          className="rounded-2xl p-5"
          style={{ background: 'var(--nav-accent)' }}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
        >
          {vatType === 'vat_16' ? (
            <>
              <div className="flex justify-between text-sm text-white/70 mb-2 tabular-nums">
                <span>{t.amountWithoutVatLabel}</span><span>{totalWithoutVat.toLocaleString('ru-KZ')} ₸</span>
              </div>
              <div className="flex justify-between text-sm text-white/70 mb-3 tabular-nums">
                <span>{t.vat16Label}</span><span>{vatAmount.toLocaleString('ru-KZ')} ₸</span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
            <span>{t.amountDueLabel}</span>
            <span className="text-lg tabular-nums">{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
        </motion.div>

        <motion.button onClick={save} disabled={saving}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.25 }}
          className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:hover:translate-y-0"
          style={{
            background: saving ? 'var(--nav-text-muted)' : 'var(--nav-success)',
            color: '#fff',
            boxShadow: saving ? 'none' : '0 10px 24px -10px var(--nav-success)',
          }}>
          {saving ? t.savingButtonLabel : t.saveChangesButton}
        </motion.button>
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: EASE, duration: reduceMotion ? 0 : 0.4 }}
        className="hidden lg:block lg:w-[380px] lg:sticky lg:top-[110px]"
      >
        <InvoiceLivePreview
          invoiceNumber={invoiceNumber}
          date={invoiceDate}
          dueDate={dueDate ? formatDate(dueDate) : undefined}
          companyName={profile?.company_name || ''}
          companyBin={profile?.bin_iin || ''}
          clientName={clientName}
          clientBin={clientBin}
          services={services}
          note={note}
          vatType={vatType}
          total={total}
        />
      </motion.div>
      </div>
      </div>

    </main>
    </DesktopShell>
  )
}
