'use client'
import { useRouter } from 'next/navigation'

export default function Privacy() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Политика конфиденциальности</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <div className="text-xs text-gray-400 mb-3">Последнее обновление: 29 апреля 2026 года</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              INVOICES.KZ ("мы", "наш", "сервис") серьёзно относится к защите ваших персональных данных. 
              Настоящая политика описывает, какие данные мы собираем и как их используем.
            </p>
          </div>

          {[
            {
              title: '1. Какие данные мы собираем',
              content: 'Мы собираем: email адрес при регистрации, данные компании (название, БИН/ИИН, адрес, телефон), банковские реквизиты которые вы вводите, данные о счетах и клиентах которые вы создаёте.'
            },
            {
              title: '2. Как мы используем данные',
              content: 'Данные используются исключительно для работы сервиса: формирование PDF счетов, отображение истории счетов, идентификация вашего аккаунта. Мы не продаём и не передаём ваши данные третьим лицам.'
            },
            {
              title: '3. Хранение данных',
              content: 'Данные хранятся на защищённых серверах Supabase (регион Singapore). Все соединения зашифрованы по протоколу HTTPS. Доступ к данным имеет только авторизованный пользователь.'
            },
            {
              title: '4. Cookies',
              content: 'Мы используем cookies только для поддержания сессии авторизации. Без cookies вход в систему невозможен.'
            },
            {
              title: '5. Ваши права',
              content: 'Вы можете в любой момент запросить удаление своего аккаунта и всех связанных данных. Для этого напишите на support@invoices.kz.'
            },
            {
              title: '6. Контакты',
              content: 'По вопросам конфиденциальности: support@invoices.kz или WhatsApp +7 776 355 51 77.'
            },
          ].map((section, i) => (
            <div key={i}>
              <div className="font-semibold text-[#1C2056] mb-2 text-sm">{section.title}</div>
              <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}