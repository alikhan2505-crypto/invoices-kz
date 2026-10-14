'use client'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { storefrontDict, type StorefrontContent } from '@/lib/i18n/storefront'

// Общая «рамка» публичной витрины: словарь текущего языка, переключатель
// Рус / Қаз / Eng и полноэкранные состояния (загрузка, «временно недоступен»,
// «не найдено»). Язык общий для всех *.invoices.kz — setLang пишет куку.

const LANGS: { key: Lang; label: string }[] = [
  { key: 'ru', label: 'Рус' },
  { key: 'kk', label: 'Қаз' },
  { key: 'en', label: 'Eng' },
]

export function useStorefrontT(): StorefrontContent {
  const { lang } = useLanguage()
  return storefrontDict[lang] ?? storefrontDict.ru
}

export function StorefrontLangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLanguage()
  const t = storefrontDict[lang] ?? storefrontDict.ru
  return (
    <div role="group" aria-label={t.langSwitchLabel}
      className={`nav-glass inline-flex items-center gap-0.5 rounded-full p-0.5 flex-shrink-0 ${className}`}>
      {LANGS.map(x => {
        const on = lang === x.key
        return (
          <button key={x.key} type="button" onClick={() => setLang(x.key)} aria-pressed={on}
            lang={x.key}
            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              background: on ? 'var(--nav-accent)' : 'transparent',
              color: on ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
            }}>
            {x.label}
          </button>
        )
      })}
    </div>
  )
}

// Полноэкранное состояние с переключателем языка в углу — чтобы покупатель,
// попавший на закрытую витрину, мог прочитать сообщение на своём языке.
export function StorefrontStatus({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-end p-4">
        <StorefrontLangSwitch />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16 text-center">
        <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{text}</div>
        {hint && <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)', opacity: 0.8 }}>{hint}</div>}
      </div>
    </div>
  )
}
