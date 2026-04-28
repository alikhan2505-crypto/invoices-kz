'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

export default function Profile() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ clients: 0, services: 0, income: 0, invoices: 0 })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('id').eq('user_id', user.id),
        supabase.from('services').select('id').eq('user_id', user.id),
        supabase.from('invoices').select('amount, status, created_at').eq('user_id', user.id),
      ])

      setProfile(p)

      // Доход за текущий месяц
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthIncome = (inv || [])
        .filter(i => i.status === 'paid' && i.created_at >= monthStart)
        .reduce((sum: number, i: any) => sum + Number(i.amount), 0)

      setStats({
        clients: (c || []).length,
        services: (s || []).length,
        income: monthIncome,
        invoices: (inv || []).length,
      })

      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  const initials = profile?.company_name
    ? profile.company_name.slice(0, 2).toUpperCase()
    : 'FP'

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-6 pb-4 border-b">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#1C2056] flex items-center justify-center text-white font-bold text-sm">
            {initials}
          </div>
          <div>
            <div className="font-semibold text-[#1C2056] text-base">{profile?.company_name || 'Заполните профиль'}</div>
            <div className="text-xs text-gray-400">{profile?.bin_iin ? 'ИИН: ' + profile.bin_iin : 'Нет данных'}</div>
          </div>
        </div>

        {/* Income card */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Доход за месяц</div>
          <div className="text-2xl font-semibold text-[#1C2056]">
            {stats.income.toLocaleString('ru-KZ')} ₸
          </div>
          <div className="text-xs text-[#2DC48D] mt-1">
            Всего счетов: {stats.invoices}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        {/* Компания */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Компания</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[
              { icon: '🏢', label: 'Реквизиты', href: '/profile/requisites' },
              { icon: '✍️', label: 'Подпись и печать', href: '/profile/signature' },
              { icon: '💳', label: 'Банковские счета', href: '/profile/banks' },
              { icon: '🔒', label: 'ЭЦП и безопасность', href: '/profile/security' },
            ].map((item, i, arr) => (
              <div key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </div>
            ))}
          </div>
        </div>

        {/* Справочники */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Справочники</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[
              { icon: '👥', label: 'Мои клиенты', href: '/profile/clients', badge: stats.clients },
              { icon: '📋', label: 'Услуги и товары', href: '/profile/services', badge: stats.services },
              { icon: '📋', label: 'Шаблоны счетов', href: '/profile/templates', badge: 0 },
            ].map((item, i, arr) => (
              <div key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.badge > 0 && (
                    <span className="text-xs text-gray-400 font-medium">{item.badge}</span>
                  )}
                  <span className="text-gray-300 text-lg">›</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Настройки */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Настройки</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[
              { icon: '⚙️', label: 'Настройки счетов', href: '/profile/settings' },
              { icon: '🔔', label: 'Уведомления', href: '/profile/notifications' },
              { icon: '💬', label: 'Поддержка', href: '/profile/support' },
            ].map((item, i, arr) => (
              <div key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={signOut} className="w-full bg-red-50 text-red-500 rounded-xl py-3 text-sm font-medium">
          Выйти из аккаунта
        </button>
      </div>
      <BottomNav />
    </main>
  )
}