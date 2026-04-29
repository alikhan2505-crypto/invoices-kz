'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'

const statusLabel: Record<string, { text: string; color: string; dot: string }> = {
  paid:    { text: 'Оплачен',   color: 'text-green-600', dot: 'bg-green-500' },
  sent:    { text: 'Отправлен', color: 'text-blue-600',  dot: 'bg-blue-400' },
  overdue: { text: 'Просрочен', color: 'text-red-600',   dot: 'bg-red-500' },
  draft:   { text: 'Черновик',  color: 'text-gray-500',  dot: 'bg-gray-300' },
}

export default function InvoicePage() {
  const router = useRouter()
  const { id } = useParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => { loadInvoice() }, [])

  async function loadInvoice() {
    const { data } = await supabase.from('invoices').select('*').eq('id', id).single()
    setInvoice(data)
    setLoading(false)
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
    const { error: updateError } = await supabase.from('profiles')
      .update({ invoice_next_number: newNum }).eq('id', user.id)
    if (updateError) { alert('Ошибка: ' + updateError.message); return }
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: invoice.amount,
      status: 'draft',
      client_name: invoice.client_name,
      client_bin: invoice.client_bin,
      client_email: invoice.client_email,
      services: invoice.services,
      created_at: new Date().toISOString(),
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return }
    router.push('/invoice/' + data.id)
  }

  async function copyPublicLink() {
    const { data } = await supabase
      .from('invoices')
      .select('public_token')
      .eq('id', id)
      .single()
    if (data?.public_token) {
      const link = `https://invoices.kz/view/${data.public_token}`
      await navigator.clipboard.writeText(link)
      alert('Ссылка скопирована:\n' + link)
    } else {
      alert('Ошибка: токен не найден')
    }
  }

  async function shareWhatsApp() {
    const { data } = await supabase
      .from('invoices')
      .select('public_token')
      .eq('id', id)
      .single()
    if (!data?.public_token) { alert('Ошибка'); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = `Здравствуйте! Направляю вам счёт на оплату ${invoice.number} на сумму ${Number(invoice.amount).toLocaleString('ru-KZ')} ₸.\n\nОткрыть счёт: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    await updateStatus('sent')
  }

  async function sendReminder() {
    const { data } = await supabase
      .from('invoices')
      .select('public_token')
      .eq('id', id)
      .single()
    if (!data?.public_token) { alert('Ошибка'); return }
    const link = `https://invoices.kz/view/${data.public_token}`
    const text = `Здравствуйте, ${invoice.client_name}!\n\nНапоминаем о неоплаченном счёте:\n\n📄 Счёт: ${invoice.number}\n💰 Сумма: ${Number(invoice.amount).toLocaleString('ru-KZ')} ₸\n🔗 Открыть счёт: ${link}\n\nПожалуйста, произведите оплату. Спасибо!`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function openPDF() {
    if (!invoice) return
    const services = invoice.services || [{ name: 'Услуга', qty: 1, price: invoice.amount }]
    generateInvoicePDF({
      number: invoice.number,
      date: new Date(invoice.created_at).toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty' }),
      clientName: invoice.client_name || '',
      clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '',
      services,
      total: Number(invoice.amount),
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

        {/* Status card */}
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

        {/* Actions */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: '💬', label: 'WhatsApp', action: shareWhatsApp },
            { icon: '🔗', label: 'Ссылка', action: copyPublicLink },
            { icon: '📄', label: 'PDF', action: openPDF },
            { icon: '🖨️', label: 'Печать', action: openPDF },
          ].map(a => (
            <button key={a.label} onClick={a.action}
              className="bg-white rounded-xl p-3 text-center shadow-sm hover:bg-gray-50">
              <div className="text-xl mb-1">{a.icon}</div>
              <div className="text-xs text-gray-500">{a.label}</div>
            </button>
          ))}
        </div>

        {/* Services */}
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

        {/* Status history */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">История статусов</div>
          <div className="space-y-3">
            {invoice.status === 'paid' && (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <div>
                  <div className="text-sm text-[#1C2056]">Оплачен</div>
                  <div className="text-xs text-gray-400">{new Date(invoice.created_at).toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty' })}</div>
                </div>
              </div>
            )}
            {(invoice.status === 'sent' || invoice.status === 'paid') && (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <div>
                  <div className="text-sm text-[#1C2056]">Отправлен</div>
                  <div className="text-xs text-gray-400">{new Date(invoice.created_at).toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty' })}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              <div>
                <div className="text-sm text-[#1C2056]">Создан</div>
                <div className="text-xs text-gray-400">{new Date(invoice.created_at).toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Change status */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Изменить статус</div>
          {[
            { status: 'sent', label: 'Отправлен' },
            { status: 'paid', label: 'Оплачен' },
            { status: 'overdue', label: 'Просрочен' },
            { status: 'draft', label: 'Черновик' },
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

        {/* Actions bottom */}
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
          <button onClick={deleteInvoice}
            className="w-full flex items-center px-4 py-3.5 text-sm hover:bg-gray-50 text-red-500">
            ← Отозвать / Аннулировать
          </button>
        </div>
      </div>
    </main>
  )
}