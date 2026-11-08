'use client'

// Раскрытие записи сессий (вопрос 34, решение основателя 08.11.2026: «строка внизу публичных
// страниц»). Строка есть только у тех, кого PostHog действительно записывает: гость на публичной
// странице, без «Не отслеживать». У вошедших и на страницах с секретом в адресе её нет.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { isReplayRequested, subscribeReplayRequested } from '@/lib/analytics/posthogClient'

const TEXT: Record<Lang, { note: string; more: string }> = {
  ru: { note: 'Мы записываем действия на сайте, чтобы делать его удобнее.', more: 'Подробнее' },
  kk: { note: 'Сайтты ыңғайлырақ ету үшін сайттағы әрекеттерді жазып аламыз.', more: 'Толығырақ' },
  en: { note: 'We record activity on this site to make it easier to use.', more: 'Learn more' },
}

// Тёмные лендинги (их цвет задан самой страницей, а не темой): строка под ними должна быть тёмной,
// иначе в тёмной странице появляется светлая полоса.
const DARK_PREFIXES = ['/lp', '/cashier-api', '/invoices-landing']
function isDarkPage(pathname: string): boolean {
  return pathname === '/' || DARK_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export default function RecordingNotice() {
  const { lang } = useLanguage()
  const pathname = usePathname()
  const recording = useSyncExternalStore(subscribeReplayRequested, isReplayRequested, () => false)
  if (!recording) return null
  const t = TEXT[lang]
  const dark = isDarkPage(pathname)
  return (
    <p
      className="recording-notice"
      style={{
        margin: 0,
        padding: '12px 16px 16px',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 1.4,
        color: dark ? '#A9AEC6' : 'var(--nav-text-secondary)',
        background: dark ? '#0A0C14' : 'var(--nav-bg)',
      }}
    >
      {t.note}{' '}
      <Link href="/privacy" prefetch={false} style={{ color: 'inherit', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>
        {t.more}
      </Link>
    </p>
  )
}
