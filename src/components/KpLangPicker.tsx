'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/components/LanguageProvider'
import { profileContentDict } from '@/lib/i18n/profileContent'
import { isKpLang, KK_DOC_UNDER_REVIEW, KP_DEFAULT_LANG, type KpLang } from '@/lib/kpI18n'

// Выбор языка печатного коммерческого предложения в кабинете (решение
// основателя 25.10.2026: КП печатается на ru, kk или en, русский по
// умолчанию). Язык ДОКУМЕНТА не зависит от языка интерфейса: казахстанец с
// русским кабинетом часто шлёт КП на казахском клиенту. Выбор помним в
// localStorage (как удобство, без него всё работает и по умолчанию русский).
const STORAGE_KEY = 'ikz-kp-doc-lang'

/** [язык КП, сменить, ref с актуальным значением для колбэков, созданных до смены]. */
export function useKpDocLang() {
  const [kpLang, setKpLangState] = useState<KpLang>(KP_DEFAULT_LANG)
  const ref = useRef<KpLang>(KP_DEFAULT_LANG)
  // Читаем после монтирования, а не в инициализаторе: иначе сервер и браузер
  // отрисовали бы разное (гидрация).
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (isKpLang(v)) { ref.current = v; setKpLangState(v) }
    } catch {}
  }, [])
  const setKpLang = useCallback((v: KpLang) => {
    ref.current = v
    setKpLangState(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch {}
  }, [])
  return { kpLang, setKpLang, kpLangRef: ref }
}

const OPTIONS: { value: KpLang; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'kk', label: 'Қазақша' },
  { value: 'en', label: 'English' },
]

export default function KpLangPicker({ value, onChange, className = '' }: { value: KpLang; onChange: (v: KpLang) => void; className?: string }) {
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  return (
    <div className={className}>
      <div className="text-xs mb-1.5" style={{ color: 'var(--nav-text-secondary)' }} id="kp-doc-lang-label">{t.kpDocLangLabel}</div>
      <div role="radiogroup" aria-labelledby="kp-doc-lang-label" className="flex flex-wrap gap-2">
        {OPTIONS.map(o => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className="px-3 min-h-[44px] rounded-xl text-xs font-semibold transition-colors text-left"
              style={{
                background: active ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
                color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
              }}>
              {o.label}
              {o.value === 'kk' && KK_DOC_UNDER_REVIEW && (
                <span className="block text-[10px] font-normal" style={{ opacity: 0.8 }}>{t.kpDocLangReview}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
