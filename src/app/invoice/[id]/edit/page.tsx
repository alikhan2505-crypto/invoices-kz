'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import Skeleton from '@/components/Skeleton'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

export default function EditInvoice() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
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
    <main className="page-surface-in-shell min-h-screen pb-8 lg:pb-6 lg:min-h-full">
      <SiteNav desktopOnly />
      <div className="sticky top-0 lg:top-16 z-10 bg-white border-b px-4 py-4 flex items-center gap-3 lg:h-16">
        <button onClick={() => router.push('/invoice/' + id)} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-8 lg:pb-6 lg:min-h-full">
      <SiteNav desktopOnly />
      <div className="sticky top-0 lg:top-16 z-10 bg-white border-b px-4 py-4 flex items-center gap-3 lg:h-16">
        <button onClick={() => router.push('/invoice/' + id)} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.editInvoiceHeaderTitle}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Client */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">{t.clientDataHeader}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.companyNameLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.companyNamePlaceholder} value={clientName}
                onChange={e => setClientName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.binIinLabel}</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={t.binIinPlaceholder} value={clientBin}
                  onChange={e => handleBinChange(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.emailLabel}</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={t.emailPlaceholder} value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.addressLabelEdit}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.addressPlaceholder} value={clientAddress}
                onChange={e => setClientAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.buyerPhoneLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.buyerPhonePlaceholderEdit} value={clientPhone}
                onChange={e => setClientPhone(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Contract */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">{t.contractHeader}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelEdit}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.contractNumberPlaceholderEdit} value={contractNumber}
                onChange={e => setContractNumber(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.contractDatePlaceholder} value={contractDate}
                onChange={e => setContractDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
              value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[#1C2056]">{t.servicesHeader}</h3>
            <button onClick={addService}
              className="text-xs bg-[#1C2056] text-white rounded-lg px-3 py-1">
              {t.addButton}
            </button>
          </div>
          <div className="space-y-4" id="services-list">
            {services.map((svc, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                {/* Переключатель */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateService(idx, 'type', 'service')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition ${(svc.type || 'service') === 'service' ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {t.serviceToggleLabel}
                  </button>
                  <button type="button" onClick={() => updateService(idx, 'type', 'product')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition ${svc.type === 'product' ? 'bg-[#2DC48D] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {t.productToggleLabel}
                  </button>
                </div>
                <div className="flex gap-2 items-start">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder={t.serviceNamePlaceholder}
                    value={svc.name}
                    onChange={e => updateService(idx, 'name', e.target.value)}
                  />
                  {services.length > 1 && (
                    <button onClick={() => removeService(idx)} className="text-gray-400 hover:text-red-400 text-xl mt-1" aria-label={deleteLabel(lang)}>×</button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t.codeLabel}</label>
                    <input className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.codePlaceholder} value={svc.code || ''}
                      onChange={e => updateService(idx, 'code', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t.qtyLabel}</label>
                    <input className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder={t.qtyPlaceholder} value={svc.qty || ''}
                      onChange={e => updateService(idx, 'qty', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t.unitLabel}</label>
                    <select className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:border-[#1C2056] bg-white"
                      value={svc.unit || 'шт'}
                      onChange={e => updateService(idx, 'unit', e.target.value)}>
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t.priceLabel}</label>
                    <input className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder={t.pricePlaceholder} value={svc.price || ''}
                      onChange={e => updateService(idx, 'price', Number(e.target.value))} />
                  </div>
                </div>
                {svc.name && svc.price > 0 && (
                  <div className="text-xs text-gray-400 text-right">
                    {t.perLineTotal((svc.qty * svc.price).toLocaleString('ru-KZ'))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">{t.noteHeader}</h3>
          <textarea
            className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] resize-none"
            placeholder={t.notePlaceholder}
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* Total */}
        <div className="bg-[#1C2056] rounded-2xl p-5">
          {vatType === 'vat_16' ? (
            <>
              <div className="flex justify-between text-sm text-white/70 mb-2">
                <span>{t.amountWithoutVatLabel}</span><span>{totalWithoutVat.toLocaleString('ru-KZ')} ₸</span>
              </div>
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <span>{t.vat16Label}</span><span>{vatAmount.toLocaleString('ru-KZ')} ₸</span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
            <span>{t.amountDueLabel}</span>
            <span className="text-lg">{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className={`w-full rounded-xl py-4 font-medium text-sm text-white transition ${saving ? 'bg-gray-400' : 'bg-[#2DC48D]'}`}>
          {saving ? t.savingButtonLabel : t.saveChangesButton}
        </button>
      </div>

    </main>
    </DesktopShell>
  )
}