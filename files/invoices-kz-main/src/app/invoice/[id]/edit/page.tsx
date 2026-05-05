'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'

export default function EditInvoice() {
  const router = useRouter()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [services, setServices] = useState([{ name: '', qty: 1, price: 0 }])

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: inv }, { data: p }] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).single(),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])

      if (!inv) { router.push('/history'); return }

      setClientName(inv.client_name || '')
      setClientBin(inv.client_bin || '')
      setClientEmail(inv.client_email || '')
      if (inv.services && inv.services.length > 0) setServices(inv.services)
      setProfile(p)
      setLoading(false)
    }
    load()
  }, [])

  function addService() { setServices([...services, { name: '', qty: 1, price: 0 }]) }
  function removeService(idx: number) { setServices(services.filter((_, i) => i !== idx)) }
  function updateService(idx: number, field: string, value: string | number) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServices(updated)
  }

  async function save() {
    if (!clientName) { alert('Введите название клиента'); return }
    if (!clientBin) { alert('Введите БИН/ИИН'); return }
    if (services.some(s => !s.name || s.price === 0)) {
      alert('Заполните все услуги'); return
    }

    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      services,
      amount: total,
    }).eq('id', id)

    if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }

    // Генерируем обновлённый PDF
    generateInvoicePDF({
      number: '',
      date: new Date().toLocaleDateString('ru-KZ'),
      clientName, clientBin, clientEmail, services, total,
      profile: {
        company_name: profile?.company_name || '',
        bin_iin: profile?.bin_iin || '',
        address: profile?.address || '',
        phone: profile?.phone || '',
        bank_name: profile?.bank_name || '',
        iik: profile?.iik || '',
        bik: profile?.bik || '',
        kbe: profile?.kbe || '19',
        director_name: profile?.director_name || '',
        signature_url: profile?.signature_url || '',
        stamp_url: profile?.stamp_url || '',
      }
    })

    setSaving(false)
    router.push('/invoice/' + id)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/invoice/' + id)} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Редактировать счёт</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Client */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">Данные клиента</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Название компании / ИП *</label>
              <input
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder="ТОО «Пример»"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">БИН/ИИН *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="123456789012"
                  value={clientBin}
                  onChange={e => setClientBin(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="client@mail.kz"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[#1C2056]">Услуги / Товары</h3>
            <button onClick={addService}
              className="text-xs bg-[#1C2056] text-white rounded-lg px-3 py-1">
              + Добавить
            </button>
          </div>
          <div className="space-y-3">
            {services.map((svc, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder="Название услуги"
                    value={svc.name}
                    onChange={e => updateService(idx, 'name', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder="Кол-во"
                      value={svc.qty}
                      onChange={e => updateService(idx, 'qty', Number(e.target.value))}
                    />
                    <input
                      className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      type="number" placeholder="Цена ₸"
                      value={svc.price || ''}
                      onChange={e => updateService(idx, 'price', Number(e.target.value))}
                    />
                  </div>
                </div>
                {services.length > 1 && (
                  <button onClick={() => removeService(idx)} className="text-gray-300 hover:text-red-400 mt-2 text-xl">×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-[#1C2056] rounded-2xl p-5">
          <div className="flex justify-between text-sm text-white/70 mb-2">
            <span>Сумма</span><span>{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
          <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
            <span>К оплате</span>
            <span className="text-lg">{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className={`w-full rounded-xl py-4 font-medium text-sm text-white transition ${saving ? 'bg-gray-400' : 'bg-[#2DC48D]'}`}>
          {saving ? 'Сохраняем...' : '💾 Сохранить изменения'}
        </button>
      </div>
    </main>
  )
}