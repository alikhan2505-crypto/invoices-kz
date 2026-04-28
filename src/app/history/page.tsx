'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

const statusLabel: Record<string, { text: string; color: string }> = {
  paid:    { text: 'Оплачен',   color: 'bg-green-100 text-green-700' },
  sent:    { text: 'Отправлен', color: 'bg-blue-100 text-blue-700' },
  overdue: { text: 'Просрочен', color: 'bg-red-100 text-red-700' },
  draft:   { text: 'Черновик',  color: 'bg-gray-100 text-gray-600' },
}

export default function History() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

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

  const counts = {
    all: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
  }

  const filtered = invoices.filter(inv => {
    const matchFilter = filter === 'all' || inv.status === filter
    const clientName = inv.clients?.name || ''
    const matchSearch = clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.number.toLowerCase().includes(search.toLowerCase()) ||
      String(inv.amount).includes(search)
    return matchFilter && matchSearch
  })

  const totalIncome = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-4">
        <h1 className="text-xl font-bold text-[#1C2056]">История счетов</h1>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {/* Search */}
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder="Поиск по клиенту или сумме"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {[
            { key: 'all', label: 'Все' },
            { key: 'paid', label: 'Оплачены' },
            { key: 'sent', label: 'Отправлены' },
            { key: 'draft', label: 'Черновики' },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition ${filter === f.key ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Отправлено', value: counts.all },
            { label: 'Оплачено', value: counts.paid },
            { label: 'Неоплач.', value: counts.sent },
            { label: 'Просроч.', value: counts.overdue, red: true },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className={`text-lg font-semibold ${s.red && s.value > 0 ? 'text-red-500' : 'text-[#1C2056]'}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

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
                onClick={() => router.push('/invoice/' + inv.id)}
                className={`flex items-start justify-between p-4 cursor-pointer hover:bg-gray-50 ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="text-xs text-gray-400 mb-1">{inv.number}</div>
                  <div className="text-sm font-medium text-[#1C2056]">
                    {inv.client_name || inv.clients?.name || 'Без клиента'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(inv.created_at).toLocaleDateString('ru-KZ', { 
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium mb-1.5">{Number(inv.amount).toLocaleString('ru-KZ')} ₸</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${(statusLabel[inv.status] || statusLabel.draft).color}`}>
                    {(statusLabel[inv.status] || statusLabel.draft).text}
                  </span>
                </div>
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