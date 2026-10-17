'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { TOOL_CHROME, TOOL_LANGS, TOOL_LANG_LABEL, TOOL_LANG_NAME, toolPath, type ToolLang } from './index'

/**
 * <html lang> под язык страницы инструмента. Корневой layout отдаёт lang="ru",
 * а LanguageProvider на монтировании ставит язык из куки посетителя — оба не
 * знают, что эта страница целиком на языке из адреса. Ставим после провайдера
 * (его эффект срабатывает позже дочерних, отсюда setTimeout) и при уходе со
 * страницы возвращаем язык из контекста.
 */
export function useToolDocumentLang(lang: ToolLang) {
  const { lang: siteLang } = useLanguage()
  const siteLangRef = useRef(siteLang)
  siteLangRef.current = siteLang
  useEffect(() => {
    const id = window.setTimeout(() => document.documentElement.setAttribute('lang', lang), 0)
    return () => {
      window.clearTimeout(id)
      document.documentElement.setAttribute('lang', siteLangRef.current)
    }
  }, [lang])
}

/**
 * Переключатель языка инструмента: обычные ссылки на соседние адреса (по ним
 * же ходит робот, у каждой hrefLang), а клик ещё и запоминает выбор в общей
 * куке lang — дальше кабинет и поддомены откроются на нём же.
 * Само посещение страницы язык посетителя НЕ меняет: пришедший из
 * поиска на русский адрес не должен терять свой сохранённый казахский.
 * Заодно выставляет <html lang> (useToolDocumentLang).
 *
 * Для страницы инструмента — `slug` (адреса строит toolPath). Для страниц, у
 * которых адреса устроены иначе (индекс /tools, /tools/kk, /tools/en), —
 * готовые `hrefs` по языкам; они важнее `slug`.
 */
export default function ToolLangSwitch({ slug, lang, hrefs }: {
  slug?: string
  lang: ToolLang
  hrefs?: Readonly<Record<ToolLang, string>>
}) {
  const { setLang } = useLanguage()
  const hrefFor = (l: ToolLang) => hrefs?.[l] ?? toolPath(slug ?? '', l)
  useToolDocumentLang(lang)
  return (
    <nav
      aria-label={TOOL_CHROME[lang].langSwitchAria}
      className="flex items-center gap-1 rounded-full p-1 flex-shrink-0"
      style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)' }}
    >
      {TOOL_LANGS.map(l =>
        l === lang ? (
          <span
            key={l}
            aria-current="page"
            title={TOOL_LANG_NAME[l]}
            className="text-xs font-semibold rounded-full px-2.5 py-1"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {TOOL_LANG_LABEL[l]}
          </span>
        ) : (
          <Link
            key={l}
            href={hrefFor(l)}
            hrefLang={l}
            lang={l}
            title={TOOL_LANG_NAME[l]}
            onClick={() => setLang(l)}
            className="text-xs font-semibold rounded-full px-2.5 py-1 transition-colors"
            style={{ color: 'var(--nav-text-secondary)' }}
          >
            {TOOL_LANG_LABEL[l]}
          </Link>
        ),
      )}
    </nav>
  )
}
