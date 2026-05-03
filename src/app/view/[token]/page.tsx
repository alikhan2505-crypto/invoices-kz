'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { generateInvoicePDF } from '@/lib/generatePDF'

export default function PublicInvoice() {
  const { token } = useParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
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
      }

      // Загружаем полный профиль включая подпись и печать
      const { data: p } = await supabase
        .from('profiles')
        .select('company_name, bin_iin, address, phone, email, director_name, signature_url, stamp_url')
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

      setLoading(false)
    }
    load()
  }, [])

  async function markAsPaid() {
    if (!confirm('Подтвердить оплату?')) return
    setMarking(true)
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id)
    setMarked(true)
    setMarking(false)
  }

  function openPDF() {
    if (!invoice) return
    const services = invoice.services || [{ name: 'Услуга', qty: 1, price: invoice.amount }]
    generateInvoicePDF({
      number: invoice.number,
      date: formatDate(invoice.created_at),
      clientName: invoice.client_name || '',
      clientBin: invoice.client_bin || '',
      clientEmail: invoice.client_email || '',
      clientAddress: invoice.client_address || '',
      knp: invoice.knp || '849',
      services,
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
    })
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  if (!invoice) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">😕</div>
        <p className="text-gray-400">Счёт не найден</p>
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
  }
  const statusLabels: Record<string, string> = {
    paid: 'Оплачен', sent: 'Отправлен', overdue: 'Просрочен',
    draft: 'Черновик', viewed: 'Просмотрен'
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-[#1C2056] px-4 py-4 flex items-center justify-between">
        <span className="font-bold text-white text-lg">INVOICES.KZ</span>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[invoice.status] || statusColors.draft}`}>
          {statusLabels[invoice.status] || 'Черновик'}
        </span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Invoice header */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Счёт на оплату</div>
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
            <div className="text-xs text-gray-400 mb-1">От кого</div>
            <div className="text-sm font-medium text-[#1C2056]">{profile?.company_name}</div>
            {profile?.bin_iin && <div className="text-xs text-gray-400">БИН: {profile.bin_iin}</div>}
            {profile?.address && <div className="text-xs text-gray-400">{profile.address}</div>}
            {profile?.phone && <div className="text-xs text-gray-400">{profile.phone}</div>}
          </div>

          {/* To */}
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-400 mb-1">Кому</div>
            <div className="text-sm font-medium text-[#1C2056]">{invoice.client_name}</div>
            {invoice.client_bin && <div className="text-xs text-gray-400">БИН: {invoice.client_bin}</div>}
            {invoice.client_email && <div className="text-xs text-gray-400">{invoice.client_email}</div>}
          </div>
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Услуги</div>
            {services.map((s: any, i: number) => (
              <div key={i} className={`flex justify-between px-4 py-3 ${i < services.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="text-sm text-[#1C2056]">{s.name}</div>
                  <div className="text-xs text-gray-400">
                    {s.qty} {s.unit || 'шт'} × {Number(s.price).toLocaleString('ru-KZ')} ₸
                  </div>
                </div>
                <div className="text-sm font-medium text-[#1C2056]">
                  {(s.qty * s.price).toLocaleString('ru-KZ')} ₸
                </div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm font-bold text-[#1C2056]">Итого к оплате</span>
              <span className="text-sm font-bold text-[#1C2056]">{total.toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
        )}

        {/* Note */}
        {invoice.note && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Примечание</div>
            <div className="text-sm text-gray-600">{invoice.note}</div>
          </div>
        )}

        {/* Bank details */}
        {bank && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Реквизиты для оплаты</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">Банк</span>
                <span className="text-xs font-medium text-[#1C2056]">{bank.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">ИИК</span>
                <span className="text-xs font-medium text-[#1C2056] font-mono">{bank.iik}</span>
              </div>
              {bank.bik && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">БИК</span>
                  <span className="text-xs font-medium text-[#1C2056] font-mono">{bank.bik}</span>
                </div>
              )}
              {bank.kbe && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">КБе</span>
                  <span className="text-xs font-medium text-[#1C2056]">{bank.kbe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Инструкция */}
        {invoice.status !== 'paid' && !marked && (
          <div className="bg-blue-50 rounded-2xl p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-2">📋 Как оплатить</div>
            <div className="space-y-2">
              {[
                { step: '1', text: 'Нажмите "Открыть счёт" — скачайте PDF' },
                { step: '2', text: 'Оплатите через свой банк по реквизитам из PDF' },
                { step: '3', text: 'Вернитесь сюда и нажмите "Я оплатил"' },
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

        {/* Actions */}
        {invoice.status !== 'paid' && (
          <div className="space-y-3">
            {marked ? (
              <div className="bg-green-50 rounded-2xl p-5 text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="text-sm font-medium text-green-700 mb-1">Спасибо! Оплата подтверждена</div>
                <div className="text-xs text-green-600">Поставщик получит уведомление</div>
              </div>
            ) : (
              <>
                {/* Главная кнопка — открыть PDF */}
                <button
                  onClick={openPDF}
                  className="w-full bg-[#1C2056] text-white rounded-2xl py-4 font-medium text-sm flex items-center justify-center gap-2">
                  📄 Открыть счёт (PDF)
                </button>

                {/* Вторая кнопка — подтвердить оплату */}
                <button
                  onClick={markAsPaid}
                  disabled={marking}
                  className="w-full bg-[#2DC48D] text-white rounded-2xl py-4 font-medium text-sm">
                  {marking ? 'Обрабатываем...' : '✓ Я уже оплатил этот счёт'}
                </button>
              </>
            )}
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="bg-green-50 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm font-medium text-green-700">Счёт оплачен</div>
            <button
              onClick={openPDF}
              className="mt-3 text-xs text-[#1C2056] underline">
              Открыть PDF
            </button>
          </div>
        )}

        <div className="text-center py-4">
          <p className="text-xs text-gray-400">Счёт создан через</p>
          <a href="https://invoices.kz" className="text-xs font-medium text-[#1C2056]">INVOICES.KZ</a>
        </div>
      </div>
    </main>
  )
}