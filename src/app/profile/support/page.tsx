'use client'
import { useRouter } from 'next/navigation'

export default function Support() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Поддержка</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <p className="text-sm text-gray-400 mb-4">
          Служба поддержки работает ежедневно с 09:00 до 20:00 (Астанинское время).
        </p>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <a href="https://t.me/invoiceskz_support_bot"
            target="_blank"
            className="flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-xl">✈️</div>
              <div>
                <div className="text-sm font-medium text-[#1C2056]">Написать в Telegram</div>
                <div className="text-xs text-[#2DC48D]">Отвечаем в течение 24 часов</div>
              </div>
            </div>
            <span className="text-gray-300">›</span>
          </a>

          <a href="mailto:support@invoices.kz"
            className="flex items-center justify-between px-4 py-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-xl">✉️</div>
              <div>
                <div className="text-sm font-medium text-[#1C2056]">Email</div>
                <div className="text-xs text-gray-400">support@invoices.kz · ответ в течение 14 дней</div>
              </div>
            </div>
            <span className="text-gray-300">›</span>
          </a>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">Частые вопросы</div>
          {[
            { q: 'Как создать счёт?', a: 'Нажмите «+» на главной странице, заполните данные клиента и услуги, нажмите «Создать и скачать PDF».' },
            { q: 'Как отправить счёт клиенту?', a: 'Откройте счёт в Истории и нажмите кнопку «WhatsApp» или «Email» — клиент получит ссылку на счёт.' },
            { q: 'Как скачать PDF?', a: 'На странице счёта нажмите кнопку «PDF» и выберите вариант с подписью или без.' },
            { q: 'Как изменить реквизиты?', a: 'Профиль → Реквизиты → заполните данные компании и нажмите «Сохранить».' },
            { q: 'Что входит в пробный период?', a: '7 дней бесплатного доступа ко всем функциям Pro тарифа без ограничений.' },
            { q: 'Как продлить подписку?', a: 'Профиль → Подписка → выберите тариф и следуйте инструкциям оплаты.' },
            { q: 'Принимают ли банки такие счета?', a: 'Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.' },
          ].map((item, i, arr) => (
            <details key={i} className={`group px-4 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <summary className="py-3.5 text-sm font-medium text-[#1C2056] cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <span className="text-gray-300 group-open:rotate-90 transition-transform">›</span>
              </summary>
              <p className="text-sm text-gray-500 pb-3.5">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </main>
  )
}