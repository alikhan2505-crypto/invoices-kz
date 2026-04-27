'use client'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default function Profile() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-[#1C2056] px-4 pt-6 pb-8 max-w-lg mx-auto rounded-b-3xl">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg mb-3">FP</div>
        <div className="text-white font-medium text-lg">ИП First Project</div>
        <div className="text-white/60 text-sm mt-1">ИИН: 890525350143 · Астана</div>
        <div className="bg-white/10 rounded-xl p-4 mt-4">
          <div className="text-white/60 text-xs uppercase tracking-wide mb-1">Доход за месяц</div>
          <div className="text-white text-2xl font-medium">1 250 000 ₸</div>
          <div className="text-[#2DC48D] text-sm mt-1">+12% к прошлому</div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Компания</div>
          {[
            { icon: '🏢', label: 'Реквизиты', href: '/profile/requisites' },
            { icon: '💳', label: 'Банковские счета', href: '/profile/banks' },
            { icon: '🔒', label: 'ЭЦП и безопасность', href: '/profile/security' },
          ].map(item => (
            <div key={item.href} onClick={() => router.push(item.href)}
              className="flex items-center justify-between px-4 py-3 border-t cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm text-gray-800">{item.label}</span>
              </div>
              <span className="text-gray-300">›</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Справочники</div>
          {[
            { icon: '👥', label: 'Мои клиенты', badge: '24', href: '/profile/clients' },
            { icon: '📋', label: 'Услуги и товары', badge: '12', href: '/profile/services' },
          ].map(item => (
            <div key={item.href} onClick={() => router.push(item.href)}
              className="flex items-center justify-between px-4 py-3 border-t cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm text-gray-800">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{item.badge}</span>
                <span className="text-gray-300">›</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Настройки</div>
          {[
            { icon: '⚙️', label: 'Настройки счетов', href: '/profile/settings' },
            { icon: '🔔', label: 'Уведомления', href: '/profile/notifications' },
            { icon: '💬', label: 'Поддержка', href: '/profile/support' },
          ].map(item => (
            <div key={item.href} onClick={() => router.push(item.href)}
              className="flex items-center justify-between px-4 py-3 border-t cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm text-gray-800">{item.label}</span>
              </div>
              <span className="text-gray-300">›</span>
            </div>
          ))}
        </div>

        <button className="w-full bg-red-50 text-red-500 rounded-xl py-3 text-sm font-medium">
          Выйти из аккаунта
        </button>
      </div>
      <BottomNav />
    </main>
  )
}