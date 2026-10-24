'use client'
import Link from 'next/link'

// Карточка «Доступно на тарифе Про» -- общий вид Про-стен продуктов (AI-агент,
// Kaspi Bot). Только отрисовка: кто и когда её видит, решает вызывающий.
// Ссылка с другого хоста (kaspi./agent. -> apex) -- обычный <a>, внутренняя --
// Link; префетч отключён, чтобы не получить CORS-шум на редиректах между хостами.
export default function ProGateCard({
  title, text, cta, href, extra, align = 'center',
}: {
  title: string
  text: string
  cta: string
  href: string
  extra?: React.ReactNode
  // 'start': карточка внутри PageContainer под PageHeader, прижата влево и без
  // собственных отступов (их даёт контейнер). По умолчанию -- по центру экрана.
  align?: 'center' | 'start'
}) {
  const btnClass = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
  const btnStyle = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }
  const external = /^https?:\/\//.test(href)
  return (
    <div className={align === 'start' ? 'max-w-md' : 'max-w-md mx-auto px-4 py-10'}>
      <div className="nav-glass nav-card-accent rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h2 className="text-base font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>{title}</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>{text}</p>
        {external
          ? <a href={href} className={btnClass} style={btnStyle}>{cta}</a>
          : <Link href={href} prefetch={false} className={btnClass} style={btnStyle}>{cta}</Link>}
        {extra}
      </div>
    </div>
  )
}
