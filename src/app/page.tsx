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
          Создавайте профессиональные счета с ЭЦП, отправляйте клиентам и отслеживайте оплаты. Без бухгалтера и сложных программ.
        </p>
        <button onClick={() => router.push('/login')}
          className="bg-[#1C2056] text-white px-8 py-4 rounded-2xl text-base font-medium hover:bg-[#252A6B] transition mb-3 w-full max-w-xs">
          Начать бесплатно →
        </button>
        <p className="text-xs text-gray-400">10 счетов бесплатно, без карты</p>
      </section>

      {/* Features */}
      <section className="max-w-2xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 gap-4">
          {[
            { icon: '⚡', title: 'Счёт за 1 минуту', desc: 'Заполните данные клиента, добавьте услуги — счёт готов. PDF скачивается автоматически.' },
            { icon: '🔒', title: 'ЭЦП НУЦ РК', desc: 'Подписывайте счета электронной подписью. Юридически значимые документы без похода к нотариусу.' },
            { icon: '📊', title: 'История и аналитика', desc: 'Все счета в одном месте. Видите кто заплатил, кто задержал, сколько заработали за месяц.' },
            { icon: '📱', title: 'Работает на телефоне', desc: 'Создавайте счета прямо с телефона — на встрече, в дороге, дома.' },
            { icon: '🇰🇿', title: 'Казахстанский формат', desc: 'БИН/ИИН, ИИК, БИК, КБе — всё по стандартам РК. Банки принимают без вопросов.' },
            { icon: '💸', title: 'Бесплатно для старта', desc: '10 счетов в месяц бесплатно. Для активного бизнеса — от 2 990 тенге в месяц.' },
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

      {/* For who */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-6">
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
              <div key={item.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-xs text-gray-600 font-medium">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-[#1C2056] mb-2 text-center">Тарифы</h2>
        <p className="text-gray-400 text-sm text-center mb-8">Без скрытых платежей</p>
        <div className="grid grid-cols-1 gap-4">
          {/* Free */}
          <div className="border-2 border-gray-100 rounded-2xl p-6">
            <div className="font-bold text-[#1C2056] text-lg mb-1">Бесплатно</div>
            <div className="text-3xl font-bold text-[#1C2056] mb-4">0 ₸</div>
            <ul className="space-y-2 mb-6">
              {['10 счетов в месяц', 'PDF генерация', 'История счетов', 'Профиль компании'].map(f => (
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

          {/* Pro */}
          <div className="bg-[#1C2056] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-white text-lg">Про</div>
              <span className="bg-[#2DC48D] text-white text-xs px-2 py-1 rounded-full">Популярный</span>
            </div>
            <div className="text-3xl font-bold text-white mb-4">2 990 ₸<span className="text-sm font-normal text-white/60">/мес</span></div>
            <ul className="space-y-2 mb-6">
              {['Безлимитные счета', 'Подпись и печать в PDF', 'Мои клиенты и услуги', 'Отправка на Email', 'ЭЦП подпись', 'Приоритетная поддержка'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <span className="text-[#2DC48D]">✓</span> {f}
                </li>
              ))}
            </ul>
            <button onClick={() => router.push('/login')}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-3 text-sm font-medium">
              Попробовать 14 дней бесплатно
            </button>
          </div>
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
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t text-center">
        <div className="font-bold text-[#1C2056] mb-2">INVOICES.KZ</div>
        <div className="text-xs text-gray-400 mb-3">Счета на оплату для казахстанского бизнеса</div>
        <div className="flex justify-center gap-6 text-xs text-gray-400">
          <button onClick={() => router.push('/login')}>Войти</button>
          <a href="mailto:support@invoices.kz">Поддержка</a>
          <a href="https://wa.me/77763555177" target="_blank">WhatsApp</a>
        </div>
      </footer>
    </main>
  )
}