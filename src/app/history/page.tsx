'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import * as XLSX from 'xlsx'

const statusLabel: Record<string, { text: string; color: string }> = {
  paid:    { text: 'Оплачен',   color: 'bg-green-100 text-green-700' },
  sent:    { text: 'Отправлен', color: 'bg-blue-100 text-blue-700' },
  overdue: { text: 'Просрочен', color: 'bg-red-100 text-red-700' },
  draft:   { text: 'Черновик',  color: 'bg-gray-100 text-gray-600' },
  viewed: { text: 'Просмотрен', color: 'bg-purple-100 text-purple-700' },
}

export default function History() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('month')

  useEffect(() => { loadInvoices() }, [])

  async function loadInvoices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function deleteInvoice(e: React.MouseEvent, id: string, number: string) {
    e.stopPropagation()
    if (!confirm('Аннулировать счёт ' + number + '?')) return
    await supabase.from('invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(inv => inv.id !== id))
  }

  function exportToExcel() {
    const data = filtered.map(inv => ({
      'Номер': inv.number,
      'Клиент': inv.client_name || 'Без клиента',
      'БИН/ИИН': inv.client_bin || '',
      'Сумма': Number(inv.amount),
      'Статус': (statusLabel[inv.status] || statusLabel.draft).text,
      'Дата': new Date(inv.created_at).toLocaleDateString('ru-KZ'),
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Счета')

    // Ширина колонок
    ws['!cols'] = [
      { wch: 12 },
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
    ]

    const date = new Date().toLocaleDateString('ru-KZ').replace(/\./g, '-')
    XLSX.writeFile(wb, `Счета_${date}.xlsx`)
  }

  const filtered = invoices.filter(inv => {
    const matchFilter = filter === 'all' || inv.status === filter
    const clientName = inv.client_name || inv.clients?.name || ''
    const matchSearch = clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.number.toLowerCase().includes(search.toLowerCase()) ||
      String(inv.amount).includes(search)

    const invDate = new Date(inv.created_at)
    const now = new Date()
    let matchDate = true
    if (dateFilter === 'today') {
      matchDate = invDate.toDateString() === now.toDateString()
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now)
      weekAgo.setDate(now.getDate() - 7)
      matchDate = invDate >= weekAgo
    } else if (dateFilter === 'month') {
      matchDate = invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear()
    } else if (dateFilter === 'last_month') {
      const lastMonth = new Date(now)
      lastMonth.setMonth(now.getMonth() - 1)
      matchDate = invDate.getMonth() === lastMonth.getMonth() && invDate.getFullYear() === lastMonth.getFullYear()
    }

    return matchFilter && matchSearch && matchDate
  })

  const counts = {
    all: filtered.length,
    paid: filtered.filter(i => i.status === 'paid').length,
    sent: filtered.filter(i => i.status === 'sent').length,
    overdue: filtered.filter(i => i.status === 'overdue').length,
  }

  const totalAmount = filtered
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.amount), 0)

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <button onClick={exportToExcel}
          className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
          📊 Экспорт
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* Search */}
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-3">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder="Поиск по клиенту или сумме"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Date filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {[
            { key: 'all_time', label: 'Всё время' },
            { key: 'today', label: 'Сегодня' },
            { key: 'week', label: 'Неделя' },
            { key: 'month', label: 'Месяц' },
            { key: 'last_month', label: 'Прошлый месяц' },
          ].map(d => (
            <button key={d.key}
              onClick={() => setDateFilter(d.key)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition flex-shrink-0 ${dateFilter === d.key ? 'bg-[#2DC48D] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'Все' },
            { key: 'paid', label: 'Оплачены' },
            { key: 'sent', label: 'Отправлены' },
            { key: 'draft', label: 'Черновики' },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition flex-shrink-0 ${filter === f.key ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Всего', value: counts.all },
            { label: 'Оплачено', value: counts.paid },
            { label: 'Неоплач.', value: counts.sent },
            { label: 'Просроч.', value: counts.overdue, red: true },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className={`text-lg font-semibold ${s.red && s.value > 0 ? 'text-red-500' : 'text-[#1C2056]'}`}>
                {s.value}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Total income for period */}
        {totalAmount > 0 && (
          <div className="bg-[#1C2056] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <span className="text-white/70 text-sm">Доход за период</span>
            <span className="text-white font-bold">{totalAmount.toLocaleString('ru-KZ')} ₸</span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-center text-gray-400 py-8">Загрузка...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-400 text-sm">Счетов нет</p>
            <button onClick={() => router.push('/dashboard')}
              className="mt-4 bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
              Создать первый счёт
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
            {filtered.map((inv, i) => (
              <div key={inv.id}
                className={`flex items-center p-4 hover:bg-gray-50 ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 flex items-start justify-between cursor-pointer"
                  onClick={() => router.push('/invoice/' + inv.id)}>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">{inv.number}</div>
                    <div className="text-sm font-medium text-[#1C2056]">
                      {inv.client_name || inv.clients?.name || 'Без клиента'}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(inv.created_at).toLocaleString('ru-KZ', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="text-right mr-3">
                    <div className="text-sm font-medium mb-1.5">{Number(inv.amount).toLocaleString('ru-KZ')} ₸</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${(statusLabel[inv.status] || statusLabel.draft).color}`}>
                      {(statusLabel[inv.status] || statusLabel.draft).text}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteInvoice(e, inv.id, inv.number)}
                  className="text-gray-300 hover:text-red-400 text-lg p-1 flex-shrink-0">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => router.push('/dashboard')}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          + Создать новый счёт
        </button>
      </div>
      <BottomNav />
    </main>
  )
}