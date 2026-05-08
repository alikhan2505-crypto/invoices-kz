'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { formatDateTime, formatDate } from '@/lib/date'
import { generateKP } from '@/lib/generateKP'
import { generateAVR } from '@/lib/generateAVR'
import { generateNakladnaya } from '@/lib/generateNakladnaya'

const statusLabel: Record<string, { text: string; color: string; dot: string }> = {
  paid:    { text: 'Оплачен',   color: 'text-green-600', dot: 'bg-green-500' },
  sent:    { text: 'Отправлен', color: 'text-blue-600',  dot: 'bg-blue-400' },
  overdue: { text: 'Просрочен', color: 'text-red-600',   dot: 'bg-red-500' },
  draft:   { text: 'Черновик',  color: 'text-gray-500',  dot: 'bg-gray-300' },
  viewed:  { text: 'Просмотрен', color: 'text-purple-600', dot: 'bg-purple-400' },
}

export default function InvoicePage() {
  const router = useRouter()
  const { id } = useParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [pendingDocAction, setPendingDocAction] = useState<((withSign: boolean) => void) | null>(null)

  useEffect(() => { loadInvoice() }, [])

  async function loadInvoice() {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
    setInvoice(inv)
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

  function askSignature(action: (withSign: boolean) => void) {
    setPendingDocAction(() => action)
    setShowSignModal(true)
  }

  function buildProfile(withSign: boolean) {
    return {
      company_name: profile.company_name || '',
      bin_iin: profile.bin_iin || '',
      address: profile.address || '',
      director_name: profile.director_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      signature_url: withSign ? (profile.signature_url || '') : '',
      stamp_url: withSign ? (profile.stamp_url || '') : '',
    }
  }

  async function updateStatus(status: string) {
    setUpdating(true)
    await supabase.from('invoices').update({ status }).eq('id', id)
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
      .select('invoice_prefix, invoice_next_number')
      .eq('id', user.id).single()
    const prefix = freshProfile?.invoice_prefix || 'INV-'
    const nextNum = freshProfile?.invoice_next_number || '0001'
    const invoiceNumber = prefix + nextNum
    const newNum = String(parseInt(nextNum) + 1).padStart(nextNum.length, '0')
    await supabase.from('profiles').update({ invoice_next_number: newNum }).eq('id', user.id)
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: invoice.amount,
      status: 'draft',
      client_name: invoice.client_name,
      client_bin: invoice.client_bin,
      client_email: invoice.client_email,
      services: invoice.services,
      note: invoice.note,
      created_at: new Date().toISOString(),
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return }
    router.push('/invoice/' + data.id)
  }

  async function copyPublicLink() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (data?.public_token) {
      const link = `https://invoices.kz/view/${data.public_token}`
      await navigator.clipboard.writeText(link)
      alert('Ссылка скопирована:\n' + link)
    } else {
      alert('Ошибка: токен не найден')
    }
  }

  async function shareWhatsApp() {
    const { data } = await supabase.from('invoices').select('public_token').eq('id', id).single()
    if (!data?.public_token) { alert('Ошибка'); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = `Здравствуйте! Направляю вам счёт на оплату ${invoice.number} на сумму ${Number(invoice.amount).toLocaleString('ru-KZ')} ₸.\n\nОткрыть счёт: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    await updateStatus('sent')
  }

  async function sendEmail() {
    if (!invoice.client_email) {
      alert('У клиента нет email! Укажите email при создании счёта.')
      return
    }
    if (!confirm(`Отправить счёт на ${invoice.client_email}?`)) return
    const res = await fetch('/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: id })
    })
    const data = await res.json()
    if (data.success) {
      alert(`✅ Счёт отправлен на ${invoice.client_email}`)
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
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function openPDF(autoPrint = false, withSignature = true) {
    if (!invoice || !profile) { alert('Данные ещё загружаются'); return }
    const services = invoice.services || [{ name: 'Услуга', qty: 1, price: invoice.amount }]
    generateInvoicePDF({
      number: invoice.number,
      date: formatDate(invoice.created_at),
      clientName: invoice.client_name || '',
      clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '',
      clientAddress: invoice.client_address || '',
      services,
      total: Number(invoice.amount),
      note: invoice.note || profile?.default_note || '',
      autoPrint,
      vatType: profile?.vat_type,
      profile: buildProfile(withSignature),
      bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
    })
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  if (!invoice) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Счёт не найден</p>
    </main>
  )

  const status = statusLabel[invoice.status] || statusLabel.draft
  const services = invoice.services || []

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

        <div className="grid grid-cols-5 gap-2">
          {[
            { icon: '💬', label: 'WhatsApp', action: shareWhatsApp },
            { icon: '🔗', label: 'Ссылка', action: copyPublicLink },
            { icon: '📄', label: 'PDF', action: () => askSignature((w) => openPDF(false, w)) },
            { icon: '🖨️', label: 'Печать', action: () => askSignature((w) => openPDF(true, w)) },
            { icon: '📧', label: 'Email', action: sendEmail },
          ].map(a => (
            <button key={a.label} onClick={a.action}
              className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50">
              <div className="text-xl mb-1">{a.icon}</div>
              <div className="text-xs text-gray-500">{a.label}</div>
            </button>
          ))}
        </div>

        {services.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Услуги</div>
            {services.map((s: any, i: number) => (
              <div key={i} className={`flex justify-between px-4 py-3 ${i < services.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="text-sm text-[#1C2056]">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.qty} шт × {Number(s.price).toLocaleString('ru-KZ')} ₸</div>
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

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">История</div>
          <div className="space-y-3">
            {invoice.status === 'paid' && (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <div>
                  <div className="text-sm text-[#1C2056]">Оплачен</div>
                  <div className="text-xs text-gray-400">{formatDate(invoice.created_at)}</div>
                </div>
              </div>
            )}
            {(invoice.status === 'sent' || invoice.status === 'paid') && (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <div>
                  <div className="text-sm text-[#1C2056]">Отправлен</div>
                  <div className="text-xs text-gray-400">{formatDate(invoice.created_at)}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              <div>
                <div className="text-sm text-[#1C2056]">Создан</div>
                <div className="text-xs text-gray-400">{formatDateTime(invoice.created_at)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Изменить статус</div>
          {[
            { status: 'sent', label: 'Отправлен' },
            { status: 'paid', label: 'Оплачен' },
            { status: 'overdue', label: 'Просрочен' },
            { status: 'draft', label: 'Черновик' },
            { status: 'viewed', label: 'Просмотрен клиентом' },
          ].filter(s => s.status !== invoice.status).map((s, i, arr) => (
            <button key={s.status}
              onClick={() => updateStatus(s.status)}
              disabled={updating}
              className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-sm text-left ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className="text-[#1C2056]">{s.label}</span>
              <span className="text-gray-300">›</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => router.push('/invoice/' + id + '/edit')}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            📝 Редактировать
          </button>
          <button onClick={duplicateInvoice}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            📋 Дублировать
          </button>
          <button onClick={async () => {
            if (!profile) { alert('Данные загружаются'); return }
            const kpNumber = prompt('Номер КП:', invoice.number)
            if (!kpNumber) return
            const today = new Date()
            today.setDate(today.getDate() + 30)
            const validUntil = prompt('Действителен до:', today.toLocaleDateString('ru-KZ'))
            if (!validUntil) return
            askSignature((withSign) => {
              generateKP({
                number: kpNumber,
                date: formatDate(invoice.created_at),
                validUntil,
                clientName: invoice.client_name || '',
                clientBin: invoice.client_bin || '',
                services: invoice.services || [],
                total: Number(invoice.amount),
                note: invoice.note || '',
                vatType: profile?.vat_type || 'no_vat',
                profile: buildProfile(withSign),
                bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
              })
            })
          }}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            📋 Коммерческое предложение
          </button>
          <button onClick={async () => {
            if (!profile) { alert('Данные загружаются'); return }
            const avrNumber = prompt('Номер АВР:', invoice.number)
            if (!avrNumber) return
            const contractNumber = prompt('Номер договора (необязательно):', invoice.number)
            const contractDate = prompt('Дата договора:', formatDate(invoice.created_at))
            askSignature((withSign) => {
              generateAVR({
                number: avrNumber,
                date: formatDate(invoice.created_at),
                contractNumber: contractNumber || undefined,
                contractDate: contractDate || undefined,
                clientName: invoice.client_name || '',
                clientBin: invoice.client_bin || '',
                clientAddress: invoice.client_address || '',
                services: invoice.services || [],
                total: Number(invoice.amount),
                vatType: profile?.vat_type || 'no_vat',
                profile: buildProfile(withSign),
              })
            })
          }}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            📋 Акт выполненных работ
          </button>
          <button onClick={async () => {
            if (!profile) { alert('Данные загружаются'); return }
            const naklNumber = prompt('Номер накладной:', invoice.number)
            if (!naklNumber) return
            askSignature((withSign) => {
              generateNakladnaya({
                number: naklNumber,
                date: formatDate(invoice.created_at),
                clientName: invoice.client_name || '',
                clientBin: invoice.client_bin || '',
                services: invoice.services || [],
                total: Number(invoice.amount),
                vatType: profile?.vat_type || 'no_vat',
                profile: buildProfile(withSign),
              })
            })
          }}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            📋 Накладная на отпуск товара
          </button>
          <button onClick={async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: p } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
            if (p?.plan !== 'pro') { router.push('/upgrade'); return }
            const name = prompt('Название шаблона:', invoice.client_name + ' — ' + invoice.number)
            if (!name) return
            const { error } = await supabase.from('templates').insert({
              user_id: user.id,
              name,
              client_name: invoice.client_name,
              client_bin: invoice.client_bin,
              client_email: invoice.client_email,
              services: invoice.services,
              amount: invoice.amount,
            })
            if (error) { alert('Ошибка: ' + error.message); return }
            alert('Шаблон сохранён!')
          }}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            ⭐ Сохранить как шаблон
          </button>
          <button onClick={sendReminder}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-[#1C2056] border-b border-gray-100">
            🔔 Напомнить об оплате
          </button>
          <button onClick={async () => {
            if (invoice.recurring_active) {
              await supabase.from('invoices').update({ recurring_active: false }).eq('id', id)
              await loadInvoice()
              alert('Повторение отключено')
            } else {
              const until = prompt('Повторять до (дата в формате ДД.ММ.ГГГГ):', '01.12.2026')
              if (!until) return
              const parts = until.split('.')
              if (parts.length !== 3) { alert('Неверный формат даты'); return }
              const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
              if (!invoice.client_email) {
                alert('У клиента нет email! Добавьте email клиента чтобы он получал счета.')
                return
              }
              await supabase.from('invoices').update({
                recurring_active: true,
                recurring_until: isoDate
              }).eq('id', id)
              await loadInvoice()
              alert(`Повторение включено до ${until}. Счёт будет отправляться 1-го числа каждого месяца на ${invoice.client_email}`)
            }
          }}
            className={`w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-50 border-b border-gray-100 ${invoice.recurring_active ? 'text-green-600' : 'text-[#1C2056]'}`}>
            <span>{invoice.recurring_active ? '🔄 Повторение включено' : '🔄 Повторять ежемесячно'}</span>
            {invoice.recurring_active && (
              <span className="text-xs text-gray-400">до {new Date(invoice.recurring_until).toLocaleDateString('ru-KZ')}</span>
            )}
          </button>
          <button onClick={deleteInvoice}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-red-500">
            ← Отозвать / Аннулировать
          </button>
        </div>
      </div>

      {/* Модал выбора подписи */}
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
                setShowSignModal(false)
                if (pendingDocAction) pendingDocAction(true)
              }}
                className="w-full bg-[#1C2056] text-white rounded-xl py-4 text-sm font-medium">
                ✍️ С подписью и печатью
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
              className="w-full text-gray-400 text-sm py-2">
              Отмена
            </button>
          </div>
        </div>
      )}
    </main>
  )
}