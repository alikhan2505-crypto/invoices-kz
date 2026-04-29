'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Banks() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('created_at')
    setAccounts(data || [])
    setLoading(false)
  }

  function startEdit(acc: any) {
    setEditingId(acc.id)
    setForm({ bank_name: acc.bank_name, iik: acc.iik, bik: acc.bik || '', kbe: acc.kbe || '19', currency: acc.currency || 'KZT' })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })
    setShowForm(false)
  }

  async function saveAccount() {
    if (!form.bank_name || !form.iik) { alert('Заполните название банка и ИИК'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (editingId) {
      const { error } = await supabase.from('bank_accounts').update({ ...form }).eq('id', editingId)
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    } else {
      const is_main = accounts.length === 0
      const { error } = await supabase.from('bank_accounts').insert({ ...form, user_id: user.id, is_main })
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    }

    resetForm()
    loadAccounts()
    setSaving(false)
  }

  async function setMain(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('bank_accounts').update({ is_main: false }).eq('user_id', user.id)
    await supabase.from('bank_accounts').update({ is_main: true }).eq('id', id)
    loadAccounts()
  }

  async function deleteAccount(id: string) {
    if (!confirm('Удалить этот счёт?')) return
    await supabase.from('bank_accounts').delete().eq('id', id)
    loadAccounts()
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
          <span className="font-semibold text-[#1C2056]">Банковские счета</span>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
            + Добавить
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">
              {editingId ? 'Редактировать счёт' : 'Новый счёт'}
            </div>
            {[
              { key: 'bank_name', label: 'Банк *', placeholder: 'АО «Kaspi Bank»' },
              { key: 'iik', label: 'ИИК *', placeholder: 'KZ...' },
              { key: 'bik', label: 'БИК', placeholder: 'CASPKZKA' },
              { key: 'kbe', label: 'КБе', placeholder: '19' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Валюта</label>
              <select
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}>
                <option>KZT</option>
                <option>USD</option>
                <option>EUR</option>
                <option>RUB</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={resetForm}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                Отмена
              </button>
              <button onClick={saveAccount} disabled={saving}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-center text-gray-400 py-8">Загрузка...</p>
        ) : accounts.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🏦</div>
            <p className="text-gray-400 text-sm mb-4">Нет банковских счетов</p>
            <button onClick={() => setShowForm(true)}
              className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
              + Добавить счёт
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id}
                className={`bg-white rounded-2xl p-4 shadow-sm border-2 ${acc.is_main ? 'border-[#2DC48D]' : 'border-transparent'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[#1C2056]">{acc.bank_name}</span>
                      {acc.is_main && (
                        <span className="text-xs bg-[#2DC48D]/10 text-[#2DC48D] px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">{acc.iik}</div>
                    {acc.bik && <div className="text-xs text-gray-400 mt-0.5">БИК: {acc.bik}</div>}
                    {acc.kbe && <div className="text-xs text-gray-400">КБе: {acc.kbe}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">{acc.currency} · Активен</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!acc.is_main && (
                    <button onClick={() => setMain(acc.id)}
                      className="flex-1 text-xs text-[#2DC48D] border border-[#2DC48D] rounded-lg py-1.5">
                      ✓ Сделать основным
                    </button>
                  )}
                  <button onClick={() => startEdit(acc)}
                    className="flex-1 text-xs text-[#1C2056] border border-[#1C2056] rounded-lg py-1.5">
                    ✏️ Редактировать
                  </button>
                  <button onClick={() => deleteAccount(acc.id)}
                    className="text-xs text-red-400 border border-red-200 rounded-lg px-3 py-1.5">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}