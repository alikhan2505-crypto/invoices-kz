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

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...profile })
    if (error) alert('Ошибка: ' + error.message)
    else { alert('Сохранено!'); router.push('/profile') }
    setSaving(false)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Реквизиты компании</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Название компании / ИП</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="ИП Смагулов А.К."
              value={profile.company_name}
              onChange={e => setProfile({ ...profile, company_name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">БИН / ИИН</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="920101401234"
              value={profile.bin_iin}
              onChange={e => setProfile({ ...profile, bin_iin: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Юридический адрес</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="г. Алматы, ул. Абая 10, оф 25"
              value={profile.address}
              onChange={e => setProfile({ ...profile, address: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="smagulov@example.kz"
              value={profile.email}
              onChange={e => setProfile({ ...profile, email: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Телефон</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="+7 701 123 45 67"
              value={profile.phone}
              type="tel"
              maxLength={16}
              onChange={e => setProfile({ ...profile, phone: formatPhone(e.target.value) })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Руководитель (ФИО)</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="Смагулов А.К."
              value={profile.director_name}
              onChange={e => setProfile({ ...profile, director_name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Бухгалтер (ФИО)</label>
            <input
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="Смагулов А.К."
              value={profile.accountant_name}
              onChange={e => setProfile({ ...profile, accountant_name: e.target.value })}
            />
          </div>

        </div>

        <button onClick={save} disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mt-4">
          {saving ? 'Сохраняем...' : 'Сохранить изменения'}
        </button>
      </div>
    </main>
  )
}