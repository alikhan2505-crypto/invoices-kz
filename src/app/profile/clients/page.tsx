'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Clients() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', bin_iin: '', email: '', address: '' })

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('name')
    setClients(data || [])
    setLoading(false)
  }

  async function addClient() {
    if (!form.name) { alert('Введите название'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('clients').insert({ ...form, user_id: user.id })
    if (error) alert('Ошибка: ' + error.message)
    else {
      setForm({ name: '', bin_iin: '', email: '', address: '' })
      setShowForm(false)
      loadClients()
    }
    setSaving(false)
  }

  async function deleteClient(id: string) {
    if (!confirm('Удалить клиента?')) return
    await supabase.from('clients').delete().eq('id', id)
    loadClients()
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.bin_iin || '').includes(search)
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Мои клиенты</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder="Поиск клиентов (БИН/ИИН, Название...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">Загрузка...</p>
        ) : filtered.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-gray-400 text-sm">{search ? 'Клиент не найден' : 'Нет клиентов'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
            {filtered.map((client, i) => (
              <div key={client.id}
                className={`flex items-center justify-between px-4 py-3.5 ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="font-medium text-sm text-[#1C2056]">{client.name}</div>
                  {client.bin_iin && <div className="text-xs text-gray-400 mt-0.5">БИН: {client.bin_iin}</div>}
                </div>
                <button onClick={() => deleteClient(client.id)} className="text-gray-300 hover:text-red-400 text-lg px-2">✕</button>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">Новый клиент</div>
            {[
              { key: 'name', label: 'Название компании / ИП', placeholder: 'ТОО «Пример»' },
              { key: 'bin_iin', label: 'БИН / ИИН', placeholder: '123456789012' },
              { key: 'email', label: 'Email', placeholder: 'client@mail.kz' },
              { key: 'address', label: 'Адрес', placeholder: 'г. Алматы, ул. Абая 1' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                Отмена
              </button>
              <button onClick={addClient} disabled={saving} className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? 'Сохраняем...' : 'Добавить'}
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)} className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
            + Новый клиент
          </button>
        )}
      </div>
    </main>
  )
}