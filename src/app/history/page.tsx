'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

const mockInvoices = [
  { id: 1, num: 'INV-001', client: 'ТОО «Альфа Технолоджис»', amount: 450000, date: '22 Мар 2026', status: 'paid' },
  { id: 2, num: 'INV-002', client: 'ИП Смагулов', amount: 125000, date: '18 Мар 2026', status: 'sent' },
  { id: 3, num: 'INV-003', client: 'Global Solutions Kz', amount: 800000, date: '10 Мар 2026', status: 'overdue' },
  { id: 4, num: 'INV-004', client: 'ТОО «Дизайн Бюро»', amount: 65000, date: '05 Мар 2026', status: 'draft' },
]

const statusLabel: Record<string, { text: string; color: string }> = {
  paid:    { text: 'Оплачен',    color: 'bg-green-100 text-green-700' },
  sent:    { text: 'Отправлен',  color: 'bg-blue-100 text-blue-700' },
  overdue: { text: 'Просрочен',  color: 'bg-red-100 text-red-700' },
  draft:   { text: 'Черновик',   color: 'bg-gray-100 text-gray-600' },
}

export default function History() {
  const router = useRouter()
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? mockInvoices : mockInvoices.filter(i => i.status === filter)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <span className="text-sm text-gray-500">ИП First Project</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <h2 className="text-xl font-bold text-[#1C2056] mb-4">История счетов</h2>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { key: 'all', label: 'Все', num: 12 },
            { key: 'paid', label: 'Оплачены', num: 8 },
            { key: 'sent', label: 'Отправлены', num: 3 },
            { key: 'overdue', label: 'Просроч.', num: 1 },
          ].map(s => (
            <div key={s.key}
              onClick={() => setFilter(s.key)}
              className={`bg-white rounded-xl p-3 text-center cursor-pointer border transition ${filter === s.key ? 'border-[#1C2056]' : 'border-transparent'}`}>
              <div className="text-lg font-medium text-[#1C2056]">{s.num}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <div className="flex gap-2 p-3 border-b overflow-x-auto">
            {['all','paid','sent','draft'].map(f => (
              <button key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${filter === f ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-gray-600'}`}>
                {f === 'all' ? 'Все' : f === 'paid' ? 'Оплачены' : f === 'sent' ? 'Отправлены' : 'Черновики'}
              </button>
            ))}
          </div>

          <div className="divide-y">
            {filtered.map(inv => (
              <div key={inv.id}
                onClick={() => router.push('/history/' + inv.id)}
                className="flex items-start justify-between p-4 cursor-pointer hover:bg-gray-50">
                <div>
                  <div className="text-xs text-gray-400 mb-1">{inv.num}</div>
                  <div className="text-sm font-medium text-[#1C2056]">{inv.client}</div>
                  <div className="text-xs text-gray-400 mt-1">◷ {inv.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium mb-2">{inv.amount.toLocaleString('ru-KZ')} ₸</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusLabel[inv.status].color}`}>
                    {statusLabel[inv.status].text}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          + Создать новый счёт
        </button>
      </div>
      <BottomNav />
    </main>
  )
}