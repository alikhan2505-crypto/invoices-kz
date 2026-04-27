'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import BottomNav from '@/components/BottomNav'

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [lastCreated, setLastCreated] = useState<number | null>(null)
  const [clients, setClients] = useState<any[]>([])
  const [savedServices, setSavedServices] = useState<any[]>([])
  const [showServicePicker, setShowServicePicker] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [services, setServices] = useState([{ name: '', qty: 1, price: 0 }])

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('*').eq('user_id', user.id).order('name'),
        supabase.from('services').select('*').eq('user_id', user.id).order('name'),
      ])
      setProfile(p)
      setClients(c || [])
      setSavedServices(s || [])
    }
    load()
  }, [])

  function selectClient(client: any) {
    setClientName(client.name)
    setClientBin(client.bin_iin || '')
    setClientEmail(client.email || '')
    setClientAddress(client.address || '')
  }

  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
  }

  function selectService(svc: any) {
    const exists = services.find(s => s.name === svc.name)
    if (exists) { setShowServicePicker(false); return }
    const updated = services[0].name === '' ? [] : [...services]
    setServices([...updated, { name: svc.name, qty: 1, price: svc.price }])
    setShowServicePicker(false)
  }

  function addService() { setServices([...services, { name: '', qty: 1, price: 0 }]) }
  function removeService(idx: number) { setServices(services.filter((_, i) => i !== idx)) }
  function updateService(idx: number, field: string, value: string | number) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServices(updated)
  }

  const filteredClients = clientName && !clientBin
    ? clients.filter(c =>
        c.name.toLowerCase().includes(clientName.toLowerCase()) ||
        (c.bin_iin || '').includes(clientName)
      )
    : []

  async function createInvoice() {
    if (!profile?.company_name || !profile?.bin_iin) {
      alert('Сначала заполните реквизиты компании в Профиле')
      router.push('/profile/requisites')
      return
    }
    if (!clientName) { alert('Введите название клиента'); return }
    if (!clientBin) { alert('Введите БИН/ИИН клиента'); return }
    if (services.length === 0 || services.some(s => !s.name)) {
      alert('Добавьте хотя бы одну услугу'); return
    }
    if (services.some(s => s.price === 0)) {
      alert('Укажите цену для всех услуг'); return
    }
    if (lastCreated && Date.now() - lastCreated < 180000) {
      if (!confirm('Вы уже создали счёт недавно. Создать ещё один?')) return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Войдите в систему'); setLoading(false); return }

    const prefix = profile?.invoice_prefix || 'INV-'
    const nextNum = profile?.invoice_next_number || '0001'
    const invoiceNumber = prefix + nextNum
    const newNum = String(parseInt(nextNum) + 1).padStart(nextNum.length, '0')
    await supabase.from('profiles').update({ invoice_next_number: newNum }).eq('id', user.id)

    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: total,
      status: 'draft',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      services,
    }).select().single()

    if (error) { alert('Ошибка: ' + error.message); setLoading(false); return }

    setLastCreated(Date.now())
    setLoading(false)

    generateInvoicePDF({
      number: data.number,
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
      }
    })

    setClientName(''); setClientBin(''); setClientEmail(''); setClientAddress('')
    setServices([{ name: '', qty: 1, price: 0 }])
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <span className="text-sm text-gray-500">{profile?.company_name || ''}</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <h2 className="text-xl font-bold text-[#1C2056] mb-1">Новый счёт</h2>
        <p className="text-sm text-gray-500 mb-4">Создайте счёт за 1 минуту</p>

        {/* Client section */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">Данные клиента</h3>

          {/* Selected client card */}
          {clientBin ? (
            <div className="bg-gray-50 rounded-xl p-3 mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#1C2056]">{clientName}</div>
                <div className="text-xs text-gray-400 mt-0.5">БИН: {clientBin}</div>
                {clientEmail && <div className="text-xs text-gray-400">{clientEmail}</div>}
              </div>
              <button onClick={clearClient} className="text-gray-300 hover:text-red-400 text-xl">✕</button>
            </div>
          ) : (
            <>
              {/* Search input */}
              <div className="relative mb-3">
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="Поиск клиента по БИН/ИИН или названию"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                />
                {filteredClients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-lg z-10 mt-1 max-h-44 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div key={c.id} onClick={() => selectClient(c)}
                        className="px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <div className="text-sm font-medium text-[#1C2056]">{c.name}</div>
                        {c.bin_iin && <div className="text-xs text-gray-400">БИН: {c.bin_iin}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent clients chips */}
              {clients.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                  {clients.slice(0, 5).map(c => (
                    <button key={c.id} onClick={() => selectClient(c)}
                      className="whitespace-nowrap text-xs bg-gray-100 text-[#1C2056] px-3 py-1.5 rounded-full hover:bg-[#1C2056] hover:text-white transition flex-shrink-0">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Manual fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">БИН/ИИН *</label>
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
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Адрес (необязательно)</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder="г. Алматы, ул. Абая 1"
                    value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Services section */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[#1C2056]">Услуги / Товары</h3>
            <div className="flex gap-2">
              {savedServices.length > 0 && (
                <button onClick={() => setShowServicePicker(true)}
                  className="text-xs text-[#1C2056] border border-[#1C2056] rounded-lg px-3 py-1">
                  Из справочника
                </button>
              )}
              <button onClick={addService}
                className="text-xs bg-[#1C2056] text-white rounded-lg px-3 py-1">
                + Добавить
              </button>
            </div>
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

        {/* Total */}
        <div className="bg-[#1C2056] rounded-2xl p-5 mb-4">
          <div className="flex justify-between text-sm text-white/70 mb-2">
            <span>Сумма</span><span>{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
          <div className="flex justify-between text-sm text-white/70 mb-3">
            <span>НДС (12%)</span><span>0 ₸</span>
          </div>
          <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
            <span>К оплате</span>
            <span className="text-lg">{total.toLocaleString('ru-KZ')} ₸</span>
          </div>
        </div>

        <button onClick={createInvoice} disabled={loading}
          className={`w-full rounded-xl py-4 font-medium text-sm text-white transition ${loading ? 'bg-gray-400' : 'bg-[#2DC48D]'}`}>
          {loading ? 'Создаём...' : '✈ Создать и скачать PDF'}
        </button>
      </div>

      {/* Service picker modal */}
      {showServicePicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-[#1C2056]">Выберите услугу</span>
              <button onClick={() => setShowServicePicker(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-2">
              {savedServices.map(s => (
                <div key={s.id} onClick={() => selectService(s)}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-[#1C2056]">
                  <div>
                    <div className="font-medium text-sm text-[#1C2056]">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.unit}</div>
                  </div>
                  <div className="text-sm font-medium text-[#1C2056]">{Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  )
}