'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import InvoiceLivePreview from '@/components/InvoiceLivePreview'
import { cacheGet, cacheSet } from '@/lib/cache'
import { getActivePlan } from '@/lib/plan'
import { formatDate } from '@/lib/date'
import { computeDefaultDueDate, todayDateString } from '@/lib/dueDate'
import { useLanguage } from '@/components/LanguageProvider'
import { closeLabel, deleteLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

export default function CreateInvoicePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const KNP_OPTIONS = t.knpOptions
  const [loading, setLoading] = useState(false)
  const [lastCreated, setLastCreated] = useState<number | null>(null)
  const [clients, setClients] = useState<any[]>([])
  const [savedServices, setSavedServices] = useState<any[]>([])
  const [showServicePicker, setShowServicePicker] = useState(false)
  const [clientSelected, setClientSelected] = useState(false)
  const [showSaveClient, setShowSaveClient] = useState(false)
  const [lastInvoiceClient, setLastInvoiceClient] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  // Distinct from `profile` itself being truthy: a cache hit sets `profile`
  // to last-known-good data almost immediately, but a user with no cache yet
  // (new device, cleared storage, or simply first load of the session) saw
  // the invoice-number preview fall back to a hardcoded "INV-0001" for the
  // brief window before the real fetch resolved -- indistinguishable from a
  // genuine, freshly-reset counter. This flag lets the preview show nothing
  // instead of that misleading default until the real profile has loaded at
  // least once.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [monthCount, setMonthCount] = useState(0)
  const [monthStats, setMonthStats] = useState({ paid: 0, total: 0, amount: 0 })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [pendingInvoiceData, setPendingInvoiceData] = useState<any>(null)
  // Ref для хранения открытого окна PDF
 
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [clientKnp, setClientKnp] = useState('849')
  const [note, setNote] = useState('')
  const [services, setServices] = useState<any[]>([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)
  const vatType = profile?.vat_type || 'no_vat'
  const vatAmount = vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(total / 1.16) : total

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const cachedProfile = cacheGet('profile_' + user.id)
    if (cachedProfile) setProfile(cachedProfile)

    const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('*').eq('user_id', user.id).order('name'),
      supabase.from('services').select('*').eq('user_id', user.id).order('name'),
      supabase.from('invoices').select('client_name, client_bin, client_email')
        .eq('user_id', user.id)
        .not('client_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setProfile(p)
    setProfileLoaded(true)
    if (p) cacheSet('profile_' + user.id, p)
    if (p?.default_note) setNote(p.default_note)
    if (!dueDateTouched) setDueDate(computeDefaultDueDate(todayDateString(), p?.default_due_days))

    supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', user.id).then(() => {})

    const { data: banks } = await supabase
      .from('bank_accounts').select('*').eq('user_id', user.id).order('is_main', { ascending: false })
    setBankAccounts(banks || [])

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('invoices').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', monthStart.toISOString())
    setMonthCount(count || 0)

    const { data: monthInvoices } = await supabase
      .from('invoices').select('amount, status')
      .eq('user_id', user.id).gte('created_at', monthStart.toISOString())
    const paid = (monthInvoices || []).filter((i: any) => i.status === 'paid').length
    const amount = (monthInvoices || [])
      .filter((i: any) => i.status === 'paid')
      .reduce((sum: number, i: any) => sum + Number(i.amount), 0)
    setMonthStats({ paid, total: monthInvoices?.length || 0, amount })

    if ((count || 0) === 0 && !p?.company_name) setShowOnboarding(true)

    setSavedServices(s || [])

    const fromHistory = (inv || []).reduce((acc: any[], inv: any) => {
      if (inv.client_name && !acc.find((c: any) => c.name === inv.client_name)) {
        acc.push({ name: inv.client_name, bin_iin: inv.client_bin, email: inv.client_email, id: inv.client_name })
      }
      return acc
    }, [])

    const fromDirectory = (c || []).map((cl: any) => ({ ...cl, id: cl.id }))
    const merged = [...fromDirectory]
    fromHistory.forEach((h: any) => {
      if (!merged.find((m: any) => m.name === h.name)) merged.push(h)
    })
    setClients(merged)

    const params = new URLSearchParams(window.location.search)
    const templateId = params.get('template')
    if (templateId) {
      const { data: tmpl } = await supabase.from('templates').select('*').eq('id', templateId).single()
      if (tmpl) {
        setClientName(tmpl.client_name || '')
        setClientBin(tmpl.client_bin || '')
        setClientEmail(tmpl.client_email || '')
        if (tmpl.services && tmpl.services.length > 0) setServices(tmpl.services)
        if (tmpl.client_name) setClientSelected(true)
      }
    }
  }, [router])

  useEffect(() => {
    load()
    const handleFocus = () => load()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [load])

  function selectClient(client: any) {
    setClientName(client.name)
    setClientBin(client.bin_iin || '')
    setClientEmail(client.email || '')
    setClientAddress(client.address || '')
    setClientPhone(client.phone || '')
    setClientSelected(true)
  }

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 11)
    return result
  }

  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
    setClientPhone('')
    setContractNumber('')
    setContractDate('')
    setClientKnp('849')
    setClientSelected(false)
    setNote('')
    setDueDate(computeDefaultDueDate(todayDateString(), profile?.default_due_days))
    setDueDateTouched(false)
  }

  function selectService(svc: any) {
    const exists = services.find(s => s.name === svc.name)
    if (exists) { setShowServicePicker(false); return }
    const updated = services[0].name === '' ? [] : [...services]
    setServices([...updated, { name: svc.name, qty: 1, price: svc.price, unit: svc.unit || 'шт', code: svc.code || '', type: 'service' }])
    setShowServicePicker(false)
  }

  function addService() {
    setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }, ...services])
    setTimeout(() => {
      const el = document.getElementById('services-list')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function removeService(idx: number) { setServices(services.filter((_, i) => i !== idx)) }

  function updateService(idx: number, field: string, value: any) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServices(updated)
  }

  async function saveClientToDirectory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !lastInvoiceClient) return
    const { error } = await supabase.from('clients').insert({ ...lastInvoiceClient, user_id: user.id })
    if (!error) setClients(prev => [...prev, { ...lastInvoiceClient, id: lastInvoiceClient.bin_iin }])
    setShowSaveClient(false)
  }

  function buildPDFProfile() {
    return {
      company_name: profile?.company_name || '',
      bin_iin: profile?.bin_iin || '',
      address: profile?.address || '',
      director_name: profile?.director_name || '',
      phone: profile?.phone || '',
      signature_url: profile?.signature_url || '',
      stamp_url: profile?.stamp_url || '',
      logo_url: profile?.logo_url || '',
    }
  }

  async function generateWithBank(bank: any) {
    if (!pendingInvoiceData) return
    const win = window.open('', '_blank')
    const { invoiceNumber, invoiceDate, cn, cb, ce, ca, cp, cn2, cd, svcs, tot, nt, knp, pt, dd } = pendingInvoiceData
    // Берём окно из ref (было открыто при клике на банк — прямой клик пользователя)
    const html = await generateInvoicePDF({
      number: invoiceNumber,
      date: invoiceDate,
      clientName: cn,
      clientBin: cb,
      clientEmail: ce,
      clientAddress: ca,
      clientPhone: cp,
      contractNumber: cn2,
      contractDate: cd,
      knp,
      services: svcs,
      total: tot,
      note: nt || profile?.default_note || '',
      autoPrint: false,
      vatType: profile?.vat_type || 'no_vat',
      profile: buildPDFProfile(),
      bank: {
        bank_name: bank.bank_name || '',
        iik: bank.iik || '',
        bik: bank.bik || '',
        kbe: bank.kbe || '19',
      },
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: pt ? `https://www.invoices.kz/view/${pt}` : undefined,
      dueDate: dd ? formatDate(dd) : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    setShowBankPicker(false)
    setPendingInvoiceData(null)
    if (win) { win.document.write(html); win.document.close() }
  }

  async function createInvoice() {
    if (!profile?.company_name || !profile?.bin_iin) {
      alert(t.fillCompanyDetailsFirstAlert)
      router.push('/profile/requisites')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert(t.signInAlert); return }

    const { data: banks } = await supabase
      .from('bank_accounts').select('*').eq('user_id', user.id).order('is_main', { ascending: false })

    if (!banks || banks.length === 0) {
      if (confirm(t.bankDetailsNeededConfirm)) {
        router.push('/profile/banks')
      }
      return
    }

    if (!clientName) { alert(t.enterClientNameAlert); return }
    if (!clientBin) { alert(t.enterClientBinAlert); return }
    if (services.length === 0 || services.some(s => !s.name)) {
      alert(t.addAtLeastOneServiceAlert); return
    }
    if (services.some(s => s.price === 0)) {
      alert(t.specifyPriceForAllServicesAlert); return
    }
    if (lastCreated && Date.now() - lastCreated < 180000) {
      if (!confirm(t.recentInvoiceConfirm)) return
    }

    setLoading(true)

    const activePlan = getActivePlan(profile)

    if (activePlan.invoiceLimit !== null && monthCount >= activePlan.invoiceLimit) {
      setLoading(false)
      if (activePlan.plan === 'free') {
        alert(t.planLimitFreeMessage(activePlan.invoiceLimit!))
        router.push('/upgrade')
      } else if (activePlan.isTrial) {
        alert(t.planLimitTrialMessage(activePlan.invoiceLimit!))
        router.push('/upgrade')
      } else {
        alert(t.planLimitBasicMessage(activePlan.invoiceLimit!))
        router.push('/upgrade')
      }
      return
    }

    if (!activePlan.isActive && activePlan.plan === 'free') {
      router.push('/upgrade')
      setLoading(false)
      return
    }

    const { data: invoiceNumber, error: numberError } = await supabase.rpc('claim_invoice_number', { p_user_id: user.id })
    if (numberError) {
      alert(t.errorPrefix(numberError.message))
      setLoading(false)
      return
    }

    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: total,
      status: 'draft',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_address: clientAddress,
      client_phone: clientPhone || null,
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      due_date: dueDate || null,
      services,
      note: note || profile?.default_note || null,
    }).select().single()

    if (error) {
      alert(t.errorPrefix(error.message))
      setLoading(false)
      return
    }

    await supabase.from('invoice_logs').insert({ invoice_id: data.id, status: 'draft' })

    setMonthCount(prev => prev + 1)
    setLastCreated(Date.now())
    setLoading(false)

    const invoiceDate = new Date().toLocaleDateString('ru-KZ')

    if (banks.length > 1) {
      // Несколько банков — сохраняем окно в ref, откроется при выборе банка
      setBankAccounts(banks)
      setPendingInvoiceData({
        invoiceNumber: data.number,
        invoiceDate,
        cn: clientName, cb: clientBin, ce: clientEmail,
        ca: clientAddress, cp: clientPhone,
        cn2: contractNumber, cd: contractDate,
        knp: clientKnp, svcs: services, tot: total, nt: note,
        pt: data.public_token,
        dd: dueDate,
      })
      setShowBankPicker(true)
      clearClient()
      setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
      return
    }
    const bank = banks[0]
    const win = window.open('', '_blank')
    const html = await generateInvoicePDF({
      number: data.number, date: invoiceDate,
      clientName, clientBin, clientEmail, clientAddress, clientPhone,
      contractNumber, contractDate, knp: clientKnp, services, total,
      note: note || '', autoPrint: false, vatType: profile?.vat_type || 'no_vat',
      profile: buildPDFProfile(),
      bank: {
        bank_name: bank.bank_name || '',
        iik: bank.iik || '',
        bik: bank.bik || '',
        kbe: bank.kbe || '19',
      },
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: data.public_token ? `https://www.invoices.kz/view/${data.public_token}` : undefined,
      dueDate: dueDate ? formatDate(dueDate) : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    if (win) { win.document.write(html); win.document.close() }

    clearClient()
    setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-7xl mx-auto p-4">
        <h2 className="text-xl font-bold text-[#1C2056] mb-1">{t.newInvoiceTitle}</h2>
        <p className="text-sm text-gray-500 mb-4">{t.newInvoiceSubtitle}</p>

        <div className="lg:flex lg:gap-6 lg:items-start">
        <div className="lg:flex-1 lg:min-w-0">

        {monthStats.total > 0 && (
          <div className="grid grid-cols-3 gap-1 mb-4">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-[#1C2056]">{monthStats.total}</div>
              <div className="text-xs text-gray-400 mt-0.5">{t.statsInvoicesLabel}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-[#2DC48D]">{monthStats.paid}</div>
              <div className="text-xs text-gray-400 mt-0.5">{t.statsPaidLabel}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-[#1C2056]">
                {monthStats.amount > 0 ? (monthStats.amount / 1000).toFixed(0) + 'K' : '0'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{t.statsIncomeLabel}</div>
            </div>
          </div>
        )}

        {(() => {
          const activePlan = getActivePlan(profile)
          if (activePlan.plan === 'free') return (
            <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-4 bg-blue-50 border border-blue-100">
              <div>
                <div className="text-sm font-medium text-[#1C2056]">{t.freePlanTitle}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.freePlanSubtitle}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">{t.ratesButton}</button>
            </div>
          )
          if (activePlan.isTrial) return (
            <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-4 bg-green-50 border border-green-100">
              <div>
                <div className="text-sm font-medium text-green-700">{t.trialPlanTitle}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.trialDaysLeftLabel(activePlan.daysLeft!, activePlan.invoiceLimit! - monthCount)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs bg-[#2DC48D] text-white px-3 py-1.5 rounded-lg">{t.buyButton}</button>
            </div>
          )
          if (activePlan.daysLeft !== null && activePlan.daysLeft <= 3) return (
            <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-4 bg-red-50 border border-red-100">
              <div>
                <div className="text-sm font-medium text-red-600">{t.expiringPlanTitle}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.daysLeftLabel(activePlan.daysLeft)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg">{t.extendButton}</button>
            </div>
          )
          return null
        })()}

        {showOnboarding && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium text-[#1C2056]">{t.onboardingTitle}</div>
              <button onClick={() => setShowOnboarding(false)} className="text-gray-400 hover:text-gray-500 text-lg" aria-label={closeLabel(lang)}>✕</button>
            </div>
            <div className="space-y-3">
              {[
                { step: 1, title: t.onboardingStep1Title, desc: t.onboardingStep1Desc, done: !!(profile?.company_name && profile?.bin_iin), action: () => router.push('/profile/requisites'), btn: t.onboardingStep1Btn },
                { step: 2, title: t.onboardingStep2Title, desc: t.onboardingStep2Desc, done: bankAccounts.length > 0, action: () => router.push('/profile/banks'), btn: t.onboardingStep2Btn },
                { step: 3, title: t.onboardingStep3Title, desc: t.onboardingStep3Desc, done: !!(profile?.signature_url), action: () => router.push('/profile/signature'), btn: t.onboardingStep3Btn },
                { step: 4, title: t.onboardingStep4Title, desc: t.onboardingStep4Desc, done: monthStats.total > 0, action: () => {}, btn: '' },
              ].map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${item.done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${item.done ? 'bg-[#2DC48D] text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {item.done ? '✓' : item.step}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${item.done ? 'text-green-700 line-through' : 'text-[#1C2056]'}`}>{item.title}</div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                  {!item.done && item.btn && (
                    <button onClick={item.action} className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg flex-shrink-0">{item.btn}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          {clients.length > 0 && !clientSelected && (
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-2">{t.quickClientPickLabel}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {clients.slice(0, 6).map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="whitespace-nowrap text-xs bg-white border border-gray-200 text-[#1C2056] px-3 py-2 rounded-full hover:bg-[#1C2056] hover:text-white transition flex-shrink-0 shadow-sm">
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:mb-4">
          {/* Client section */}
          <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm lg:mb-0">
            <h3 className="font-medium text-[#1C2056] mb-3">{t.clientDataHeader}</h3>
            {clientSelected ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[#1C2056]">{clientName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{t.binLabel(clientBin)}</div>
                    {clientEmail && <div className="text-xs text-gray-400">{clientEmail}</div>}
                  </div>
                  <button onClick={clearClient} className="text-gray-400 hover:text-red-400 text-xl" aria-label={deleteLabel(lang)}>✕</button>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.knpLabel}</label>
                  <select className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] bg-white"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.buyerPhoneLabel}</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                    onChange={e => setClientPhone(formatPhone(e.target.value))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); setDueDateTouched(true) }} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.companyNameLabel}</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder={t.companyNamePlaceholder} value={clientName} onChange={e => setClientName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.binIinLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.binIinPlaceholder} value={clientBin}
                      onChange={async e => {
                        const bin = e.target.value
                        setClientBin(bin)
                        if (bin.length === 12) {
                          const found = clients.find(c => c.bin_iin === bin)
                          if (found) {
                            setClientName(found.name)
                            setClientEmail(found.email || '')
                            setClientAddress(found.address || '')
                            setClientPhone(found.phone || '')
                          }
                        }
                      }} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.emailLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.emailPlaceholder} value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.addressLabelDashboard}</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder={t.addressPlaceholder} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.buyerPhoneLabel}</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                    onChange={e => setClientPhone(formatPhone(e.target.value))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); setDueDateTouched(true) }} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.knpLabel}</label>
                  <select className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] bg-white"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Services section + Total, grouped so Total sits directly under Services */}
          <div>
          <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-[#1C2056]">{t.servicesHeader}</h3>
              <div className="flex gap-2">
                {savedServices.length > 0 && (
                  <button onClick={() => setShowServicePicker(true)}
                    className="text-xs text-[#1C2056] border border-[#1C2056] rounded-lg px-3 py-1">
                    {t.fromDirectoryButton}
                  </button>
                )}
                <button onClick={addService} className="text-xs bg-[#1C2056] text-white rounded-lg px-3 py-1">
                  {t.addButton}
                </button>
              </div>
            </div>
            <div className="space-y-4" id="services-list">
              {services.map((svc, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 mb-2">
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
                    <input className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.serviceNamePlaceholder} value={svc.name}
                      onChange={e => updateService(idx, 'name', e.target.value)} />
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
                        value={svc.unit || 'шт'} onChange={e => updateService(idx, 'unit', e.target.value)}>
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

          {/* Total */}
          <div className="bg-[#1C2056] rounded-2xl p-5 mb-4">
            {vatType === 'vat_16' ? (
              <>
                <div className="flex justify-between text-sm text-white/70 mb-2">
                  <span>{t.amountWithoutVatLabel}</span><span>{totalWithoutVat.toLocaleString('ru-KZ')} ₸</span>
                </div>
                <div className="flex justify-between text-sm text-white/70 mb-3">
                  <span>{t.vat16Label}</span><span>{vatAmount.toLocaleString('ru-KZ')} ₸</span>
                </div>
              </>
            ) : vatType === 'vat_0' ? (
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <span>{t.vat0Label}</span><span>{t.vat0Amount}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <span>{t.noVatLabel}</span><span>{t.noVatDash}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
              <span>{t.amountDueLabel}</span>
              <span className="text-lg">{total.toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
          </div>
          </div>

          <button onClick={createInvoice} disabled={loading}
            className={`w-full rounded-xl py-4 font-medium text-sm text-white transition ${loading ? 'bg-gray-400' : 'bg-[#2DC48D]'}`}>
            {loading ? t.creatingButton : t.createButton}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
          className="hidden lg:block lg:w-[400px] lg:flex-shrink-0 lg:sticky lg:top-[88px]"
        >
          <InvoiceLivePreview
            invoiceNumber={!profileLoaded ? '' : (profile?.invoice_prefix || 'INV-') + (profile?.invoice_next_number || '0001')}
            date={formatDate(new Date().toISOString())}
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

      {/* Service picker modal */}
      {showServicePicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-[#1C2056]">{t.servicePickerTitle}</span>
              <button onClick={() => setShowServicePicker(false)} className="back-btn text-gray-400 text-xl" aria-label={closeLabel(lang)}>✕</button>
            </div>
            <div className="space-y-2">
              {savedServices.map(s => (
                <div key={s.id} onClick={() => selectService(s)}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-[#1C2056]">
                  <div>
                    <div className="font-medium text-sm text-[#1C2056]">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.unit || 'шт'}</div>
                  </div>
                  <div className="text-sm font-medium text-[#1C2056]">{Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save client modal */}
      {showSaveClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">👥</div>
              <div className="font-semibold text-[#1C2056] mb-1">{t.saveClientModalTitle}</div>
              <div className="text-sm text-gray-400">{t.saveClientPrompt(lastInvoiceClient?.name)}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveClient(false)}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                {t.skipButton}
              </button>
              <button onClick={saveClientToDirectory}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {t.saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank picker modal */}
      {showBankPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-[#1C2056]">{t.bankPickerTitle}</span>
              <button onClick={() => {

                setShowBankPicker(false)
                setPendingInvoiceData(null)
              }} className="back-btn text-gray-400 text-xl" aria-label={closeLabel(lang)}>✕</button>
            </div>
            <div className="space-y-2">
              {bankAccounts.map(bank => (
                <div key={bank.id} onClick={() => generateWithBank(bank)}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-100 cursor-pointer hover:border-[#1C2056] hover:bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#1C2056]">{bank.bank_name}</span>
                      {bank.is_main && <span className="text-xs bg-[#2DC48D]/10 text-[#2DC48D] px-2 py-0.5 rounded-full">{t.mainBankBadge}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{bank.iik}</div>
                  </div>
                  <span className="text-gray-400 text-lg">›</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </main>
    </DesktopShell>
  )
}