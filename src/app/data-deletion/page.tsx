'use client'
import { useRouter } from 'next/navigation'

export default function DataDeletion() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-16 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="back-btn text-gray-400 text-xl" aria-label="Назад">‹</button>
        <span className="font-semibold text-[#1C2056]">Удаление данных</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <div className="text-xs text-gray-400 mb-3">Последнее обновление: 15 августа 2026 года</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Вы можете в любой момент запросить полное удаление своего аккаунта INVOICES.KZ
              и всех связанных с ним данных, включая данные, полученные через подключение Instagram
              (AI-агент).
            </p>
          </div>

          <div>
            <div className="font-semibold text-[#1C2056] mb-2 text-sm">Как удалить данные</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Напишите на <a href="mailto:support@invoices.kz" className="text-[#1C2056] underline">support@invoices.kz</a> с
              темой «Удаление данных» и укажите email, привязанный к вашему аккаунту (или имя пользователя
              подключённого Instagram-аккаунта). Мы обработаем запрос и удалим данные в течение 30 дней.
            </p>
          </div>

          <div>
            <div className="font-semibold text-[#1C2056] mb-2 text-sm">Что именно удаляется</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Профиль и реквизиты компании, созданные счета и история операций, а для AI-агента — сохранённый
              токен доступа к Instagram, настройки ассистента и история переписок с клиентами, собранная
              через Instagram-канал.
            </p>
          </div>

          <div>
            <div className="font-semibold text-[#1C2056] mb-2 text-sm">Отключение Instagram отдельно</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Чтобы только отключить Instagram, не удаляя весь аккаунт, отзовите доступ приложения
              INVOICES.KZ в настройках вашего аккаунта Instagram/Meta (Настройки → Приложения и сайты) —
              мы получим уведомление и удалим сохранённый токен доступа.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
