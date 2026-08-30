# Landing Redesign (Kaspi Bot / AI-agent + Features Reformat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the landing page's stale "Скоро" placeholder with a live, honest Kaspi Bot / AI-agent tabbed demo, reformat the "Возможности" card grid into the spec's asymmetric list, and add a footer link to the (separately shipped) Cashier API page.

**Architecture:** All changes live in the single client component `src/app/page.tsx`. A new module-scope `BotShowcase` component (framer-motion `AnimatePresence` fade-swap between two tabs) replaces the old static "soon" section entirely; the `features` section keeps its existing 5-item `Copy.features` array but renders it as two blocks (a top 2-item text block with a shrunk `HeroMockupCard`, a bottom 3-item divided list) instead of a 3-column card grid; the footer gains a 4th data-only link. No new dependencies, no new routes, no server-side changes.

**Tech Stack:** Next.js App Router client component (`'use client'`), React `useState`/`useEffect`, framer-motion (`motion`, `AnimatePresence`, `useReducedMotion` — `AnimatePresence` is newly imported, the rest already imported), Tailwind CSS utility classes (including arbitrary values, already used throughout this file), TypeScript strict mode.

## Global Constraints

- BLOCKED: do not begin executing this plan until the separate Kaspi Cashier API landing page exists and is deployed at the `/cashier-api` route (founder decision, 2026-08-30) — Tasks 2 and 3 add live links to that route and must not ship a broken link to production.
- Execute tasks strictly in order 1 → 2 → 3. All three tasks edit `src/app/page.tsx`; the line numbers cited in Tasks 2 and 3 are computed assuming Task 1's (and, for Task 3, Task 2's) edits have already landed. Re-read the file at the start of each task and match by the literal code shown in each step — do not blind-jump to a line number.
- Colors (verbatim from `src/app/page.tsx`'s `COLOR` const and the hero's documented contrast fix): `COLOR.violet = '#6E5ED8'`, `COLOR.teal = '#0B7A88'`, `COLOR.magenta = '#CE4C86'`, `COLOR.ground = '#0a0d1f'`. The large stat digit and the status-pulse dot in the new Kaspi Bot / AI-agent section use the literal `'#5EEAD4'` accent (the same value the hero `<h1>` already uses for its teal word) — not `COLOR.teal`, which is too dark for large text directly on the page's ambient background (documented at `src/app/page.tsx:749-754` as measuring only ~2.65:1 contrast there).
- Background of `BotShowcase`: the spec's "Секция 1 / Цвета" line ("фон секции — тот же COLOR.ground (#0a0d1f) с уже существующими AmbientBlobs, а не новый радиальный градиент из мокапа") is satisfied without mounting a second `<AmbientBlobs />` and without adding any new gradient. `AmbientBlobs` is rendered exactly once today (`src/app/page.tsx:725`), absolutely positioned and clipped inside the hero `<section>`'s own `overflow-hidden`, and it drives three infinitely-looping decorative drift animations (`repeat: Infinity` when motion isn't reduced) — reusing it here would directly violate the "No continuous decorative animation in the new Kaspi Bot / AI-agent section" constraint below. Read the spec's "AmbientBlobs" mention as shorthand for "the page's existing flat `COLOR.ground` treatment already used by every non-hero section": the root wrapper already sets `background: COLOR.ground` once (`src/app/page.tsx:679`), which every section including `BotShowcase` inherits automatically with zero extra markup — no ambient glow, no gradient, nothing for Task 1 to add here.
- Touch targets: every new interactive control (the Kaspi Bot / AI-agent tab buttons) must have a real `min-height: 44px` tap zone — this is a hard project-wide baseline already applied in commits `a42a67b` and `366074b`, not optional polish.
- No continuous decorative animation in the new Kaspi Bot / AI-agent section (`BotShowcase`): the only two animations allowed to loop forever there are the Kaspi Bot tab's status-pulse dot and the AI-agent tab's typing-dots indicator (both functional state indicators, both gated by `motion-safe:`). Do not add a decorative infinite glow/box-shadow pulse around its demo card (the throwaway mockup's `glow-pulse` is explicitly banned by the spec). This does not apply to `HeroMockupCard`'s pre-existing infinite floating animation (`y: [0, -10, 0]`, already shipped, unrelated to this plan) — Task 2 reuses that component as-is, floating animation included.
- The compact features list's row divider is `border-bottom: 1px solid rgba(255,255,255,0.08)` — a deliberately lighter value than the file's shared `BORDER` constant (`rgba(255,255,255,0.12)`); do not substitute `BORDER` here. No left/side-stripe border on list rows (banned pattern).
- The features section keeps its `<h2>`/subtitle but drops the `<Eyebrow>` kicker above them — that pattern is banned by the project's design system per the spec; every other section's `<Eyebrow>` is untouched.
- All new copy strings (RU is normative, per the approved spec) get natural, human-quality KK and EN translations — never machine-literal — consistent with how the rest of `COPY.kk`/`COPY.en` already reads.
- This file is a `'use client'` component with no new Next.js APIs introduced by this plan (no new routes, data fetching, or server components) — if any step ever needs a Next.js API not already used in this file, consult `node_modules/next/dist/docs/` first per `AGENTS.md` before writing it.

---

## Task 1: Kaspi Bot / AI-agent tabbed section

**Files:**
- Modify: `src/app/page.tsx:6` — framer-motion import (add `AnimatePresence`)
- Modify: `src/app/page.tsx:88-109` — remove now-unused `StoreIcon`/`BotIcon`
- Modify: `src/app/page.tsx:196` — `SoonKey` type → `BotTabKey`
- Modify: `src/app/page.tsx:207-210` — remove `SOON_ICONS`
- Modify: `src/app/page.tsx:243-245` — `Copy` interface: `soonEyebrow`/`soonTitle`/`soon` → `botTitle`/`botSubtitle`/`botTabs`/`botKaspi`/`botAgent`
- Modify: `src/app/page.tsx:295-300` — `COPY.ru` soon fields → bot fields
- Modify: `src/app/page.tsx:365-370` — `COPY.kk` soon fields → bot fields
- Modify: `src/app/page.tsx:435-440` — `COPY.en` soon fields → bot fields
- Modify: `src/app/page.tsx:933-966` — soon JSX section → `<BotShowcase t={t} />`
- Modify: `src/app/page.tsx` (append after line 1117, end of file) — new `BotShowcase` component
- Test: this project has no test suite for this file; verification is `npx tsc --noEmit` from the repo root plus a live dev-server visual check (both tabs, reduced-motion toggle, tab tap-target size) — there is no test file to add.

**Interfaces:**
- Consumes: existing `COLOR` (`violet`, `magenta`), `EASE`, `SURFACE`, `BORDER` module constants; existing `Reveal` component (`children`, `delay`, `className`); `useReducedMotion` from framer-motion; `t = COPY[lang]` already computed in `Home()`.
- Produces: `type BotTabKey = 'kaspibot' | 'aiagent'`; `Copy.botTitle: string`, `Copy.botSubtitle: string`, `Copy.botTabs: { key: BotTabKey; label: string }[]`, `Copy.botKaspi: { stat: string; statCaption: string; yourPriceLabel: string; yourPrice: string; competitorLabel: string; competitorPrice: string; statusText: string }`, `Copy.botAgent: { stat: string; statCaption: string; incomingMessage: string; replyMessage: string; typingLabel: string }`; module-scope `function BotShowcase({ t }: { t: Copy })`. Nothing in Task 2 or Task 3 consumes these — they only share the same file, so Task 1 must land first purely to keep Task 2/3's line-number references valid.

- [ ] **Step 1: Add `AnimatePresence` to the framer-motion import**

  Current (`src/app/page.tsx:6`):
  ```tsx
  import { motion, useInView, useReducedMotion } from 'framer-motion'
  ```
  Replace with:
  ```tsx
  import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
  ```

- [ ] **Step 2: Remove the now-unused `StoreIcon` and `BotIcon` icon components**

  Current (`src/app/page.tsx:87-110`, i.e. the blank line before `StoreIcon` through the blank line before `FaceIdIcon`):
  ```tsx

  function StoreIcon({ className }: { className?: string }) {
    return (
      <svg className={className} aria-hidden="true" {...ICON_PROPS}>
        <path d="M4.5 9 5.7 4.5h12.6L19.5 9" />
        <path d="M4.5 9a2 2 0 0 0 4 .1 2 2 0 0 0 4-.1 2 2 0 0 0 4 .1 2 2 0 0 0 4-.1" />
        <path d="M5.5 9.3V20h13V9.3" />
        <path d="M10 20v-5.5h4V20" />
      </svg>
    )
  }

  function BotIcon({ className }: { className?: string }) {
    return (
      <svg className={className} aria-hidden="true" {...ICON_PROPS}>
        <rect x="4" y="5" width="16" height="11" rx="3.5" />
        <path d="M9 20.5 11.2 16h1.6L15 20.5" />
        <circle cx="9.2" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.8" cy="10.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  function FaceIdIcon({ className }: { className?: string }) {
  ```
  Replace with (deleting both functions and the extra blank line between them, keeping exactly one blank line before `FaceIdIcon`):
  ```tsx

  function FaceIdIcon({ className }: { className?: string }) {
  ```

- [ ] **Step 3: Replace the `SoonKey` type alias with `BotTabKey`, and remove `SOON_ICONS`**

  Current (`src/app/page.tsx:195-210` after Step 2's shift — locate by content, not line number):
  ```tsx
  type FeatureKey = 'invoice' | 'kaspi' | 'api' | 'esign' | 'contract'
  type SoonKey = 'store' | 'bot'
  type AuthKey = 'google' | 'facebook' | 'faceid' | 'mail'
  type ExtraKey = 'globe' | 'wallet' | 'gift'

  const FEATURE_ICONS: Record<FeatureKey, ComponentType<{ className?: string }>> = {
    invoice: BoltIcon,
    kaspi: PaymentIcon,
    api: ApiIcon,
    esign: PenIcon,
    contract: ContractIcon,
  }
  const SOON_ICONS: Record<SoonKey, ComponentType<{ className?: string }>> = {
    store: StoreIcon,
    bot: BotIcon,
  }
  const AUTH_ICONS: Record<AuthKey, ComponentType<{ className?: string }>> = {
  ```
  Replace with:
  ```tsx
  type FeatureKey = 'invoice' | 'kaspi' | 'api' | 'esign' | 'contract'
  type BotTabKey = 'kaspibot' | 'aiagent'
  type AuthKey = 'google' | 'facebook' | 'faceid' | 'mail'
  type ExtraKey = 'globe' | 'wallet' | 'gift'

  const FEATURE_ICONS: Record<FeatureKey, ComponentType<{ className?: string }>> = {
    invoice: BoltIcon,
    kaspi: PaymentIcon,
    api: ApiIcon,
    esign: PenIcon,
    contract: ContractIcon,
  }
  const AUTH_ICONS: Record<AuthKey, ComponentType<{ className?: string }>> = {
  ```

- [ ] **Step 4: Replace `soonEyebrow`/`soonTitle`/`soon` in the `Copy` interface with the new `bot*` fields**

  Current (`src/app/page.tsx:243-245` before this task's earlier shifts — locate by content):
  ```tsx
    soonEyebrow: string
    soonTitle: string
    soon: { icon: SoonKey; title: string; desc: string; badge: string }[]
  ```
  Replace with:
  ```tsx
    botTitle: string
    botSubtitle: string
    botTabs: { key: BotTabKey; label: string }[]
    botKaspi: { stat: string; statCaption: string; yourPriceLabel: string; yourPrice: string; competitorLabel: string; competitorPrice: string; statusText: string }
    botAgent: { stat: string; statCaption: string; incomingMessage: string; replyMessage: string; typingLabel: string }
  ```

- [ ] **Step 5: Replace `COPY.ru`'s `soonEyebrow`/`soonTitle`/`soon` with the new bot fields**

  Current (`src/app/page.tsx:295-300` before this task's earlier shifts):
  ```tsx
      soonEyebrow: 'В разработке',
      soonTitle: 'Скоро',
      soon: [
        { icon: 'store', title: 'Kaspi Bot', desc: 'Автоматическое управление ценами на Kaspi Магазине: демпинг-бот, заказы, финансы и прибыль магазина, аналитика ниш, цены по городам.', badge: 'Скоро для всех' },
        { icon: 'bot', title: 'AI-агент для Instagram', desc: 'Авто-ответы на комментарии и сообщения Direct от ИИ, обученного на вашем бизнесе.', badge: 'Скоро' },
      ],
  ```
  Replace with:
  ```tsx
      botTitle: 'Ещё два сотрудника, которым не нужна зарплата',
      botSubtitle: 'Kaspi Bot держит цены под контролем, AI-агент отвечает клиентам — 24/7, без вашего участия.',
      botTabs: [
        { key: 'kaspibot', label: 'Kaspi Bot' },
        { key: 'aiagent', label: 'AI-агент' },
      ],
      botKaspi: {
        stat: '10 мин',
        statCaption: 'между проверками цен конкурентов — Kaspi Bot держит вас на первой позиции без ручной работы',
        yourPriceLabel: 'Ваша цена',
        yourPrice: '15 000 ₸',
        competitorLabel: 'Конкурент',
        competitorPrice: '14 500 ₸ ↓',
        statusText: 'Проверка каждые 10 минут, без вашего участия',
      },
      botAgent: {
        stat: '5₸',
        statCaption: 'за автоответ клиенту в WhatsApp, Instagram, Telegram и на сайте',
        incomingMessage: 'Здравствуйте, работаете завтра?',
        replyMessage: 'Да, с 9:00 до 19:00 🙂',
        typingLabel: 'печатает',
      },
  ```

- [ ] **Step 6: Replace `COPY.kk`'s `soonEyebrow`/`soonTitle`/`soon` with the new bot fields**

  Current (`src/app/page.tsx:365-370` before this task's earlier shifts):
  ```tsx
      soonEyebrow: 'Әзірленуде',
      soonTitle: 'Жақында',
      soon: [
        { icon: 'store', title: 'Kaspi Bot', desc: 'Kaspi Дүкеніндегі бағаларды автоматты басқару: демпинг-бот, тапсырыстар, дүкен қаржысы мен пайдасы, ниша аналитикасы, қала бойынша бағалар.', badge: 'Жақында бәріне' },
        { icon: 'bot', title: 'Instagram үшін AI-агент', desc: 'Бизнесіңізге оқытылған ЖИ-ден пікірлер мен Direct хабарламаларына автоматты жауап.', badge: 'Жақында' },
      ],
  ```
  Replace with:
  ```tsx
      botTitle: 'Жалақы сұрамайтын тағы екі қызметкер',
      botSubtitle: 'Kaspi Bot бағаны бақылауда ұстайды, AI-агент клиенттерге жауап береді — 24/7, сіздің қатысуыңызсыз.',
      botTabs: [
        { key: 'kaspibot', label: 'Kaspi Bot' },
        { key: 'aiagent', label: 'AI-агент' },
      ],
      botKaspi: {
        stat: '10 мин',
        statCaption: 'бәсекелестердің бағасын тексеру аралығы — Kaspi Bot сізді қолмен әрекетсіз бірінші орында ұстайды',
        yourPriceLabel: 'Сіздің бағаңыз',
        yourPrice: '15 000 ₸',
        competitorLabel: 'Бәсекелес',
        competitorPrice: '14 500 ₸ ↓',
        statusText: 'Әр 10 минут сайын тексеріледі, сіздің қатысуыңызсыз',
      },
      botAgent: {
        stat: '5₸',
        statCaption: 'WhatsApp, Instagram, Telegram және сайттағы бір автожауап үшін',
        incomingMessage: 'Сәлеметсіз бе, ертең жұмыс істейсіздер ме?',
        replyMessage: 'Иә, 9:00-ден 19:00-ге дейін 🙂',
        typingLabel: 'жазып жатыр',
      },
  ```

- [ ] **Step 7: Replace `COPY.en`'s `soonEyebrow`/`soonTitle`/`soon` with the new bot fields**

  Current (`src/app/page.tsx:435-440` before this task's earlier shifts):
  ```tsx
      soonEyebrow: 'In progress',
      soonTitle: 'Coming soon',
      soon: [
        { icon: 'store', title: 'Kaspi Bot', desc: 'Automatic price management on Kaspi Shop: a price-matching bot, orders, store finances and profit, niche analytics, and per-city pricing.', badge: 'Coming soon for everyone' },
        { icon: 'bot', title: 'AI agent for Instagram', desc: 'Automatic replies to comments and Direct messages from an AI trained on your business.', badge: 'Coming soon' },
      ],
  ```
  Replace with:
  ```tsx
      botTitle: 'Two more employees who never ask for a salary',
      botSubtitle: 'Kaspi Bot keeps your prices in check, the AI agent replies to customers — 24/7, with no effort from you.',
      botTabs: [
        { key: 'kaspibot', label: 'Kaspi Bot' },
        { key: 'aiagent', label: 'AI Agent' },
      ],
      botKaspi: {
        stat: '10 min',
        statCaption: 'between competitor price checks — Kaspi Bot keeps you in first place with zero manual work',
        yourPriceLabel: 'Your price',
        yourPrice: '15 000 ₸',
        competitorLabel: 'Competitor',
        competitorPrice: '14 500 ₸ ↓',
        statusText: 'Checked every 10 minutes, with no effort from you',
      },
      botAgent: {
        stat: '5₸',
        statCaption: 'per automatic reply on WhatsApp, Instagram, Telegram, and your website',
        incomingMessage: 'Hi, are you open tomorrow?',
        replyMessage: 'Yes, from 9:00 AM to 7:00 PM 🙂',
        typingLabel: 'typing',
      },
  ```

- [ ] **Step 8: Replace the "soon" JSX section with a call to the new `BotShowcase` component**

  Current (`src/app/page.tsx:933-966` before this task's earlier shifts):
  ```tsx
        {/* --------------------------------------------------------- soon */}
        <section className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <Eyebrow color={COLOR.magenta}>{t.soonEyebrow}</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.7rem,3.4vw,2.25rem)] font-semibold tracking-[-0.02em]">{t.soonTitle}</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {t.soon.map((s, i) => {
              const SIcon = SOON_ICONS[s.icon]
              return (
                <Reveal key={s.title} delay={i * 0.05}>
                  <div
                    className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 flex h-full flex-col rounded-2xl p-6"
                    style={{ background: 'rgba(20,23,46,0.55)', border: `1px dashed ${border}` }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }}
                      >
                        <SIcon className="h-5 w-5" />
                      </div>
                      <span className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: COLOR.violet }}>
                        {s.badge}
                      </span>
                    </div>
                    <h3 className="mt-4 text-[16px] font-semibold">{s.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{s.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>
  ```
  Replace with:
  ```tsx
        {/* ---------------------------------------------- kaspi bot / ai agent */}
        <BotShowcase t={t} />
  ```

- [ ] **Step 9: Append the new `BotShowcase` component at the end of the file**

  After the final line of the file (the closing `}` of `AmbientBlobs`, currently line 1117), add the code below. It uses the `BotTabKey` type Step 3 already declared near the top of the file — do not redeclare it here, that would be a TypeScript "Duplicate identifier" error:
  ```tsx

  /* Replaces the old static "soon" placeholder cards for Kaspi Bot and the
     AI agent -- both are live products now, so this shows an honest demo
     instead of a "coming soon" badge. Tab switch uses framer-motion's
     AnimatePresence for a fade-swap (not the raw CSS @keyframes strings
     from the throwaway brainstorm mockup) so the whole file stays on one
     animation system. "10 min" is the product's real competitor-price
     check interval; the AI agent's price mirrors AI_AGENT_CREDIT_PRICE_TENGE
     from src/lib/aiAgent/wallet.ts -- both are real numbers, not marketing
     stats. The only looping animation is the functional status-pulse dot
     (motion-safe:animate-ping) -- no decorative infinite glow. */
  function BotShowcase({ t }: { t: Copy }) {
    const reduce = useReducedMotion()
    const [active, setActive] = useState<BotTabKey>('kaspibot')
    const [showReply, setShowReply] = useState(reduce ? true : false)

    useEffect(() => {
      if (active !== 'aiagent') return
      if (reduce) {
        setShowReply(true)
        return
      }
      setShowReply(false)
      const timer = setTimeout(() => setShowReply(true), 1400)
      return () => clearTimeout(timer)
    }, [active, reduce])

    return (
      <section id="bot-showcase" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="max-w-2xl">
          <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.botTitle}</h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.botSubtitle}</p>
        </Reveal>

        <Reveal delay={0.08} className="mt-8">
          <div
            className="inline-flex gap-2 rounded-2xl p-1.5"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}` }}
          >
            {t.botTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                aria-pressed={active === tab.key}
                className="flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  background: active === tab.key ? COLOR.violet : 'transparent',
                  color: active === tab.key ? '#fff' : 'rgba(255,255,255,0.68)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.14} className="mt-6">
          <div className="overflow-hidden rounded-3xl p-6 sm:p-10" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <AnimatePresence mode="wait">
              {active === 'kaspibot' ? (
                <motion.div
                  key="kaspibot"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                  className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center"
                >
                  <div>
                    <div className="text-[clamp(2.75rem,6vw,4rem)] font-bold tracking-tight" style={{ color: '#5EEAD4' }}>
                      {t.botKaspi.stat}
                    </div>
                    <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
                      {t.botKaspi.statCaption}
                    </p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between text-[13px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
                      <span>{t.botKaspi.yourPriceLabel}</span>
                      <span className="text-[15px] font-semibold text-white">{t.botKaspi.yourPrice}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[13px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
                      <span>{t.botKaspi.competitorLabel}</span>
                      <span className="text-[15px] font-semibold" style={{ color: COLOR.magenta }}>{t.botKaspi.competitorPrice}</span>
                    </div>
                    <div className="mt-5 flex items-center gap-2 border-t pt-4 text-[12px]" style={{ borderColor: BORDER, color: 'rgba(255,255,255,0.68)' }}>
                      <span className="relative flex h-2 w-2">
                        <span
                          className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full"
                          style={{ background: '#5EEAD4', opacity: 0.6 }}
                        />
                        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#5EEAD4' }} />
                      </span>
                      {t.botKaspi.statusText}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="aiagent"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                  className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center"
                >
                  <div>
                    <div className="text-[clamp(2.75rem,6vw,4rem)] font-bold tracking-tight" style={{ color: '#5EEAD4' }}>
                      {t.botAgent.stat}
                    </div>
                    <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
                      {t.botAgent.statCaption}
                    </p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
                    <div className="flex justify-start">
                      <div
                        className="max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px]"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' }}
                      >
                        {t.botAgent.incomingMessage}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      {showReply ? (
                        <div
                          className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px] text-white"
                          style={{ background: COLOR.violet }}
                        >
                          {t.botAgent.replyMessage}
                        </div>
                      ) : (
                        <div
                          role="status"
                          aria-label={t.botAgent.typingLabel}
                          className="flex items-center gap-1 rounded-2xl rounded-br-sm px-3.5 py-3"
                          style={{ background: COLOR.violet }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </section>
    )
  }
  ```

- [ ] **Step 10: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 11: Commit**
  ```
  git add src/app/page.tsx
  git commit -m "$(cat <<'EOF'
  feat(landing): replace soon section with live Kaspi Bot / AI-agent demo

  Kaspi Bot and the AI agent are both shipped products now, not
  "coming soon" placeholders -- swap the static dashed-border cards for
  a tabbed demo (framer-motion AnimatePresence fade-swap) showing the
  real 10-minute price-check interval and the real AI_AGENT_CREDIT_PRICE_TENGE
  reply cost.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Reformat the "features" section into an asymmetric list

**Files:**
- Modify: `src/app/page.tsx` — `Copy` interface, `featuresEyebrow`/`featuresTitle`/`featuresSubtitle`/`features` fields, originally lines 239-242, projected ~lines 213-216 after Task 1's edits (drop `featuresEyebrow`, add `href?: string` to `features`)
- Modify: `src/app/page.tsx` — `COPY.ru`'s `featuresEyebrow`..`features` block, originally lines 285-294, projected ~lines 261-270 (drop `featuresEyebrow`, edit the `'api'` item)
- Modify: `src/app/page.tsx` — `COPY.kk`'s equivalent block, originally lines 355-364, projected ~lines 347-356
- Modify: `src/app/page.tsx` — `COPY.en`'s equivalent block, originally lines 425-434, projected ~lines 433-442
- Modify: `src/app/page.tsx` — `HeroMockupCard`, originally lines 539-598, projected ~lines 559-618 (add `compact` prop)
- Modify: `src/app/page.tsx` — features JSX section, originally lines 893-931, projected ~lines 913-951
- Test: this project has no test suite for this file; verification is `npx tsc --noEmit` from the repo root plus a live dev-server visual check (top block text+mockup, bottom divided list, the 'api' row's link, no Eyebrow above the heading) — there is no test file to add.

**Interfaces:**
- Consumes: `Copy.features` (existing 5-item array, unchanged content order: invoice, kaspi, api, esign, contract — Task 2 slices this array by index, `slice(0,2)` and `slice(2)`), `FeatureKey`, `FEATURE_ICONS`, `COLOR.violet`/`COLOR.magenta`, existing `HeroMockupCard` component (modified in this same task), `Reveal`.
- Produces: `Copy['features'][number].href?: string` — an optional field set only on the `'api'` entry across all three languages, pointing at `/cashier-api`; `HeroMockupCard({ compact }: { compact?: boolean })` — a new optional prop, default `false`, used nowhere else in this plan but preserved for future reuse. `Copy.featuresEyebrow` is removed entirely (interface + all three `COPY` objects) since dropping the `<Eyebrow>` render in Step 6 would otherwise leave it as unused dead data. No later task in this plan consumes any of these.

- [ ] **Step 1: Drop `featuresEyebrow` from the `Copy` interface and add `href?: string` to `features`**

  Current (`src/app/page.tsx:239-242` before this task, after Task 1's shift):
  ```tsx
    featuresEyebrow: string
    featuresTitle: string
    featuresSubtitle: string
    features: { icon: FeatureKey; title: string; desc: string; badge?: string }[]
  ```
  Replace with:
  ```tsx
    featuresTitle: string
    featuresSubtitle: string
    features: { icon: FeatureKey; title: string; desc: string; badge?: string; href?: string }[]
  ```

- [ ] **Step 2: Update `COPY.ru` — drop `featuresEyebrow`, update the `'api'` feature item**

  Current (`src/app/page.tsx:285-294` before this task, after Task 1's shift):
  ```tsx
      featuresEyebrow: 'Возможности',
      featuresTitle: 'Главное, что вы получаете',
      featuresSubtitle: 'Реальные инструменты, которыми уже пользуется бизнес в Казахстане.',
      features: [
        { icon: 'invoice', title: 'Счета за 1 минуту', desc: 'Конструктор счетов, PDF с подписью и печатью, НДС, шаблоны. Отправка на email или публичной ссылкой, статусы оплат и история.' },
        { icon: 'kaspi', title: 'Оплата через Kaspi', desc: 'Платёжная ссылка и QR Kaspi Pay прямо в счёте. Платформа сама подтверждает оплату. Комиссия 2% — только с реально оплаченных счетов. Есть импорт выписки из Excel с автосопоставлением.' },
        { icon: 'api', title: 'Kaspi API и вебхуки', desc: 'Принимайте оплаты Kaspi на своём сайте: создание платежа по API, вебхук об оплате, документация — в разделе «Kaspi API».' },
        { icon: 'esign', title: 'ЭЦП-подписание', desc: 'Подписывайте счета и договоры ЭЦП через QR или eGov mobile (SIGEX) — юридически значимо, без визита в офис.', badge: 'Pro' },
        { icon: 'contract', title: 'Договоры', desc: 'Создавайте договоры и подписывайте их онлайн обеими сторонами — без бумаги и личных встреч.' },
      ],
  ```
  Replace with:
  ```tsx
      featuresTitle: 'Главное, что вы получаете',
      featuresSubtitle: 'Реальные инструменты, которыми уже пользуется бизнес в Казахстане.',
      features: [
        { icon: 'invoice', title: 'Счета за 1 минуту', desc: 'Конструктор счетов, PDF с подписью и печатью, НДС, шаблоны. Отправка на email или публичной ссылкой, статусы оплат и история.' },
        { icon: 'kaspi', title: 'Оплата через Kaspi', desc: 'Платёжная ссылка и QR Kaspi Pay прямо в счёте. Платформа сама подтверждает оплату. Комиссия 2% — только с реально оплаченных счетов. Есть импорт выписки из Excel с автосопоставлением.' },
        { icon: 'api', title: 'Kaspi API и вебхуки', desc: 'Принимайте оплаты Kaspi на своём сайте: создание платежа по API, вебхук об оплате, подробности и тарифы — на странице Cashier API.', href: '/cashier-api' },
        { icon: 'esign', title: 'ЭЦП-подписание', desc: 'Подписывайте счета и договоры ЭЦП через QR или eGov mobile (SIGEX) — юридически значимо, без визита в офис.', badge: 'Pro' },
        { icon: 'contract', title: 'Договоры', desc: 'Создавайте договоры и подписывайте их онлайн обеими сторонами — без бумаги и личных встреч.' },
      ],
  ```

- [ ] **Step 3: Update `COPY.kk` — drop `featuresEyebrow`, update the `'api'` feature item**

  Current (`src/app/page.tsx:355-364` before this task, after Task 1's shift):
  ```tsx
      featuresEyebrow: 'Мүмкіндіктер',
      featuresTitle: 'Сіз алатын негізгі нәрселер',
      featuresSubtitle: 'Қазақстандағы бизнес қазірдің өзінде пайдаланатын нақты құралдар.',
      features: [
        { icon: 'invoice', title: 'Бір минутта шот', desc: 'Шот конструкторы, қолтаңба мен мөрі бар PDF, ҚҚС, үлгілер. Email арқылы немесе жария сілтемемен жіберу, төлем мәртебелері мен тарихы.' },
        { icon: 'kaspi', title: 'Kaspi арқылы төлем', desc: 'Шоттың өзінде Kaspi Pay сілтемесі мен QR коды. Платформа төлемді өзі растайды. Комиссия 2% — тек нақты төленген шоттан. Excel үзінді-көшірмесін автоматты салыстырумен жүктеуге болады.' },
        { icon: 'api', title: 'Kaspi API және вебхук', desc: 'Kaspi төлемдерін өз сайтыңызда қабылдаңыз: API арқылы төлем жасау, төлем вебхугі, құжаттама — «Kaspi API» бөлімінде.' },
        { icon: 'esign', title: 'ЭЦҚ қолтаңба', desc: 'Шоттар мен келісімшарттарға QR немесе eGov mobile (SIGEX) арқылы ЭЦҚ қойыңыз — заңды күші бар, кеңсеге барудың қажеті жоқ.', badge: 'Pro' },
        { icon: 'contract', title: 'Келісімшарттар', desc: 'Келісімшарт жасаңыз және екі тарап та онлайн қол қойсын — қағазсыз, кездесусіз.' },
      ],
  ```
  Replace with:
  ```tsx
      featuresTitle: 'Сіз алатын негізгі нәрселер',
      featuresSubtitle: 'Қазақстандағы бизнес қазірдің өзінде пайдаланатын нақты құралдар.',
      features: [
        { icon: 'invoice', title: 'Бір минутта шот', desc: 'Шот конструкторы, қолтаңба мен мөрі бар PDF, ҚҚС, үлгілер. Email арқылы немесе жария сілтемемен жіберу, төлем мәртебелері мен тарихы.' },
        { icon: 'kaspi', title: 'Kaspi арқылы төлем', desc: 'Шоттың өзінде Kaspi Pay сілтемесі мен QR коды. Платформа төлемді өзі растайды. Комиссия 2% — тек нақты төленген шоттан. Excel үзінді-көшірмесін автоматты салыстырумен жүктеуге болады.' },
        { icon: 'api', title: 'Kaspi API және вебхук', desc: 'Kaspi төлемдерін өз сайтыңызда қабылдаңыз: API арқылы төлем жасау, төлем вебхугі, толық ақпарат пен тарифтер — Cashier API бетінде.', href: '/cashier-api' },
        { icon: 'esign', title: 'ЭЦҚ қолтаңба', desc: 'Шоттар мен келісімшарттарға QR немесе eGov mobile (SIGEX) арқылы ЭЦҚ қойыңыз — заңды күші бар, кеңсеге барудың қажеті жоқ.', badge: 'Pro' },
        { icon: 'contract', title: 'Келісімшарттар', desc: 'Келісімшарт жасаңыз және екі тарап та онлайн қол қойсын — қағазсыз, кездесусіз.' },
      ],
  ```

- [ ] **Step 4: Update `COPY.en` — drop `featuresEyebrow`, update the `'api'` feature item**

  Current (`src/app/page.tsx:425-434` before this task, after Task 1's shift):
  ```tsx
      featuresEyebrow: 'Features',
      featuresTitle: 'What you actually get',
      featuresSubtitle: 'Real tools that businesses in Kazakhstan already use.',
      features: [
        { icon: 'invoice', title: 'Invoices in 1 minute', desc: 'An invoice builder, PDF with your signature and stamp, VAT, templates. Send by email or a public link, track payment status and history.' },
        { icon: 'kaspi', title: 'Payment via Kaspi', desc: 'A Kaspi Pay link and QR code right inside the invoice. The platform confirms payment on its own. A 2% fee applies only to invoices actually paid via Kaspi. You can also import an Excel bank statement with automatic matching.' },
        { icon: 'api', title: 'Kaspi API & webhooks', desc: "Accept Kaspi payments on your own site: create a payment via the API, get a payment webhook, and read the docs — all in the platform's “Kaspi API” section." },
        { icon: 'esign', title: 'Digital signature', desc: 'Sign invoices and contracts with a digital signature via QR or eGov mobile (SIGEX) — legally binding, no office visit needed.', badge: 'Pro' },
        { icon: 'contract', title: 'Contracts', desc: 'Create contracts and have both parties sign them online — no paper, no meetings.' },
      ],
  ```
  Replace with:
  ```tsx
      featuresTitle: 'What you actually get',
      featuresSubtitle: 'Real tools that businesses in Kazakhstan already use.',
      features: [
        { icon: 'invoice', title: 'Invoices in 1 minute', desc: 'An invoice builder, PDF with your signature and stamp, VAT, templates. Send by email or a public link, track payment status and history.' },
        { icon: 'kaspi', title: 'Payment via Kaspi', desc: 'A Kaspi Pay link and QR code right inside the invoice. The platform confirms payment on its own. A 2% fee applies only to invoices actually paid via Kaspi. You can also import an Excel bank statement with automatic matching.' },
        { icon: 'api', title: 'Kaspi API & webhooks', desc: 'Accept Kaspi payments on your own site: create a payment via the API, get a payment webhook — full details and pricing are on the Cashier API page.', href: '/cashier-api' },
        { icon: 'esign', title: 'Digital signature', desc: 'Sign invoices and contracts with a digital signature via QR or eGov mobile (SIGEX) — legally binding, no office visit needed.', badge: 'Pro' },
        { icon: 'contract', title: 'Contracts', desc: 'Create contracts and have both parties sign them online — no paper, no meetings.' },
      ],
  ```

- [ ] **Step 5: Add a `compact` prop to `HeroMockupCard`**

  Current (`src/app/page.tsx`, originally lines 539-598, projected ~lines 559-618 after Task 1's shift and Steps 1-4 above each removing one `featuresEyebrow` line) — locate by content, the code itself is unchanged from the original file:
  ```tsx
  function HeroMockupCard() {
    const { lang } = useLanguage()
    const t = COPY[lang].mock
    const reduce = useReducedMotion()

    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
        className="relative mx-auto w-full max-w-md"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-16 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${COLOR.violet}33, transparent 72%)`, filter: 'blur(30px)' }}
        />
        <motion.div
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="relative overflow-hidden rounded-3xl text-left"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }}
        >
          <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.magenta, opacity: 0.7 }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.violet, opacity: 0.7 }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.teal, opacity: 0.7 }} />
            <span className="ml-2 truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
              {t.url}
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>{t.number}</div>
                <div className="mt-0.5 text-[16px] font-semibold">{t.client}</div>
              </div>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-white" style={{ background: COLOR.teal }}>
                {t.paid}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
              <div className="flex justify-between">
                <span>{t.service}</span>
                <span>150 000 ₸</span>
              </div>
              <div className="flex justify-between">
                <span>{t.vat}</span>
                <span>18 000 ₸</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: BORDER }}>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.total}</span>
              <span className="text-[20px] font-bold" style={{ color: COLOR.teal }}>168 000 ₸</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }
  ```
  Replace with:
  ```tsx
  function HeroMockupCard({ compact = false }: { compact?: boolean } = {}) {
    const { lang } = useLanguage()
    const t = COPY[lang].mock
    const reduce = useReducedMotion()

    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
        className={compact ? 'relative mx-auto w-full max-w-[260px]' : 'relative mx-auto w-full max-w-md'}
      >
        <div
          aria-hidden="true"
          className={compact ? 'pointer-events-none absolute -inset-8 rounded-full' : 'pointer-events-none absolute -inset-16 rounded-full'}
          style={{ background: `radial-gradient(closest-side, ${COLOR.violet}33, transparent 72%)`, filter: compact ? 'blur(18px)' : 'blur(30px)' }}
        />
        <motion.div
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="relative overflow-hidden rounded-3xl text-left"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }}
        >
          <div className={compact ? 'flex items-center gap-1.5 px-4 py-2.5' : 'flex items-center gap-2 px-5 py-3'} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.magenta, opacity: 0.7 }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.violet, opacity: 0.7 }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.teal, opacity: 0.7 }} />
            <span className="ml-2 truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
              {t.url}
            </span>
          </div>
          <div className={compact ? 'p-4' : 'p-5'}>
            <div className="flex items-start justify-between">
              <div>
                <div className={compact ? 'text-[10px]' : 'text-[11px]'} style={{ color: 'rgba(255,255,255,0.68)' }}>{t.number}</div>
                <div className={compact ? 'mt-0.5 text-[14px] font-semibold' : 'mt-0.5 text-[16px] font-semibold'}>{t.client}</div>
              </div>
              <span className={compact ? 'rounded-lg px-2 py-0.5 text-[9px] font-bold text-white' : 'rounded-lg px-2.5 py-1 text-[10px] font-bold text-white'} style={{ background: COLOR.teal }}>
                {t.paid}
              </span>
            </div>
            <div className={compact ? 'mt-3 space-y-1.5 text-[11px]' : 'mt-4 space-y-2 text-[12px]'} style={{ color: 'rgba(255,255,255,0.82)' }}>
              <div className="flex justify-between">
                <span>{t.service}</span>
                <span>150 000 ₸</span>
              </div>
              <div className="flex justify-between">
                <span>{t.vat}</span>
                <span>18 000 ₸</span>
              </div>
            </div>
            <div className={compact ? 'mt-3 flex items-center justify-between border-t pt-3' : 'mt-4 flex items-center justify-between border-t pt-4'} style={{ borderColor: BORDER }}>
              <span className={compact ? 'text-[11px]' : 'text-[12px]'} style={{ color: 'rgba(255,255,255,0.82)' }}>{t.total}</span>
              <span className={compact ? 'text-[17px] font-bold' : 'text-[20px] font-bold'} style={{ color: COLOR.teal }}>168 000 ₸</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }
  ```
  Note: the `= {}` default on the destructured parameter is required — `<HeroMockupCard />` is already called with zero arguments elsewhere in this file (the `Spline3D` lazy-load fallback and `SplineErrorBoundary`'s fallback), and destructuring `{ compact = false }` from an `undefined` argument throws at runtime without it.

- [ ] **Step 6: Replace the "features" JSX section with the asymmetric layout**

  Current (`src/app/page.tsx`, originally lines 893-931, projected ~lines 913-951 after Task 1's shift and Steps 1-5 above) — locate by content, the code itself is unchanged from the original file:
  ```tsx
        {/* ------------------------------------------------------ features */}
        <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="max-w-xl">
            <Eyebrow color={COLOR.violet}>{t.featuresEyebrow}</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.featuresTitle}</h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.featuresSubtitle}</p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.map((f, i) => {
              const FIcon = FEATURE_ICONS[f.icon]
              return (
                <Reveal key={f.title} delay={Math.min(i * 0.045, 0.27)}>
                  <div
                    className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 relative h-full rounded-2xl p-6"
                    style={{ background: surface, border: `1px solid ${border}` }}
                  >
                    {f.badge && (
                      <span
                        className="absolute right-5 top-5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ background: COLOR.magenta }}
                      >
                        {f.badge}
                      </span>
                    )}
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(122,108,240,0.16)', color: COLOR.violet }}
                    >
                      <FIcon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{f.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>
  ```
  Replace with:
  ```tsx
        {/* ------------------------------------------------------ features */}
        <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="max-w-xl">
            <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.featuresTitle}</h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.featuresSubtitle}</p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
            <div className="space-y-8">
              {t.features.slice(0, 2).map((f, i) => {
                const FIcon = FEATURE_ICONS[f.icon]
                return (
                  <Reveal key={f.title} delay={i * 0.06} className="flex gap-4">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(122,108,240,0.16)', color: COLOR.violet }}
                    >
                      <FIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[18px] font-semibold">{f.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{f.desc}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>

            <Reveal delay={0.12}>
              <HeroMockupCard compact />
            </Reveal>
          </div>

          <div className="mt-14 border-t sm:mt-16" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            {t.features.slice(2).map((f, i) => {
              const FIcon = FEATURE_ICONS[f.icon]
              return (
                <Reveal key={f.title} delay={i * 0.05}>
                  <div className="flex items-start gap-4 border-b py-5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'rgba(122,108,240,0.12)', color: COLOR.violet }}
                    >
                      <FIcon className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold">
                          {f.href ? (
                            <a
                              href={f.href}
                              className="underline decoration-1 underline-offset-2 transition-opacity hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {f.title}
                            </a>
                          ) : (
                            f.title
                          )}
                        </h3>
                        {f.badge && (
                          <span
                            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ background: COLOR.magenta }}
                          >
                            {f.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{f.desc}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>
  ```

- [ ] **Step 7: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 8: Commit**
  ```
  git add src/app/page.tsx
  git commit -m "$(cat <<'EOF'
  feat(landing): reformat features into asymmetric list, link Kaspi API to Cashier API

  Swap the templated 3-column feature card grid for the spec's
  asymmetric layout (Invoices + Kaspi payment as a combined top block
  with a shrunk invoice mockup, Kaspi API/e-signature/Contracts as a
  compact divided list below) and drop the Eyebrow kicker the design
  system now bans. The Kaspi API item's description now points at the
  new Cashier API page instead of the vague "Kaspi API section" text.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Add a Cashier API footer link

**Files:**
- Modify: `src/app/page.tsx` — `COPY.ru.footerLinks`, originally lines 319-323, projected ~lines 309-313 after Tasks 1-2
- Modify: `src/app/page.tsx` — `COPY.kk.footerLinks`, originally lines 389-393, projected ~lines 394-398
- Modify: `src/app/page.tsx` — `COPY.en.footerLinks`, originally lines 459-463, projected ~lines 479-483
- Test: this project has no test suite for this file; verification is `npx tsc --noEmit` from the repo root plus a live dev-server visual check (the footer nav now shows 4 links in each language and the new one is a working link to `/cashier-api`) — there is no test file to add. The footer's render loop (`{t.footerLinks.map((l) => (...))}`) is already generic over array length, so no JSX change is needed in this task.

**Interfaces:**
- Consumes: existing `Copy.footerLinks: { label: string; href: string }[]` type (unchanged — the new entry fits the existing shape, no type edit needed) and the existing footer `<nav>` render loop (unchanged).
- Produces: a 4th `{ label, href: '/cashier-api' }` entry per language. Nothing downstream in this plan consumes it.

- [ ] **Step 1: Add the Cashier API link to `COPY.ru.footerLinks`**

  Current (`src/app/page.tsx`, originally lines 319-323, projected ~lines 309-313 after Tasks 1-2) — locate by content, the code itself is unchanged from the original file:
  ```tsx
      footerLinks: [
        { label: 'Политика', href: '/privacy' },
        { label: 'Условия', href: '/terms' },
        { label: 'Удаление данных', href: '/data-deletion' },
      ],
  ```
  Replace with:
  ```tsx
      footerLinks: [
        { label: 'Политика', href: '/privacy' },
        { label: 'Условия', href: '/terms' },
        { label: 'Удаление данных', href: '/data-deletion' },
        { label: 'Для разработчиков → Cashier API', href: '/cashier-api' },
      ],
  ```

- [ ] **Step 2: Add the Cashier API link to `COPY.kk.footerLinks`**

  Current (`src/app/page.tsx`, originally lines 389-393, projected ~lines 394-398 after Tasks 1-2) — locate by content, the code itself is unchanged from the original file:
  ```tsx
      footerLinks: [
        { label: 'Құпиялылық', href: '/privacy' },
        { label: 'Шарттар', href: '/terms' },
        { label: 'Деректерді жою', href: '/data-deletion' },
      ],
  ```
  Replace with:
  ```tsx
      footerLinks: [
        { label: 'Құпиялылық', href: '/privacy' },
        { label: 'Шарттар', href: '/terms' },
        { label: 'Деректерді жою', href: '/data-deletion' },
        { label: 'Әзірлеушілерге → Cashier API', href: '/cashier-api' },
      ],
  ```

- [ ] **Step 3: Add the Cashier API link to `COPY.en.footerLinks`**

  Current (`src/app/page.tsx`, originally lines 459-463, projected ~lines 479-483 after Tasks 1-2) — locate by content, the code itself is unchanged from the original file:
  ```tsx
      footerLinks: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Data Deletion', href: '/data-deletion' },
      ],
  ```
  Replace with:
  ```tsx
      footerLinks: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Data Deletion', href: '/data-deletion' },
        { label: 'For Developers → Cashier API', href: '/cashier-api' },
      ],
  ```

- [ ] **Step 4: Run `npx tsc --noEmit` from the repo root and confirm zero new errors**

- [ ] **Step 5: Commit**
  ```
  git add src/app/page.tsx
  git commit -m "$(cat <<'EOF'
  feat(landing): add Cashier API footer link

  Add a plain fourth footer link pointing developers at the new
  Cashier API page, in all three languages -- no badge, no separate
  section, matching the existing footer link style.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```
