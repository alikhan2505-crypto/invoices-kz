'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import InvoiceLivePreview from '@/components/InvoiceLivePreview'
import { cacheGet, cacheSet } from '@/lib/cache'
import { getActivePlan } from '@/lib/plan'
import { formatDate, formatDateSafe } from '@/lib/date'
import { computeDefaultDueDate, todayDateString } from '@/lib/dueDate'
import { useLanguage } from '@/components/LanguageProvider'
import { closeLabel, deleteLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'

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

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
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

function PeopleIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-accent)' }}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 4.3c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3" />
      <path d="M15 13.7c2.7.5 4.5 2.4 4.5 5.3" />
    </svg>
  )
}

export default function CreateInvoicePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const KNP_OPTIONS = t.knpOptions
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
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
  const [showVatHint, setShowVatHint] = useState(false)
  const vatHintRef = useRef<HTMLSpanElement>(null)
  const [pendingInvoiceData, setPendingInvoiceData] = useState<any>(null)
  // Ref для хранения открытого окна PDF
 
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [noContract, setNoContract] = useState(false)
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

    // "Повторить счёт" from history/the invoice detail page -- prefills this
    // form from a past invoice's client+services+contract, same as a
    // template, but due date/note stay on their own today-based defaults
    // (already computed above) rather than copying the old invoice's dates.
    const repeatId = params.get('repeat')
    if (repeatId) {
      const { data: src } = await supabase.from('invoices').select('*').eq('id', repeatId).eq('user_id', user.id).single()
      if (src) {
        setClientName(src.client_name || '')
        setClientBin(src.client_bin || '')
        setClientEmail(src.client_email || '')
        setClientAddress(src.client_address || '')
        setClientPhone(src.client_phone || '')
        setContractNumber(src.contract_number || '')
        setContractDate(src.contract_date || '')
        if (src.services && src.services.length > 0) setServices(src.services)
        if (src.client_name) setClientSelected(true)
      }
    }

    // Strip ?template=/?repeat= once consumed -- otherwise clearing the
    // client (clearClient) doesn't stick: browser back navigation, or even
    // just switching tabs and back (the focus listener below re-runs load()),
    // re-reads the same still-present query param and silently reapplies the
    // prefill the user just removed. router.replace() (next/navigation) was
    // tried first but silently didn't touch window.location.search here --
    // going straight to the History API instead, which is all this needs
    // (no server re-fetch, just a client-side URL cleanup).
    if (templateId || repeatId) window.history.replaceState(null, '', '/create')
  }, [router])

  useEffect(() => {
    load()
    const handleFocus = () => load()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [load])

  // Примечание всегда отражает выбранный срок оплаты -- вместо статичного
  // "оплата в течение N дней" показываем конкретную дату (2026-08-20, founder request).
  useEffect(() => {
    if (dueDate) setNote(invoiceFlowDict[lang].paymentDueNote(formatDate(dueDate)))
  }, [dueDate, lang])

  useEffect(() => {
    if (!showVatHint) return
    function onOutsideClick(e: MouseEvent) {
      if (vatHintRef.current && !vatHintRef.current.contains(e.target as Node)) setShowVatHint(false)
    }
    document.addEventListener('click', onOutsideClick)
    return () => document.removeEventListener('click', onOutsideClick)
  }, [showVatHint])

  function toggleNoContract(checked: boolean) {
    setNoContract(checked)
    if (checked) { setContractNumber(t.noContractValue); setContractDate('') }
    else { setContractNumber('') }
  }

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
      contractDate: cd ? formatDateSafe(cd) : undefined,
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
      contractNumber, contractDate: contractDate ? formatDateSafe(contractDate) : undefined, knp: clientKnp, services, total,
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
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.newInvoiceTitle}</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{t.newInvoiceSubtitle}</p>
        </motion.div>

        <div className="lg:flex lg:gap-6 lg:items-start">
        <div className="lg:flex-1 lg:min-w-0">

        {monthStats.total > 0 && (
          <div className="grid grid-cols-3 gap-1 mb-4">
            {[
              { value: monthStats.total, label: t.statsInvoicesLabel, color: 'var(--nav-text-primary)' },
              { value: monthStats.paid, label: t.statsPaidLabel, color: 'var(--nav-success)' },
              { value: monthStats.amount > 0 ? (monthStats.amount / 1000).toFixed(0) + 'K' : '0', label: t.statsIncomeLabel, color: 'var(--nav-text-primary)' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 + i * 0.04 }}
              >
                <div className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{s.label}</div>
              </motion.div>
            ))}
          </div>
        )}

        {(() => {
          const activePlan = getActivePlan(profile)
          if (activePlan.plan === 'free') return (
            <div className="nav-glass flex items-center justify-between rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--nav-accent-soft)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.freePlanTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.freePlanSubtitle}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{t.ratesButton}</button>
            </div>
          )
          if (activePlan.isTrial) return (
            <div className="nav-glass flex items-center justify-between rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--nav-success-soft)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-success)' }}>{t.trialPlanTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.trialDaysLeftLabel(activePlan.daysLeft!, activePlan.invoiceLimit! - monthCount)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-success)', color: '#fff' }}>{t.buyButton}</button>
            </div>
          )
          if (activePlan.daysLeft !== null && activePlan.daysLeft <= 3) return (
            <div className="nav-glass flex items-center justify-between rounded-xl px-4 py-3 mb-4">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>{t.expiringPlanTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.daysLeftLabel(activePlan.daysLeft)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>{t.extendButton}</button>
            </div>
          )
          return null
        })()}

        {showOnboarding && (
          <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.onboardingTitle}</div>
              <button onClick={() => setShowOnboarding(false)} className="transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-3">
              {[
                { step: 1, title: t.onboardingStep1Title, desc: t.onboardingStep1Desc, done: !!(profile?.company_name && profile?.bin_iin), action: () => router.push('/profile/requisites'), btn: t.onboardingStep1Btn },
                { step: 2, title: t.onboardingStep2Title, desc: t.onboardingStep2Desc, done: bankAccounts.length > 0, action: () => router.push('/profile/banks'), btn: t.onboardingStep2Btn },
                { step: 3, title: t.onboardingStep3Title, desc: t.onboardingStep3Desc, done: !!(profile?.signature_url), action: () => router.push('/profile/signature'), btn: t.onboardingStep3Btn },
                { step: 4, title: t.onboardingStep4Title, desc: t.onboardingStep4Desc, done: monthStats.total > 0, action: () => {}, btn: '' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: item.done ? 'var(--nav-success-soft)' : 'var(--nav-surface-glass)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={item.done ? { background: 'var(--nav-success)', color: '#fff' } : { background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
                    {item.done ? '✓' : item.step}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: item.done ? 'var(--nav-success)' : 'var(--nav-text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</div>
                    <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{item.desc}</div>
                  </div>
                  {!item.done && item.btn && (
                    <button onClick={item.action} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{item.btn}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          {clients.length > 0 && !clientSelected && (
            <div className="mb-3">
              <p className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.quickClientPickLabel}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {clients.slice(0, 6).map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="nav-glass whitespace-nowrap text-xs px-3 py-2 rounded-full flex-shrink-0 transition-colors hover:bg-[var(--nav-accent)] hover:text-[var(--nav-accent-ink)] hover:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)' }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:mb-4">
          {/* Client section */}
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 lg:mb-0"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
          >
            <h3 className="font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.clientDataHeader}</h3>
            {clientSelected ? (
              <div className="space-y-3">
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'var(--nav-surface-glass)' }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{clientName}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.binLabel(clientBin)}</div>
                    {clientEmail && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{clientEmail}</div>}
                  </div>
                  <button onClick={clearClient} className="transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-critical)]" aria-label={deleteLabel(lang)}><XIcon /></button>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.knpLabel}</label>
                  <select className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.buyerPhoneLabel}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                    onChange={e => setClientPhone(formatPhone(e.target.value))} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={noContract} onChange={e => toggleNoContract(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--nav-accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.noContractLabel}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractNumberLabelDashboard}</label>
                    <input disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractDateLabel}</label>
                    <input type="date" disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.dueDateLabel}</label>
                  <input type="date" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); setDueDateTouched(true) }} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.companyNameLabel}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.companyNamePlaceholder} value={clientName} onChange={e => setClientName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.binIinLabel}</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
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
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.emailLabel}</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.emailPlaceholder} value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.addressLabelDashboard}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.addressPlaceholder} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.buyerPhoneLabel}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                    onChange={e => setClientPhone(formatPhone(e.target.value))} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={noContract} onChange={e => toggleNoContract(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--nav-accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.noContractLabel}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractNumberLabelDashboard}</label>
                    <input disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractDateLabel}</label>
                    <input type="date" disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.dueDateLabel}</label>
                  <input type="date" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); setDueDateTouched(true) }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.knpLabel}</label>
                  <select className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </motion.div>

          {/* Services section + Total, grouped so Total sits directly under Services */}
          <div>
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-5 mb-4"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.15 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.servicesHeader}</h3>
              <div className="flex gap-2">
                {savedServices.length > 0 && (
                  <button onClick={() => setShowServicePicker(true)}
                    className="text-xs font-semibold rounded-lg px-3 py-1 border border-[color:var(--nav-accent)]" style={{ color: 'var(--nav-accent)' }}>
                    {t.fromDirectoryButton}
                  </button>
                )}
                <button onClick={addService} className="text-xs font-semibold rounded-lg px-3 py-1" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.addButton}
                </button>
              </div>
            </div>
            <div className="space-y-4" id="services-list">
              {services.map((svc, idx) => (
                <motion.div
                  key={idx}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE }}
                  className="rounded-xl p-3 space-y-2 border border-[color:var(--nav-border-soft)]"
                >
                  <div className="flex gap-2 mb-2">
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
                    <input className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.serviceNamePlaceholder} value={svc.name}
                      onChange={e => updateService(idx, 'name', e.target.value)} />
                    {services.length > 1 && (
                      <button onClick={() => removeService(idx)} className="mt-1 transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-critical)]" aria-label={deleteLabel(lang)}><XIcon /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.codeLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        placeholder={t.codePlaceholder} value={svc.code || ''}
                        onChange={e => updateService(idx, 'code', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.qtyLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        type="number" placeholder={t.qtyPlaceholder} value={svc.qty || ''}
                        onChange={e => updateService(idx, 'qty', Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.unitLabel}</label>
                      <select className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        value={svc.unit || 'шт'} onChange={e => updateService(idx, 'unit', e.target.value)}>
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.priceLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        type="number" placeholder={t.pricePlaceholder} value={svc.price || ''}
                        onChange={e => updateService(idx, 'price', Number(e.target.value))} />
                    </div>
                  </div>
                  {svc.name && svc.price > 0 && (
                    <div className="text-xs text-right tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.perLineTotal((svc.qty * svc.price).toLocaleString('ru-KZ'))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Total */}
          <motion.div
            className="rounded-2xl p-5 mb-4"
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
                  <span ref={vatHintRef} className="relative flex items-center gap-1.5">
                    {t.vat16Label}
                    <button type="button" onClick={() => setShowVatHint(v => !v)} className="text-white/50 hover:text-white/90 transition-colors" aria-label={t.vatHintAriaLabel}>
                      <InfoIcon />
                    </button>
                    {showVatHint && (
                      <div className="absolute left-0 top-[calc(100%+8px)] z-10 w-60 rounded-xl p-3 text-xs leading-relaxed normal-case"
                        style={{ background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-secondary)', boxShadow: '0 20px 44px -18px rgba(10,10,15,0.35)' }}>
                        {t.vatHintText}
                        <button type="button" onClick={() => { setShowVatHint(false); router.push('/profile/settings') }}
                          className="block mt-2 font-semibold text-left" style={{ color: 'var(--nav-accent)' }}>
                          {t.vatHintLink}
                        </button>
                      </div>
                    )}
                  </span>
                  <span>{vatAmount.toLocaleString('ru-KZ')} ₸</span>
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
              <span className="text-lg tabular-nums">{total.toLocaleString('ru-KZ')} ₸</span>
            </div>
          </motion.div>
          </div>
          </div>

          <motion.button
            onClick={createInvoice} disabled={loading}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.25 }}
            className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:hover:translate-y-0"
            style={{
              background: loading ? 'var(--nav-text-muted)' : 'var(--nav-success)',
              color: '#fff',
              boxShadow: loading ? 'none' : '0 10px 24px -10px var(--nav-success)',
            }}
          >
            {loading ? t.creatingButton : t.createButton}
          </motion.button>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease: EASE, duration: reduceMotion ? 0 : 0.4 }}
          className="hidden lg:block lg:w-[400px] lg:flex-shrink-0 lg:sticky lg:top-[110px]"
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
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.servicePickerTitle}</span>
              <button onClick={() => setShowServicePicker(false)} className="back-btn transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-2">
              {savedServices.map(s => (
                <div key={s.id} onClick={() => selectService(s)}
                  className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border border-[color:var(--nav-border-soft)] hover:border-[color:var(--nav-accent)]">
                  <div>
                    <div className="font-medium text-sm" style={{ color: 'var(--nav-text-primary)' }}>{s.name}</div>
                    <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{s.unit || 'шт'}</div>
                  </div>
                  <div className="text-sm font-medium tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save client modal */}
      {showSaveClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="text-center mb-5">
              <div className="flex justify-center mb-2"><PeopleIcon /></div>
              <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.saveClientModalTitle}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.saveClientPrompt(lastInvoiceClient?.name)}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveClient(false)}
                className="flex-1 rounded-xl py-3 text-sm border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.skipButton}
              </button>
              <button onClick={saveClientToDirectory}
                className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank picker modal */}
      {showBankPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-3xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.bankPickerTitle}</span>
              <button onClick={() => {

                setShowBankPicker(false)
                setPendingInvoiceData(null)
              }} className="back-btn transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-2">
              {bankAccounts.map(bank => (
                <div key={bank.id} onClick={() => generateWithBank(bank)}
                  className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors border border-[color:var(--nav-border-soft)] hover:border-[color:var(--nav-accent)] hover:bg-[var(--nav-surface-glass)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--nav-text-primary)' }}>{bank.bank_name}</span>
                      {bank.is_main && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-success-soft)', color: 'var(--nav-success)' }}>{t.mainBankBadge}</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{bank.iik}</div>
                  </div>
                  <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
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