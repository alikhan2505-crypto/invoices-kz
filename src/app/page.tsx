'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { landing } from '@/lib/i18n/landing'

export default function Home() {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = landing[lang]
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

  const features = t.features
  const steps = t.steps
  const faqs = t.faqs
  const who = t.who

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
          <div style={{ display: 'flex', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 100, padding: 2 }}>
            <button onClick={() => setLang('ru')} style={{
              fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter,sans-serif',
              background: lang === 'ru' ? 'var(--green)' : 'transparent',
              color: lang === 'ru' ? '#fff' : 'rgba(255,255,255,.5)',
            }}>RU</button>
            <button onClick={() => setLang('kk')} style={{
              fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter,sans-serif',
              background: lang === 'kk' ? 'var(--green)' : 'transparent',
              color: lang === 'kk' ? '#fff' : 'rgba(255,255,255,.5)',
            }}>ҚЗ</button>
            <button onClick={() => setLang('en')} style={{
              fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter,sans-serif',
              background: lang === 'en' ? 'var(--green)' : 'transparent',
              color: lang === 'en' ? '#fff' : 'rgba(255,255,255,.5)',
            }}>EN</button>
          </div>

          <button onClick={() => router.push('/login')} style={{
            fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--green)',
            border: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 10,
            fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap' as const,
          }}>{t.navCta}</button>
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
        }}>{t.heroBadge}</div>

        <h1 className="anim-1" style={{
          fontFamily: 'Syne,sans-serif', fontSize: 'clamp(48px,8vw,96px)',
          fontWeight: 800, lineHeight: .95, letterSpacing: -2, marginBottom: 24,
        }}>
          {t.heroTitleLine1}<br />
          <span style={{ background: 'linear-gradient(135deg,#2DC48D,#5ee8b3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heroTitleLine2}
          </span>
        </h1>

        <p className="anim-2" style={{ maxWidth: 520, color: 'rgba(255,255,255,.55)', fontSize: 16, lineHeight: 1.7, marginBottom: 40 }}>
          {t.heroSubtitle}
        </p>

        <div className="anim-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => router.push('/login')} style={{
            background: 'var(--green)', color: '#fff', fontFamily: 'Inter,sans-serif',
            fontWeight: 700, fontSize: 15, padding: '16px 32px', borderRadius: 16,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}>{t.heroPrimaryCta}</button>
          <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} style={{
            background: 'var(--glass)', color: 'rgba(255,255,255,.8)', fontFamily: 'Inter,sans-serif',
            fontWeight: 500, fontSize: 15, padding: '16px 32px', borderRadius: 16,
            border: '1px solid var(--glass-border)', cursor: 'pointer', backdropFilter: 'blur(10px)',
          }}>{t.heroSecondaryCta}</button>
        </div>
        <p className="anim-4" style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,.3)' }}>{t.heroNote}</p>

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
                  <div style={{ background: 'rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>{t.phoneStatusPaid}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  <span>{t.phoneServiceLine}</span><span>150 000 ₸</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  <span>{t.phoneVatLine}</span><span>18 000 ₸</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', textAlign: 'right', marginTop: 8 }}>168 000 ₸</div>
              </div>
              <button style={{ width: '100%', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', cursor: 'pointer' }}>
                {t.phoneDownloadPdf}
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
          {t.stats.map((s, i) => (
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
        <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>{t.featuresEyebrow}</div>
        <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, marginBottom: 16 }}>
          {t.featuresTitleLine1}<br />{t.featuresTitleLine2}
        </h2>
        <p className="reveal" style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', maxWidth: 480, lineHeight: 1.7, marginBottom: 60 }}>
          {t.featuresSubtitle}
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
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>{t.stepsEyebrow}</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            {t.stepsTitleLine1}<br />{t.stepsTitleLine2}
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
        <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>{t.whoEyebrow}</div>
        <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1, marginBottom: 40 }}>{t.whoTitle}</h2>
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
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>{t.pricingEyebrow}</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>{t.pricingTitleLine1}<br />{t.pricingTitleLine2}</h2>
          <p className="reveal" style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', marginBottom: 48 }}>{t.pricingSubtitle}</p>
        </div>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
          {t.plans.map((p, i) => (
            <div key={i} className="price-card reveal" style={{
              background: i === 2 ? 'linear-gradient(135deg,rgba(28,32,86,.9),rgba(45,196,141,.1))' : 'var(--glass)',
              border: i === 0 ? '1px solid var(--glass-border)' : i === 1 ? '1px solid rgba(45,196,141,.4)' : '1px solid rgba(45,196,141,.3)',
              ...(i === 1 ? { background: 'rgba(45,196,141,.06)' } : {}),
              borderRadius: 24, padding: 28, backdropFilter: 'blur(10px)',
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
          <div style={{ display: 'inline-block', background: 'rgba(45,196,141,.1)', border: '1px solid rgba(45,196,141,.2)', color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: 2, padding: '6px 14px', borderRadius: 100, marginBottom: 20, textTransform: 'uppercase' as const }}>{t.faqEyebrow}</div>
          <h2 className="reveal" style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(32px,4vw,52px)', fontWeight: 800, letterSpacing: -1 }}>{t.faqTitle}</h2>
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
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>{t.ctaTitle}</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', marginBottom: 32 }}>{t.ctaSubtitle}</p>
          <button onClick={() => router.push('/login')} style={{
            background: 'var(--green)', color: '#fff', fontFamily: 'Inter,sans-serif',
            fontWeight: 700, fontSize: 15, padding: '16px 32px', borderRadius: 16, border: 'none', cursor: 'pointer',
          }}>{t.ctaButton}</button>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 16 }}>{t.ctaNote}</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '32px 24px', borderTop: '1px solid var(--glass-border)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 2 }}>
            INVOICES<span style={{ color: 'var(--green)' }}>.KZ</span>
          </span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {t.footerLinks.map(l => (
              <a key={l.label} href={l.href} target={l.href.startsWith('http') ? '_blank' : '_self'} style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', textDecoration: 'none' }}>{l.label}</a>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', textAlign: 'center' }}>
          {t.footerBottom}
        </div>
      </footer>
    </>
  )
}