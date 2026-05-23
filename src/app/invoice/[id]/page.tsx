'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { formatDateTime, formatDate } from '@/lib/date'
import { generateKP } from '@/lib/generateKP'
import { generateAVR } from '@/lib/generateAVR'
import { generateNakladnaya } from '@/lib/generateNakladnaya'
import { getActivePlan } from '@/lib/plan'

const statusLabel: Record<string, { text: string; color: string; dot: string }> = {
  paid:    { text: 'Оплачен',    color: 'text-green-600',  dot: 'bg-green-500' },
  sent:    { text: 'Отправлен',  color: 'text-blue-600',   dot: 'bg-blue-400' },
  overdue: { text: 'Просрочен',  color: 'text-red-600',    dot: 'bg-red-500' },
  draft:   { text: 'Черновик',   color: 'text-gray-500',   dot: 'bg-gray-300' },
  viewed:  { text: 'Просмотрен', color: 'text-purple-600', dot: 'bg-purple-400' },
}

const statusIcon: Record<string, string> = {
  paid: '✅', sent: '📤', overdue: '⏰', draft: '📝', viewed: '👁'
}

export default function InvoicePage() {
  const router = useRouter()
  const { id } = useParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
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

  const [showPDFModal, setShowPDFModal] = useState(false)
  const [pdfHTML, setPdfHTML] = useState('')

  useEffect(() => { loadInvoice() }, [])

  async function loadInvoice() {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
    setInvoice(inv)
    if (inv?.client_email) setEmailTo(inv.client_email)

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
    if (!confirm('Аннулировать счёт?')) return
    await supabase.from('invoices').delete().eq('id', id)
    router.push('/history')
  }

  async function duplicateInvoice() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: freshProfile } = await supabase.from('profiles')
      .select('invoice_prefix, invoice_next_number').eq('id', user.id).single()
    const prefix = freshProfile?.invoice_prefix || 'INV-'
    const nextNum = freshProfile?.invoice_next_number || '0001'
    const invoiceNumber = prefix + nextNum
    const newNum = String(parseInt(nextNum) + 1).padStart(nextNum.length, '0')
    await supabase.from('profiles').update({ invoice_next_number: newNum }).eq('id', user.id)
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id, number: invoiceNumber, amount: invoice.amount,
      status: 'draft', client_name: invoice.client_name, client_bin: invoice.client_bin,
      client_email: invoice.client_email, services: invoice.services,
      note: invoice.note, created_at: new Date().toISOString(),
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return }
    await supabase.from('invoice_logs').insert({ invoice_id: data.id, status: 'draft' })
    router.push('/invoice/' + data.id)
  }

  async function copyPublicLink() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (data?.public_token) {
      const link = `https://invoices.kz/view/${data.public_token}`
      try {
        await navigator.clipboard.writeText(link)
        alert('Ссылка скопирована: ' + link)
      } catch {
        const el = document.createElement('textarea')
        el.value = link
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        alert('Ссылка скопирована: ' + link)
      }
    } else {
      alert('Ошибка: токен не найден')
    }
  }

  async function shareWhatsApp() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (!data?.public_token) { alert('Ошибка'); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = `Здравствуйте! Направляю вам счёт на оплату ${invoice.number} на сумму ${Number(invoice.amount).toLocaleString('ru-KZ')} ₸.\n\nОткрыть счёт: ${link}`
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
    await updateStatus('sent')
  }

  async function sendEmailConfirm() {
    if (!emailTo) { alert('Введите email адрес'); return }
    setSendingEmail(true)
    const res = await fetch('/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: id, overrideEmail: emailTo })
    })
    const data = await res.json()
    setSendingEmail(false)
    if (data.success) {
      alert(`✅ Счёт отправлен на ${emailTo}`)
      setShowEmailModal(false)
      await loadInvoice()
    } else {
      alert('Ошибка: ' + data.error)
    }
  }

  async function sendReminder() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (!data?.public_token) { alert('Ошибка'); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = `Здравствуйте, ${invoice.client_name}!\n\nНапоминаем о неоплаченном счёте:\n\n📄 Счёт: ${invoice.number}\n💰 Сумма: ${Number(invoice.amount).toLocaleString('ru-KZ')} ₸\n🔗 Открыть счёт: ${link}\n\nПожалуйста, произведите оплату. Спасибо!`
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  async function openPDF(withSignature = true) {
    if (!invoice || !profile) return
    const html = await generateInvoicePDF({
      number: invoice.number, date: formatDate(invoice.created_at),
      clientName: invoice.client_name || '', clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '', clientAddress: invoice.client_address || '',
      clientPhone: invoice.client_phone || '', contractNumber: invoice.contract_number || '',
      contractDate: invoice.contract_date || '',
      services: invoice.services || [],
      total: Number(invoice.amount), note: invoice.note || profile?.default_note || '',
      autoPrint: false, vatType: profile?.vat_type,
      profile: buildProfile(withSignature),
      bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
    })
    setPdfHTML(html)
    setShowPDFModal(true)
  }

  function calcServiceTotal(svcs: any[]) {
    return svcs.filter(s => !s.type || s.type === 'service').reduce((sum, s) => sum + s.qty * s.price, 0)
  }

  function calcProductTotal(svcs: any[]) {
    return svcs.filter(s => s.type === 'product').reduce((sum, s) => sum + s.qty * s.price, 0)
  }

  async function getNextNumber(type: 'kp' | 'avr' | 'nakladnaya', userId: string) {
    const { data: p } = await supabase.from('profiles')
      .select('kp_prefix, kp_next_number, avr_prefix, avr_next_number, nakladnaya_prefix, nakladnaya_next_number')
      .eq('id', userId).single()

    let prefix: string
    let num: number

    if (type === 'kp') {
      prefix = p?.kp_prefix || 'КП-'
      num = p?.kp_next_number || 1
      await supabase.from('profiles').update({ kp_next_number: num + 1 }).eq('id', userId)
    } else if (type === 'avr') {
      prefix = p?.avr_prefix || 'АВР-'
      num = p?.avr_next_number || 1
      await supabase.from('profiles').update({ avr_next_number: num + 1 }).eq('id', userId)
    } else {
      prefix = p?.nakladnaya_prefix || 'НАК-'
      num = p?.nakladnaya_next_number || 1
      await supabase.from('profiles').update({ nakladnaya_next_number: num + 1 }).eq('id', userId)
    }

    return `${prefix}${String(num).padStart(4, '0')}`
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-400 text-sm">Загрузка...</p>
      </div>
    </main>
  )

  if (!invoice) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Счёт не найден</p>
    </main>
  )

  const status = statusLabel[invoice.status] || statusLabel.draft
  const services = invoice.services || []
  const ap = getActivePlan(profile)

  const serviceTotal = calcServiceTotal(services)
  const productTotal = calcProductTotal(services)
  const hasServices = serviceTotal > 0
  const hasProducts = productTotal > 0

  function DocButton({ label, icon, onClick, locked, lockedLabel, savedCount, disabled, disabledReason }: {
    label: string; icon: string; onClick: () => void; locked: boolean; lockedLabel: string
    savedCount: number; disabled?: boolean; disabledReason?: string
  }) {
    const isLocked = locked
    const isDisabled = !locked && disabled
    return (
      <button
        onClick={() => {
          if (isLocked) showUpgrade(lockedLabel, 'pro')
          else if (isDisabled) alert(disabledReason || 'Недоступно')
          else onClick()
        }}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 border-b border-gray-100">
        <div className="flex flex-col items-start gap-0.5">
          <span className={isLocked || isDisabled ? 'text-gray-400' : 'text-[#1C2056]'}>
            {icon} {label}
          </span>
          {savedCount > 0 && (
            <span className="text-xs text-[#2DC48D]">
              📁 {savedCount} {savedCount === 1 ? 'документ' : 'документа'} сохранено в налоговую
            </span>
          )}
          {isDisabled && disabledReason && (
            <span className="text-xs text-gray-400">{disabledReason}</span>
          )}
        </div>
        {isLocked ? (
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
            🔒 Про
          </span>
        ) : isDisabled ? (
          <span className="text-xs text-gray-300 flex-shrink-0">—</span>
        ) : (
          <span className="text-gray-300 flex-shrink-0">›</span>
        )}
      </button>
    )
  }

  function LockedButton({ label, icon, onClick, locked, lockedLabel }: {
    label: string; icon: string; onClick: () => void; locked: boolean; lockedLabel: string
  }) {
    return (
      <button
        onClick={locked ? () => showUpgrade(lockedLabel, lockedLabel.includes('Про') ? 'pro' : 'basic') : onClick}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 border-b border-gray-100">
        <span className={locked ? 'text-gray-400' : 'text-[#1C2056]'}>{icon} {label}</span>
        {locked ? (
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
            🔒 {lockedLabel.includes('Про') ? 'Про' : 'Базовый'}
          </span>
        ) : (
          <span className="text-gray-300">›</span>
        )}
      </button>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/history')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Счёт {invoice.number}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
          <div className="text-3xl font-bold text-[#1C2056] mb-1">
            {Number(invoice.amount).toLocaleString('ru-KZ')} ₸
          </div>
          <div className="text-gray-500 text-sm mb-2">{invoice.client_name || 'Без клиента'}</div>
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${status.color}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
            {status.text}
          </span>
        </div>

        {/* 4 кнопки действий */}
        <div className="grid grid-cols-4 gap-2">
          <button onClick={shareWhatsApp}
            className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50">
            <div className="text-xl mb-1">💬</div>
            <div className="text-xs text-gray-500">WhatsApp</div>
          </button>
          <button onClick={copyPublicLink}
            className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50">
            <div className="text-xl mb-1">🔗</div>
            <div className="text-xs text-gray-500">Ссылка</div>
          </button>
          {/* PDF — окно открывается в кнопке модала (прямой клик пользователя) */}
          <button onClick={() => askSignature(openPDF)}
            className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50">
            <div className="text-xl mb-1">📄</div>
            <div className="text-xs text-gray-500">PDF</div>
          </button>
          <button
            onClick={() => ap.canEmail
              ? setShowEmailModal(true)
              : showUpgrade('Email отправка доступна с тарифа Базовый', 'basic')
            }
            className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50 relative">
            <div className="text-xl mb-1">📧</div>
            <div className="text-xs text-gray-500">Email</div>
            {!ap.canEmail && (
              <span className="absolute -top-1 -right-1 text-xs bg-amber-400 text-white w-4 h-4 rounded-full flex items-center justify-center">🔒</span>
            )}
          </button>
        </div>

        {services.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Услуги и товары</div>
            {services.map((s: any, i: number) => (
              <div key={i} className={`flex justify-between px-4 py-3 ${i < services.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-[#1C2056]">{s.name}</div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${s.type === 'product' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {s.type === 'product' ? 'Товар' : 'Услуга'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{s.qty} {s.unit || 'шт'} × {Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
                <div className="text-sm font-medium">{(s.qty * s.price).toLocaleString('ru-KZ')} ₸</div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm font-medium text-[#1C2056]">Итого</span>
              <span className="text-sm font-bold text-[#1C2056]">{Number(invoice.amount).toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
        )}

        {invoice.note && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Примечание</div>
            <div className="text-sm text-gray-600">{invoice.note}</div>
          </div>
        )}

        {bank && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Банковские реквизиты</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Банк</span>
                <span className="text-[#1C2056] font-medium">{bank.bank_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">ИИК</span>
                <span className="text-[#1C2056] font-mono text-xs">{bank.iik}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">БИК</span>
                <span className="text-[#1C2056] font-mono text-xs">{bank.bik}</span>
              </div>
              {bank.kbe && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">КБе</span>
                  <span className="text-[#1C2056]">{bank.kbe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* История */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">История</div>
          {logs.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-2">Нет записей</div>
          ) : (
            <div className="space-y-0">
              {logs.map((log, i) => {
                const s = statusLabel[log.status] || statusLabel.draft
                const icon = statusIcon[log.status] || '📝'
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ${s.dot}`}></span>
                      {i < logs.length - 1 && <div className="w-px flex-1 min-h-[24px] bg-gray-100 my-1"></div>}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className={`text-sm font-medium ${s.color}`}>{icon} {s.text}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Изменить статус */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Изменить статус</div>
          {[
            { status: 'draft',   label: '📝 Черновик' },
            { status: 'sent',    label: '📤 Отправлен' },
            { status: 'viewed',  label: '👁 Просмотрен клиентом' },
            { status: 'paid',    label: '✅ Оплачен' },
            { status: 'overdue', label: '⏰ Просрочен' },
          ].filter(s => s.status !== invoice.status).map((s, i, arr) => (
            <button key={s.status} onClick={() => updateStatus(s.status)} disabled={updating}
              className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-sm text-left ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className="text-[#1C2056]">{s.label}</span>
              <span className="text-gray-300">›</span>
            </button>
          ))}
        </div>

        {/* Действия */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => router.push('/invoice/' + id + '/edit')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            <span>📝 Редактировать</span>
            <span className="text-gray-300">›</span>
          </button>

          <button onClick={duplicateInvoice}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            <span>📋 Дублировать</span>
            <span className="text-gray-300">›</span>
          </button>

          {/* КП */}
          <DocButton
            label="Коммерческое предложение"
            icon="📋"
            locked={!ap.canKpAvrNakl}
            lockedLabel="Доступно на тарифе Про"
            savedCount={kpCount}
            onClick={async () => {
              if (!profile) return
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const kpNumber = await getNextNumber('kp', user.id)
              const today = new Date()
              today.setDate(today.getDate() + 30)
              const validUntil = prompt('Действителен до:', today.toLocaleDateString('ru-KZ'))
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
            label="Акт выполненных работ"
            icon="📄"
            locked={!ap.canKpAvrNakl}
            lockedLabel="Доступно на тарифе Про"
            savedCount={avrCount}
            disabled={!hasServices}
            disabledReason="Нет услуг в счёте"
            onClick={async () => {
              if (!profile) return
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const avrNumber = await getNextNumber('avr', user.id)
              const contractNumber = prompt('Номер договора (необязательно):', invoice.contract_number || '')
              const contractDate = prompt('Дата договора:', invoice.contract_date || formatDate(invoice.created_at))
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
            label="Накладная на отпуск товара"
            icon="📦"
            locked={!ap.canKpAvrNakl}
            lockedLabel="Доступно на тарифе Про"
            savedCount={naklCount}
            disabled={!hasProducts}
            disabledReason="Нет товаров в счёте"
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
            label="Сохранить как шаблон"
            icon="⭐"
            locked={!ap.canTemplates}
            lockedLabel="Доступно на тарифе Про"
            onClick={async () => {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const name = prompt('Название шаблона:', invoice.client_name + ' — ' + invoice.number)
              if (!name) return
              const { error } = await supabase.from('templates').insert({
                user_id: user.id, name,
                client_name: invoice.client_name, client_bin: invoice.client_bin,
                client_email: invoice.client_email, services: invoice.services,
                amount: invoice.amount,
              })
              if (error) { alert('Ошибка: ' + error.message); return }
              alert('Шаблон сохранён!')
            }}
          />

          <button onClick={sendReminder}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            <span>🔔 Напомнить об оплате</span>
            <span className="text-gray-300">›</span>
          </button>

          <LockedButton
            label={invoice.recurring_active ? 'Повторение включено' : 'Повторять ежемесячно'}
            icon="🔄"
            locked={!ap.canRecurring}
            lockedLabel="Доступно на тарифе Про"
            onClick={async () => {
              if (invoice.recurring_active) {
                await supabase.from('invoices').update({ recurring_active: false }).eq('id', id)
                await loadInvoice()
                alert('Повторение отключено')
              } else {
                const until = prompt('Повторять до (ДД.ММ.ГГГГ):', '01.12.2026')
                if (!until) return
                const parts = until.split('.')
                if (parts.length !== 3) { alert('Неверный формат даты'); return }
                if (!invoice.client_email) { alert('У клиента нет email!'); return }
                const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
                await supabase.from('invoices').update({ recurring_active: true, recurring_until: isoDate }).eq('id', id)
                await loadInvoice()
                alert(`Повторение включено до ${until}`)
              }
            }}
          />

          <button onClick={deleteInvoice}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-red-500">
            ← Отозвать / Аннулировать
          </button>
        </div>
      </div>

      {/* Модал апгрейда */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔒</div>
              <div className="font-semibold text-[#1C2056] mb-2">Необходим апгрейд</div>
              <div className="text-sm text-gray-400">{upgradeMessage}</div>
            </div>
            <div className="space-y-2">
              <button onClick={() => { setShowUpgradeModal(false); router.push('/upgrade') }}
                className="w-full bg-[#1C2056] text-white rounded-xl py-3.5 font-medium text-sm">
                🚀 Перейти к тарифам
              </button>
              <button onClick={() => setShowUpgradeModal(false)}
                className="w-full text-gray-400 text-sm py-2">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Модал Email */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">📧</div>
              <div className="font-semibold text-[#1C2056] mb-1">Отправить счёт на email</div>
              <div className="text-sm text-gray-400 mb-4">Измените адрес если нужно</div>
            </div>
            <label className="text-xs text-gray-500 mb-1 block">Email получателя</label>
            <input className="w-full border rounded-lg px-3 py-3 text-sm outline-none focus:border-[#1C2056] mb-4"
              placeholder="client@mail.kz" type="email"
              value={emailTo} onChange={e => setEmailTo(e.target.value)} />
            <div className="space-y-2">
              <button onClick={sendEmailConfirm} disabled={sendingEmail}
                className="w-full bg-[#1C2056] text-white rounded-xl py-4 text-sm font-medium">
                {sendingEmail ? 'Отправляем...' : '📧 Отправить'}
              </button>
              <button onClick={() => setShowEmailModal(false)}
                className="w-full text-gray-400 text-sm py-2">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Модал подписи — здесь открываем window.open (прямой клик пользователя → iOS не блокирует) */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">✍️</div>
              <div className="font-semibold text-[#1C2056] mb-1">Формат документа</div>
              <div className="text-sm text-gray-400">Выберите вариант для скачивания</div>
            </div>
            <div className="space-y-3 mb-4">
              <button onClick={() => {
                if (!ap.canSign) {
                  setShowSignModal(false)
                  showUpgrade('PDF с подписью доступен с тарифа Базовый', 'basic')
                  return
                }
           
                setShowSignModal(false)
                if (pendingDocAction) pendingDocAction(true)
              }}
                className={`w-full rounded-xl py-4 text-sm font-medium relative ${ap.canSign ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-gray-400'}`}>
                ✍️ С подписью и печатью
                {!ap.canSign && <span className="absolute top-1 right-2 text-xs text-amber-500">🔒 Базовый+</span>}
              </button>
              <button onClick={() => {
                
                setShowSignModal(false)
                if (pendingDocAction) pendingDocAction(false)
              }}
                className="w-full border-2 border-gray-200 text-[#1C2056] rounded-xl py-4 text-sm font-medium">
                📄 Без подписи и печати
              </button>
            </div>
            <button onClick={() => setShowSignModal(false)}
              className="w-full text-gray-400 text-sm py-2">Отмена</button>
          </div>
        </div>
      )}

      {showPDFModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
            <button onClick={() => setShowPDFModal(false)} className="text-sm text-gray-500">← Назад</button>
            <span className="text-sm font-semibold text-[#1C2056]">Счёт {invoice.number}</span>
            <div className="flex gap-2">
              <button onClick={() => {
                const iframe = document.getElementById('inv-pdf-iframe') as HTMLIFrameElement
                iframe?.contentWindow?.print()
              }} className="text-sm bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">🖨️ Печать</button>
              <button onClick={async () => {
                const script = document.createElement('script')
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
                document.head.appendChild(script)
                await new Promise(r => script.onload = r)
                
                const parser = new DOMParser()
                const doc = parser.parseFromString(pdfHTML, 'text/html')
                
                // Берём стили
                const styles = Array.from(doc.querySelectorAll('style'))
                  .map(s => s.outerHTML).join('')
                
                const div = document.createElement('div')
                div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:1123px;background:white;'
                div.innerHTML = styles + doc.body.innerHTML
                document.body.appendChild(div)
                
                await new Promise(r => setTimeout(r, 500)) // ждём рендер
                
                ;(window as any).html2pdf().set({
                  margin: 0,
                  filename: `Счёт-${invoice.number}.pdf`,
                  html2canvas: { scale: 2, useCORS: true, windowWidth: 794, scrollX: 0, scrollY: 0 },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                }).from(div).save().then(() => {
                  document.body.removeChild(div)
                  document.head.removeChild(script)
                })
              }} className="text-sm bg-[#2DC48D] text-white px-3 py-1.5 rounded-lg">💾 PDF</button>
            </div>
          </div>
          <iframe id="inv-pdf-iframe" srcDoc={pdfHTML} className="flex-1 w-full border-none" />
        </div>
      )}

    </main>
  )
}