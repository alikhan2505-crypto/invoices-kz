'use client'
import { useRouter } from 'next/navigation'

export default function Upgrade() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Тарифы</span>
      </div>

      <div className="max-w-lg mx-auto p-6 flex-1">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-2xl font-bold text-[#1C2056] mb-2">Выберите тариф</h1>
          <p className="text-gray-400 text-sm">Бесплатно — 3 счёта в месяц</p>
        </div>

        {/* Free */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056]">Бесплатно</div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Текущий</span>
          </div>
          <div className="text-2xl font-bold text-[#1C2056] mb-3">0 ₸</div>
          <ul className="space-y-2">
            {['3 счёта в месяц', 'PDF генерация', 'История счетов', 'Профиль компании'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Basic */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 border-[#1C2056]/20">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056]">Базовый</div>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">Популярный</span>
          </div>
          <div className="text-2xl font-bold text-[#1C2056] mb-3">
            2 990 ₸<span className="text-sm font-normal text-gray-400">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              '30 счетов в месяц',
              'PDF с подписью и печатью',
              'Справочник клиентов',
              'Услуги и товары',
              'Отправка на Email',
              'Поддержка в WhatsApp',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => window.open('https://wa.me/77763555177?text=Хочу подключить Базовый тариф INVOICES.KZ', '_blank')}
            className="w-full border-2 border-[#1C2056] text-[#1C2056] rounded-xl py-3.5 font-medium text-sm">
            Подключить за 2 990 ₸/мес
          </button>
        </div>

        {/* Pro */}
        <div className="bg-[#1C2056] rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-white text-lg">Про</div>
            <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">Максимум</span>
          </div>
          <div className="text-2xl font-bold text-white mb-3">
            5 990 ₸<span className="text-sm font-normal text-white/60">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              'Безлимитные счета',
              'ЭЦП НУЦ РК подпись',
              'Шаблоны счетов',
              'PDF с подписью и печатью',
              'Отправка на Email и WhatsApp',
              'Аналитика и отчёты',
              'Приоритетная поддержка 24/7',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => window.open('https://wa.me/77763555177?text=Хочу подключить Про тариф INVOICES.KZ', '_blank')}
            className="w-full bg-[#2DC48D] text-white rounded-xl py-3.5 font-medium text-sm">
            Подключить за 5 990 ₸/мес
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Оплата через Kaspi или перевод.{' '}
          <a href="https://wa.me/77763555177" target="_blank" className="text-[#1C2056] underline">
            Написать нам
          </a>
        </p>
      </div>
    </main>
  )
}