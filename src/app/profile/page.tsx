'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

export default function Profile() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    company_name: '',
    bin_iin: '',
    address: '',
    phone: '',
    email: '',
    bank_name: '',
    bik: '',
    iik: '',
    kbe: '19',
    knp: '',
    director_name: '',
    accountant_name: '',
  })

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile({ ...profile, ...data })
      setLoading(false)
    }
    loadProfile()
  }, [])

  async function saveProfile() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...profile })
    if (error) alert('Ошибка: ' + error.message)
    else alert('Профиль сохранён!')
    setSaving(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  const fields = [
    { section: 'Компания', items: [
      { key: 'company_name', label: 'Название компании / ИП', placeholder: 'ИП First Project' },
      { key: 'bin_iin', label: 'БИН / ИИН', placeholder: '890525350143' },
      { key: 'address', label: 'Адрес', placeholder: 'г. Астана, ул. ...' },
      { key: 'phone', label: 'Телефон', placeholder: '+7 776 355 51 77' },
      { key: 'email', label: 'Email', placeholder: 'info@company.kz' },
      { key: 'director_name', label: 'Руководитель (ФИО)', placeholder: 'Абилбаев А.А.' },
      { key: 'accountant_name', label: 'Бухгалтер (ФИО)', placeholder: 'Абилбаев А.А.' },
    ]},
    { section: 'Банковские реквизиты', items: [
      { key: 'bank_name', label: 'Банк', placeholder: 'АО «Kaspi Bank»' },
      { key: 'iik', label: 'ИИК (номер счёта)', placeholder: 'KZ...' },
      { key: 'bik', label: 'БИК', placeholder: 'CASPKZKA' },
      { key: 'kbe', label: 'КБе', placeholder: '19' },
      { key: 'knp', label: 'КНП', placeholder: '119' },
    ]},
  ]

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-[#1C2056] px-4 pt-6 pb-8 max-w-lg mx-auto rounded-b-3xl">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg mb-3">
          {profile.company_name ? profile.company_name[0] : 'F'}
        </div>
        <div className="text-white font-medium text-lg">{profile.company_name || 'Заполните профиль'}</div>
        <div className="text-white/60 text-sm mt-1">{profile.bin_iin ? 'ИИН: ' + profile.bin_iin : ''}</div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {fields.map(section => (
          <div key={section.section} className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide font-medium">
              {section.section}
            </div>
            {section.items.map(field => (
              <div key={field.key} className="px-4 pb-3">
                <label className="text-xs text-gray-500 mb-1 block">{field.label}</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={field.placeholder}
                  value={(profile as any)[field.key] || ''}
                  onChange={e => setProfile({ ...profile, [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        ))}

        <button
          onClick={saveProfile}
          disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mb-3"
        >
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>

        <button
          onClick={signOut}
          className="w-full bg-red-50 text-red-500 rounded-xl py-3 text-sm font-medium"
        >
          Выйти из аккаунта
        </button>
      </div>
      <BottomNav />
    </main>
  )
}