'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Services() {
  const router = useRouter()
  const [services, setServices] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', unit: 'шт' })

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id).order('name')
    setServices(data || [])
    setLoading(false)
  }

  async function addService() {
    if (!form.name || !form.price) { alert('Заполните название и цену'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('services').insert({
      name: form.name,
      price: Number(form.price),
      unit: form.unit,
      user_id: user.id
    })
    if (error) alert('Ошибка: ' + error.message)
    else {
      setForm({ name: '', price: '', unit: 'шт' })
      setShowForm(false)
      loadServices()
    }
    setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm('Удалить позицию?')) return
    await supabase.from('services').delete().eq('id', id)
    loadServices()
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const units = ['шт', 'час', 'день', 'месяц', 'кг', 'л', 'м', 'м²']

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Услуги и товары</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder="Поиск услуг и товаров..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">Загрузка...</p>
        ) : filtered.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">{search ? 'Не найдено' : 'Нет позиций'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
            {filtered.map((svc, i) => (
              <div key={svc.id}
                className={`flex items-center justify-between px-4 py-3.5 ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div>
                  <div className="font-medium text-sm text-[#1C2056]">{svc.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{svc.unit}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#1C2056]">{Number(svc.price).toLocaleString('ru-KZ')} ₸</span>
                  <button onClick={() => deleteService(svc.id)} className="text-gray-300 hover:text-red-400 text-lg">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">Новая позиция</div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Название</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="Услуги дизайна"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Цена ₸</label>
                <input
                  type="number"
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                  placeholder="15000"
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Единица</label>
                <select
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                >
                  {units.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                Отмена
              </button>
              <button onClick={addService} disabled={saving} className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? 'Сохраняем...' : 'Добавить'}
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)} className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
            + Добавить позицию
          </button>
        )}
      </div>
    </main>
  )
}