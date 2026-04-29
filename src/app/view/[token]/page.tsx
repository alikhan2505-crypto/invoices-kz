'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PublicInvoice() {
  const { token } = useParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
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

      const { data: p } = await supabase
        .from('profiles')
        .select('company_name, bin_iin, address, phone, email, bank_name, iik, bik, kbe')
        .eq('id', inv.user_id)
        .single()

      setProfile(p)
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
  }
  const statusLabels: Record<string, string> = {
    paid: 'Оплачен', sent: 'Отправлен', overdue: 'Просрочен', draft: 'Черновик'
  }

  return (
    <main className="min-h-screen bg-gray-50">
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
              <div className="text-xs text-gray-400 mt-1">
                {new Date(invoice.created_at).toLocaleDateString('ru-KZ', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </div>
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
                  <div className="text-xs text-gray-400">{s.qty} шт × {Number(s.price).toLocaleString('ru-KZ')} ₸</div>
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

        {/* Bank details */}
        {(profile?.iik || profile?.bank_name) && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Реквизиты для оплаты</div>
            <div className="space-y-2">
              {profile?.bank_name && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Банк</span>
                  <span className="text-xs font-medium text-[#1C2056]">{profile.bank_name}</span>
                </div>
              )}
              {profile?.iik && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">ИИК</span>
                  <span className="text-xs font-medium text-[#1C2056]">{profile.iik}</span>
                </div>
              )}
              {profile?.bik && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">БИК</span>
                  <span className="text-xs font-medium text-[#1C2056]">{profile.bik}</span>
                </div>
              )}
              {profile?.kbe && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">КБе</span>
                  <span className="text-xs font-medium text-[#1C2056]">{profile.kbe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {invoice.status !== 'paid' && (
          <div className="space-y-3">
            {marked ? (
              <div className="bg-green-50 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">✅</div>
                <div className="text-sm font-medium text-green-700">Спасибо! Оплата подтверждена</div>
                <div className="text-xs text-green-600 mt-1">Поставщик получит уведомление</div>
              </div>
            ) : (
              <button
                onClick={markAsPaid}
                disabled={marking}
                className="w-full bg-[#2DC48D] text-white rounded-2xl py-4 font-medium text-sm">
                {marking ? 'Обрабатываем...' : '✓ Я оплатил этот счёт'}
              </button>
            )}

            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                alert('Ссылка скопирована!')
              }}
              className="w-full border border-gray-200 text-gray-500 rounded-2xl py-3 text-sm">
              🔗 Скопировать ссылку на счёт
            </button>
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="bg-green-50 rounded-2xl p-4 text-center">
            <div className="text-2xl mb-2">✅</div>
            <div className="text-sm font-medium text-green-700">Счёт оплачен</div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">Счёт создан через</p>
          <a href="https://invoices.kz" className="text-xs font-medium text-[#1C2056]">INVOICES.KZ</a>
        </div>
      </div>
    </main>
  )
}