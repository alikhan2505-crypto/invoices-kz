'use client'
import { useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { motion } from 'framer-motion'
import { track } from '@vercel/analytics'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { useLanguage } from '@/components/LanguageProvider'
import { formatIsoDate, formatTenge, toolGuidePath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { useToolSession } from '@/lib/tools-i18n/useToolSession'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { useToolLimitEvent, useToolView } from '@/lib/tools-i18n/useToolEvents'
import type { ToolEventMedium } from '@/lib/toolEvents/schema'
import { anonymousToolHref, signedInToolHref } from '@/lib/tools-i18n/signedInDestination'
import { kontragentDict } from './dict'

// Один и тот же инструмент для /tools/kontragent, /tools/kk/kontragent и
// /tools/en/kontragent: язык приходит пропсом из page.tsx (то есть из адреса),
// а не из куки посетителя — см. docs/tools-i18n-pattern.md.

const EASE = [0.16, 1, 0.3, 1] as const

// Гайд «Как проверить контрагента по БИН»: ru и kk есть, английского нет (en → русский).
const GUIDE_SLUG = 'proverka-kontragenta'

// Публичный срез ответа /api/tools/kontragent — без адреса, руководителя и
// ОКЭД: они остаются за регистрацией, роут отдаёт только hasFullCard.
interface PublicCompany {
  bin: string
  name: string
  status: string | null
  registeredAt: string | null
  source: 'egov' | 'kgd'
  isVatPayer: boolean | null
  vatRegisteredAt: string | null
  isUnreliable: boolean | null
  isLiquidating: boolean | null
  totalArrear: number | null
  taxArrear: number | null
  hasFullCard: boolean
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'limit' }
  | { kind: 'busy' }
  | { kind: 'notFound'; remaining: number | null }
  | { kind: 'found'; company: PublicCompany; remaining: number | null }

// Тройственность каждого вердикта (чисто / проблема / не удалось проверить)
// сохраняется до экрана: молчание из-за упавшего запроса никогда не должно
// читаться как «контрагент в порядке» — то же правило, что во внутренней
// проверке на /create.
function Verdict({ ok, label, okText, badText, unknownText }: {
  ok: boolean | null
  label: string
  okText: string
  badText: string
  unknownText: string
}) {
  const color = ok === null ? 'var(--nav-text-muted)' : ok ? 'var(--nav-success)' : 'var(--nav-critical)'
  const icon = ok === null ? '?' : ok ? '✓' : '!'
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
        style={{ background: color, color: '#fff' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{label}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>
          {ok === null ? unknownText : ok ? okText : badText}
        </div>
      </div>
    </div>
  )
}

export default function KontragentTool({ lang }: { lang: ToolLang }) {
  const t = kontragentDict[lang]
  const chrome = TOOL_CHROME[lang]
  // Вошедшему блок лимита и «полная карточка» ведут в кабинет (проверка по
  // БИН — поле клиента в /create), а не на /login (15.10.2026).
  const { signedIn } = useToolSession()
  const { setLang } = useLanguage()
  const [bin, setBin] = useState('')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const valid = isValidBin(bin)
  useToolView('kontragent', lang)
  useToolLimitEvent('kontragent', lang, outcome.kind === 'limit')

  const check = async () => {
    if (!valid || outcome.kind === 'loading') return
    setOutcome({ kind: 'loading' })
    track('tool_kontragent_check', { lang })
    try {
      const res = await fetch('/api/tools/kontragent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin: normalizeBin(bin) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        if (data?.error === 'busy') { setOutcome({ kind: 'busy' }); return }
        track('tool_kontragent_limit', { lang })
        setOutcome({ kind: 'limit' })
        return
      }
      if (!res.ok) {
        // Роут отвечает текстом ошибки по-русски; на ru показываем его как
        // есть (как раньше), на kk/en — свой перевод по коду ответа.
        const serverText = typeof data?.error === 'string' && data.error !== 'limit' ? data.error : null
        const message = lang === 'ru' && serverText
          ? serverText
          : res.status === 400 ? t.errInvalidBin
          : res.status === 503 ? t.errUnavailable
          : t.errGeneric
        setOutcome({ kind: 'error', message })
        return
      }
      const remaining = typeof data?.remaining === 'number' ? data.remaining : null
      // Проверка прошла и результат показан (найдена или «не найдена») — это и есть «документ» инструмента.
      logToolEvent('doc', 'kontragent', { lang })
      if (!data?.found) { setOutcome({ kind: 'notFound', remaining }); return }
      setOutcome({ kind: 'found', company: data.company as PublicCompany, remaining })
    } catch {
      setOutcome({ kind: 'error', message: t.errNetwork })
    }
  }

  const remaining = outcome.kind === 'found' || outcome.kind === 'notFound' ? outcome.remaining : null

  // Клик в регистрацию запоминает язык страницы — /login откроется на нём же.
  const signupClick = (event: string, medium: ToolEventMedium) => () => {
    setLang(lang); track(event, { lang, signedIn })
    logToolEvent('cta', 'kontragent', { lang, medium })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch slug="kontragent" lang={lang} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          {t.intro}
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <label htmlFor="bin" className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--nav-text-muted)' }}>
            {t.binLabel}
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              id="bin"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t.binPlaceholder}
              value={bin}
              onChange={e => setBin(normalizeBin(e.target.value).slice(0, 12))}
              onKeyDown={e => { if (e.key === 'Enter') check() }}
              className="flex-1 min-w-[200px] rounded-xl px-4 py-3 text-base font-mono tracking-wider outline-none"
              style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}
            />
            <button
              onClick={check}
              disabled={!valid || outcome.kind === 'loading'}
              className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              {outcome.kind === 'loading' ? t.checking : t.check}
            </button>
          </div>
          {remaining !== null && (
            <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
              {t.remaining(remaining)}
            </div>
          )}
        </div>

        <div aria-live="polite">
          {outcome.kind === 'error' && (
            <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{outcome.message}</div>
          )}

          {outcome.kind === 'busy' && (
            <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.busy}
            </div>
          )}

          {outcome.kind === 'notFound' && (
            <div className="nav-glass rounded-2xl p-5 mb-4">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.notFoundTitle}</div>
              <p className="text-[13px]" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.notFoundBody}
              </p>
            </div>
          )}

          {outcome.kind === 'limit' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
              className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
              <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
                {t.limitTitle}
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
                {signedIn ? t.limitBodySignedIn : t.limitBody}
              </p>
              <a
                href={signedIn ? signedInToolHref('kontragent', 'limit') : anonymousToolHref('kontragent', 'limit')}
                onClick={signupClick('tool_kontragent_signup_click', 'limit')}
                className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {signedIn ? chrome.ctaSignedInButton : t.limitButton}
              </a>
            </motion.div>
          )}

          {outcome.kind === 'found' && (() => {
            const c = outcome.company
            const registeredAt = formatIsoDate(c.registeredAt)
            const vatSince = formatIsoDate(c.vatRegisteredAt)
            const hasDebt = c.totalArrear !== null && c.totalArrear > 0
            const taxPart = hasDebt && c.taxArrear !== null && c.taxArrear !== c.totalArrear ? formatTenge(c.taxArrear) : null
            return (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
                className="nav-glass rounded-2xl p-5 mb-4">
                <div className="mb-3">
                  <div className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>{c.name}</div>
                  <div className="text-[13px] mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
                    {t.binPrefix} {c.bin}
                    {c.status ? ` · ${t.status(c.status)}` : ''}
                    {registeredAt ? ` · ${t.registered(registeredAt)}` : ''}
                  </div>
                  {c.source === 'kgd' && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.kgdNote}
                    </div>
                  )}
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
                  <Verdict
                    ok={c.isUnreliable === null ? null : !c.isUnreliable}
                    label={t.unreliable.label}
                    okText={t.unreliable.ok}
                    badText={t.unreliable.bad}
                    unknownText={t.unknown}
                  />
                  <Verdict
                    ok={c.isLiquidating === null ? null : !c.isLiquidating}
                    label={t.liquidation.label}
                    okText={t.liquidation.ok}
                    badText={t.liquidation.bad}
                    unknownText={t.unknown}
                  />
                  <Verdict
                    ok={c.totalArrear === null ? null : c.totalArrear <= 0}
                    label={t.arrear.label}
                    okText={t.arrear.ok}
                    badText={hasDebt ? t.arrear.bad(formatTenge(c.totalArrear as number), taxPart) : t.arrear.badGeneric}
                    unknownText={t.arrear.unknown}
                  />
                  <Verdict
                    ok={c.isVatPayer === null ? null : true}
                    label={t.vat.label}
                    okText={c.isVatPayer ? t.vat.payer(vatSince) : t.vat.notPayer}
                    badText=""
                    unknownText={t.vat.unknown}
                  />
                </div>

                {c.hasFullCard && (
                  <div className="rounded-xl p-4 mt-3" style={{ background: 'var(--nav-surface-glass)', border: '1px dashed var(--nav-border)' }}>
                    <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                      {signedIn ? t.fullCardTitleSignedIn : t.fullCardTitle}
                    </div>
                    <p className="text-[12px] mb-2.5" style={{ color: 'var(--nav-text-secondary)' }}>
                      {signedIn ? t.fullCardBodySignedIn : t.fullCardBody}
                    </p>
                    <a
                      href={signedIn ? signedInToolHref('kontragent', 'fullcard') : anonymousToolHref('kontragent', 'fullcard')}
                      onClick={signupClick('tool_kontragent_fullcard_click', 'fullcard')}
                      className="text-[13px] font-semibold"
                      style={{ color: 'var(--nav-accent)' }}
                    >
                      {signedIn ? t.fullCardLinkSignedIn : t.fullCardLink}
                    </a>
                  </div>
                )}
              </motion.div>
            )
          })()}
        </div>

        <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          {t.sources}
        </div>

        {/* Пояснения к каждому пункту проверки. Обычные <details> — работают без
            JS и видны роботу в серверном HTML; те же вопросы — в FAQPage JSON-LD
            (KontragentFaqJsonLd в page.tsx). */}
        <section aria-labelledby="kontragent-faq" className="mt-8">
          <h2 id="kontragent-faq" className="text-lg font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>
            {t.faq.title}
          </h2>
          <div className="nav-glass rounded-2xl px-5 divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {t.faq.items.map(item => (
              <details key={item.q} className="group py-3.5">
                <summary
                  className="flex items-start justify-between gap-3 cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden"
                  style={{ color: 'var(--nav-text-primary)' }}
                >
                  <span>{item.q}</span>
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 text-base leading-5 transition-transform group-open:rotate-45"
                    style={{ color: 'var(--nav-text-muted)' }}
                  >
                    +
                  </span>
                </summary>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <ToolCta source="kontragent" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
          <Link href={toolGuidePath(GUIDE_SLUG, lang)} hrefLang={lang === 'en' ? 'ru' : lang} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.guideLink}</Link>
        </div>
      </div>
    </div>
  )
}
