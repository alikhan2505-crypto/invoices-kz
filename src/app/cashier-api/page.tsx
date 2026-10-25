'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { FOOTER_COPY } from '@/lib/i18n/productsHub'
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
  docTitle: string
  navCta: string
  // Короткая подпись той же кнопки для телефона: на 360px в шапке рядом
  // с логотипом и тумблером RU/KZ/EN полная фраза не помещается.
  navCtaShort: string
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
  pricingExamples: FeatureRow[]
  featuresEyebrow: string
  featuresTitle: string
  features: FeatureRow[]
  featuresFootnote: string
  finalCtaTitle: string
  finalCtaButton: string
  footerDocsLabel: string
}

// Реквизиты и подписи ссылок на документы в футере — из FOOTER_COPY
// (src/lib/i18n/productsHub.ts), общего с хабом invoices.kz, не дублируем.
const COPY: Record<Lang, Copy> = {
  ru: {
    docTitle: 'Kaspi Cashier API — приём Kaspi Pay на вашем сайте | invoices.kz',
    navCta: 'Получить доступ к API',
    navCtaShort: 'API-доступ',
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
      { title: 'Получите вебхук', desc: 'Уведомление на ваш callback_url — при вашей проверке статуса или ежедневной сверке.' },
    ],
    pricingEyebrow: 'Цена',
    pricingCaption: 'с суммы каждого оплаченного платежа. Ничего — если платежа не было.',
    pricingUsLabel: 'invoices.kz Kaspi Cashier API',
    pricingUsValue: '2% с оплаченного, без абонплаты и минимального оборота',
    pricingExamples: [
      { label: '50 оплаченных счетов по 3 000 ₸', value: '× 2% = 3 000 ₸' },
      { label: '300 оплаченных счетов по 2 000 ₸', value: '× 2% = 12 000 ₸' },
    ],
    featuresEyebrow: 'Возможности',
    featuresTitle: 'Что входит в API',
    features: [
      { label: 'Создание платежа', value: 'POST /api/kaspi/pay' },
      { label: 'QR-код и платёжная ссылка', value: 'payment_link, qr_token' },
      { label: 'Вебхук об оплате', value: 'callback_url' },
      { label: 'Проверка статуса', value: 'GET /api/kaspi/pay/status' },
    ],
    featuresFootnote: 'Ссылка payment_link открывается в приложении Kaspi и работает только у клиентов Kaspi.kz. По данным Kaspi, оплата QR из приложений других банков не гарантируется: она зависит от вида деятельности продавца.',
    finalCtaTitle: 'Готовы принимать Kaspi Pay?',
    finalCtaButton: 'Получить доступ к API',
    footerDocsLabel: 'Документация API',
  },
  kk: {
    docTitle: 'Kaspi Cashier API — сайтыңызда Kaspi Pay қабылдау | invoices.kz',
    navCta: 'API-ға қол жеткізу',
    navCtaShort: 'API алу',
    heroTitle: 'Сайтыңыздағы Kaspi Pay — үш сұраныс, банкпен интеграциясыз',
    heroSubtitle: 'Төлем құру, QR-сілтеме және төлем туралы вебхук. Төленген сомадан 2% — абоненттік төлемсіз және ең аз айналым талабынсыз.',
    heroPrimaryCta: 'API-ға қол жеткізу',
    heroSecondaryCta: 'Құжаттаманы қарау',
    codeResponseLabel: 'Жауап',
    stepsEyebrow: 'Қалай қосылады',
    stepsTitle: 'Алғашқы төлемге дейін төрт қадам',
    steps: [
      { title: 'Cashier-ді қосыңыз', desc: 'Телефон нөмірі + SMS-код, Kaspi Pay қосымшасындағыдай.' },
      { title: 'Токен алыңыз', desc: 'API-токен мен вебхук құпиясы — бір рет қана көрсетіледі.' },
      { title: 'API-ды шақырыңыз', desc: 'POST /api/kaspi/pay — сілтеме мен QR аласыз.' },
      { title: 'Вебхук қабылдаңыз', desc: 'Хабарлама callback_url мекенжайыңызға келеді — мәртебені өзіңіз тексергенде немесе күнделікті салыстыру кезінде.' },
    ],
    pricingEyebrow: 'Баға',
    pricingCaption: 'әр төленген төлем сомасынан. Төлем болмаса — ештеңе алынбайды.',
    pricingUsLabel: 'invoices.kz Kaspi Cashier API',
    pricingUsValue: 'Төленген сомадан 2%, абоненттік төлемсіз және ең аз айналым талабынсыз',
    pricingExamples: [
      { label: '3 000 ₸-ден төленген 50 шот', value: '× 2% = 3 000 ₸' },
      { label: '2 000 ₸-ден төленген 300 шот', value: '× 2% = 12 000 ₸' },
    ],
    featuresEyebrow: 'Мүмкіндіктер',
    featuresTitle: 'API-ға не кіреді',
    features: [
      { label: 'Төлем құру', value: 'POST /api/kaspi/pay' },
      { label: 'QR-код және төлем сілтемесі', value: 'payment_link, qr_token' },
      { label: 'Төлем туралы вебхук', value: 'callback_url' },
      { label: 'Мәртебені тексеру', value: 'GET /api/kaspi/pay/status' },
    ],
    // kk: awaiting native proofreading
    featuresFootnote: 'payment_link сілтемесі Kaspi қосымшасында ашылады және тек Kaspi.kz клиенттерінде жұмыс істейді. Kaspi деректері бойынша, QR-ды басқа банктердің қосымшаларымен төлеуге кепілдік берілмейді: бұл сатушының қызмет түріне байланысты.',
    finalCtaTitle: 'Kaspi Pay қабылдауға дайынсыз ба?',
    finalCtaButton: 'API-ға қол жеткізу',
    footerDocsLabel: 'API құжаттамасы',
  },
  en: {
    docTitle: 'Kaspi Cashier API — accept Kaspi Pay on your site | invoices.kz',
    navCta: 'Get API access',
    navCtaShort: 'Get API',
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
      { title: 'Receive the webhook', desc: 'A notification to your callback_url — on your status check or the daily reconciliation.' },
    ],
    pricingEyebrow: 'Pricing',
    pricingCaption: 'of the amount of every payment actually paid. Nothing if there was no payment.',
    pricingUsLabel: 'invoices.kz Kaspi Cashier API',
    pricingUsValue: '2% of what is paid, no subscription, no minimum volume',
    pricingExamples: [
      { label: '50 paid invoices of ₸3,000', value: '× 2% = ₸3,000' },
      { label: '300 paid invoices of ₸2,000', value: '× 2% = ₸12,000' },
    ],
    featuresEyebrow: 'Capabilities',
    featuresTitle: "What's in the API",
    features: [
      { label: 'Create a payment', value: 'POST /api/kaspi/pay' },
      { label: 'QR code and payment link', value: 'payment_link, qr_token' },
      { label: 'Payment webhook', value: 'callback_url' },
      { label: 'Status check', value: 'GET /api/kaspi/pay/status' },
    ],
    featuresFootnote: "The payment_link opens in the Kaspi app and works only for Kaspi.kz clients. Per Kaspi, paying the QR from other banks' apps is not guaranteed: it depends on the seller's line of business.",
    finalCtaTitle: 'Ready to accept Kaspi Pay?',
    finalCtaButton: 'Get API access',
    footerDocsLabel: 'API documentation',
  },
}

// Manual token coloring via <span> -- no syntax-highlighting library, per
// the design spec's "простой <pre> с ручной раскраской токенов через
// <span>". Colors are restricted to the three approved text tones
// (text/muted/accent) so no new hex value is introduced for code display.
type Tok = { text: string; tone?: 'accent' | 'muted' }
type CodeLine = Tok[]

const CURL_LINES: CodeLine[] = [
  [{ text: 'curl -X ', tone: 'muted' }, { text: 'POST', tone: 'accent' }, { text: ' https://api.invoices.kz/api/kaspi/pay \\' }],
  [{ text: '  -H "Authorization: Bearer YOUR_API_TOKEN" \\', tone: 'muted' }],
  [{ text: '  -H "Content-Type: application/json" \\', tone: 'muted' }],
  [{ text: "  -d '{" }, { text: '"amount"', tone: 'accent' }, { text: ': 10000, ' }, { text: '"order_id"', tone: 'accent' }, { text: `: "order_12345"}'` }],
]

const JAVASCRIPT_LINES: CodeLine[] = [
  [{ text: 'const', tone: 'accent' }, { text: ' res = ' }, { text: 'await', tone: 'accent' }, { text: " fetch('https://api.invoices.kz/api/kaspi/pay', {" }],
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
  [{ text: '    "https://api.invoices.kz/api/kaspi/pay",' }],
  [{ text: '    headers={"Authorization": "Bearer YOUR_API_TOKEN"},' }],
  [{ text: '    json={"amount": 10000, "order_id": "order_12345"},' }],
  [{ text: ')' }],
  [{ text: 'data = response.json()' }],
]

const RESPONSE_LINES: CodeLine[] = [
  [{ text: '{' }],
  [{ text: '  "payment_link"', tone: 'accent' }, { text: ': "https://pay.kaspi.kz/pay/...",' }],
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
            ' '
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
  const t = COPY[lang]
  const f = FOOTER_COPY[lang]

  // Серверный <title> из layout.tsx один (ru); на клиенте — по выбранному языку.
  useEffect(() => { document.title = t.docTitle }, [t.docTitle])

  const goLogin = () => router.push('/login')
  const goDocs = () => router.push('/kaspi-api/docs')

  return (
    <div className="min-h-screen" style={{ background: C.bg0, color: C.text, fontFamily: FONT_SANS }}>
      <header className="sticky top-0 z-20" style={{ background: 'rgba(10,12,16,0.92)', borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="/" className="flex min-h-11 items-center text-[14px] font-bold tracking-[0.08em]" style={{ color: C.text }}>
            invoices<span style={{ color: C.accent }}>.kz</span>
          </a>
          {/* Тумблер языка — слева от кнопки входа (правило основателя).
              На телефоне (<sm) всё ужато: кнопки языка 36px шириной (высота
              по-прежнему 44px), короткая подпись CTA — иначе логотип +
              RU/KZ/EN + CTA не помещаются в 360px. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div role="group" aria-label="Language / Тіл / Язык" className="flex overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              {(['ru', 'kk', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="min-h-11 min-w-9 px-1.5 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-w-11 sm:px-2"
                  style={{ background: lang === l ? C.bg2 : 'transparent', color: lang === l ? C.accent : C.muted }}
                  aria-pressed={lang === l}
                  lang={l}
                >
                  {l === 'kk' ? 'KZ' : l}
                </button>
              ))}
            </div>
            <button
              onClick={goLogin}
              className="min-h-11 whitespace-nowrap motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] rounded-lg px-3 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4"
              style={{ background: C.button }}
            >
              <span className="sm:hidden">{t.navCtaShort}</span>
              <span className="hidden sm:inline">{t.navCta}</span>
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
              {t.pricingExamples.map((ex) => (
                <div
                  key={ex.label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3"
                  style={{ border: `1px solid ${C.border}` }}
                >
                  <span className="text-[13.5px]" style={{ color: C.muted }}>{ex.label}</span>
                  <span className="text-[13px]" style={{ color: C.text, fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>{ex.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8" style={{ borderTop: `1px solid ${C.border}` }}>
          <Eyebrow>{t.featuresEyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.01em]">{t.featuresTitle}</h2>
          <div className="mt-8">
            {t.features.map((feat, i) => (
              <div
                key={feat.label}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
                style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}
              >
                <span className="text-[14px] font-medium">{feat.label}</span>
                <span className="text-[13px]" style={{ color: C.accent, fontFamily: FONT_MONO }}>{feat.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-prose text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{t.featuresFootnote}</p>
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
        {/* Документы и контакты — как в футере хаба invoices.kz. Страницы
            политик живут только на apex, поэтому ссылки абсолютные: с
            api.invoices.kz относительный /privacy увёл бы не туда. */}
        <nav className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1" aria-label="Documents and contacts">
          {[
            { href: 'https://invoices.kz/privacy', label: f.privacy },
            { href: 'https://invoices.kz/terms', label: f.terms },
            { href: 'https://invoices.kz/data-deletion', label: f.dataDeletion },
            { href: 'mailto:mail@invoices.kz', label: `${f.contacts}: mail@invoices.kz` },
          ].map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-9 items-center text-[12px]" style={{ color: C.muted }}>
              {link.label}
            </a>
          ))}
          <a
            href="https://www.instagram.com/invoices.kz/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-9 items-center text-[12px]"
            style={{ color: C.muted }}
          >
            Instagram
          </a>
        </nav>
        <div className="mt-4 text-center text-[11px]" style={{ color: C.muted }}>© 2026 INVOICES.KZ · {f.company}</div>
      </footer>
    </div>
  )
}
