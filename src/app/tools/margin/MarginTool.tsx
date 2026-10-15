'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { PRODUCTS } from '@/lib/products'
import { motion, useReducedMotion } from 'framer-motion'
import { track } from '@vercel/analytics'
import * as XLSX from 'xlsx'
import { useLanguage } from '@/components/LanguageProvider'
import { calculateMargin, MarginInput } from '@/lib/marginCalc'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'
import { formatTenge, guidesIndexPath, toolPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { marginDict, type MarginFieldKey } from './dict'
import { formatPercent, parseAmount } from './numbers'

const KASPI_BOT_LANDING =
  (PRODUCTS.find(p => p.key === 'kaspiShop')?.landing ?? 'https://kaspi.invoices.kz') +
  '/?utm_source=tools&utm_medium=cta&utm_campaign=margin'

// Один и тот же калькулятор для /tools/margin, /tools/kk/margin и
// /tools/en/margin: язык приходит пропсом из page.tsx (то есть из адреса), а
// не из куки посетителя — см. docs/tools-i18n-pattern.md. Раньше язык брался
// из useLanguage(), и робот по одному адресу видел то русский, то казахский.

const EASE = [0.16, 1, 0.3, 1] as const

// 12.5% is the rate the large majority of Kaspi's top-level categories carry
// (see KASPI_CATEGORY_COMMISSIONS, transcribed from Kaspi's own published
// tariff). An ИП on упрощёнка in Kazakhstan pays 4% of turnover since
// 2026-01-01 (new Tax Code №214-VIII; a region's маслихат may shift it within
// 2-6%). Both are pre-filled so the calculator answers before anything is
// typed, and both stay editable because neither is universal.
const DEFAULTS: MarginInput = {
  costPrice: 5000,
  sellPrice: 10000,
  commissionPercent: 12.5,
  deliveryCost: 800,
  taxPercent: 4,
  otherCosts: 200,
  monthlyUnits: 30,
}

// Order the inputs appear in, and which of them are money / percent / count.
const FIELDS: { key: MarginFieldKey; unit: 'tenge' | 'percent' | 'pieces' }[] = [
  { key: 'costPrice', unit: 'tenge' },
  { key: 'sellPrice', unit: 'tenge' },
  { key: 'commissionPercent', unit: 'percent' },
  { key: 'deliveryCost', unit: 'tenge' },
  { key: 'taxPercent', unit: 'percent' },
  { key: 'otherCosts', unit: 'tenge' },
  { key: 'monthlyUnits', unit: 'pieces' },
]

// WebkitTextFillColor is required, not decoration: globals.css sets
// `input, select { -webkit-text-fill-color: #111827 }`, which in Chrome/Safari
// overrides `color`, so on the dark theme the typed numbers and the category
// were drawn near-black on a dark card -- the fields looked empty. Same fix
// as /tools/nalogi.
const FIELD_STYLE = {
  color: 'var(--nav-text-primary)',
  WebkitTextFillColor: 'var(--nav-text-primary)',
  background: 'var(--nav-surface-glass)',
} as const

const INPUT_CLS = 'w-full rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] tabular-nums'

export default function MarginTool({ lang }: { lang: ToolLang }) {
  const reduceMotion = !!useReducedMotion()
  // Только для явных действий (клик в продукт): текст страницы — из пропса.
  const { setLang } = useLanguage()
  const t = marginDict[lang]
  const chrome = TOOL_CHROME[lang]

  // Kept as strings so a cleared field stays cleared instead of snapping back
  // to 0 while someone is retyping it.
  const [raw, setRaw] = useState<Record<MarginFieldKey, string>>(() =>
    Object.fromEntries(FIELDS.map(f => [f.key, String(DEFAULTS[f.key])])) as Record<MarginFieldKey, string>
  )
  // '' = manual entry, which is what the field alone used to be.
  const [category, setCategory] = useState('')
  const [leadContact, setLeadContact] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [exported, setExported] = useState(false)

  // Anonymous usage stats -- see src/app/api/tools/margin/stat/route.ts.
  // `touched` gates the whole thing: without it every visitor who opens the
  // page and leaves would be recorded with the prefilled defaults, which
  // would drown the real numbers we are trying to learn from.
  const touched = useRef(false)
  const statTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // parseAmount, not Number(): «12,5» and «10 000» are how people here type
  // numbers, and Number() turned both into 0 without a word. lang matters on
  // /tools/en/margin, where «10,000» is ten thousand, not 10.
  const input = useMemo<MarginInput>(() => ({
    costPrice: parseAmount(raw.costPrice, lang),
    sellPrice: parseAmount(raw.sellPrice, lang),
    commissionPercent: parseAmount(raw.commissionPercent, lang),
    deliveryCost: parseAmount(raw.deliveryCost, lang),
    taxPercent: parseAmount(raw.taxPercent, lang),
    otherCosts: parseAmount(raw.otherCosts, lang),
    monthlyUnits: parseAmount(raw.monthlyUnits, lang),
  }), [raw, lang])

  const result = useMemo(() => calculateMargin(input), [input])

  // |n| < 0.5 would round to «-0 ₸».
  const money = (n: number) => formatTenge(Math.abs(n) < 0.5 ? 0 : n)
  const percent = (n: number) => formatPercent(n, lang)
  const categoryName = (label: string) => t.categoryNames[label] ?? label
  const unitOf = (unit: 'tenge' | 'percent' | 'pieces') =>
    unit === 'tenge' ? t.unitTenge : unit === 'percent' ? t.unitPercent : t.unitPieces

  // One id per visit, so a visitor still editing after a reload updates their
  // own row instead of creating a second one.
  function sessionId(): string | null {
    try {
      let id = sessionStorage.getItem('margin_session')
      if (!id) {
        id = crypto.randomUUID()
        sessionStorage.setItem('margin_session', id)
      }
      return id
    } catch {
      // Private mode or blocked site data -- skip the stat rather than
      // minting a fresh id on every keystroke and inflating the counts.
      return null
    }
  }

  const sendStat = useCallback((didExport: boolean) => {
    const id = sessionId()
    if (!id) return
    fetch('/api/tools/margin/stat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        // category stays the Russian Kaspi label in every language, so the
        // stats table groups the same category together.
        sessionId: id, lang, category, ...input, exported: didExport,
        profitPerUnit: result.profitPerUnit,
        marginPercent: result.marginPercent,
        breakEvenPrice: result.breakEvenPrice,
      }),
    }).catch(() => {
      // Stats must never surface to the visitor: they came for a number,
      // not for our analytics.
    })
  }, [lang, category, input, result])

  // Debounced: fires once the visitor stops typing, so a row reflects a
  // finished thought rather than a half-entered price.
  useEffect(() => {
    if (!touched.current) return
    if (statTimer.current) clearTimeout(statTimer.current)
    statTimer.current = setTimeout(() => sendStat(false), 2500)
    return () => { if (statTimer.current) clearTimeout(statTimer.current) }
  }, [sendStat])

  function exportExcel() {
    const row = (param: string, value: string | number) => ({ [t.excelHeaderParam]: param, [t.excelHeaderValue]: value })
    const rows: Record<string, string | number>[] = [
      ...(category ? [row(t.categoryLabel, categoryName(category))] : []),
      // Unit in the label: the commission shows up twice -- as the % typed in
      // and as ₸ taken off the price -- and without it the two rows read alike.
      ...FIELDS.map(f => row(`${t.fieldLabels[f.key]}, ${unitOf(f.unit)}`, input[f.key])),
      row('', ''),
      row(`${t.breakdownCommission}, ₸`, Math.round(result.commission)),
      row(`${t.breakdownTax}, ₸`, Math.round(result.tax)),
      row(`${t.breakdownTotal}, ₸`, Math.round(result.totalCosts)),
      row(`${result.profitPerUnit < 0 ? t.lossPerUnitLabel : t.profitPerUnitLabel}, ₸`, Math.round(result.profitPerUnit)),
      row(`${t.marginLabel}, %`, Number(result.marginPercent.toFixed(1))),
      row(`${t.markupLabel}, %`, result.markupPercent === null ? '—' : Number(result.markupPercent.toFixed(1))),
      row(`${t.breakEvenLabel}, ₸`, result.breakEvenPrice === null ? '—' : Math.round(result.breakEvenPrice)),
      row('', ''),
      row(`${t.monthlyTitle} · ${t.monthlyRevenueLabel}, ₸`, Math.round(result.monthlyRevenue)),
      row(`${t.monthlyTitle} · ${t.monthlyProfitLabel}, ₸`, Math.round(result.monthlyProfit)),
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 40 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t.excelSheetName)
    XLSX.writeFile(wb, t.excelFileName)
    // Same signal as the waybill tool: not that someone landed here, but that
    // the tool did its job for them. Nothing identifying is sent -- only
    // whether the numbers they entered came out profitable.
    track('margin_exported', { profitable: result.profitPerUnit > 0, lang })
    // Sent immediately rather than waiting for the debounce: downloading the
    // file is the strongest signal the tool produced something useful, and
    // the visitor often leaves right after.
    sendStat(true)
    setExported(true)
  }

  async function submitLead() {
    const contact = leadContact.trim()
    if (!contact) return
    setLeadStatus('sending')
    try {
      await fetch('/api/tools/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, tool: 'margin' }),
      })
    } catch {
      // Optional and low-stakes -- a failed send here isn't worth troubling
      // someone who already got what they came for with a retry prompt.
    }
    setLeadStatus('sent')
  }

  const inLoss = result.profitPerUnit < 0
  const profitColor = inLoss ? 'var(--nav-critical)' : 'var(--nav-success)'

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <BrandWordmark height={15} />
            <ToolLangSwitch slug="margin" lang={lang} />
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.h1}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>{t.intro}</p>

          <div className="nav-glass rounded-2xl p-4 lg:p-5 mb-4">
            {/* Kaspi's real rates are 7.3 / 12.5 / 15.5 depending on category,
                not the vague range this tool used to suggest. The table is the
                one the in-app calculator uses, transcribed from Kaspi's own
                published tariff — shared rather than copied so the two cannot
                drift. The option VALUE stays the Russian label (stats key);
                only the visible name is translated, from dict.ts. */}
            <label className="block mb-3">
              <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.categoryLabel}</span>
              <select
                value={category}
                onChange={e => {
                  touched.current = true
                  setCategory(e.target.value)
                  const found = KASPI_CATEGORY_COMMISSIONS.find(c => c.label === e.target.value)
                  if (found) setRaw(prev => ({ ...prev, commissionPercent: String(found.ratePercent) }))
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                style={FIELD_STYLE}>
                <option value="">{t.categoryManual}</option>
                {KASPI_CATEGORY_COMMISSIONS.map(c => (
                  <option key={c.label} value={c.label}>{categoryName(c.label)} — {percent(c.ratePercent)}</option>
                ))}
              </select>
              <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.categoryHint}</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="block">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>
                    {t.fieldLabels[f.key]}
                  </span>
                  <div className="relative">
                    {/* type="text" + inputMode, not type="number": a number
                        input drops «12,5» to an empty value in many browsers,
                        and the calculator then silently counts it as 0. */}
                    <input
                      type="text"
                      inputMode={f.unit === 'pieces' ? 'numeric' : 'decimal'}
                      autoComplete="off"
                      value={raw[f.key]}
                      onChange={e => {
                        touched.current = true
                        // Typing your own commission drops the category:
                        // leaving it selected would name a category whose
                        // published rate is no longer what is in the field.
                        if (f.key === 'commissionPercent') setCategory('')
                        setRaw(prev => ({ ...prev, [f.key]: e.target.value }))
                      }}
                      className={INPUT_CLS}
                      style={FIELD_STYLE} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--nav-text-muted)' }}>
                      {unitOf(f.unit)}
                    </span>
                  </div>
                  {t.fieldHints[f.key] && (
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.fieldHints[f.key]}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Results update as you type -- there is no Calculate button on
              purpose: the whole tool is one screen and a button would just be
              a step between the numbers and the answer. */}
          <div className="nav-glass nav-card-accent rounded-2xl p-4 lg:p-5 mb-4" aria-live="polite">
            <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.resultTitle}</div>

            <div className="text-3xl font-bold tabular-nums mb-1" style={{ color: profitColor }}>
              {money(result.profitPerUnit)}
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>
              {inLoss ? t.lossPerUnitLabel : t.profitPerUnitLabel}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <div className="text-[11px] mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.marginLabel}</div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: profitColor }}>{percent(result.marginPercent)}</div>
              </div>
              <div>
                <div className="text-[11px] mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.markupLabel}</div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                  {result.markupPercent === null
                    ? <span className="text-xs font-normal" style={{ color: 'var(--nav-text-muted)' }}>{t.markupUndefined}</span>
                    : percent(result.markupPercent)}
                </div>
              </div>
            </div>

            {inLoss && (
              <div className="text-xs mb-4" style={{ color: 'var(--nav-critical)' }}>{t.lossWarning}</div>
            )}

            <div className="rounded-lg p-3" style={{ background: 'var(--nav-bg)' }}>
              <div className="text-[11px] mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.breakEvenLabel}</div>
              {result.breakEvenPrice === null ? (
                <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{t.breakEvenImpossible}</div>
              ) : (
                <>
                  <div className="text-xl font-bold tabular-nums mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                    {money(result.breakEvenPrice)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{t.breakEvenHint}</div>
                </>
              )}
            </div>

            {/* Lives inside the result card rather than in one of its own two
                cards further down. «Продаж в месяц» is the last field in the
                form, so with the monthly figures below the cost breakdown the
                only thing on screen while you edit it was the per-sale number
                -- which the field does not affect. It read as a dead input
                (founder, 2026-09-07). */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
              <div>
                <div className="text-[11px] mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.monthlyTitle} · {t.monthlyRevenueLabel}
                </div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{money(result.monthlyRevenue)}</div>
              </div>
              <div>
                <div className="text-[11px] mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.monthlyTitle} · {t.monthlyProfitLabel}
                </div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: profitColor }}>{money(result.monthlyProfit)}</div>
              </div>
            </div>
          </div>

          <div className="nav-glass rounded-2xl p-4 lg:p-5 mb-4">
            <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.costBreakdownTitle}</div>
            <dl className="space-y-1.5 text-sm">
              {([
                [t.breakdownCost, input.costPrice],
                [t.breakdownCommission, result.commission],
                [t.breakdownDelivery, input.deliveryCost],
                [t.breakdownTax, result.tax],
                [t.breakdownOther, input.otherCosts],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--nav-text-secondary)' }}>{label}</dt>
                  <dd className="tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{money(value)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-1.5" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                <dt className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.breakdownTotal}</dt>
                <dd className="font-semibold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{money(result.totalCosts)}</dd>
              </div>
            </dl>
          </div>

          <button onClick={exportExcel}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {t.exportButton}
          </button>

          {exported && (
            <div className="nav-glass rounded-2xl p-4 mt-4">
              {leadStatus === 'sent' ? (
                <p className="text-sm" style={{ color: 'var(--nav-success)' }}>{t.leadThanks}</p>
              ) : (
                <>
                  <p className="text-sm mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.leadPromptTitle}</p>
                  <div className="flex gap-2">
                    <input value={leadContact} onChange={e => setLeadContact(e.target.value)}
                      placeholder={t.leadPlaceholder}
                      aria-label={t.leadPlaceholder}
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                      style={FIELD_STYLE} />
                    <button onClick={submitLead} disabled={leadStatus === 'sending' || !leadContact.trim()}
                      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex-shrink-0"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {leadStatus === 'sending' ? t.leadSendingButton : t.leadSubmitButton}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* The formulas, in plain words. Collapsed by default so the tool
              stays one screen, but present in the HTML for anyone (and any
              crawler) who wants to know why the floor is above the costs. */}
          <details className="nav-glass rounded-2xl p-4 lg:p-5 mt-4">
            <summary className="text-sm font-semibold cursor-pointer select-none" style={{ color: 'var(--nav-text-primary)' }}>
              {t.howTitle}
            </summary>
            <ul className="mt-3 space-y-2 text-[13px] list-disc pl-5" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.howItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </details>

          {/* The floor price the calculator just produced is exactly what the
              repricing bot protects -- so the pitch is the visitor's own
              number, not a generic feature list. */}
          {result.breakEvenPrice !== null && (
            <div className="nav-glass rounded-2xl p-5 mt-8">
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.ctaTitle}</div>
              <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.ctaBody(money(result.breakEvenPrice))}
              </p>
              {/* Clicking through to the product remembers the page language,
                  so the landing (another subdomain, shared cookie) opens in it.
                  Ведёт на лендинг Kaspi Bot, а не на #features лендинга счетов
                  (правка основателя 15.10.2026), как в склейке накладных. */}
              <a href={KASPI_BOT_LANDING} onClick={() => { setLang(lang); track('margin_to_product', { lang }) }}
                className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
                {t.ctaLink}
              </a>
            </div>
          )}

          <ToolCta source="margin" lang={lang} />

          {/* The waybill tool has its own kk/en pages since 14.10.2026. */}
          <div className="mt-6 flex flex-col gap-3">
            <Link href={toolPath('waybills', lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
              {t.otherToolLink}
            </Link>
            <div className="flex gap-4 flex-wrap">
              <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
              <Link href={guidesIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.guides}</Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
