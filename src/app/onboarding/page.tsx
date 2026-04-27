'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Onboarding() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [accountType, setAccountType] = useState<'ИП' | 'ТОО' | 'Физлицо'>('ИП')
  const [form, setForm] = useState({
    company_name: '',
    bin_iin: '',
    email: '',
  })

  async function save() {
    if (!form.company_name) { alert('Введите название'); return }
    if (!form.bin_iin) { alert('Введите БИН/ИИН'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      company_name: form.company_name,
      bin_iin: form.bin_iin,
      email: form.email || user.email,
      account_type: accountType,
    })

    if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#2DC48D]/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1C2056] mb-2">Настройка профиля</h1>
          <p className="text-sm text-gray-400">Заполните данные для выставления счетов</p>
        </div>

        {/* Account type */}
        <div className="mb-5">
          <label className="text-xs text-gray-500 mb-2 block">Тип аккаунта</label>
          <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-xl">
            {(['ИП', 'ТОО', 'Физлицо'] as const).map(type => (
              <button key={type}
                onClick={() => setAccountType(type)}
                className={`py-2 rounded-lg text-sm font-medium transition ${accountType === type ? 'bg-white text-[#1C2056] shadow-sm' : 'text-gray-400'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {accountType === 'ТОО' ? 'Название ТОО' : accountType === 'ИП' ? 'Название ИП' : 'ФИО'}
            </label>
            <input
              className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
              placeholder={accountType === 'ТОО' ? 'ТОО «Пример»' : accountType === 'ИП' ? 'ИП Смагулов А.К.' : 'Смагулов Алихан'}
              value={form.company_name}
              onChange={e => setForm({ ...form, company_name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">БИН / ИИН</label>
            <input
              className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
              placeholder="123456789012"
              value={form.bin_iin}
              onChange={e => setForm({ ...form, bin_iin: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email для уведомлений</label>
            <input
              className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
              placeholder="email@example.kz"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {saving ? 'Сохраняем...' : 'Сохранить и войти →'}
        </button>
      </div>
    </main>
  )
}