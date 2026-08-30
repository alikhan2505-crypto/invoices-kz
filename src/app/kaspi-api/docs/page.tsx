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
