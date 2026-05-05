'use client'
import { useRouter } from 'next/navigation'

export default function Terms() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Условия использования</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <div className="text-xs text-gray-400 mb-3">Последнее обновление: 29 апреля 2026 года</div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Используя INVOICES.KZ вы соглашаетесь с настоящими условиями. 
              Пожалуйста, прочитайте их внимательно.
            </p>
          </div>

          {[
            {
              title: '1. Описание сервиса',
              content: 'INVOICES.KZ — веб-приложение для создания и отправки счетов на оплату. Сервис предназначен для индивидуальных предпринимателей и юридических лиц Республики Казахстан.'
            },
            {
              title: '2. Регистрация',
              content: 'Для использования сервиса необходима регистрация. Вы несёте ответственность за сохранность данных своего аккаунта. Один человек — один аккаунт.'
            },
            {
              title: '3. Тарифы и оплата',
              content: 'Бесплатный тариф включает 3 счёта в месяц. Платные тарифы оплачиваются ежемесячно. Возврат средств за неиспользованный период не производится.'
            },
            {
              title: '4. Ограничения',
              content: 'Запрещается использовать сервис для незаконной деятельности, создания фиктивных счетов, мошенничества. Мы оставляем за собой право заблокировать аккаунт при нарушении правил.'
            },
            {
              title: '5. Ответственность',
              content: 'Сервис предоставляется "как есть". Мы не несём ответственности за убытки связанные с использованием или невозможностью использования сервиса.'
            },
            {
              title: '6. Изменения',
              content: 'Мы можем изменять условия использования. Уведомление об изменениях будет направлено на email указанный при регистрации.'
            },
            {
              title: '7. Контакты',
              content: 'ИП First Project, БИН: 890525350143, г. Астана. Email: support@invoices.kz, WhatsApp: +7 776 355 51 77.'
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