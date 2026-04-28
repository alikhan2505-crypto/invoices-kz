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
  const [clientSelected, setClientSelected] = useState(false)
  const [showSaveClient, setShowSaveClient] = useState(false)
  const [lastInvoiceClient, setLastInvoiceClient] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [monthCount, setMonthCount] = useState(0)

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
      const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('*').eq('user_id', user.id).order('name'),
        supabase.from('services').select('*').eq('user_id', user.id).order('name'),
        supabase.from('invoices').select('client_name, client_bin, client_email')
          .eq('user_id', user.id)
          .not('client_name', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      setProfile(p)
      // Считаем счета за текущий месяц
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString())
      setMonthCount(count || 0)
      setSavedServices(s || [])

      const fromHistory = (inv || []).reduce((acc: any[], inv: any) => {
        if (inv.client_name && !acc.find((c: any) => c.name === inv.client_name)) {
          acc.push({ name: inv.client_name, bin_iin: inv.client_bin, email: inv.client_email, id: inv.client_name })
        }
        return acc
      }, [])

      const fromDirectory = (c || []).map((cl: any) => ({ ...cl, id: cl.id }))
      const merged = [...fromDirectory]
      fromHistory.forEach((h: any) => {
        if (!merged.find((m: any) => m.name === h.name)) merged.push(h)
      })
      setClients(merged)
    }
    load()
  }, [])

  function selectClient(client: any) {
    setClientName(client.name)
    setClientBin(client.bin_iin || '')
    setClientEmail(client.email || '')
    setClientAddress(client.address || '')
    setClientSelected(true)
  }

  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
    setClientSelected(false)
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

  // Сохранить клиента в справочник — вынесено на уровень компонента
  async function saveClientToDirectory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !lastInvoiceClient) return
    const { error } = await supabase.from('clients').insert({ ...lastInvoiceClient, user_id: user.id })
    if (!error) {
      setClients(prev => [...prev, { ...lastInvoiceClient, id: lastInvoiceClient.bin_iin }])
    }
    setShowSaveClient(false)
  }

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

    // Проверка лимита — 3 счёта в месяц для free
    if ((profile?.plan || 'free') === 'free') {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString())

      if ((count || 0) >= 3) {
        router.push('/upgrade')
        setLoading(false)
        return
      }
    }


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
        signature_url: profile?.signature_url || '',
        stamp_url: profile?.stamp_url || '',
      }
    })

    // Предлагаем сохранить клиента если его нет в справочнике
    const alreadyExists = clients.find(c => c.bin_iin === clientBin)
    if (!alreadyExists && clientBin) {
      setLastInvoiceClient({ name: clientName, bin_iin: clientBin, email: clientEmail, address: clientAddress })
      setShowSaveClient(true)
    }

    clearClient()
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
        <h2 className="text-xl font-bold text-[#1C2056] mb-1">Новый счёт</h2>
        <p className="text-sm text-gray-500 mb-4">Создайте счёт за 1 минуту</p>

        {(profile?.plan || 'free') === 'free' && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-4 ${monthCount >= 3 ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
            <div>
              <div className={`text-sm font-medium ${monthCount >= 3 ? 'text-red-600' : 'text-[#1C2056]'}`}>
                {monthCount >= 3 ? 'Лимит исчерпан!' : `Использовано ${monthCount} из 3 бесплатных`}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {monthCount >= 3 ? 'Перейдите на платный тариф' : `Осталось ${3 - monthCount} счёта в этом месяце`}
              </div>
            </div>
            <button onClick={() => router.push('/upgrade')}
              className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
              Тарифы
            </button>
          </div>
        )}

        {/* Recent clients chips */}
        {clients.length > 0 && !clientSelected && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">Быстрый выбор клиента</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {clients.slice(0, 6).map(c => (
                <button key={c.id} onClick={() => selectClient(c)}
                  className="whitespace-nowrap text-xs bg-white border border-gray-200 text-[#1C2056] px-3 py-2 rounded-full hover:bg-[#1C2056] hover:text-white hover:border-[#1C2056] transition flex-shrink-0 shadow-sm">
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Client section */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h3 className="font-medium text-[#1C2056] mb-3">Данные клиента</h3>

          {clientSelected ? (
            <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#1C2056]">{clientName}</div>
                <div className="text-xs text-gray-400 mt-0.5">БИН: {clientBin}</div>
                {clientEmail && <div className="text-xs text-gray-400">{clientEmail}</div>}
              </div>
              <button onClick={clearClient} className="text-gray-300 hover:text-red-400 text-xl">✕</button>
            </div>
          ) : (
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Адрес (необязательно)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="г. Алматы, ул. Абая 1"
                  value={clientAddress}
                  onChange={e => setClientAddress(e.target.value)}
                />
              </div>
            </div>
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

      {/* Save client modal */}
      {showSaveClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">👥</div>
              <div className="font-semibold text-[#1C2056] mb-1">Сохранить клиента?</div>
              <div className="text-sm text-gray-400">
                {lastInvoiceClient?.name} будет добавлен в справочник
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveClient(false)}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                Пропустить
              </button>
              <button
                onClick={saveClientToDirectory}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  )
}