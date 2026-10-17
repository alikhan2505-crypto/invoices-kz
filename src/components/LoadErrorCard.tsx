'use client'
import { useLanguage, type Lang } from '@/components/LanguageProvider'

const TEXT: Record<Lang, { title: string; text: string; retry: string }> = {
  ru: { title: 'Не удалось загрузить данные', text: 'Похоже, соединение прервалось или сервер долго не отвечает. Попробуйте ещё раз.', retry: 'Повторить' },
  kk: { title: 'Деректерді жүктеу мүмкін болмады', text: 'Байланыс үзілген немесе сервер ұзақ жауап бермей тұр. Қайталап көріңіз.', retry: 'Қайталау' },
  en: { title: 'Could not load the data', text: 'The connection dropped or the server is taking too long. Please try again.', retry: 'Try again' },
}

// Состояние «загрузка не удалась» с кнопкой «Повторить» -- вместо вечной
// заставки (см. src/lib/loadGuard.ts).
export default function LoadErrorCard({ onRetry }: { onRetry: () => void }) {
  const { lang } = useLanguage()
  const t = TEXT[lang]
  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div role="alert" className="nav-glass nav-card-accent rounded-2xl p-6 text-center">
        <h2 className="text-base font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>{t.text}</p>
        <button type="button" onClick={onRetry}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
          {t.retry}
        </button>
      </div>
    </div>
  )
}
