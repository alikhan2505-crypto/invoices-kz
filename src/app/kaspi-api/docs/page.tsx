'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import ApiDocsViewer from '@/components/ApiDocsViewer'
import { CASHIER_API_COLOR as C, CASHIER_API_FONT_SANS as FONT_SANS, CASHIER_API_FONT_MONO as FONT_MONO } from '@/lib/kaspiCashierApi/theme'

interface DocsCopy {
  loading: string
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
    title: 'Kaspi Cashier API — документация',
    liveWarning: 'Все запросы «Try it» ниже выполняются к реальному продакшн-API — у Kaspi Pay нет тестового режима. Успешный вызов создания платежа спишет комиссию 2% с вашего баланса при оплате.',
    i18nNote: 'Часть элементов интерфейса самого проводника (например, кнопки Authorize и Send Request) отображается на английском независимо от выбранного языка — это ограничение библиотеки Scalar, не наших переводов.',
    webhookTitle: 'Вебхуки (webhook)',
    webhookIntro: 'Если при создании платежа указан callback_url (только https://, не localhost и не приватная сеть), invoices.kz отправит на него POST-запрос в момент, когда оплата подтверждается — то есть при вашем вызове GET /api/kaspi/pay/status или при ежедневной внутренней сверке. Вебхук — не единственный и не мгновенный сигнал: если важна скорость, опрашивайте статус-эндпоинт сами.',
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
    title: 'Kaspi Cashier API — documentation',
    liveWarning: 'Every "Try it" request below hits the real production API — Kaspi Pay has no test/sandbox mode. A successful payment-creation call will debit a 2% commission from your balance once the customer pays.',
    i18nNote: "Some of the reference tool's own interface labels (e.g. the Authorize and Send Request buttons) stay in English regardless of the selected language — that's a limitation of the Scalar library itself, not of our translations.",
    webhookTitle: 'Webhooks',
    webhookIntro: 'If a callback_url was provided when creating the payment (https:// only — never localhost or a private network), invoices.kz sends a POST request to it at the moment the payment gets confirmed — that is, when you call GET /api/kaspi/pay/status yourself, or during the daily internal reconciliation. The webhook is neither the only nor an instant signal: if speed matters, poll the status endpoint yourself.',
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
    // getSession() first: a local, no-network check. If it already finds a
    // session, render immediately instead of waiting on a round trip -- this
    // is what the founder's «Документация API» click needed: hitting this
    // guard right after arriving from a fresh /login redirect used to lose a
    // beat here and occasionally lands with a stale in-memory client before
    // getUser() alone would resolve. getUser() below is still awaited and
    // remains the sole authority on whether to redirect -- a session existing
    // locally never skips it, so a genuinely dead/revoked session still gets
    // caught and sent to /login exactly as before.
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setLoading(false)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Remember where the user was trying to go so /login (or
      // /auth/callback, for the OAuth/magic-link paths) can send them back
      // here instead of defaulting to /dashboard -- see
      // src/lib/postLoginRedirect.ts.
      setPostLoginRedirect('/kaspi-api/docs')
      router.push('/login')
      return
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        {/* cashier-dev-theme (see globals.css): same dark developer palette
            as /kaspi-api's Connection tab -- only this inner content area
            goes dark, DesktopShell's card and SiteNav's menu strip above
            keep the normal light app chrome. */}
        <div className="cashier-dev-theme flex min-h-screen items-center justify-center lg:min-h-full" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', fontFamily: FONT_SANS }}>
          {d.loading}
        </div>
      </main>
      </DesktopShell>
    )
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      {/* cashier-dev-theme (see globals.css): scopes --nav-* to the dark
          developer palette shared with /kaspi-api's Connection tab and the
          public /cashier-api landing, so both pages under the
          «Подключение | Документация API» menu strip above (rendered by
          SiteNav, outside this dark wrapper) read as one product. Replaces
          this page's old standalone header (own back-link, own sticky bar)
          now that SiteNav provides the app chrome and the section tabs. */}
      <div className="cashier-dev-theme min-h-screen lg:min-h-full" style={{ background: 'var(--nav-bg)', color: C.text, fontFamily: FONT_SANS }}>
        {/* RU/EN toggle + the Scalar-limitation caption that used to live in
            the standalone header's sticky bar. setLang is the app-wide
            language (LanguageProvider) -- now that this page renders inside
            SiteNav, switching it here also updates the menu labels, which is
            the point: this is a normal in-app page, not an isolated surface
            anymore. */}
        <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px]" style={{ color: C.muted, fontFamily: FONT_MONO }}>
              {d.title}
            </span>
            <div className="flex overflow-hidden rounded-lg flex-shrink-0" style={{ border: `1px solid ${C.border}` }}>
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
          <p className="mt-2 text-[11px]" style={{ color: C.muted }}>
            {d.i18nNote}
          </p>
        </div>

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
    </main>
    </DesktopShell>
  )
}
