'use client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <span className="font-bold text-[#1C2056] text-lg">INVOICES.KZ</span>
        <div className="flex gap-3">
          <button onClick={() => router.push('/login')}
            className="text-sm text-gray-500 hover:text-[#1C2056]">
            Войти
          </button>
          <button onClick={() => router.push('/login')}
            className="text-sm bg-[#1C2056] text-white px-4 py-2 rounded-xl">
            Начать бесплатно
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-block bg-[#2DC48D]/10 text-[#2DC48D] text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          🇰🇿 Сделано для казахстанского бизнеса
        </div>
        <h1 className="text-4xl font-bold text-[#1C2056] mb-4 leading-tight">
          Счета на оплату<br/>за 1 минуту
        </h1>
        <p className="text-gray-500 text-lg mb-8 leading-relaxed">
          Создавайте профессиональные счета с подписью и печатью, отправляйте клиентам через WhatsApp и отслеживайте оплаты. Без бухгалтера и сложных программ.
        </p>
        <button onClick={() => router.push('/login')}
          className="bg-[#1C2056] text-white px-8 py-4 rounded-2xl text-base font-medium hover:bg-[#252A6B] transition mb-3 w-full max-w-xs">
          Начать бесплатно →
        </button>
        <p className="text-xs text-gray-400">3 счёта бесплатно, без карты</p>
      </section>

      {/* Features */}
      <section className="max-w-2xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 gap-4">
          {[
            { icon: '⚡', title: 'Счёт за 1 минуту', desc: 'Заполните данные клиента, добавьте услуги — счёт готов. PDF скачивается автоматически.' },
            { icon: '💬', title: 'Отправка через WhatsApp', desc: 'Нажмите одну кнопку — клиент получит ссылку на красивую страницу счёта прямо в WhatsApp.' },
            { icon: '📊', title: 'История и аналитика', desc: 'Все счета в одном месте. Видите кто заплатил, кто задержал, сколько заработали за месяц.' },
            { icon: '📱', title: 'Работает на телефоне', desc: 'Создавайте счета прямо с телефона — на встрече, в дороге, дома. Устанавливается как приложение.' },
            { icon: '🇰🇿', title: 'Казахстанский формат', desc: 'БИН/ИИН, ИИК, БИК, КБе — всё по стандартам РК. Банки принимают без вопросов.' },
            { icon: '✍️', title: 'Подпись и печать', desc: 'Добавьте свою подпись и печать — они автоматически появятся на всех PDF документах.' },
          ].map(f => (
            <div key={f.title} className="bg-gray-50 rounded-2xl p-5 flex gap-4 items-start">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <div className="font-semibold text-[#1C2056] mb-1">{f.title}</div>
                <div className="text-sm text-gray-500 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#1C2056] mb-2 text-center">Как это работает</h2>
          <p className="text-gray-400 text-sm text-center mb-8">Три простых шага</p>
          <div className="space-y-4">
            {[
              { step: '1', title: 'Заполните реквизиты', desc: 'Один раз введите данные компании — они будут автоматически появляться во всех счетах.' },
              { step: '2', title: 'Создайте счёт', desc: 'Укажите клиента, добавьте услуги и нажмите "Создать". PDF готов за 30 секунд.' },
              { step: '3', title: 'Отправьте и получите оплату', desc: 'Отправьте ссылку через WhatsApp. Клиент видит счёт и отмечает оплату.' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-2xl p-5 flex gap-4 items-start shadow-sm">
                <div className="w-10 h-10 rounded-full bg-[#1C2056] text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {item.step}
                </div>
                <div>
                  <div className="font-semibold text-[#1C2056] mb-1">{item.title}</div>
                  <div className="text-sm text-gray-500 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For who */}
      <section className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-[#1C2056] mb-6 text-center">Для кого</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '👨‍💼', label: 'ИП и фрилансеры' },
            { icon: '🏢', label: 'Малый бизнес' },
            { icon: '👩‍💻', label: 'IT компании' },
            { icon: '🎨', label: 'Дизайнеры' },
            { icon: '🔧', label: 'Подрядчики' },
            { icon: '📦', label: 'Поставщики' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-xs text-gray-600 font-medium">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#1C2056] mb-2 text-center">Тарифы</h2>
          <p className="text-gray-400 text-sm text-center mb-8">Без скрытых платежей</p>
          <div className="grid grid-cols-1 gap-4">

            {/* Free */}
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
              <div className="font-bold text-[#1C2056] text-lg mb-1">Бесплатно</div>
              <div className="text-3xl font-bold text-[#1C2056] mb-4">0 ₸</div>
              <ul className="space-y-2 mb-6">
                {[
                  '3 счёта в месяц',
                  'PDF генерация',
                  'История счетов',
                  'Профиль компании',
                  'Публичная ссылка на счёт',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-[#2DC48D]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/login')}
                className="w-full border-2 border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                Начать бесплатно
              </button>
            </div>

            {/* Basic */}
            <div className="bg-white border-2 border-[#1C2056]/20 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-[#1C2056] text-lg">Базовый</div>
                <span className="bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">Популярный</span>
              </div>
              <div className="text-3xl font-bold text-[#1C2056] mb-4">
                2 990 ₸<span className="text-sm font-normal text-gray-400">/мес</span>
              </div>
              <ul className="space-y-2 mb-6">
                {[
                  '30 счетов в месяц',
                  'PDF с подписью и печатью',
                  'Справочник клиентов',
                  'Услуги и товары',
                  'Отправка через WhatsApp',
                  'Поддержка в WhatsApp',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-[#2DC48D]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/login')}
                className="w-full border-2 border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                Подключить за 2 990 ₸/мес
              </button>
            </div>

            {/* Pro */}
            <div className="bg-[#1C2056] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-white text-lg">Про</div>
                <span className="bg-[#2DC48D] text-white text-xs px-2 py-1 rounded-full">Максимум</span>
              </div>
              <div className="text-3xl font-bold text-white mb-4">
                5 990 ₸<span className="text-sm font-normal text-white/60">/мес</span>
              </div>
              <ul className="space-y-2 mb-6">
                {[
                  'Безлимитные счета',
                  'ЭЦП НУЦ РК подпись (скоро)',
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
              <button onClick={() => router.push('/login')}
                className="w-full bg-[#2DC48D] text-white rounded-xl py-3 text-sm font-medium">
                Подключить за 5 990 ₸/мес
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-[#1C2056] mb-8 text-center">Частые вопросы</h2>
        <div className="space-y-4">
          {[
            { q: 'Нужна ли ЭЦП для работы?', a: 'Нет, ЭЦП необязательна. Вы можете загрузить рукописную подпись и печать. Интеграция с ЭЦП НУЦ РК находится в разработке.' },
            { q: 'Как клиент получает счёт?', a: 'Вы отправляете ссылку через WhatsApp. Клиент открывает страницу счёта без регистрации и видит все реквизиты для оплаты.' },
            { q: 'Принимают ли банки такие счета?', a: 'Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.' },
            { q: 'Можно ли работать с нескольких устройств?', a: 'Да. INVOICES.KZ работает в браузере на телефоне, планшете и компьютере. Все данные синхронизируются.' },
            { q: 'Как отменить подписку?', a: 'Напишите нам в WhatsApp — отменим в течение часа. Деньги за неиспользованный период возвращаем.' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-5">
              <div className="font-semibold text-[#1C2056] mb-2">{item.q}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1C2056] py-12 px-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">Готовы начать?</h2>
        <p className="text-white/60 text-sm mb-6">Зарегистрируйтесь за 30 секунд — никакой карты не нужно</p>
        <button onClick={() => router.push('/login')}
          className="bg-[#2DC48D] text-white px-8 py-4 rounded-2xl text-base font-medium">
          Создать первый счёт →
        </button>
        <p className="text-white/40 text-xs mt-3">3 счёта бесплатно · Без карты · Отмена в любое время</p>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-[#1C2056]">INVOICES.KZ</div>
            <div className="flex gap-4 text-xs text-gray-400">
              <a href="https://wa.me/77763555177" target="_blank" className="hover:text-[#1C2056]">WhatsApp</a>
              <a href="mailto:support@invoices.kz" className="hover:text-[#1C2056]">Email</a>
              <button onClick={() => router.push('/privacy')} className="hover:text-[#1C2056]">Политика</button>
              <button onClick={() => router.push('/terms')} className="hover:text-[#1C2056]">Условия</button>
            </div>
          </div>
          <div className="text-xs text-gray-400 text-center">
            © 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана
          </div>
        </div>
      </footer>
    </main>
  )
}