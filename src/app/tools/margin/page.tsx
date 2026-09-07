'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { track } from '@vercel/analytics'
import * as XLSX from 'xlsx'
import { useLanguage, Lang } from '@/components/LanguageProvider'
import { calculateMargin, MarginInput } from '@/lib/marginCalc'

const EASE = [0.16, 1, 0.3, 1] as const

// Kaspi Магазин's commission is set per category and most sellers sit around
// 10%; an ИП on упрощёнка in Kazakhstan pays 3% of turnover. Both are
// pre-filled so the calculator gives a believable answer before anything is
// typed, and both are editable because neither is universal.
const DEFAULTS: MarginInput = {
  costPrice: 5000,
  sellPrice: 10000,
  commissionPercent: 10,
  deliveryCost: 800,
  taxPercent: 3,
  otherCosts: 200,
  monthlyUnits: 30,
}

type FieldKey = keyof MarginInput

interface Copy {
  title: string
  subtitle: string
  fieldLabels: Record<FieldKey, string>
  fieldHints: Partial<Record<FieldKey, string>>
  unitTenge: string
  unitPercent: string
  unitPieces: string
  resultTitle: string
  profitPerUnitLabel: string
  lossPerUnitLabel: string
  marginLabel: string
  markupLabel: string
  markupUndefined: string
  breakEvenLabel: string
  breakEvenHint: string
  breakEvenImpossible: string
  costBreakdownTitle: string
  breakdownCost: string
  breakdownCommission: string
  breakdownDelivery: string
  breakdownTax: string
  breakdownOther: string
  breakdownTotal: string
  monthlyTitle: string
  monthlyRevenueLabel: string
  monthlyProfitLabel: string
  lossWarning: string
  exportButton: string
  excelSheetName: string
  excelFileName: string
  excelHeaderParam: string
  excelHeaderValue: string
  ctaTitle: string
  ctaBody: (price: string) => string
  ctaLink: string
  leadPromptTitle: string
  leadPlaceholder: string
  leadSubmitButton: string
  leadSendingButton: string
  leadThanks: string
  otherToolLink: string
}

const COPY: Record<Lang, Copy> = {
  ru: {
    title: 'Калькулятор маржи для Kaspi',
    subtitle: 'Посчитайте, сколько остаётся с одной продажи после комиссии Kaspi, доставки и налога — и ниже какой цены опускаться нельзя. Бесплатно и без регистрации.',
    fieldLabels: {
      costPrice: 'Себестоимость',
      sellPrice: 'Цена продажи на Kaspi',
      commissionPercent: 'Комиссия Kaspi',
      deliveryCost: 'Доставка на единицу',
      taxPercent: 'Налог с оборота',
      otherCosts: 'Прочие расходы на единицу',
      monthlyUnits: 'Продаж в месяц',
    },
    fieldHints: {
      commissionPercent: 'Зависит от категории — обычно 5–12%',
      taxPercent: 'ИП на упрощёнке в РК — 3% с оборота',
      otherCosts: 'Упаковка, реклама, возвраты',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'шт',
    resultTitle: 'С одной продажи',
    profitPerUnitLabel: 'Прибыль',
    lossPerUnitLabel: 'Убыток',
    marginLabel: 'Маржинальность',
    markupLabel: 'Наценка',
    markupUndefined: 'укажите себестоимость',
    breakEvenLabel: 'Минимальная цена',
    breakEvenHint: 'Ниже этой цены вы продаёте в минус — комиссия и налог берутся с цены, поэтому она выше суммы расходов.',
    breakEvenImpossible: 'Комиссия и налог забирают всю цену — заработать невозможно ни при какой цене.',
    costBreakdownTitle: 'Куда уходит цена',
    breakdownCost: 'Себестоимость',
    breakdownCommission: 'Комиссия Kaspi',
    breakdownDelivery: 'Доставка',
    breakdownTax: 'Налог',
    breakdownOther: 'Прочие расходы',
    breakdownTotal: 'Всего расходов',
    monthlyTitle: 'За месяц',
    monthlyRevenueLabel: 'Оборот',
    monthlyProfitLabel: 'Прибыль',
    lossWarning: 'При этой цене каждая продажа приносит убыток.',
    exportButton: 'Скачать расчёт в Excel',
    excelSheetName: 'Маржа',
    excelFileName: 'raschet-marzhi.xlsx',
    excelHeaderParam: 'Показатель',
    excelHeaderValue: 'Значение',
    ctaTitle: 'Знать минимальную цену мало — её нужно удержать',
    ctaBody: price => `Ваша минимальная цена — ${price}. Демпинг-бот в invoices.kz сам держит вас в топе Kaspi и никогда не опускает цену ниже заданного вами порога.`,
    ctaLink: 'Посмотреть Kaspi Bot →',
    leadPromptTitle: 'Хотите узнавать о новых бесплатных инструментах?',
    leadPlaceholder: 'Email или телефон (необязательно)',
    leadSubmitButton: 'Отправить',
    leadSendingButton: 'Отправляем…',
    leadThanks: 'Спасибо! Дадим знать, когда выйдет что-то новое.',
    otherToolLink: 'Ещё бесплатно: склейка накладных Kaspi →',
  },
  kk: {
    title: 'Kaspi үшін маржа калькуляторы',
    subtitle: 'Kaspi комиссиясынан, жеткізуден және салықтан кейін бір сатылымнан қанша қалатынын — және қай бағадан төмен түсуге болмайтынын есептеңіз. Тегін және тіркеусіз.',
    fieldLabels: {
      costPrice: 'Өзіндік құны',
      sellPrice: 'Kaspi-дегі сату бағасы',
      commissionPercent: 'Kaspi комиссиясы',
      deliveryCost: 'Бір данаға жеткізу',
      taxPercent: 'Айналымнан салық',
      otherCosts: 'Бір данаға өзге шығындар',
      monthlyUnits: 'Айына сатылым',
    },
    fieldHints: {
      commissionPercent: 'Санатқа байланысты — әдетте 5–12%',
      taxPercent: 'ҚР-дағы жеңілдетілген ЖК — айналымнан 3%',
      otherCosts: 'Қаптама, жарнама, қайтарымдар',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'дана',
    resultTitle: 'Бір сатылымнан',
    profitPerUnitLabel: 'Пайда',
    lossPerUnitLabel: 'Шығын',
    marginLabel: 'Маржиналдық',
    markupLabel: 'Үстеме баға',
    markupUndefined: 'өзіндік құнын көрсетіңіз',
    breakEvenLabel: 'Ең төменгі баға',
    breakEvenHint: 'Бұл бағадан төмен сатсаңыз — зиянға жұмыс істейсіз. Комиссия мен салық бағадан алынады, сондықтан ол шығындар сомасынан жоғары.',
    breakEvenImpossible: 'Комиссия мен салық бүкіл бағаны алады — ешқандай бағада пайда табу мүмкін емес.',
    costBreakdownTitle: 'Баға қайда кетеді',
    breakdownCost: 'Өзіндік құны',
    breakdownCommission: 'Kaspi комиссиясы',
    breakdownDelivery: 'Жеткізу',
    breakdownTax: 'Салық',
    breakdownOther: 'Өзге шығындар',
    breakdownTotal: 'Барлық шығын',
    monthlyTitle: 'Айына',
    monthlyRevenueLabel: 'Айналым',
    monthlyProfitLabel: 'Пайда',
    lossWarning: 'Бұл бағада әр сатылым зиян әкеледі.',
    exportButton: 'Есепті Excel-ге жүктеу',
    excelSheetName: 'Маржа',
    excelFileName: 'marzha-esebi.xlsx',
    excelHeaderParam: 'Көрсеткіш',
    excelHeaderValue: 'Мәні',
    ctaTitle: 'Ең төменгі бағаны білу аз — оны ұстап тұру керек',
    ctaBody: price => `Сіздің ең төменгі бағаңыз — ${price}. invoices.kz демпинг-боты сізді Kaspi-де топта ұстайды және бағаны сіз қойған шектен ешқашан төмендетпейді.`,
    ctaLink: 'Kaspi Bot-ты қарау →',
    leadPromptTitle: 'Жаңа тегін құралдар туралы білгіңіз келе ме?',
    leadPlaceholder: 'Email немесе телефон (міндетті емес)',
    leadSubmitButton: 'Жіберу',
    leadSendingButton: 'Жіберілуде…',
    leadThanks: 'Рахмет! Жаңалық шыққанда хабарлаймыз.',
    otherToolLink: 'Тағы тегін: Kaspi жүкқұжаттарын желімдеу →',
  },
  en: {
    title: 'Kaspi Margin Calculator',
    subtitle: "Work out what one sale actually leaves you after Kaspi's commission, delivery and tax — and the price you must never go below. Free, no signup.",
    fieldLabels: {
      costPrice: 'Cost price',
      sellPrice: 'Selling price on Kaspi',
      commissionPercent: 'Kaspi commission',
      deliveryCost: 'Delivery per unit',
      taxPercent: 'Turnover tax',
      otherCosts: 'Other costs per unit',
      monthlyUnits: 'Sales per month',
    },
    fieldHints: {
      commissionPercent: 'Depends on the category — usually 5–12%',
      taxPercent: 'A simplified-regime sole trader in Kazakhstan pays 3%',
      otherCosts: 'Packaging, ads, returns',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'pcs',
    resultTitle: 'Per sale',
    profitPerUnitLabel: 'Profit',
    lossPerUnitLabel: 'Loss',
    marginLabel: 'Margin',
    markupLabel: 'Markup',
    markupUndefined: 'enter a cost price',
    breakEvenLabel: 'Floor price',
    breakEvenHint: 'Below this you sell at a loss. Commission and tax are taken off the price, so the floor sits above the sum of your costs.',
    breakEvenImpossible: 'Commission and tax take the entire price — no price can turn a profit.',
    costBreakdownTitle: 'Where the price goes',
    breakdownCost: 'Cost price',
    breakdownCommission: 'Kaspi commission',
    breakdownDelivery: 'Delivery',
    breakdownTax: 'Tax',
    breakdownOther: 'Other costs',
    breakdownTotal: 'Total costs',
    monthlyTitle: 'Per month',
    monthlyRevenueLabel: 'Revenue',
    monthlyProfitLabel: 'Profit',
    lossWarning: 'At this price every sale loses money.',
    exportButton: 'Download as Excel',
    excelSheetName: 'Margin',
    excelFileName: 'margin-calculation.xlsx',
    excelHeaderParam: 'Metric',
    excelHeaderValue: 'Value',
    ctaTitle: 'Knowing your floor price is not enough — you have to hold it',
    ctaBody: price => `Your floor price is ${price}. The repricing bot in invoices.kz keeps you at the top of Kaspi and never drops below the floor you set.`,
    ctaLink: 'See Kaspi Bot →',
    leadPromptTitle: 'Want to hear about new free tools?',
    leadPlaceholder: 'Email or phone (optional)',
    leadSubmitButton: 'Send',
    leadSendingButton: 'Sending…',
    leadThanks: "Thanks! We'll let you know when something new ships.",
    otherToolLink: 'Also free: Kaspi waybill merger →',
  },
}

// Order the inputs appear in, and which of them are money / percent / count.
const FIELDS: { key: FieldKey; unit: 'tenge' | 'percent' | 'pieces' }[] = [
  { key: 'costPrice', unit: 'tenge' },
  { key: 'sellPrice', unit: 'tenge' },
  { key: 'commissionPercent', unit: 'percent' },
  { key: 'deliveryCost', unit: 'tenge' },
  { key: 'taxPercent', unit: 'percent' },
  { key: 'otherCosts', unit: 'tenge' },
  { key: 'monthlyUnits', unit: 'pieces' },
]

const INPUT_CLS = 'w-full rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] tabular-nums'

export default function MarginCalculatorTool() {
  const reduceMotion = !!useReducedMotion()
  const { lang, setLang } = useLanguage()
  const t = COPY[lang]

  // Kept as strings so a cleared field stays cleared instead of snapping back
  // to 0 while someone is retyping it.
  const [raw, setRaw] = useState<Record<FieldKey, string>>(() =>
    Object.fromEntries(FIELDS.map(f => [f.key, String(DEFAULTS[f.key])])) as Record<FieldKey, string>
  )
  const [leadContact, setLeadContact] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [exported, setExported] = useState(false)

  // Anonymous usage stats -- see src/app/api/tools/margin/stat/route.ts.
  // `touched` gates the whole thing: without it every visitor who opens the
  // page and leaves would be recorded with the prefilled defaults, which
  // would drown the real numbers we are trying to learn from.
  const touched = useRef(false)
  const statTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const input = useMemo<MarginInput>(() => ({
    costPrice: Number(raw.costPrice) || 0,
    sellPrice: Number(raw.sellPrice) || 0,
    commissionPercent: Number(raw.commissionPercent) || 0,
    deliveryCost: Number(raw.deliveryCost) || 0,
    taxPercent: Number(raw.taxPercent) || 0,
    otherCosts: Number(raw.otherCosts) || 0,
    monthlyUnits: Number(raw.monthlyUnits) || 0,
  }), [raw])

  const result = useMemo(() => calculateMargin(input), [input])

  const money = (n: number) => `${Math.round(n).toLocaleString('ru-KZ')} ${t.unitTenge}`
  const percent = (n: number) => `${n.toFixed(1)} %`

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
        sessionId: id, lang, ...input, exported: didExport,
        profitPerUnit: result.profitPerUnit,
        marginPercent: result.marginPercent,
        breakEvenPrice: result.breakEvenPrice,
      }),
    }).catch(() => {
      // Stats must never surface to the visitor: they came for a number,
      // not for our analytics.
    })
  }, [lang, input, result])

  // Debounced: fires once the visitor stops typing, so a row reflects a
  // finished thought rather than a half-entered price.
  useEffect(() => {
    if (!touched.current) return
    if (statTimer.current) clearTimeout(statTimer.current)
    statTimer.current = setTimeout(() => sendStat(false), 2500)
    return () => { if (statTimer.current) clearTimeout(statTimer.current) }
  }, [sendStat])

  function exportExcel() {
    const rows: Record<string, string | number>[] = [
      ...FIELDS.map(f => ({
        [t.excelHeaderParam]: t.fieldLabels[f.key],
        [t.excelHeaderValue]: input[f.key],
      })),
      { [t.excelHeaderParam]: '', [t.excelHeaderValue]: '' },
      { [t.excelHeaderParam]: t.breakdownCommission, [t.excelHeaderValue]: Math.round(result.commission) },
      { [t.excelHeaderParam]: t.breakdownTax, [t.excelHeaderValue]: Math.round(result.tax) },
      { [t.excelHeaderParam]: t.breakdownTotal, [t.excelHeaderValue]: Math.round(result.totalCosts) },
      { [t.excelHeaderParam]: t.profitPerUnitLabel, [t.excelHeaderValue]: Math.round(result.profitPerUnit) },
      { [t.excelHeaderParam]: t.marginLabel, [t.excelHeaderValue]: Number(result.marginPercent.toFixed(1)) },
      {
        [t.excelHeaderParam]: t.markupLabel,
        [t.excelHeaderValue]: result.markupPercent === null ? '—' : Number(result.markupPercent.toFixed(1)),
      },
      {
        [t.excelHeaderParam]: t.breakEvenLabel,
        [t.excelHeaderValue]: result.breakEvenPrice === null ? '—' : Math.round(result.breakEvenPrice),
      },
      { [t.excelHeaderParam]: '', [t.excelHeaderValue]: '' },
      { [t.excelHeaderParam]: t.monthlyRevenueLabel, [t.excelHeaderValue]: Math.round(result.monthlyRevenue) },
      { [t.excelHeaderParam]: t.monthlyProfitLabel, [t.excelHeaderValue]: Math.round(result.monthlyProfit) },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 32 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t.excelSheetName)
    XLSX.writeFile(wb, t.excelFileName)
    // Same signal as the waybill tool: not that someone landed here, but that
    // the tool did its job for them. Nothing identifying is sent -- only
    // whether the numbers they entered came out profitable.
    track('margin_exported', { profitable: result.profitPerUnit > 0 })
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
          <div className="flex items-center justify-between gap-2.5 mb-6">
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
              <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>invoices.kz</Link>
            </div>
            <div className="flex rounded-full p-0.5" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)' }}>
              {(['ru', 'kk', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: lang === l ? 'var(--nav-accent)' : 'transparent', color: lang === l ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}
                  aria-pressed={lang === l}>
                  {l === 'kk' ? 'ҚЗ' : l}
                </button>
              ))}
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>{t.subtitle}</p>

          <div className="nav-glass rounded-2xl p-4 lg:p-5 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="block">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>
                    {t.fieldLabels[f.key]}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={raw[f.key]}
                      onChange={e => { touched.current = true; setRaw(prev => ({ ...prev, [f.key]: e.target.value })) }}
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-glass)' }} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--nav-text-muted)' }}>
                      {f.unit === 'tenge' ? t.unitTenge : f.unit === 'percent' ? t.unitPercent : t.unitPieces}
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
                      className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-glass)' }} />
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

          {/* The floor price the calculator just produced is exactly what the
              repricing bot protects -- so the pitch is the visitor's own
              number, not a generic feature list. */}
          {result.breakEvenPrice !== null && (
            <div className="nav-glass rounded-2xl p-5 mt-8">
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.ctaTitle}</div>
              <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.ctaBody(money(result.breakEvenPrice))}
              </p>
              <Link href="/#features" onClick={() => track('margin_to_product')}
                className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
                {t.ctaLink}
              </Link>
            </div>
          )}

          <div className="text-center mt-6">
            <Link href="/tools/waybills" className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>
              {t.otherToolLink}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
