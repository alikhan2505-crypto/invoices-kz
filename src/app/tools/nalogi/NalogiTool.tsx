'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { calculateIpTaxes, MRP_2026, MZP_2026 } from '@/lib/ipTaxes'
import { formatTenge, isToolLocalized, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { nalogiDict, type RichLine } from './dict'

// Калькулятор налогов ИП на упрощёнке — 2026, один и тот же для
// /tools/nalogi, /tools/kk/nalogi и /tools/en/nalogi: язык приходит пропсом
// из page.tsx (то есть из адреса), а не из куки посетителя — см.
// docs/tools-i18n-pattern.md. Чистая логика и границы взносов живут в
// src/lib/ipTaxes.ts (покрыто тестами); здесь только ввод и разбор. Лимита
// нет: расчёт локальный и ничего не стоит, крючок — CTA.

const digits = (s: string) => s.replace(/\D/g, '')
// Разряды пробелами прямо в поле: «1 000 000» читается, «10000000» — нет.
const grouped = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// Пороги из кодекса в тенге (МРП 2026 — 4 325 ₸).
const SIMPLIFIED_LIMIT_YEAR = 600_000 * MRP_2026 // 2 595 000 000 ₸
const VAT_THRESHOLD_YEAR = 10_000 * MRP_2026 // 43 250 000 ₸

const RATES = ['2', '3', '4', '5', '6'] as const

function Rich({ line }: { line: RichLine }) {
  return <>{line.pre}<b>{line.b}</b>{line.post}</>
}

export default function NalogiTool({ lang }: { lang: ToolLang }) {
  const t = nalogiDict[lang]
  const chrome = TOOL_CHROME[lang]
  const [income, setIncome] = useState('1000000')
  const [base, setBase] = useState(String(MZP_2026))
  const [before1975, setBefore1975] = useState(false)
  const [rate, setRate] = useState('4')
  const [touched, setTouched] = useState(false)

  const r = useMemo(() => calculateIpTaxes({
    monthlyIncome: Number(income) || 0,
    contributionBase: Number(base) || 0,
    bornBefore1975: before1975,
    taxRatePercent: Number(rate) || 4,
  }), [income, base, before1975, rate])

  const onChange = (fn: () => void) => { fn(); if (!touched) { setTouched(true); track('tool_nalogi_calc', { lang }) } }

  // Что расчёт на самом деле взял за базу взносов — чтобы цифра в итоге не
  // выглядела ошибкой, когда введённая база вышла за коридор МЗП.
  const baseNum = Number(base) || 0
  const baseNotes: string[] = []
  if (baseNum > 0 && baseNum < MZP_2026) baseNotes.push(t.baseRaisedToMin(formatTenge(MZP_2026)))
  if (baseNum > 7 * MZP_2026) baseNotes.push(t.baseSoCapped(formatTenge(7 * MZP_2026)))
  if (baseNum > 50 * MZP_2026) baseNotes.push(t.basePensionCapped(formatTenge(50 * MZP_2026)))

  const annual = (Number(income) || 0) * 12
  const thresholdWarning = annual > SIMPLIFIED_LIMIT_YEAR
    ? t.limitWarning(formatTenge(annual), formatTenge(SIMPLIFIED_LIMIT_YEAR))
    : annual > VAT_THRESHOLD_YEAR
      ? t.vatWarning(formatTenge(annual), formatTenge(VAT_THRESHOLD_YEAR))
      : null

  const input = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none'
  // WebkitTextFillColor обязателен: глобальное `input, select { -webkit-text-fill-color: #111827 }`
  // из globals.css перебивает `color` в Chrome/Safari, и в тёмной теме ОС
  // введённые цифры почти не видны (та же ловушка, что у .planner-shell).
  const inputStyle = { background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)' } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const
  const row = 'flex items-center justify-between gap-3 py-2 text-sm'
  const hint = 'text-[11px] mt-1'

  const rows: Array<{ label: string; value: number; strong?: boolean }> = [
    { label: t.taxRow(rate), value: r.taxMonthly, strong: true },
    { label: t.opvRow, value: r.opv },
    { label: t.opvrRow, value: r.opvr },
    { label: t.soRow, value: r.so },
    { label: t.vosmsRow, value: r.vosms },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch slug="nalogi" lang={lang} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          <Rich line={t.intro} />
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nalogi-income" className={label} style={labelStyle}>{t.incomeLabel}</label>
              <input id="nalogi-income" className={`${input} font-mono tabular-nums`} style={inputStyle} inputMode="numeric" autoComplete="off"
                value={grouped(income)}
                onChange={e => onChange(() => setIncome(digits(e.target.value).slice(0, 12)))} />
            </div>
            <div>
              <label htmlFor="nalogi-rate" className={label} style={labelStyle}>{t.rateLabel}</label>
              <select id="nalogi-rate" className={input} style={inputStyle} value={rate} onChange={e => onChange(() => setRate(e.target.value))}>
                {RATES.map(v => <option key={v} value={v}>{t.rateOption[v]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nalogi-base" className={label} style={labelStyle}>{t.baseLabel}</label>
              <input id="nalogi-base" className={`${input} font-mono tabular-nums`} style={inputStyle} inputMode="numeric" autoComplete="off"
                aria-describedby="nalogi-base-hint"
                value={grouped(base)}
                onChange={e => onChange(() => setBase(digits(e.target.value).slice(0, 12)))} />
              <div id="nalogi-base-hint" className={hint} style={{ color: 'var(--nav-text-muted)' }}>
                {t.baseHint(formatTenge(MZP_2026))}
                {baseNotes.map(note => (
                  <span key={note} className="block mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{note}</span>
                ))}
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>
                <input type="checkbox" checked={before1975} onChange={e => onChange(() => setBefore1975(e.target.checked))}
                  className="w-4 h-4 accent-[#5B4CE0]" />
                {t.before1975}
              </label>
            </div>
          </div>
        </div>

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.totalTitle}</div>
          <div className="text-3xl font-black font-mono tabular-nums mb-1" style={{ color: 'var(--nav-text-primary)' }}>
            {formatTenge(r.totalMonthly)}
          </div>
          <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>
            {r.effectivePercent !== null
              ? t.effective(String(r.effectivePercent).replace('.', t.decimalSeparator))
              : t.noIncome}
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {rows.map(item => (
              <div key={item.label} className={row}>
                <span style={{ color: 'var(--nav-text-secondary)' }}>{item.label}</span>
                <span className={`font-mono tabular-nums whitespace-nowrap${item.strong ? ' font-semibold' : ''}`} style={{ color: 'var(--nav-text-primary)' }}>
                  {formatTenge(item.value)}
                </span>
              </div>
            ))}
            <div className={row}>
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.contributionsRow}</span>
              <span className="font-mono tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>
                {formatTenge(r.contributionsMonthly)}
              </span>
            </div>
          </div>

          <div className="rounded-xl p-3.5 mt-3 text-[13px]" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
            <Rich line={t.halfYear(formatTenge(r.taxHalfYear))} />
          </div>

          {thresholdWarning && (
            <div role="status" className="rounded-xl p-3.5 mt-3 text-[13px]"
              style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-critical)', color: 'var(--nav-text-primary)' }}>
              {thresholdWarning}
            </div>
          )}
        </div>

        <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          {t.disclaimer}{' '}
          <Link href={t.guideHref} style={{ color: 'var(--nav-accent)' }}>{t.guideLink}</Link>.
        </div>

        <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby="nalogi-faq">
          <h2 id="nalogi-faq" className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {t.faq.map(item => (
              <details key={item.q} className="py-2.5 group">
                <summary className="text-sm font-semibold cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-start justify-between gap-3" style={{ color: 'var(--nav-text-primary)' }}>
                  <span>{item.q}</span>
                  <span aria-hidden="true" className="transition-transform group-open:rotate-45 flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>+</span>
                </summary>
                <p className="text-[13px] mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <ToolCta source="nalogi" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
          {/* toolLinkPath ведёт на языковую версию schet (переведён 14.10.2026). */}
          <Link href={toolLinkPath('schet', lang)} hrefLang={isToolLocalized('schet') ? lang : 'ru'} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.schetLink}</Link>
        </div>
      </div>
    </div>
  )
}
