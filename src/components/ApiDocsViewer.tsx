'use client'

import dynamic from 'next/dynamic'
import '@scalar/api-reference-react/style.css'
import { useLanguage } from '@/components/LanguageProvider'
import { CASHIER_API_COLOR as C, CASHIER_API_FONT_MONO as FONT_MONO } from '@/lib/kaspiCashierApi/theme'
import openApiRu from '@/lib/kaspiCashierApi/openapi.ru.json'
import openApiEn from '@/lib/kaspiCashierApi/openapi.en.json'

const LOADING_TEXT: Record<'ru' | 'en', string> = {
  ru: 'Загрузка справочника API…',
  en: 'Loading API reference…',
}

// This is the plan's own wrapper copy (not Scalar's untranslatable interface
// chrome), so it must be bilingual like everything else on this page --
// see the Global Constraints' i18n requirement. `dynamic()` itself has to
// stay at module scope, outside ApiDocsViewer({ lang }), because ssr:false
// is only legal inside a Client Component and this whole file needs to
// stay statically analyzable as one (see the comment below); that means
// its `loading` fallback cannot simply read a `lang` prop passed down from
// ApiDocsViewer. Making the fallback a real component instead of an inline
// arrow solves this: next/dynamic's `loading` is still rendered inside the
// app's own React tree (under the root layout's LanguageProvider, see
// src/app/layout.tsx), so calling useLanguage() here works exactly like it
// does in every other client component in this codebase.
function DynamicLoadingFallback() {
  const { lang } = useLanguage()
  const activeLang: 'ru' | 'en' = lang === 'en' ? 'en' : 'ru'
  return (
    <div style={{ padding: 32, color: C.muted, fontFamily: FONT_MONO, fontSize: 13 }}>
      {LOADING_TEXT[activeLang]}
    </div>
  )
}

// Scalar's own docs state the React package is untested on SSR/SSG -- the
// underlying @scalar/api-reference is actually a Vue 3 app wrapped for
// React and must stay strictly client-rendered. next/dynamic with
// ssr:false is only legal inside a Client Component (confirmed against
// this repo's own installed docs:
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md), which is
// why this whole file is 'use client' rather than only the page that
// mounts it.
const ApiReferenceReact = dynamic(
  () => import('@scalar/api-reference-react').then((m) => m.ApiReferenceReact),
  {
    ssr: false,
    loading: DynamicLoadingFallback,
  }
)

// Same dark palette as /cashier-api (CASHIER_API_COLOR, Task 1) --
// interpolated into Scalar's documented CSS custom properties
// (@scalar/themes source) rather than one of its built-in presets
// (theme: 'none' below disables those), so both surfaces stay visually
// identical to a single source of truth.
const SCALAR_CUSTOM_CSS = `
  .light-mode, .dark-mode {
    --scalar-background-1: ${C.bg0};
    --scalar-background-2: ${C.bg1};
    --scalar-background-3: ${C.bg2};
    --scalar-color-1: ${C.text};
    --scalar-color-2: ${C.muted};
    --scalar-color-3: ${C.muted};
    --scalar-color-accent: ${C.accent};
    --scalar-border-color: ${C.border};
    --scalar-sidebar-border-color: ${C.borderStrong};
    --scalar-button-1: ${C.button};
    --scalar-button-1-hover: ${C.buttonHover};
    --scalar-button-1-color: #ffffff;
  }
`

export default function ApiDocsViewer({ lang }: { lang: 'ru' | 'en' }) {
  const content = lang === 'en' ? openApiEn : openApiRu

  return (
    <ApiReferenceReact
      configuration={{
        // JSON imports are typed to their literal shape (e.g. every
        // securitySchemes.type narrows to the literal string "http"),
        // which is narrower than @scalar/api-reference-react's own
        // OpenAPI.Document type expects in places -- cast to unblock
        // tsc without touching runtime behavior; the JSON itself is
        // still validated against the real API contract in Task 2.
        content: content as any,
        // proxyUrl is EXPLICITLY the empty string, not merely unset: Scalar
        // defaults to its own proxy.scalar.com in some layouts when this is
        // undefined, and only the embedded reference layout happens to skip
        // it today. '' short-circuits shouldUseProxy and forces every
        // "Try it" request to go straight from the visitor's browser to
        // invoices.kz's own API -- a hard requirement, since these requests
        // carry the customer's real production Cashier token.
        proxyUrl: '',
        theme: 'none',
        darkMode: true,
        forceDarkModeState: 'dark',
        hideDarkModeToggle: true,
        customCss: SCALAR_CUSTOM_CSS,
      }}
    />
  )
}
