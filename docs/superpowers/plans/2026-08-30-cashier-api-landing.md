# Kaspi Cashier API Landing & Interactive Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship a public, developer-facing `/cashier-api` marketing page and turn the currently-unauthenticated `/kaspi-api/docs` into an auth-gated, interactive OpenAPI reference with a real "Try it" against invoices.kz's own live API, both fully bilingual (ru/en).

**Architecture:** `/cashier-api` is a new standalone client page (its own dark "docs" visual language, not `DesktopShell`/the brand violet-teal palette) with a `useLanguage()`-driven `COPY` object, mirroring `src/app/page.tsx`'s structure. The real API contract (already live at `/api/kaspi/pay` and `/api/kaspi/pay/status`) is captured once as two OpenAPI 3.1 JSON documents (`openapi.ru.json` / `openapi.en.json`) and rendered by `@scalar/api-reference-react`, mounted through a small `'use client'` + `next/dynamic(ssr:false)` wrapper (`ApiDocsViewer`) inside the rewritten `/kaspi-api/docs` page, which keeps the existing app's client-side Supabase auth guard. A shared `src/lib/kaspiCashierApi/theme.ts` module is the single source of truth for the dark palette so the landing page, the docs page's own chrome, and Scalar's `customCss` theme override all stay visually identical.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript 5, Tailwind CSS v4 (`@tailwindcss/postcss`), `@supabase/supabase-js` (existing `src/lib/supabase.ts` client), and `@scalar/api-reference-react@0.9.66` (pinned exact version) for the interactive OpenAPI reference.

## Global Constraints

- Dark "docs" palette (GitHub Dark / Stripe-docs inspired), used identically on `/cashier-api` and `/kaspi-api/docs` — no other hex values may be introduced for chrome/background/text/accent on these two surfaces: `#0a0c10` (bg0), `#0d1117` (bg1), `#161b22` (bg2), `#c9d1d9` (text), `#8b949e` (muted), `#7ee787` (accent/code), `#21262d` (border), `#30363d` (border-strong), `#238636` (primary button), `#2ea043` (primary button hover).
- Typography: headings/body text use the system sans stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`; every code/technical value (endpoints, JSON, field names) uses the monospace stack `'SF Mono', Consolas, monospace`.
- This page's palette is deliberately NOT `COLOR.violet`/`COLOR.teal`/`COLOR.ground` from `src/app/page.tsx` — different audience (developers/technical founders), different visual language, per the design spec's "Аудитория и тон".
- Russian and English are both required on BOTH surfaces (`/cashier-api` and `/kaspi-api/docs`); Kazakh is explicitly out of scope for this project. Reuse the existing global `useLanguage()`/`LanguageProvider` (`src/components/LanguageProvider.tsx`, `Lang = 'ru' | 'kk' | 'en'`) — never invent a page-local language mechanism. Since this project's `COPY` objects only define `'ru' | 'en'`, every consumer must fall back a `lang === 'kk'` visitor to `'ru'` (`const activeLang: 'ru' | 'en' = lang === 'en' ? 'en' : 'ru'`), and the language toggle UI on both pages renders only two buttons (RU/EN), not three.
- `/cashier-api` is fully public — no Supabase auth check, no redirect, matches the design spec's "публичная страница для анонимных посетителей".
- `/kaspi-api/docs` is auth-gated with the exact client-side pattern already used at `src/app/kaspi-api/page.tsx:96-98`: `'use client'`, a `loading` state defaulting `true`, a `useEffect(() => { load() }, [])` that calls `supabase.auth.getUser()`, and `router.push('/login')` when there is no user. No `next=` redirect-back parameter — that's a known, out-of-scope limitation of `/login`.
- Both CTA buttons ("Получить доступ к API" / "Get API access", in the hero and the final-CTA section) call `router.push('/login')` — same behavior as every CTA on the main landing (`goLogin` in `src/app/page.tsx`). The secondary hero button ("Смотреть документацию" / "View documentation") calls `router.push('/kaspi-api/docs')`.
- Exactly two endpoints are documented anywhere on these surfaces: `POST /api/kaspi/pay` and `GET /api/kaspi/pay/status`. `/api/kaspi/dashboard` and `/api/kaspi/webhook-url` are internal (Supabase-session-authed) and must never appear.
- Real pricing only: `COMMISSION_RATE = 0.02` (`src/lib/kaspiPay/wallet.ts:10`) — 2% of each **paid** payment, no subscription, no minimum volume, connecting Cashier is free on any plan. Never advertise the unbuilt "5–10₸/call" model from the pricing memo.
- Direct-from-browser "Try it": Scalar's `configuration.proxyUrl` must never be set. Every request the interactive reference sends goes straight from the visitor's own browser to `https://www.invoices.kz/api/kaspi/pay(/status)` — never through any Scalar-hosted proxy.
- `@scalar/api-reference-react` is a React wrapper around a Vue 3 app and is untested on SSR/SSG — it must be mounted only through `next/dynamic(..., { ssr: false })` inside a `'use client'` module, per `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` ("`ssr: false` is not allowed... in Server Components").
- Known, disclosed limitation: Scalar's own interface chrome (button labels like "Authorize", "Send Request") is not localized by the library itself — only spec content (our own descriptions/examples) is translated. `/kaspi-api/docs` must show a short, explicit caption saying so (never silently leave English UI chrome unexplained).
- Every "Try it" call against `/api/kaspi/pay` is against the REAL production API — there is no Kaspi Pay sandbox. `/kaspi-api/docs` must show a visible, un-missable warning to this effect before the interactive reference.
- Soft disclosure note (not a technical/protocol disclaimer): `/kaspi-api/docs` must end with a short paragraph stating this is not an official Kaspi merchant API and that invoices.kz maintains compatibility — no protocol details, no separate disclaimer needed on the public `/cashier-api` landing itself.
- Touch targets: every interactive control unique to these two surfaces (both CTA buttons, the RU/EN language toggle on each page, and the cURL/JavaScript/Python code tabs) is at least 44×44px (`min-h-11` / `min-w-11`, matching the `w-11 h-11` convention already shipped in commits `a42a67b` / `366074b`).
- No `framer-motion` dependency for these two pages — CSS-only `motion-safe:` hover transitions (Tailwind's `motion-safe:` variant already gates on `prefers-reduced-motion` with zero JS).
- Tailwind v4 layer ordering: `src/app/globals.css` must declare `@layer scalar-base, scalar-theme, scalar-config, theme, base, components, utilities;` before its `@import "tailwindcss";` line, per Scalar's own Tailwind v4 integration note, to prevent Tailwind's utility layer and Scalar's own layered CSS from fighting each other.
- `src/components/TopUtilityBar.tsx`'s `isPublicPage` exclusion list (lines 294-303) must include both `/cashier-api` and `/kaspi-api/docs` — otherwise the app's global wallet/notifications/account icon bar renders on top of these two intentionally-different-chrome pages whenever the viewer (e.g. the founder, doing a click-through review) happens to be logged in.
- No new automated tests exist or are added for these files — verification is `npx tsc --noEmit` plus a live dev-server check, exactly as this repo's own recent plans (e.g. `2026-08-28-icon-button-tap-zone-sweep.md`) already do.

---

### Task 1: Cashier API Landing Page

**Files:**
- Create: `src/lib/kaspiCashierApi/theme.ts`
- Create: `src/app/cashier-api/page.tsx`
- Create: `src/app/cashier-api/layout.tsx`
- Modify: `src/components/TopUtilityBar.tsx:294-303`
- Test: this project has no test suite for these files; verification is `npx tsc --noEmit` plus a live dev-server visual/functional check at `http://localhost:3000/cashier-api` — confirm: the header shows "invoices.kz" linking to `/`; the RU/EN toggle switches every piece of hero/steps/pricing/features/footer text; both CTA buttons ("Получить доступ к API"/"Get API access") navigate to `/login`; the secondary hero button ("Смотреть документацию"/"View documentation") navigates to `/kaspi-api/docs`; the three code tabs (cURL/JavaScript/Python) switch the request snippet on click while the response panel stays the same; and — while logged in as the admin in another tab — reloading `/cashier-api` shows NO wallet/notifications/account icon bar in the corner.

**Interfaces:**
- Consumes: `useLanguage` from `@/components/LanguageProvider` (existing, `Lang = 'ru' | 'kk' | 'en'`), `useRouter` from `next/navigation`.
- Produces: `CASHIER_API_COLOR`, `CASHIER_API_FONT_SANS`, `CASHIER_API_FONT_MONO` from `src/lib/kaspiCashierApi/theme.ts`, consumed by Task 3 (`ApiDocsViewer.tsx`) and Task 4 (`/kaspi-api/docs/page.tsx`) to guarantee the two surfaces share one literal palette. Default export `CashierApiPage` mounted at route `/cashier-api`.

- [ ] **Step 1: Create the shared theme constants**

Create `src/lib/kaspiCashierApi/theme.ts`:

```ts
// Shared dark "docs" palette for the Kaspi Cashier API surfaces
// (/cashier-api and /kaspi-api/docs) -- deliberately NOT the invoices.kz
// brand violet/teal (COLOR.violet/teal/ground in src/app/page.tsx). This
// audience is developers/technical founders, not the accounting-software
// buyer of the main landing -- see
// docs/superpowers/specs/2026-08-30-cashier-api-landing-design.md
// "Аудитория и тон". Values match GitHub Dark / Stripe docs. Kept as a
// single source of truth so /cashier-api, /kaspi-api/docs, and the Scalar
// customCss override in ApiDocsViewer.tsx all stay visually identical
// instead of three hand-copied literal blocks that could drift apart.
export const CASHIER_API_COLOR = {
  bg0: '#0a0c10',
  bg1: '#0d1117',
  bg2: '#161b22',
  text: '#c9d1d9',
  muted: '#8b949e',
  accent: '#7ee787',
  border: '#21262d',
  borderStrong: '#30363d',
  button: '#238636',
  buttonHover: '#2ea043',
} as const

export const CASHIER_API_FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const CASHIER_API_FONT_MONO = "'SF Mono', Consolas, monospace"
```

- [ ] **Step 2: Create the segment metadata layout**

Create `src/app/cashier-api/layout.tsx`:

```tsx
import type { Metadata } from 'next'

// The root layout (src/app/layout.tsx) sets a metadata title/description
// aimed at the accounting-software buyer ("INVOICES.KZ -- Счета, АВР, КП и
// Накладные..."), which would otherwise be inherited here verbatim. This
// page targets a completely different audience (developers integrating
// Kaspi Pay), so it needs its own segment-level override.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — invoices.kz',
  description: 'Принимайте Kaspi Pay на своём сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного — без абонплаты и минимального оборота.',
}

export default function CashierApiLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

- [ ] **Step 3: Create the landing page**

Create `src/app/cashier-api/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { CASHIER_API_COLOR as C, CASHIER_API_FONT_SANS as FONT_SANS, CASHIER_API_FONT_MONO as FONT_MONO } from '@/lib/kaspiCashierApi/theme'

type CodeLang = 'curl' | 'javascript' | 'python'

interface Step {
  title: string
  desc: string
}

interface FeatureRow {
  label: string
  value: string
}

interface Copy {
  navCta: string
  heroTitle: string
  heroSubtitle: string
  heroPrimaryCta: string
  heroSecondaryCta: string
  codeResponseLabel: string
  stepsEyebrow: string
  stepsTitle: string
  steps: Step[]
  pricingEyebrow: string
  pricingCaption: string
  pricingUsLabel: string
  pricingUsValue: string
  pricingCompetitorLabel: string
  pricingCompetitorValue: string
  featuresEyebrow: string
  featuresTitle: string
  features: FeatureRow[]
  finalCtaTitle: string
  finalCtaButton: string
  footerDocsLabel: string
  footerBottom: string
}

const COPY: Record<'ru' | 'en', Copy> = {
  ru: {
    navCta: 'Получить доступ к API',
    heroTitle: 'Kaspi Pay на вашем сайте — три запроса, без интеграции с банком',
    heroSubtitle: 'Создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного — без абонплаты и минимального оборота.',
    heroPrimaryCta: 'Получить доступ к API',
    heroSecondaryCta: 'Смотреть документацию',
    codeResponseLabel: 'Ответ',
    stepsEyebrow: 'Как подключить',
    stepsTitle: 'Четыре шага до первого платежа',
    steps: [
      { title: 'Подключите Cashier', desc: 'Номер телефона + смс-код, как в приложении Kaspi Pay.' },
      { title: 'Получите токен', desc: 'API-токен и секрет вебхука — показываются один раз.' },
      { title: 'Вызовите API', desc: 'POST /api/kaspi/pay — получите ссылку и QR.' },
      { title: 'Получите вебхук', desc: 'Уведомление на ваш callback_url, когда клиент оплатит.' },
    ],
    pricingEyebrow: 'Цена',
    pricingCaption: 'с суммы каждого оплаченного платежа. Ничего — если платежа не было.',
    pricingUsLabel: 'invoices.kz Kaspi Cashier API',
    pricingUsValue: '2% с оплаченного, без абонплаты и минимального оборота',
    pricingCompetitorLabel: 'ApiPay.kz',
    pricingCompetitorValue: '10 000–60 000 ₸/мес по лимиту объёма',
    featuresEyebrow: 'Возможности',
    featuresTitle: 'Что входит в API',
    features: [
      { label: 'Создание платежа', value: 'POST /api/kaspi/pay' },
      { label: 'QR-код и платёжная ссылка', value: 'payment_link, qr_token' },
      { label: 'Вебхук об оплате', value: 'callback_url' },
      { label: 'Проверка статуса', value: 'GET /api/kaspi/pay/status' },
    ],
    finalCtaTitle: 'Готовы принимать Kaspi Pay?',
    finalCtaButton: 'Получить доступ к API',
    footerDocsLabel: 'Документация API',
    footerBottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана',
  },
  en: {
    navCta: 'Get API access',
    heroTitle: 'Kaspi Pay on your site — three requests, no bank integration',
    heroSubtitle: 'Create a payment, get a QR link, and receive a payment webhook. 2% of what actually gets paid — no subscription, no minimum volume.',
    heroPrimaryCta: 'Get API access',
    heroSecondaryCta: 'View documentation',
    codeResponseLabel: 'Response',
    stepsEyebrow: 'How to integrate',
    stepsTitle: 'Four steps to your first payment',
    steps: [
      { title: 'Connect Cashier', desc: 'Phone number + SMS code, same as in the Kaspi Pay app.' },
      { title: 'Get your token', desc: 'An API token and a webhook secret — shown once.' },
      { title: 'Call the API', desc: 'POST /api/kaspi/pay — get back a link and a QR code.' },
      { title: 'Receive the webhook', desc: 'A notification to your callback_url when the customer pays.' },
    ],
    pricingEyebrow: 'Pricing',
    pricingCaption: 'of the amount of every payment actually paid. Nothing if there was no payment.',
    pricingUsLabel: 'invoices.kz Kaspi Cashier API',
    pricingUsValue: '2% of what is paid, no subscription, no minimum volume',
    pricingCompetitorLabel: 'ApiPay.kz',
    pricingCompetitorValue: '₸10,000–60,000/mo by volume tier',
    featuresEyebrow: 'Capabilities',
    featuresTitle: "What's in the API",
    features: [
      { label: 'Create a payment', value: 'POST /api/kaspi/pay' },
      { label: 'QR code and payment link', value: 'payment_link, qr_token' },
      { label: 'Payment webhook', value: 'callback_url' },
      { label: 'Status check', value: 'GET /api/kaspi/pay/status' },
    ],
    finalCtaTitle: 'Ready to accept Kaspi Pay?',
    finalCtaButton: 'Get API access',
    footerDocsLabel: 'API documentation',
    footerBottom: '© 2026 INVOICES.KZ · First Project Sole Proprietorship · BIN 890525350143 · Astana, Kazakhstan',
  },
}

// Manual token coloring via <span> -- no syntax-highlighting library, per
// the design spec's "простой <pre> с ручной раскраской токенов через
// <span>". Colors are restricted to the three approved text tones
// (text/muted/accent) so no new hex value is introduced for code display.
type Tok = { text: string; tone?: 'accent' | 'muted' }
type CodeLine = Tok[]

const CURL_LINES: CodeLine[] = [
  [{ text: 'curl -X ', tone: 'muted' }, { text: 'POST', tone: 'accent' }, { text: ' https://www.invoices.kz/api/kaspi/pay \\' }],
  [{ text: '  -H "Authorization: Bearer YOUR_API_TOKEN" \\', tone: 'muted' }],
  [{ text: '  -H "Content-Type: application/json" \\', tone: 'muted' }],
  [{ text: "  -d '{" }, { text: '"amount"', tone: 'accent' }, { text: ': 10000, ' }, { text: '"order_id"', tone: 'accent' }, { text: `: "order_12345"}'` }],
]

const JAVASCRIPT_LINES: CodeLine[] = [
  [{ text: 'const', tone: 'accent' }, { text: ' res = ' }, { text: 'await', tone: 'accent' }, { text: " fetch('https://www.invoices.kz/api/kaspi/pay', {" }],
  [{ text: "  method: 'POST'," }],
  [{ text: '  headers: {' }],
  [{ text: "    Authorization: 'Bearer YOUR_API_TOKEN'," }],
  [{ text: "    'Content-Type': 'application/json'," }],
  [{ text: '  },' }],
  [{ text: '  body: ' }, { text: 'JSON.stringify', tone: 'accent' }, { text: "({ amount: 10000, order_id: 'order_12345' })," }],
  [{ text: '})' }],
  [{ text: 'const', tone: 'accent' }, { text: ' data = ' }, { text: 'await', tone: 'accent' }, { text: ' res.json()' }],
]

const PYTHON_LINES: CodeLine[] = [
  [{ text: 'import', tone: 'accent' }, { text: ' requests' }],
  [{ text: '' }],
  [{ text: 'response = requests.' }, { text: 'post', tone: 'accent' }, { text: '(' }],
  [{ text: '    "https://www.invoices.kz/api/kaspi/pay",' }],
  [{ text: '    headers={"Authorization": "Bearer YOUR_API_TOKEN"},' }],
  [{ text: '    json={"amount": 10000, "order_id": "order_12345"},' }],
  [{ text: ')' }],
  [{ text: 'data = response.json()' }],
]

const RESPONSE_LINES: CodeLine[] = [
  [{ text: '{' }],
  [{ text: '  "payment_link"', tone: 'accent' }, { text: ': "https://kaspi.kz/pay/...",' }],
  [{ text: '  "qr_token"', tone: 'accent' }, { text: ': "eyJhbGc...",' }],
  [{ text: '  "operation_id"', tone: 'accent' }, { text: ': "op_123456789"' }],
  [{ text: '}' }],
]

function CodeBlock({ lines }: { lines: CodeLine[] }) {
  return (
    <pre style={{ fontFamily: FONT_MONO, fontSize: 13, lineHeight: 1.7, margin: 0, color: C.text, whiteSpace: 'pre' }}>
      {lines.map((line, i) => (
        <div key={i}>
          {line.length === 0 ? (
            ' '
          ) : (
            line.map((tok, j) => (
              <span key={j} style={{ color: tok.tone === 'accent' ? C.accent : tok.tone === 'muted' ? C.muted : C.text }}>
                {tok.text}
              </span>
            ))
          )}
        </div>
      ))}
    </pre>
  )
}

function HeroCodeDemo({ responseLabel }: { responseLabel: string }) {
  const [active, setActive] = useState<CodeLang>('curl')
  const lines = active === 'curl' ? CURL_LINES : active === 'javascript' ? JAVASCRIPT_LINES : PYTHON_LINES

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-2xl" style={{ background: C.bg1, border: `1px solid ${C.border}` }}>
      <div className="flex" style={{ borderBottom: `1px solid ${C.border}` }}>
        {(['curl', 'javascript', 'python'] as CodeLang[]).map((l) => (
          <button
            key={l}
            onClick={() => setActive(l)}
            className="min-h-11 px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              fontFamily: FONT_MONO,
              color: active === l ? C.accent : C.muted,
              borderBottom: active === l ? `2px solid ${C.accent}` : '2px solid transparent',
              background: 'transparent',
            }}
            aria-pressed={active === l}
          >
            {l === 'curl' ? 'cURL' : l === 'javascript' ? 'JavaScript' : 'Python'}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto p-4">
        <CodeBlock lines={lines} />
      </div>
      <div className="px-4 pb-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted, fontFamily: FONT_MONO }}>
          {responseLabel}
        </div>
        <div className="overflow-x-auto rounded-xl p-3" style={{ background: C.bg0, border: `1px solid ${C.border}` }}>
          <CodeBlock lines={RESPONSE_LINES} />
        </div>
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: C.accent, fontFamily: FONT_MONO }}>
      <span className="inline-block h-1 w-4 rounded-full" style={{ background: C.accent }} />
      {children}
    </span>
  )
}

export default function CashierApiPage() {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const activeLang: 'ru' | 'en' = lang === 'en' ? 'en' : 'ru'
  const t = COPY[activeLang]

  const goLogin = () => router.push('/login')
  const goDocs = () => router.push('/kaspi-api/docs')

  return (
    <div className="min-h-screen" style={{ background: C.bg0, color: C.text, fontFamily: FONT_SANS }}>
      <header className="sticky top-0 z-20" style={{ background: 'rgba(10,12,16,0.92)', borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="/" className="flex min-h-11 items-center text-[14px] font-bold tracking-[0.08em]" style={{ color: C.text }}>
            invoices<span style={{ color: C.accent }}>.kz</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              {(['ru', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="min-h-11 min-w-11 px-2 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: activeLang === l ? C.bg2 : 'transparent', color: activeLang === l ? C.accent : C.muted }}
                  aria-pressed={activeLang === l}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={goLogin}
              className="min-h-11 motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] rounded-lg px-4 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: C.button }}
            >
              {t.navCta}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
          <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              {/* "KASPI CASHIER API" is a product label, invariant across
                  languages -- see design spec's Hero section: "единственное
                  уместное использование эйбрау на этой странице". */}
              <div className="mb-5 text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: C.accent, fontFamily: FONT_MONO }}>
                KASPI CASHIER API
              </div>
              <h1 className="text-[clamp(1.9rem,4.4vw,3rem)] font-bold leading-[1.12] tracking-[-0.02em]">{t.heroTitle}</h1>
              <p className="mt-5 text-[15px] leading-relaxed" style={{ color: C.muted }}>{t.heroSubtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={goLogin}
                  className="min-h-11 motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] rounded-lg px-6 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: C.button }}
                >
                  {t.heroPrimaryCta}
                </button>
                <button
                  onClick={goDocs}
                  className="min-h-11 motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] rounded-lg px-6 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ border: `1px solid ${C.borderStrong}`, color: C.text }}
                >
                  {t.heroSecondaryCta}
                </button>
              </div>
            </div>
            <HeroCodeDemo responseLabel={t.codeResponseLabel} />
          </div>
        </section>

        <section id="how" className="mx-auto max-w-5xl px-5 py-14 sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
          <Eyebrow>{t.stepsEyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.01em]">{t.stepsTitle}</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.steps.map((s, i) => (
              <div key={s.title} className="rounded-xl p-5" style={{ background: C.bg1, border: `1px solid ${C.border}` }}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold" style={{ background: C.bg2, color: C.accent, fontFamily: FONT_MONO }}>
                  {i + 1}
                </div>
                <h3 className="mt-4 text-[14px] font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
          <Eyebrow>{t.pricingEyebrow}</Eyebrow>
          <div className="mt-6 flex flex-col gap-10 lg:flex-row lg:items-center">
            <div>
              <div className="text-[clamp(3rem,8vw,4.5rem)] font-bold leading-none" style={{ color: C.accent, fontFamily: FONT_MONO }}>
                2%
              </div>
              <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{t.pricingCaption}</p>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3" style={{ background: C.bg1, border: `1px solid ${C.border}` }}>
                <span className="text-[13.5px] font-semibold">{t.pricingUsLabel}</span>
                <span className="text-[13px]" style={{ color: C.accent, fontFamily: FONT_MONO }}>{t.pricingUsValue}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3" style={{ border: `1px dashed ${C.border}` }}>
                <span className="text-[13.5px]" style={{ color: C.muted }}>{t.pricingCompetitorLabel}</span>
                <span className="text-[13px]" style={{ color: C.muted, fontFamily: FONT_MONO }}>{t.pricingCompetitorValue}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
          <Eyebrow>{t.featuresEyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.01em]">{t.featuresTitle}</h2>
          <div className="mt-8">
            {t.features.map((f, i) => (
              <div
                key={f.label}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
                style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}
              >
                <span className="text-[14px] font-medium">{f.label}</span>
                <span className="text-[13px]" style={{ color: C.accent, fontFamily: FONT_MONO }}>{f.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
          <h2 className="text-[clamp(1.6rem,3.4vw,2.25rem)] font-semibold tracking-[-0.01em]">{t.finalCtaTitle}</h2>
          <button
            onClick={goLogin}
            className="min-h-11 motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] mt-7 rounded-lg px-7 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: C.button }}
          >
            {t.finalCtaButton}
          </button>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-5 py-8 sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="flex min-h-11 items-center text-[13px] font-bold" style={{ color: C.text }}>
            invoices<span style={{ color: C.accent }}>.kz</span>
          </a>
          <a href="/kaspi-api/docs" className="flex min-h-11 items-center text-[13px]" style={{ color: C.muted }}>
            {t.footerDocsLabel}
          </a>
        </div>
        <div className="mt-4 text-center text-[11px]" style={{ color: C.muted }}>{t.footerBottom}</div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Exclude `/cashier-api` from the global TopUtilityBar chrome**

In `src/components/TopUtilityBar.tsx`, find (lines 294-303):

```tsx
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/')
```

Replace with:

```tsx
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/cashier-api' ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/')
```

- [ ] **Step 5: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 6: Commit**

```
git add src/lib/kaspiCashierApi/theme.ts src/app/cashier-api/page.tsx src/app/cashier-api/layout.tsx src/components/TopUtilityBar.tsx
git commit -m "feat(cashier-api): add public Kaspi Cashier API landing page"
```

---

### Task 2: OpenAPI Spec Files (ru + en)

**Files:**
- Create: `src/lib/kaspiCashierApi/openapi.ru.json`
- Create: `src/lib/kaspiCashierApi/openapi.en.json`
- Test: no test suite for these files; verification is an explicit JSON-parse check on both files, plus `npx tsc --noEmit`. `tsconfig.json`'s `include` (`["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"]`) has no `**/*.json` glob, so these two files are outside the TypeScript program — and therefore unchecked by `tsc --noEmit` — until Task 3 actually imports them via `resolveJsonModule`. The `node -e "JSON.parse(...)"` check below is what actually proves each file is well-formed JSON at this stage; `tsc --noEmit` here only proves the rest of the repo still compiles.

**Interfaces:**
- Consumes: exact request/response field names and types verified against `src/app/api/kaspi/pay/route.ts`, `src/app/api/kaspi/pay/status/route.ts`, and `src/lib/kaspiPay/wallet.ts` (not just the prose in the old `src/app/kaspi-api/docs/page.tsx`).
- Produces: `openApiRu`/`openApiEn` JSON documents, imported directly (via `resolveJsonModule`, already enabled in `tsconfig.json`) by `src/components/ApiDocsViewer.tsx` in Task 3.

- [ ] **Step 1: Create the Russian OpenAPI document**

Create `src/lib/kaspiCashierApi/openapi.ru.json`:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Kaspi Cashier API",
    "version": "1.0.0",
    "description": "Приём платежей Kaspi Pay на вашем сайте или в приложении: создание платежа, получение ссылки/QR и отслеживание оплаты — без прямой интеграции с банком. Это не официальный Kaspi merchant API — интеграция сделана по тому же принципу, что и мобильное приложение Kaspi Pay Cashier. Мы поддерживаем совместимость и уведомим вас, если Kaspi изменит свою сторону.\n\n## Быстрый старт\n1. **Подключите роль «Кассир»** — на странице `/kaspi-api` введите номер телефона, на котором в приложении Kaspi Pay уже выдана роль «Кассир», и подтвердите код из SMS.\n2. **Сохраните API-токен и webhook-секрет** — сразу после подключения один раз покажутся два значения: API-токен (для запросов к API) и отдельный webhook-секрет (для проверки подписи вебхуков, см. раздел Webhooks ниже). Скопируйте и сохраните оба — второй раз они не показываются (можно только отключить кассира и подключить заново, тогда выдадутся новые).\n3. **Передайте их разработчику или вставьте в свой сайт** — если сайт делаете не вы сами, отправьте эти два значения и ссылку на эту страницу вашему разработчику.\n4. **Создайте платёж** — отправьте запрос из примера `POST /api/kaspi/pay` ниже, указав сумму и свой номер заказа. В ответе придёт ссылка/QR — покажите её клиенту.\n5. **Узнайте об оплате автоматически** — проще всего периодически спрашивать статус (`GET /api/kaspi/pay/status`), пока клиент на странице оплаты, либо настроить вебхук (см. раздел Webhooks ниже).\n\n## Стоимость\nПодключение и приём платежей — бесплатно на любом тарифе. Комиссия 2% списывается с баланса вашего кошелька только с подтверждённых оплат — например, с платежа на 10 000 ₸ спишется 200 ₸. Баланс пополняется заранее на странице `/kaspi-api`.",
    "contact": {
      "name": "Поддержка invoices.kz",
      "email": "support@invoices.kz",
      "url": "https://t.me/invoiceskz_support"
    }
  },
  "servers": [
    { "url": "https://www.invoices.kz", "description": "Продакшн — единственная среда, тестового режима нет" }
  ],
  "tags": [
    { "name": "Kaspi Cashier API", "description": "Приём и отслеживание платежей Kaspi Pay" }
  ],
  "security": [{ "bearerAuth": [] }],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "API-токен вашего подключения Kaspi Cashier. Выдаётся один раз на странице /kaspi-api при подключении роли «Кассир» — сохраните его сразу, второй раз он не показывается (если его потеряли или он попал не в те руки — отключите и снова подключите Кассира, будет выдан новый). Он свой у каждого подключения — не переиспользуется другими клиентами invoices.kz."
      }
    },
    "schemas": {
      "PayRequest": {
        "type": "object",
        "required": ["amount", "order_id"],
        "properties": {
          "amount": { "type": "number", "description": "Сумма платежа в тенге", "example": 10000 },
          "order_id": { "type": "string", "description": "Уникальный идентификатор заказа на вашей стороне", "example": "order_12345" },
          "callback_url": {
            "type": "string",
            "format": "uri",
            "description": "URL вашего вебхука для уведомления об успешной оплате. Должен начинаться с https:// и не указывать на localhost/приватную сеть (192.168.x.x, 10.x.x.x, 172.16–31.x.x) — иначе вебхук не отправляется.",
            "example": "https://example.com/webhook/kaspi"
          }
        }
      },
      "PayResponse": {
        "type": "object",
        "properties": {
          "qr_token": { "type": "string", "description": "Токен для отображения QR-кода платежа", "example": "eyJhbGc..." },
          "payment_link": { "type": "string", "format": "uri", "description": "Ссылка на оплату — можно передать клиенту напрямую", "example": "https://kaspi.kz/pay/..." },
          "operation_id": { "type": "string", "description": "Уникальный идентификатор операции на стороне Kaspi", "example": "op_123456789" },
          "expire_date": { "type": "string", "format": "date-time", "description": "Дата и время истечения QR-кода", "example": "2024-12-31T23:59:59Z" }
        }
      },
      "StatusResponse": {
        "type": "object",
        "properties": {
          "operation_id": { "type": "string", "example": "op_123456789" },
          "order_id": { "type": "string", "example": "order_12345" },
          "amount": { "type": "number", "example": 10000 },
          "status": { "type": "string", "enum": ["pending", "paid", "expired"], "description": "pending — ожидает оплаты, paid — оплачен, expired — QR истёк без оплаты", "example": "paid" },
          "paid": { "type": "boolean", "example": true }
        }
      },
      "ErrorUnauthorized": { "type": "object", "properties": { "error": { "type": "string", "example": "Unauthorized" } } },
      "ErrorBadRequestPay": { "type": "object", "properties": { "error": { "type": "string", "example": "amount and order_id required" } } },
      "ErrorBadRequestStatus": { "type": "object", "properties": { "error": { "type": "string", "example": "operation_id required" } } },
      "ErrorInsufficientBalance": {
        "type": "object",
        "properties": {
          "error": { "type": "string", "example": "insufficient_balance" },
          "required": { "type": "number", "description": "Сумма комиссии (2% от amount), которую нужно иметь на балансе", "example": 200 },
          "balance": { "type": "number", "description": "Текущий баланс кошелька в тенге", "example": 50 }
        }
      },
      "ErrorNotFound": { "type": "object", "properties": { "error": { "type": "string", "example": "not_found" } } },
      "ErrorRateLimited": { "type": "object", "properties": { "error": { "type": "string", "example": "rate_limited" } } },
      "ErrorKaspiUnavailable": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string",
            "enum": ["kaspi_unavailable", "tracking_failed"],
            "description": "kaspi_unavailable — сбой при обращении к Kaspi; tracking_failed — платёж создан на стороне Kaspi, но не удалось сохранить его на нашей стороне для отслеживания (случается редко) — обратитесь в поддержку",
            "example": "kaspi_unavailable"
          }
        }
      },
      "ErrorKaspiUnavailableStatus": {
        "type": "object",
        "properties": {
          "error": { "type": "string", "description": "Сбой при обращении к Kaspi во время проверки статуса", "example": "kaspi_unavailable" }
        }
      }
    }
  },
  "paths": {
    "/api/kaspi/pay": {
      "post": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Создать платёж",
        "description": "Создаёт платёж Kaspi Pay и возвращает ссылку/QR для клиента. Лимит — 20 запросов в 60 секунд на одно подключение. Комиссия 2% от суммы списывается с баланса вашего кошелька только при подтверждённой оплате.",
        "operationId": "createPayment",
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PayRequest" } } }
        },
        "responses": {
          "200": { "description": "Платёж создан", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PayResponse" } } } },
          "400": { "description": "Bad Request — отсутствуют обязательные параметры", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorBadRequestPay" } } } },
          "401": { "description": "Unauthorized — токен отсутствует или некорректен", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorUnauthorized" } } } },
          "402": { "description": "Payment Required — недостаточно средств на балансе кошелька для комиссии; пополните баланс на странице /kaspi-api", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorInsufficientBalance" } } } },
          "429": { "description": "Too Many Requests — превышен лимит 20 запросов в минуту на одно подключение", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorRateLimited" } } } },
          "502": { "description": "Bad Gateway — ошибка при обращении к Kaspi, либо платёж создан, но не удалось сохранить его для отслеживания", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorKaspiUnavailable" } } } }
        }
      }
    },
    "/api/kaspi/pay/status": {
      "get": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Проверить статус платежа",
        "description": "Каждый вызов реально перепроверяет статус у Kaspi (не просто читает базу) — можно опрашивать раз в несколько секунд, пока клиент ждёт оплаты.",
        "operationId": "getPaymentStatus",
        "parameters": [
          {
            "name": "operation_id",
            "in": "query",
            "required": true,
            "schema": { "type": "string" },
            "description": "operation_id, полученный в ответе на создание платежа",
            "example": "op_123456789"
          }
        ],
        "responses": {
          "200": { "description": "Статус платежа", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/StatusResponse" } } } },
          "400": { "description": "Bad Request — не передан operation_id", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorBadRequestStatus" } } } },
          "401": { "description": "Unauthorized — токен отсутствует или некорректен", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorUnauthorized" } } } },
          "404": { "description": "Not Found — платёж с таким operation_id не найден", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorNotFound" } } } },
          "502": { "description": "Bad Gateway — ошибка при обращении к Kaspi", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorKaspiUnavailableStatus" } } } }
        }
      }
    }
  },
  "webhooks": {
    "paymentSuccess": {
      "post": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Уведомление об успешной оплате",
        "description": "Если при создании платежа был указан callback_url, invoices.kz отправляет на него POST-запрос в момент подтверждения оплаты. Подписан заголовком X-Kaspi-Pay-Signature (hex HMAC-SHA256 от сырого тела запроса, ключ — ваш webhook-секрет). Webhook-секрет свой у каждого подключения — вебхуки других клиентов invoices.kz подписываются другим ключом, и наоборот. Это не единственный сигнал об оплате — он приходит либо в момент вашего собственного вызова GET /api/kaspi/pay/status, либо когда оплату обнаружит наш внутренний крон (на бесплатном тарифе хостинга запускается не чаще раза в сутки).",
        "security": [],
        "parameters": [
          {
            "name": "X-Kaspi-Pay-Signature",
            "in": "header",
            "required": true,
            "schema": { "type": "string" },
            "description": "hex-encoded HMAC-SHA256 от сырого JSON тела, подписанный webhook-секретом этого подключения"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "event": { "type": "string", "const": "payment.success" },
                  "order_id": { "type": "string", "example": "order_12345" },
                  "amount": { "type": "number", "example": 10000 },
                  "operation_id": { "type": "string", "example": "op_123456789" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Подтверждение получения — верните 200, если вебхук успешно обработан" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create the English OpenAPI document**

Create `src/lib/kaspiCashierApi/openapi.en.json`:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Kaspi Cashier API",
    "version": "1.0.0",
    "description": "Accept Kaspi Pay payments on your own site or app: create a payment, get a payment link/QR code, and track payment status — without integrating with the bank directly. This is not an official Kaspi merchant API — the integration works the same way the Kaspi Pay Cashier mobile app does. We maintain compatibility and will notify you if Kaspi changes their side.\n\n## Quick start\n1. **Connect the Cashier role** — on the `/kaspi-api` page, enter the phone number that already has the Kaspi Pay app's \"Cashier\" role, and confirm the SMS code.\n2. **Save your API token and webhook secret** — right after connecting, two values are shown once: an API token (for API requests) and a separate webhook secret (for verifying webhook signatures, see the Webhooks section below). Copy and save both — they are not shown again (you can only disconnect Cashier and reconnect it, which issues new ones).\n3. **Hand them to your developer or wire them into your site** — if you're not building the site yourself, send these two values and a link to this page to your developer.\n4. **Create a payment** — send the request from the `POST /api/kaspi/pay` example below with an amount and your own order id. The response contains a link/QR — show it to the customer.\n5. **Learn about the payment automatically** — the simplest way is to poll the status endpoint (`GET /api/kaspi/pay/status`) while the customer is on the payment page, or set up a webhook instead (see the Webhooks section below).\n\n## Pricing\nConnecting and accepting payments is free on any plan. A 2% commission is debited from your wallet balance only for confirmed payments — e.g. a ₸10,000 payment debits ₸200. Top up your balance in advance on the `/kaspi-api` page.",
    "contact": {
      "name": "invoices.kz support",
      "email": "support@invoices.kz",
      "url": "https://t.me/invoiceskz_support"
    }
  },
  "servers": [
    { "url": "https://www.invoices.kz", "description": "Production — the only environment; there is no test/sandbox mode" }
  ],
  "tags": [
    { "name": "Kaspi Cashier API", "description": "Accepting and tracking Kaspi Pay payments" }
  ],
  "security": [{ "bearerAuth": [] }],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "Your Kaspi Cashier connection's API token. Issued once on the /kaspi-api page when you connect the \"Cashier\" role — save it immediately, it is not shown again (if it's lost or leaked, disconnect and reconnect Cashier to get a new one). It belongs only to your connection — never reused by anyone else."
      }
    },
    "schemas": {
      "PayRequest": {
        "type": "object",
        "required": ["amount", "order_id"],
        "properties": {
          "amount": { "type": "number", "description": "Payment amount in tenge", "example": 10000 },
          "order_id": { "type": "string", "description": "A unique order identifier on your side", "example": "order_12345" },
          "callback_url": {
            "type": "string",
            "format": "uri",
            "description": "Your webhook URL for the payment-success notification. Must start with https:// and must not point at localhost or a private network (192.168.x.x, 10.x.x.x, 172.16-31.x.x) — otherwise the webhook is simply not sent.",
            "example": "https://example.com/webhook/kaspi"
          }
        }
      },
      "PayResponse": {
        "type": "object",
        "properties": {
          "qr_token": { "type": "string", "description": "Token used to render the payment's QR code", "example": "eyJhbGc..." },
          "payment_link": { "type": "string", "format": "uri", "description": "Payment link — can be handed to the customer directly", "example": "https://kaspi.kz/pay/..." },
          "operation_id": { "type": "string", "description": "Unique operation id on Kaspi's side", "example": "op_123456789" },
          "expire_date": { "type": "string", "format": "date-time", "description": "Date and time the QR code expires", "example": "2024-12-31T23:59:59Z" }
        }
      },
      "StatusResponse": {
        "type": "object",
        "properties": {
          "operation_id": { "type": "string", "example": "op_123456789" },
          "order_id": { "type": "string", "example": "order_12345" },
          "amount": { "type": "number", "example": 10000 },
          "status": { "type": "string", "enum": ["pending", "paid", "expired"], "description": "pending — awaiting payment, paid — paid, expired — the QR code expired unpaid", "example": "paid" },
          "paid": { "type": "boolean", "example": true }
        }
      },
      "ErrorUnauthorized": { "type": "object", "properties": { "error": { "type": "string", "example": "Unauthorized" } } },
      "ErrorBadRequestPay": { "type": "object", "properties": { "error": { "type": "string", "example": "amount and order_id required" } } },
      "ErrorBadRequestStatus": { "type": "object", "properties": { "error": { "type": "string", "example": "operation_id required" } } },
      "ErrorInsufficientBalance": {
        "type": "object",
        "properties": {
          "error": { "type": "string", "example": "insufficient_balance" },
          "required": { "type": "number", "description": "The commission amount (2% of amount) your balance needs to cover", "example": 200 },
          "balance": { "type": "number", "description": "Your current wallet balance in tenge", "example": 50 }
        }
      },
      "ErrorNotFound": { "type": "object", "properties": { "error": { "type": "string", "example": "not_found" } } },
      "ErrorRateLimited": { "type": "object", "properties": { "error": { "type": "string", "example": "rate_limited" } } },
      "ErrorKaspiUnavailable": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string",
            "enum": ["kaspi_unavailable", "tracking_failed"],
            "description": "kaspi_unavailable — the request to Kaspi itself failed; tracking_failed — the payment was created on Kaspi's side but we failed to save it for tracking on ours (rare) — contact support",
            "example": "kaspi_unavailable"
          }
        }
      },
      "ErrorKaspiUnavailableStatus": {
        "type": "object",
        "properties": {
          "error": { "type": "string", "description": "A failure talking to Kaspi while checking the status", "example": "kaspi_unavailable" }
        }
      }
    }
  },
  "paths": {
    "/api/kaspi/pay": {
      "post": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Create a payment",
        "description": "Creates a Kaspi Pay payment and returns a link/QR for the customer. Limit: 20 requests per 60 seconds per connection. A 2% commission is debited from your wallet balance only once the payment is confirmed.",
        "operationId": "createPayment",
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PayRequest" } } }
        },
        "responses": {
          "200": { "description": "Payment created", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PayResponse" } } } },
          "400": { "description": "Bad Request — a required field is missing", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorBadRequestPay" } } } },
          "401": { "description": "Unauthorized — the token is missing or invalid", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorUnauthorized" } } } },
          "402": { "description": "Payment Required — insufficient wallet balance to cover the commission; top up on the /kaspi-api page", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorInsufficientBalance" } } } },
          "429": { "description": "Too Many Requests — the 20-requests-per-minute-per-connection limit was exceeded", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorRateLimited" } } } },
          "502": { "description": "Bad Gateway — a failure talking to Kaspi, or the payment was created but couldn't be saved for tracking", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorKaspiUnavailable" } } } }
        }
      }
    },
    "/api/kaspi/pay/status": {
      "get": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Check payment status",
        "description": "Every call genuinely re-checks the status with Kaspi (it does not just read our database) — safe to poll every few seconds while the customer waits on the payment page.",
        "operationId": "getPaymentStatus",
        "parameters": [
          {
            "name": "operation_id",
            "in": "query",
            "required": true,
            "schema": { "type": "string" },
            "description": "The operation_id returned when the payment was created",
            "example": "op_123456789"
          }
        ],
        "responses": {
          "200": { "description": "Payment status", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/StatusResponse" } } } },
          "400": { "description": "Bad Request — operation_id was not provided", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorBadRequestStatus" } } } },
          "401": { "description": "Unauthorized — the token is missing or invalid", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorUnauthorized" } } } },
          "404": { "description": "Not Found — no payment with that operation_id exists", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorNotFound" } } } },
          "502": { "description": "Bad Gateway — a failure talking to Kaspi", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorKaspiUnavailableStatus" } } } }
        }
      }
    }
  },
  "webhooks": {
    "paymentSuccess": {
      "post": {
        "tags": ["Kaspi Cashier API"],
        "summary": "Payment-success notification",
        "description": "If a callback_url was provided when creating the payment, invoices.kz sends it a POST request the moment the payment is confirmed. Signed with an X-Kaspi-Pay-Signature header (hex HMAC-SHA256 of the raw request body, keyed with your webhook secret). The webhook secret is unique per connection — other invoices.kz customers' webhooks are signed with a different key, and vice versa. This is not the only signal of payment — it fires either when you call GET /api/kaspi/pay/status yourself, or when our internal cron discovers the payment (on the hosting plan's free tier, that cron runs no more than once a day).",
        "security": [],
        "parameters": [
          {
            "name": "X-Kaspi-Pay-Signature",
            "in": "header",
            "required": true,
            "schema": { "type": "string" },
            "description": "hex-encoded HMAC-SHA256 of the raw JSON body, signed with this connection's webhook secret"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "event": { "type": "string", "const": "payment.success" },
                  "order_id": { "type": "string", "example": "order_12345" },
                  "amount": { "type": "number", "example": 10000 },
                  "operation_id": { "type": "string", "example": "op_123456789" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Acknowledged — return 200 once the webhook has been processed successfully" }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Parse-check both JSON files, then run `npx tsc --noEmit` and confirm zero new errors**

```
node -e "JSON.parse(require('fs').readFileSync('src/lib/kaspiCashierApi/openapi.ru.json'))"
node -e "JSON.parse(require('fs').readFileSync('src/lib/kaspiCashierApi/openapi.en.json'))"
npx tsc --noEmit
```

Both `node -e` commands must exit with no output/error — that's what actually proves each file is syntactically valid JSON at this stage, since `tsconfig.json`'s `include` has no `**/*.json` glob and these two files aren't imported by any `.ts`/`.tsx` file until Task 3, so `tsc --noEmit` alone would silently pass even with a JSON syntax error in either file.

- [ ] **Step 4: Commit**

```
git add src/lib/kaspiCashierApi/openapi.ru.json src/lib/kaspiCashierApi/openapi.en.json
git commit -m "docs(cashier-api): add ru/en OpenAPI 3.1 specs for the Kaspi Cashier API"
```

---

### Task 3: Scalar Renderer Wrapper Component

**Files:**
- Modify: `package.json` (dependency added by `npm install`)
- Modify: `src/app/globals.css:1`
- Create: `src/components/ApiDocsViewer.tsx`
- Test: no test suite for these files; verification is `npx tsc --noEmit` plus a live dev-server check — `ApiDocsViewer` is not mounted by any page until Task 4, so at this stage confirm only that the install succeeded (`node_modules/@scalar/api-reference-react` exists) and `npx tsc --noEmit` is clean.

**Interfaces:**
- Consumes: `openApiRu`/`openApiEn` JSON from Task 2 (`src/lib/kaspiCashierApi/openapi.ru.json` / `.en.json`), `CASHIER_API_COLOR` and `CASHIER_API_FONT_MONO` from Task 1 (`src/lib/kaspiCashierApi/theme.ts`). Takes a plain `'ru' | 'en'` literal prop (not the app-wide `Lang` union) since the caller has already collapsed `'kk'` to `'ru'` before calling.
- Produces: default export `ApiDocsViewer({ lang: 'ru' | 'en' })`, consumed by Task 4's rewritten `/kaspi-api/docs` page.

- [ ] **Step 1: Install the exact pinned Scalar package**

```
npm install @scalar/api-reference-react@0.9.66
```

- [ ] **Step 2: Declare Tailwind v4 layer order ahead of Scalar's own CSS**

In `src/app/globals.css`, find (line 1):

```css
@import "tailwindcss";
```

Replace with:

```css
@layer scalar-base, scalar-theme, scalar-config, theme, base, components, utilities;

@import "tailwindcss";
```

- [ ] **Step 3: Create the ApiDocsViewer wrapper component**

Create `src/components/ApiDocsViewer.tsx`:

```tsx
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
        // Never set proxyUrl -- leaving it unset is what keeps every
        // "Try it" request going straight from the visitor's browser to
        // invoices.kz's own API, never through any Scalar-hosted proxy
        // (hard requirement, see the design spec's "Библиотека-рендерер").
        theme: 'none',
        darkMode: true,
        forceDarkModeState: 'dark',
        hideDarkModeToggle: true,
        customCss: SCALAR_CUSTOM_CSS,
      }}
    />
  )
}
```

- [ ] **Step 4: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 5: Commit**

```
git add package.json package-lock.json src/app/globals.css src/components/ApiDocsViewer.tsx
git commit -m "feat(cashier-api): add Scalar-based interactive OpenAPI viewer wrapper"
```

---

### Task 4: Replace `/kaspi-api/docs` With Auth-Gated Interactive Docs

**Files:**
- Modify: `src/app/kaspi-api/docs/page.tsx:1-391` (full rewrite — the existing static-text page, currently reachable by anyone with no login check at all, is replaced entirely)
- Create: `src/app/kaspi-api/docs/layout.tsx`
- Modify: `src/components/TopUtilityBar.tsx:294-304`
- Test: no test suite for these files; verification is `npx tsc --noEmit` plus a live dev-server check at `http://localhost:3000/kaspi-api/docs` — confirm: (a) logged out, the page immediately redirects to `/login`; (b) logged in, it shows the "Загрузка…"/"Loading…" state briefly then the full interactive reference; (c) the RU/EN toggle switches both the page's own chrome text and the Scalar reference's spec content; (d) the "real API, no sandbox" warning is visible above the reference; (e) the Scalar UI-chrome-localization caption is visible; (f) the webhook payload/signature/Node.js verification example and the "not an official Kaspi API" disclosure both render below the reference; (g) opening the browser Network tab and clicking "Send Request" on `GET /api/kaspi/pay/status` (using a real token from `/kaspi-api`) shows the request going directly to `www.invoices.kz`, not to any `scalar.com`/proxy host.

**Interfaces:**
- Consumes: `ApiDocsViewer` from Task 3 (`@/components/ApiDocsViewer`), `CASHIER_API_COLOR`/`CASHIER_API_FONT_SANS`/`CASHIER_API_FONT_MONO` from Task 1 (`@/lib/kaspiCashierApi/theme`), `supabase` from `@/lib/supabase`, `useLanguage` from `@/components/LanguageProvider`.
- Produces: default export `KaspiApiDocsPage`, still mounted at the existing route `/kaspi-api/docs`.

- [ ] **Step 1: Create the segment metadata layout (now-gated, should not be indexed)**

Create `src/app/kaspi-api/docs/layout.tsx`:

```tsx
import type { Metadata } from 'next'

// This page used to be fully public (no auth check at all) and may already
// be indexed by search engines. Now that it requires a login (Task 4's
// rewrite), it must stop being indexed going forward -- a search visitor
// landing on a login redirect is a bad experience, and there is no reason
// for this URL to appear in search results at all.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — документация',
  robots: { index: false, follow: false },
}

export default function KaspiApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

- [ ] **Step 2: Replace the entire docs page with the auth-gated interactive reference**

Replace the full contents of `src/app/kaspi-api/docs/page.tsx` with:

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import ApiDocsViewer from '@/components/ApiDocsViewer'
import { CASHIER_API_COLOR as C, CASHIER_API_FONT_SANS as FONT_SANS, CASHIER_API_FONT_MONO as FONT_MONO } from '@/lib/kaspiCashierApi/theme'

interface DocsCopy {
  loading: string
  backLabel: string
  title: string
  liveWarning: string
  i18nNote: string
  webhookTitle: string
  webhookIntro: string
  webhookPayloadLabel: string
  webhookHeaderLabel: string
  webhookVerifyTitle: string
  webhookVerifyIntro: string
  webhookVerifyCode: string
  disclosureTitle: string
  disclosureBody: string
  supportTitle: string
}

const DOCS_COPY: Record<'ru' | 'en', DocsCopy> = {
  ru: {
    loading: 'Загрузка…',
    backLabel: 'invoices.kz',
    title: 'Kaspi Cashier API — документация',
    liveWarning: 'Все запросы «Try it» ниже выполняются к реальному продакшн-API — у Kaspi Pay нет тестового режима. Успешный вызов создания платежа спишет комиссию 2% с вашего баланса при оплате.',
    i18nNote: 'Часть элементов интерфейса самого проводника (например, кнопки Authorize и Send Request) отображается на английском независимо от выбранного языка — это ограничение библиотеки Scalar, не наших переводов.',
    webhookTitle: 'Вебхуки (webhook)',
    webhookIntro: 'Если при создании платежа указан callback_url, invoices.kz отправит на него POST-запрос в момент подтверждения оплаты.',
    webhookPayloadLabel: 'Тело вебхука (JSON):',
    webhookHeaderLabel: 'Заголовок подписи:',
    webhookVerifyTitle: 'Верификация подписи',
    webhookVerifyIntro: 'Вычислите HMAC-SHA256 от сырого JSON тела запроса, используя ваш webhook-секрет, и сравните результат с заголовком X-Kaspi-Pay-Signature. Пример на Node.js:',
    webhookVerifyCode: `const crypto = require('crypto');

// rawBody — это точная строка JSON, полученная из тела запроса
// secret — ваш webhook-секрет, показанный один раз при подключении
const signature = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

const isValid = signature === req.headers['x-kaspi-pay-signature'];`,
    disclosureTitle: 'Важно знать',
    disclosureBody: 'Это не официальный Kaspi merchant API — интеграция сделана по тому же принципу, что и мобильное приложение Kaspi Pay Cashier. Мы поддерживаем совместимость и уведомим вас, если Kaspi изменит свою сторону.',
    supportTitle: 'Поддержка',
  },
  en: {
    loading: 'Loading…',
    backLabel: 'invoices.kz',
    title: 'Kaspi Cashier API — documentation',
    liveWarning: 'Every "Try it" request below hits the real production API — Kaspi Pay has no test/sandbox mode. A successful payment-creation call will debit a 2% commission from your balance once the customer pays.',
    i18nNote: "Some of the reference tool's own interface labels (e.g. the Authorize and Send Request buttons) stay in English regardless of the selected language — that's a limitation of the Scalar library itself, not of our translations.",
    webhookTitle: 'Webhooks',
    webhookIntro: 'If a callback_url was provided when creating the payment, invoices.kz sends a POST request to it the moment the payment is confirmed.',
    webhookPayloadLabel: 'Webhook body (JSON):',
    webhookHeaderLabel: 'Signature header:',
    webhookVerifyTitle: 'Verifying the signature',
    webhookVerifyIntro: 'Compute an HMAC-SHA256 of the raw JSON request body using your webhook secret, and compare it to the X-Kaspi-Pay-Signature header. Node.js example:',
    webhookVerifyCode: `const crypto = require('crypto');

// rawBody -- the exact JSON string received in the request body
// secret  -- your webhook secret, shown once when connecting Cashier
const signature = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

const isValid = signature === req.headers['x-kaspi-pay-signature'];`,
    disclosureTitle: 'Good to know',
    disclosureBody: 'This is not an official Kaspi merchant API — the integration works the same way the Kaspi Pay Cashier mobile app does. We maintain compatibility and will notify you if Kaspi changes their side.',
    supportTitle: 'Support',
  },
}

const WEBHOOK_BODY_EXAMPLE = `{
  "event": "payment.success",
  "order_id": "order_12345",
  "amount": 10000,
  "operation_id": "op_123456789"
}`

// WEBHOOK_VERIFY_EXAMPLE is intentionally NOT a single hardcoded constant:
// its comments are natural-language prose ("rawBody -- exact JSON string
// received..."), unlike WEBHOOK_BODY_EXAMPLE above (pure JSON field names,
// already language-neutral), so it must be bilingual like every other
// DOCS_COPY string -- see DocsCopy.webhookVerifyCode (DOCS_COPY.ru /
// DOCS_COPY.en above), rendered below as `<Pre>{d.webhookVerifyCode}</Pre>`.

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: C.bg1, border: `1px solid ${C.border}` }}>
      {children}
    </div>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      className="overflow-x-auto rounded-lg p-3 text-[12.5px] leading-relaxed"
      style={{ background: C.bg0, border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT_MONO }}
    >
      {children}
    </pre>
  )
}

export default function KaspiApiDocsPage() {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const activeLang: 'ru' | 'en' = lang === 'en' ? 'en' : 'ru'
  const d = DOCS_COPY[activeLang]

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: C.bg0, color: C.muted, fontFamily: FONT_SANS }}>
        {d.loading}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg0, color: C.text, fontFamily: FONT_SANS }}>
      <header className="sticky top-0 z-20" style={{ background: 'rgba(10,12,16,0.92)', borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="/" className="flex min-h-11 items-center text-[14px] font-bold tracking-[0.06em]" style={{ color: C.text }}>
            {d.backLabel}
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] sm:inline" style={{ color: C.muted, fontFamily: FONT_MONO }}>
              {d.title}
            </span>
            <div className="flex overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              {(['ru', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="min-h-11 min-w-11 px-2 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: activeLang === l ? C.bg2 : 'transparent', color: activeLang === l ? C.accent : C.muted }}
                  aria-pressed={activeLang === l}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-2 text-[11px] sm:px-8" style={{ color: C.muted }}>
          {d.i18nNote}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <Panel>
          <p className="text-[13px] leading-relaxed" style={{ color: C.accent }}>{d.liveWarning}</p>
        </Panel>
      </div>

      <div className="mx-auto max-w-6xl sm:px-8">
        <ApiDocsViewer lang={activeLang} />
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8">
        <section>
          <h2 className="text-[20px] font-semibold">{d.webhookTitle}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{d.webhookIntro}</p>

          <p className="mb-2 mt-4 text-[13px] font-semibold">{d.webhookPayloadLabel}</p>
          <Pre>{WEBHOOK_BODY_EXAMPLE}</Pre>

          <p className="mb-2 mt-4 text-[13px] font-semibold">{d.webhookHeaderLabel}</p>
          <Pre>{'X-Kaspi-Pay-Signature: <hex-encoded HMAC-SHA256>'}</Pre>

          <h3 className="mt-6 text-[15px] font-semibold">{d.webhookVerifyTitle}</h3>
          <p className="mb-2 mt-2 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{d.webhookVerifyIntro}</p>
          <Pre>{d.webhookVerifyCode}</Pre>
        </section>

        <section className="rounded-xl p-5" style={{ background: C.bg1, border: `1px solid ${C.border}` }}>
          <h2 className="text-[15px] font-semibold" style={{ color: C.accent }}>{d.disclosureTitle}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{d.disclosureBody}</p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold">{d.supportTitle}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href="mailto:support@invoices.kz"
              className="flex min-h-11 items-center rounded-lg px-3 text-[13px] font-medium"
              style={{ background: C.bg1, border: `1px solid ${C.border}`, color: C.accent }}
            >
              support@invoices.kz
            </a>
            <a
              href="https://t.me/invoiceskz_support"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center rounded-lg px-3 text-[13px] font-medium"
              style={{ background: C.bg1, border: `1px solid ${C.border}`, color: C.accent }}
            >
              Telegram
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Exclude `/kaspi-api/docs` from the global TopUtilityBar chrome**

In `src/components/TopUtilityBar.tsx`, find (as left after Task 1's Step 4):

```tsx
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/cashier-api' ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/')
```

Replace with:

```tsx
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/cashier-api' ||
    pathname === '/kaspi-api/docs' ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/')
```

- [ ] **Step 4: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 5: Commit**

```
git add src/app/kaspi-api/docs/page.tsx src/app/kaspi-api/docs/layout.tsx src/components/TopUtilityBar.tsx
git commit -m "feat(kaspi-api): replace static docs page with auth-gated interactive OpenAPI reference"
```

---

### Task 5: Polish & Verification

**Files:**
- Modify: none expected beyond what the audit in Steps 1-3 finds (if the audit finds a real gap, fix it inline in the same file it's found in, using the same `min-h-11`/`motion-safe:` conventions as Tasks 1 and 4 — do not add a placeholder here, apply the literal fix).
- Test: no test suite for these files; verification is `npx tsc --noEmit` plus a full live dev-server pass across both languages and both surfaces, itemized in Step 5.

**Interfaces:**
- Consumes: the finished `/cashier-api` (Task 1) and `/kaspi-api/docs` (Task 4) pages.
- Produces: a confirmed-working feature; no new interfaces for later code.

- [ ] **Step 1: Audit touch targets on both new/changed pages**

```
git grep -n "<button" src/app/cashier-api/page.tsx src/app/kaspi-api/docs/page.tsx
```

For every match, confirm the button's `className` includes `min-h-11` (or, for square icon-style buttons, both `min-h-11` and `min-w-11`) — every button introduced in Tasks 1 and 4 already does (the CTA buttons, the two RU/EN toggles, and the three code-language tabs). If any button is found missing it, add `min-h-11` (and `min-w-11` for square buttons) to its `className` in that same file — using the exact class, not a new pattern.

- [ ] **Step 2: Audit motion for `prefers-reduced-motion` compliance**

```
git grep -n "transition\|translate\|animate" src/app/cashier-api/page.tsx src/app/kaspi-api/docs/page.tsx src/components/ApiDocsViewer.tsx
```

Confirm every hover-transform class is prefixed `motion-safe:` (Tailwind's `motion-safe:` variant already resolves to `@media (prefers-reduced-motion: no-preference)`, so no bare `hover:-translate-y-*`/`hover:scale-*` should appear outside a `motion-safe:` prefix). Tasks 1 and 4 only ever used `motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97]` — if a bare (non-`motion-safe:`) transform-on-hover class is found, prefix it with `motion-safe:` in that same file.

- [ ] **Step 3: Audit for internal-endpoint leakage**

```
git grep -n "dashboard\|webhook-url" src/app/cashier-api src/lib/kaspiCashierApi src/app/kaspi-api/docs
```

This must return no matches. Per the Global Constraints, `/api/kaspi/dashboard` and `/api/kaspi/webhook-url` are internal, Supabase-session-authed endpoints (see `src/app/kaspi-api/page.tsx`) and must never appear on the public landing page, in either OpenAPI spec, or on the docs page — only `POST /api/kaspi/pay` and `GET /api/kaspi/pay/status` are the public contract. If a match is found, remove it from that file.

- [ ] **Step 4: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 5: Start the dev server and manually verify the full feature**

```
npm run dev
```

Then, in a browser, verify all of the following:
1. `http://localhost:3000/cashier-api` in RU: header shows "invoices.kz", both CTA buttons and the "Смотреть документацию" button work, the 4-step grid, the "2%" pricing comparison against ApiPay.kz, and the 4-row features list all render with the correct dark palette (`#0a0c10`/`#0d1117`/`#161b22` surfaces, `#7ee787` accent, `#238636` buttons).
2. Toggle to EN on the same page — every string switches (title, subtitle, both CTAs, all 4 steps, pricing captions, all 4 feature rows, footer) with no leftover Russian text.
3. Click each of the three code tabs (cURL/JavaScript/Python) and confirm the request snippet changes while the response JSON panel underneath stays constant.
4. While logged in as the admin (a separate tab), reload `/cashier-api` and confirm the wallet/notifications/account icon bar from `TopUtilityBar` does NOT appear.
5. Log out, navigate to `http://localhost:3000/kaspi-api/docs` directly, and confirm an immediate redirect to `/login`.
6. Log back in and reload `/kaspi-api/docs`: confirm the brief "Загрузка…" state, then the full page — the live-API warning banner, the i18n-limitation caption, the interactive Scalar reference (both endpoints listed, `bearerAuth` "Authorize" control visible), the webhook section (payload, signature header, Node.js verification example), the "Важно знать" disclosure note, and the support links.
7. Toggle RU/EN on `/kaspi-api/docs`: confirm the page's own chrome text (warning, caption, webhook section, disclosure, support) and the Scalar reference's spec-derived content (summaries, descriptions, examples) both switch language; note that a few of Scalar's own interface labels (e.g. "Authorize", "Send Request") stay in English in both modes — this is the disclosed, expected limitation, not a bug.
8. Paste a real API token (from `/kaspi-api`) into Scalar's "Authorize" field, open the browser's Network tab, and click "Send Request" on `GET /api/kaspi/pay/status` with a real `operation_id`: confirm the outgoing request's host is `www.invoices.kz` (never a `scalar.com`/proxy host) and that a real response comes back.

- [ ] **Step 6: Commit**

```
git add src/app/cashier-api/page.tsx src/app/kaspi-api/docs/page.tsx src/components/ApiDocsViewer.tsx src/lib/kaspiCashierApi/openapi.ru.json src/lib/kaspiCashierApi/openapi.en.json
git commit -m "fix(cashier-api): polish touch targets and reduced-motion guards after live verification"
```

If Steps 1-3 found nothing to fix, there is nothing to stage — skip this commit and instead run `git status` to confirm the working tree is clean; do not create an empty commit.
