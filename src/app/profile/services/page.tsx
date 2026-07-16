'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { profileContentDict } from '@/lib/i18n/profileContent'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

export default function Services() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const [services, setServices] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', price: '', unit: 'шт', code: '', type: 'service'
  })

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id).order('name')
    setServices(data || [])
    setLoading(false)
  }

  function startEdit(svc: any) {
    setEditingId(svc.id)
    setForm({
      name: svc.name,
      price: String(svc.price),
      unit: svc.unit || 'шт',
      code: svc.code || '',
      type: svc.type || 'service',
    })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ name: '', price: '', unit: 'шт', code: '', type: 'service' })
    setShowForm(false)
  }

  async function saveService() {
    if (!form.name || !form.price) { alert(t.fillNameAndPriceAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      name: form.name,
      price: Number(form.price),
      unit: form.unit,
      code: form.code || null,
      type: form.type,
    }

    if (editingId) {
      const { error } = await supabase.from('services').update(payload).eq('id', editingId)
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    } else {
      const { error } = await supabase.from('services').insert({ ...payload, user_id: user.id })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    }

    resetForm()
    loadServices()
    setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm(t.deleteItemConfirm)) return
    await supabase.from('services').delete().eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.code || '').toLowerCase().includes(search.toLowerCase())
  )

  const servicesList = filtered.filter(s => !s.type || s.type === 'service')
  const productsList = filtered.filter(s => s.type === 'product')

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
          <span className="font-semibold text-[#1C2056]">{t.servicesHeaderLabel}</span>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
            {t.openAddFormButton}
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto p-4">

        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder={t.searchServicesPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">✕</button>
          )}
        </div>

        {/* Форма добавления/редактирования */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">
              {editingId ? t.editItemHeading : t.newItemHeading}
            </div>

            {/* Тип */}
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setForm({ ...form, type: 'service' })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition ${form.type === 'service' ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {t.serviceTypeToggleLabel}
              </button>
              <button type="button"
                onClick={() => setForm({ ...form, type: 'product' })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition ${form.type === 'product' ? 'bg-[#2DC48D] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {t.productTypeToggleLabel}
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.itemNameFieldLabel}</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder={form.type === 'service' ? t.serviceNamePlaceholder : t.productNamePlaceholder}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.itemCodeFieldLabel}</label>
                <input
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={t.itemCodePlaceholder}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.itemPriceFieldLabel}</label>
                <input
                  type="number"
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={t.itemPricePlaceholder}
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t.itemUnitFieldLabel}</label>
                <select
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-white"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{t.unitLabel(u)}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={resetForm}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                {t.cancelButton}
              </button>
              <button onClick={saveService} disabled={saving}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {t.formSubmitLabel(saving, !!editingId)}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-gray-400 text-sm">{t.servicesLoadingLabel}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">{t.itemsEmptyStateLabel(!!search)}</p>
          </div>
        ) : (
          <>
            {/* Услуги */}
            {servicesList.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">
                  {t.servicesSectionLabel(servicesList.length)}
                </div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {servicesList.map((svc, i) => (
                    <div key={svc.id}
                      className={`flex items-center px-4 py-3.5 ${i < servicesList.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#1C2056]">{svc.name}</span>
                          {svc.code && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{svc.code}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{t.unitLabel(svc.unit)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#1C2056]">
                          {Number(svc.price).toLocaleString('ru-KZ')} ₸
                        </span>
                        <button onClick={() => startEdit(svc)} className="text-gray-300 hover:text-[#1C2056] text-lg">✏️</button>
                        <button onClick={() => deleteService(svc.id)} className="text-gray-300 hover:text-red-400 text-lg">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Товары */}
            {productsList.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">
                  {t.productsSectionLabel(productsList.length)}
                </div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {productsList.map((svc, i) => (
                    <div key={svc.id}
                      className={`flex items-center px-4 py-3.5 ${i < productsList.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#1C2056]">{svc.name}</span>
                          {svc.code && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{svc.code}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{t.unitLabel(svc.unit)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#1C2056]">
                          {Number(svc.price).toLocaleString('ru-KZ')} ₸
                        </span>
                        <button onClick={() => startEdit(svc)} className="text-gray-300 hover:text-[#1C2056] text-lg">✏️</button>
                        <button onClick={() => deleteService(svc.id)} className="text-gray-300 hover:text-red-400 text-lg">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!showForm && services.length > 0 && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
            {t.addItemButton}
          </button>
        )}
      </div>
    </main>
  )
}