'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { generateInvoicePDF } from '@/lib/generatePDF'

export default function Dashboard() {
  const router = useRouter()
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [services, setServices] = useState([{ name: '', qty: 1, price: 0 }])

  const [loading, setLoading] = useState(false)
  const [lastCreated, setLastCreated] = useState<number | null>(null)

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)

  function addService() {
    setServices([...services, { name: '', qty: 1, price: 0 }])
  }

  function updateService(idx: number, field: string, value: string | number) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServices(updated)
  }

  function removeService(idx: number) {
    setServices(services.filter((_, i) => i !== idx))
  }

async function createInvoice() {
  // Защита от двойного нажатия — 3 минуты
  if (lastCreated && Date.now() - lastCreated < 180000) {
    const seconds = Math.round((180000 - (Date.now() - lastCreated)) / 1000)
    if (!confirm(`Вы уже создали счёт ${Math.round((Date.now() - lastCreated)/1000)} сек. назад. Создать ещё один?`)) return
  }

  setLoading(true)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { alert('Войдите в систему'); setLoading(false); return }

  const { data, error } = await supabase.from('invoices').insert({
    user_id: user.id,
    number: 'INV-' + Date.now(),
    amount: total,
    status: 'draft',
  }).select().single()

  if (error) { alert('Ошибка: ' + error.message); setLoading(false); return }

  setLastCreated(Date.now())
  setLoading(false)
  generateInvoicePDF({
  number: data.number,
  date: new Date().toLocaleDateString('ru-KZ'),
  clientName,
  clientBin,
  clientEmail,
  services,
  total,
})
alert('Счёт создан и скачан! №' + data.number)
}
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <span className="text-sm text-gray-500">ИП First Project</span>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-28">
        <h2 className="text-xl font-bold text-[#1C2056] mb-1">Новый счёт</h2>
        <p className="text-sm text-gray-500 mb-6">Создайте счёт за 1 минуту</p>

        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-4">Данные клиента</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Название компании / ИП</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder="ТОО «Пример»"
                value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">БИН/ИИН</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="123456789012"
                  value={clientBin} onChange={e => setClientBin(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="client@mail.kz"
                  value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[#1C2056]">Услуги / Товары</h3>
            <button onClick={addService}
              className="text-sm text-[#1C2056] border border-[#1C2056] rounded-lg px-3 py-1">
              + Добавить
            </button>
          </div>
          <div className="space-y-3">
            {services.map((svc, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder="Название услуги"
                    value={svc.name} onChange={e => updateService(idx, 'name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder="Кол-во"
                      value={svc.qty} onChange={e => updateService(idx, 'qty', Number(e.target.value))} />
                    <input className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder="Цена ₸"
                      value={svc.price || ''} onChange={e => updateService(idx, 'price', Number(e.target.value))} />
                  </div>
                </div>
                {services.length > 1 && (
                  <button onClick={() => removeService(idx)} className="text-gray-300 hover:text-red-400 mt-2 text-xl">×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1C2056] rounded-2xl p-5 mb-4">
          <div className="flex justify-between text-sm text-white/70 mb-2">
            <span>Сумма</span><span>{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
          <div className="flex justify-between text-sm text-white/70 mb-3">
            <span>НДС (12%)</span><span>0 ₸</span>
          </div>
          <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
            <span>К оплате</span><span className="text-lg">{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
        </div>

        <button
        onClick={createInvoice}
        disabled={loading}
        className={`w-full rounded-xl py-4 font-medium text-sm text-white transition ${loading ? 'bg-gray-400' : 'bg-[#2DC48D]'}`}>
        {loading ? 'Создаём...' : '✈ Создать и отправить'}
        </button>
      </div>
      <BottomNav />
    </main>
  )
}