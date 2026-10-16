'use client'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict } from '@/lib/i18n/aiAgent'

// Что видит пользователь без активного Про на страницах AI-агента
// (15.10.2026). Раньше там было «Эта функция пока доступна только
// администраторам» -- неправда с 02.09, раздел открыт на Про, и тупик без
// пути дальше. Теперь честно: на каком тарифе и кнопка на /upgrade -- туда
// же ведут все остальные Про-стены приложения (Обзор, SiteNav proOnly).
// Только текст: кто пускается в раздел, решают те же проверки, что и раньше.
export default function AiAgentProUpsell() {
  const { lang } = useLanguage()
  const t = aiAgentDict[lang]
  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="nav-glass nav-card-accent rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h2 className="text-base font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>{t.proOnlyTitle}</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>{t.proOnlyText}</p>
        <Link href="/upgrade"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
          {t.proOnlyCta}
        </Link>
      </div>
    </div>
  )
}
