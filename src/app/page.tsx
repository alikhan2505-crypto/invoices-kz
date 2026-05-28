'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [navBg, setNavBg] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    // Nav scroll
    const onScroll = () => setNavBg(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)

    // Scroll reveal
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 80)
        }
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' })
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))

    // Counter
    const statsEl = document.querySelector('.stats-section')
    let counted = false
    const statsObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !counted) {
        counted = true
        const el = document.getElementById('counter-users')
        if (!el) return
        let start = 0
        const step = (ts: number, startTs: number) => {
          const p = Math.min((ts - startTs) / 1500, 1)
          el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * 2000) + '+'
          if (p < 1) requestAnimationFrame(t => step(t, startTs))
        }
        requestAnimationFrame(t => step(t, t))
      }
    }, { threshold: 0.5 })
    if (statsEl) statsObserver.observe(statsEl)

    return () => {
      window.removeEventListener('scroll', onScroll)
      observer.disconnect()
      statsObserver.disconnect()
    }
  }, [])

  const features = [
    { icon: '⚡', title: 'Счёт за 1 минуту', desc: 'Заполните данные клиента, добавьте услуги — PDF готов автоматически с вашей подписью и печатью.' },
    { icon: '💚', title: 'Оплата через Kaspi Pay', desc: 'Клиент оплачивает в один клик через Kaspi. Деньги приходят мгновенно. Интеграция уже работает.' },
    { icon: '💬', title: 'Отправка в WhatsApp', desc: 'Нажмите одну кнопку — клиент получит красивую страницу счёта прямо в мессенджере.' },
    { icon: '📋', title: 'КП, АВР, Накладная', desc: 'Все документы по стандартам РК: Форма Р-1, Приложение 50, Форма З-2. Банки принимают без вопросов.' },
    { icon: '✍️', title: 'Подпись и печать', desc: 'Загрузите один раз — автоматически появятся на всех документах. Поддержка ЭЦП НУЦ РК.' },
    { icon: '📱', title: 'Работает на телефоне', desc: 'Создавайте счета на встрече, в дороге, дома. Устанавливается как приложение на любое устройство.' },
  ]

  const steps = [
    { n: '1', title: 'Введите реквизиты', desc: 'Один раз заполните данные компании — БИН, ИИК, БИК, КБе. Они будут автоматически появляться во всех документах.' },
    { n: '2', title: 'Создайте документ', desc: 'Укажите клиента, добавьте услуги и нажмите «Создать». PDF с подписью и печатью готов за 30 секунд.' },
    { n: '3', title: 'Отправьте и получите деньги', desc: 'Отправьте ссылку через WhatsApp. Клиент видит счёт и оплачивает через Kaspi Pay мгновенно.' },
  ]

  const faqs = [
    { q: 'Нужна ли ЭЦП для работы?', a: 'Нет, ЭЦП необязательна. Вы можете загрузить рукописную подпись и печать. Интеграция с ЭЦП НУЦ РК находится в разработке.' },
    { q: 'Как клиент получает счёт?', a: 'Вы отправляете ссылку через WhatsApp. Клиент открывает страницу счёта без регистрации и оплачивает через Kaspi Pay.' },
    { q: 'Принимают ли банки такие счета?', a: 'Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.' },
    { q: 'Можно ли работать с нескольких устройств?', a: 'Да. INVOICES.KZ работает в браузере на телефоне, планшете и компьютере. Все данные синхронизируются.' },
    { q: 'Как отменить подписку?', a: 'Напишите нам в WhatsApp — отменим в течение часа. Деньги за неиспользованный период возвращаем.' },
  ]

  const who = [
    { icon: '👨‍💼', label: 'ИП и фрилансеры' },
    { icon: '🏢', label: 'Малый бизнес' },
    { icon: '👩‍💻', label: 'IT компании' },
    { icon: '🎨', label: 'Дизайнеры' },
    { icon: '🔧', label: 'Подрядчики' },
    { icon: '📦', label: 'Поставщики' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap');
        :root{--navy:#1C2056;--green:#2DC48D;--dark:#0a0d1f;--glass:rgba(255,255,255,0.07);--glass-border:rgba(255,255,255,0.12)}
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{font-family:'Inter',sans-serif;background:var(--dark);color:#fff;overflow-x:hidden}
        html{overflow-x:hidden}
        .orb{position:fixed;border-radius:50%;filter:blur(80px);opacity:.2;pointer-events:none;z-index:0}
        .orb1{width:600px;height:600px;background:radial-gradient(circle,#2DC48D,transparent);top:-200px;left:-200px;animation:orbFloat 12s ease-in-out infinite}
        .orb2{width:500px;height:500px;background:radial-gradient(circle,#3b4fd4,transparent);top:30%;right:-150px;animation:orbFloat 12s ease-in-out infinite;animation-delay:-4s}
        .orb3{width:400px;height:400px;background:radial-gradient(circle,#2DC48D44,transparent);bottom:-100px;left:40%;animation:orbFloat 12s ease-in-out infinite;animation-delay:-8s}
        @keyframes orbFloat{0%,100%{transform:translate(0,0)}33%{transform:translate(30px,-40px)}66%{transform:translate(-20px,30px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes phoneFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        .reveal{opacity:0;transform:translateY(40px);transition:opacity .7s ease,transform .7s ease}
        .reveal.visible{opacity:1;transform:translateY(0)}
        .anim-0{animation:fadeUp .8s ease both}
        .anim-1{animation:fadeUp .8s .1s ease both}
        .anim-2{animation:fadeUp .8s .2s ease both}
        .anim-3{animation:fadeUp .8s .3s ease both}
        .anim-4{animation:fadeUp .8s .4s ease both}
        .anim-5{animation:fadeUp .8s .5s ease both}
        .phone-float{animation:phoneFloat 4s ease-in-out infinite}
        .feat-card{transition:.3s}
        .feat-card:hover{transform:translateY(-4px)}
        .step-card{transition:.3s;position:relative;overflow:hidden}
        .step-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#2DC48D,transparent);opacity:0;transition:.3s}
        .step-card:hover::before{opacity:1}
        .step-card:hover{transform:translateX(6px)}
        .faq-a{max-height:0;overflow:hidden;transition:.35s ease}
        .faq-open .faq-a{max-height:200px;padding-bottom:18px}
        .faq-open .faq-icon{transform:rotate(45deg)}
        .who-card{transition:.3s}
        .who-card:hover{transform:translateY(-3px)}
        .price-card{transition:.3s}
        @media(max-width:768px){section{padding-top:50px!important;padding-bottom:50px!important}.orb{opacity:.1}}
      `}</style>

      {/* Orbs */}
      <div className="orb orb1" />
      <div className="orb orb2" />
      <div className="orb orb3" />

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: navBg ? 'rgba(10,13,31,0.95)' : 'rgba(10,13,31,0.7)',
        backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)',
        transition: 'background .3s',
      }}>
        <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: 2, color: '#fff' }}>
          INVOICES<span style={{ color: 'var(--green)' }}>.KZ</span>
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>

          <button onClick={() => router.push('/login')} style={{
            fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--green)',
            border: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 10,
            fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap' as const,
          }}>Начать →</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '140px 24px 60px',
      }}>
        <div className="anim-0" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.3)',
          color: 'var(--green)', fontSize: 12, fontWeight: 600, letterSpacing: 1,
          padding: '8px 18px', borderRadius: 100, marginBottom: 32, marginTop: 20,
        }}>🇰🇿 Сделано для казахстанского бизнеса</div>

        <h1 className="anim-1" style={{
          fontFamily: 'Syne,sans-serif', fontSize: 'clamp(48px,8vw,96px)',
          fontWeight: 800, lineHeight: .95, letterSpacing: -2, marginBottom: 24,
        }}>
          Счета на оплату<br />
          <span style={{ background: 'linear-gradient(135deg,#2DC48D,#5ee8b3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            за 1 минуту
          </span>
        </h1>

        <p className="anim-2" style={{ maxWidth: 520, color: 'rgba(255,255,255,.55)', fontSize: 16, lineHeight: 1.7, marginBottom: 40 }}>
          Создавайте профессиональные счета с подписью и печатью. Отправляйте через WhatsApp. Принимайте оплату через Kaspi Pay.
        </p>

        <div className="anim-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => router.push('/login')} style={{
            background: 'var(--green)', color: '#fff', fontFamily: 'Inter,sans-serif',
            fontWeight: 700, fontSize: 15, padding: '16px 32px', borderRadius: 16,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}>Создать первый счёт →</button>
          <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} style={{
            background: 'var(--glass)', color: 'rgba(255,255,255,.8)', fontFamily: 'Inter,sans-serif',
            fontWeight: 500, fontSize: 15, padding: '16px 32px', borderRadius: 16,
            border: '1px solid var(--glass-border)', cursor: 'pointer', backdropFilter: 'blur(10px)',
          }}>Как это работает</button>
        </div>
        <p className="anim-4" style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,.3)' }}>7 дней бесплатно · Без карты</p>

        {/* Phone mockup */}
        <div className="anim-5" style={{ marginTop: 64, position: 'relative', width: 280, margin: '64px auto 0' }}>
          <div style={{ position: 'absolute', inset: -60, background: 'radial-gradient(ellipse,rgba(45,196,141,.2),transparent 70%)', pointerEvents: 'none' }} />
          <div className="phone-float" style={{
            width: 280, background: '#111827', borderRadius: 40,
            border: '2px solid rgba(255,255,255,.1)', overflow: 'hidden',
            boxShadow: '0 40px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.1)',
          }}>
            <div style={{ width: 100, height: 28, background: '#000', borderRadius: '0 0 20px 20px', margin: '0 auto 12px' }} />
            <div style={{ padding: '0 16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                <span>9:41</span>
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13, color: '#fff' }}>INVOICES.KZ</span>
                <span>●●●</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>INV-2024-1024</div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14 }}>ТОО «Ромашка»</div>
                  </div>
                  <div style={{ background: 'rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>Оплачен</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  <span>Консалтинг × 10</span><span>150 000 ₸</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  <span>НДС 12%</span><span>18 000 ₸</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', textAlign: 'right', marginTop: 8 }}>168 000 ₸</div>
              </div>
              <button style={{ width: '100%', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', cursor: 'pointer' }}>
                📥 Скачать PDF
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="stats-section reveal" style={{
        position: 'relative', zIndex: 1, padding: '40px 24px',
        borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', maxWidth: 500, margin: '0 auto', gap: 1, background: 'var(--glass-border)' }}>
          {[
            { val: '1 мин', label: 'создание счёта' },
            { val: '7+', label: 'бизнесов' },
            { val: '100%', label: 'стандарты РК' },
            { val: 'Kaspi', label: 'интеграция' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--dark)' }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 32, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>
                {s.val}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>Возможности</div>
        <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, marginBottom: 16 }}>
          Всё для вашего<br />документооборота
        </h2>
        <p className="reveal" style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', maxWidth: 480, lineHeight: 1.7, marginBottom: 60 }}>
          Все необходимые инструменты в одном месте — без бухгалтера и сложных программ.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {features.map(f => (
            <div key={f.title} className="feat-card reveal" style={{
              background: 'var(--glass)', border: '1px solid var(--glass-border)',
              borderRadius: 24, padding: 28, backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STEPS */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', background: 'linear-gradient(180deg,transparent,rgba(45,196,141,.03),transparent)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>Как работает</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            Три шага<br />до оплаты
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 48, textAlign: 'left' }}>
            {steps.map(s => (
              <div key={s.n} className="step-card reveal" style={{
                display: 'flex', gap: 20, alignItems: 'flex-start',
                background: 'var(--glass)', border: '1px solid var(--glass-border)',
                borderRadius: 20, padding: 24, backdropFilter: 'blur(10px)',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#2DC48D,#1a9969)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{s.n}</div>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR WHO */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>Аудитория</div>
        <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1, marginBottom: 40 }}>Для кого</h2>
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 600, margin: '0 auto' }}>
          {who.map(w => (
            <div key={w.label} className="who-card" style={{
              background: 'var(--glass)', border: '1px solid var(--glass-border)',
              borderRadius: 18, padding: '20px 12px', textAlign: 'center',
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{w.icon}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 500 }}>{w.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '100px 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>Тарифы</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>Без скрытых<br />платежей</h2>
          <p className="reveal" style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', marginBottom: 48 }}>Выберите подходящий план. Отмена в любое время.</p>
        </div>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
          {[
            {
              badge: null, name: 'Бесплатно', price: '0', per: '₸', style: {},
              features: ['7 дней бесплатного периода', 'PDF генерация', 'История счетов', 'Профиль компании', 'Публичная ссылка'],
              btn: 'outline', btnText: 'Начать бесплатно',
            },
            {
              badge: 'Популярный', name: 'Базовый', price: '2 990', per: '₸/мес',
              style: { borderColor: 'rgba(45,196,141,.4)', background: 'rgba(45,196,141,.06)' },
              features: ['30 счетов в месяц', 'PDF с подписью и печатью', 'Справочник клиентов', 'Kaspi Pay интеграция', 'Отправка через WhatsApp', 'Поддержка в WhatsApp'],
              btn: 'solid', btnText: 'Подключить за 2 990 ₸',
            },
            {
              badge: 'Максимум', name: 'Про', price: '5 990', per: '₸/мес',
              style: { background: 'linear-gradient(135deg,rgba(28,32,86,.9),rgba(45,196,141,.1))', borderColor: 'rgba(45,196,141,.3)' },
              features: ['Безлимитные счета', 'КП, АВР, Накладная', 'Email + WhatsApp отправка', 'Аналитика и отчёты', 'ЭЦП НУЦ РК (скоро)', 'Приоритетная поддержка 24/7'],
              btn: 'solid', btnText: 'Подключить за 5 990 ₸',
            },
          ].map((p, i) => (
            <div key={i} className="price-card reveal" style={{
              background: 'var(--glass)', border: '1px solid var(--glass-border)',
              borderRadius: 24, padding: 28, backdropFilter: 'blur(10px)', ...p.style,
            }}>
              {p.badge && <div style={{ display: 'inline-block', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '4px 10px', borderRadius: 8, marginBottom: 16, textTransform: 'uppercase' as const }}>{p.badge}</div>}
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{p.name}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 40, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>
                {p.price} <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,.4)' }}>{p.per}</span>
              </div>
              <ul style={{ listStyle: 'none', margin: '20px 0 24px' }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,.6)', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <span style={{ color: 'var(--green)' }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/login')} style={{
                width: '100%', padding: 14, borderRadius: 14, cursor: 'pointer',
                fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, transition: '.25s',
                background: p.btn === 'solid' ? 'var(--green)' : 'transparent',
                color: p.btn === 'solid' ? '#fff' : 'rgba(255,255,255,.7)',
                border: p.btn === 'solid' ? 'none' : '1px solid rgba(255,255,255,.15)',
              }}>{p.btnText}</button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>FAQ</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1 }}>Частые вопросы</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faqs.map((f, i) => (
            <div key={i} className={`reveal ${openFaq === i ? 'faq-open' : ''}`} style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', backdropFilter: 'blur(10px)' }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '18px 20px', background: 'none', border: 'none', color: '#fff',
                cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 500, textAlign: 'left', gap: 16,
              }}>
                {f.q}
                <div className="faq-icon" style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(45,196,141,.15)', color: 'var(--green)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: '.3s' }}>+</div>
              </button>
              <div className="faq-a" style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.7, padding: '0 20px', maxHeight: openFaq === i ? 200 : 0, overflow: 'hidden', transition: '.35s ease', paddingBottom: openFaq === i ? 18 : 0 }}>
                {f.a}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', textAlign: 'center' }}>
        <div className="reveal" style={{
          maxWidth: 600, margin: '0 auto',
          background: 'linear-gradient(135deg,rgba(45,196,141,.12),rgba(28,32,86,.4))',
          border: '1px solid rgba(45,196,141,.2)', borderRadius: 32, padding: '64px 40px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', width: 300, height: 300, background: 'radial-gradient(circle,rgba(45,196,141,.15),transparent)', top: -100, right: -100, borderRadius: '50%', pointerEvents: 'none' }} />
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>Готовы начать?</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', marginBottom: 32 }}>Зарегистрируйтесь за 30 секунд — никакой карты не нужно</p>
          <button onClick={() => router.push('/login')} style={{
            background: 'var(--green)', color: '#fff', fontFamily: 'Inter,sans-serif',
            fontWeight: 700, fontSize: 15, padding: '16px 32px', borderRadius: 16, border: 'none', cursor: 'pointer',
          }}>Создать первый счёт →</button>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 16 }}>7 дней бесплатно · Отмена в любое время</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '32px 24px', borderTop: '1px solid var(--glass-border)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 2 }}>
            INVOICES<span style={{ color: 'var(--green)' }}>.KZ</span>
          </span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
              { label: 'Email', href: 'mailto:support@invoices.kz' },
              { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
              { label: 'Политика', href: '/privacy' },
              { label: 'Условия', href: '/terms' },
            ].map(l => (
              <a key={l.label} href={l.href} target={l.href.startsWith('http') ? '_blank' : '_self'} style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', textDecoration: 'none' }}>{l.label}</a>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', textAlign: 'center' }}>
          © 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана
        </div>
      </footer>
    </>
  )
}