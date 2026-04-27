'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Requisites() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    company_name: '', bin_iin: '', address: '', email: '', phone: '',
    director_name: '', accountant_name: ''
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile({ ...profile, ...data })
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...profile })
    if (error) alert('Ошибка: ' + error.message)
    else { alert('Сохранено!'); router.push('/profile') }
    setSaving(false)
  }

  const fields = [
    { key: 'company_name', label: 'Название компании / ИП', placeholder: 'ИП Смагулов А.К.' },
    { key: 'bin_iin', label: 'БИН / ИИН', placeholder: '920101401234' },
    { key: 'address', label: 'Юридический адрес', placeholder: 'г. Алматы, ул. Абая 10, оф 25' },
    { key: 'email', label: 'Email', placeholder: 'smagulov@example.kz' },
    { key: 'phone', label: 'Телефон', placeholder: '+7 701 123 45 67' },
    { key: 'director_name', label: 'Руководитель (ФИО)', placeholder: 'Смагулов А.К.' },
    { key: 'accountant_name', label: 'Бухгалтер (ФИО)', placeholder: 'Смагулов А.К.' },
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Реквизиты компании</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder={f.placeholder}
                value={(profile as any)[f.key] || ''}
                onChange={e => setProfile({ ...profile, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mt-4"
        >
          {saving ? 'Сохраняем...' : 'Сохранить изменения'}
        </button>
      </div>
    </main>
  )
}