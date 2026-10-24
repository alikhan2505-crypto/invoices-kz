'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { calculateIpTaxes, MRP_2026, MZP_2026 } from '@/lib/ipTaxes'
import { formatTenge, isToolLocalized, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { useToolView } from '@/lib/tools-i18n/useToolEvents'
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

  useToolView('nalogi', lang)
  // «Документ» калькулятора — первый расчёт по своим цифрам за загрузку
  // страницы: когда человек что-то поменял и полторы секунды не печатает
  // (не на каждую нажатую цифру). Расчёт по умолчанию не считается.
  const docSent = useRef(false)
  useEffect(() => {
    if (!touched || docSent.current) return
    const timer = setTimeout(() => { docSent.current = true; logToolEvent('doc', 'nalogi', { lang }) }, 1500)
    return () => clearTimeout(timer)
  }, [touched, income, base, before1975, rate, lang])

  // Что расчёт на самом деле взял за базу взносов — чтобы цифра в итоге не
  // выглядела ошибкой, когда введённая база вышла за коридор МЗП.
  const baseNum = Number(base) || 0
  const baseNotes: string[] = []
  if (baseNum > 0 && baseNum < MZP_2026) baseNotes.push(t.baseRaisedToMin(formatTenge(MZP_2026)))
  if (baseNum - r.opv > 7 * MZP_2026) baseNotes.push(t.baseSoCapped(formatTenge(7 * MZP_2026)))
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

  // Формула каждой строки с реальными числами — во всплывающей подсказке
  // (правка основателя 14.10.2026: «при наведении показывать формулу»).
  // На телефоне наведения нет — касание фокусирует строку, и подсказка
  // открывается по фокусу; касание в другом месте её закрывает.
  const f = t.formula
  const sep = t.decimalSeparator
  const pct = (v: number) => `${String(v).replace('.', sep)}%`
  const incomeNum = Number(income) || 0
  const corridorNote = (used: number, corridor: string) =>
    baseNum > 0 && used !== baseNum ? ` (${f.entered(formatTenge(baseNum))}; ${corridor})` : ''
  // База основного СО до коридора МЗП: заявленный доход минус ОПВ (разъяснения ГФСС).
  const soAfterOpv = baseNum - r.opv
  const rows: Array<{ key: string; label: string; value: number; strong?: boolean; formula: string }> = [
    { key: 'tax', label: t.taxRow(rate), value: r.taxMonthly, strong: true,
      formula: `${formatTenge(incomeNum)} × ${pct(Number(rate) || 4)} = ${formatTenge(r.taxMonthly)}` },
    { key: 'opv', label: t.opvRow, value: r.opv,
      formula: r.pensionBase === 0 ? `0 — ${f.noIncome}`
        : `${formatTenge(r.pensionBase)} × ${pct(10)} = ${formatTenge(r.opv)}${corridorNote(r.pensionBase, f.pensionCorridor)}` },
    { key: 'opvr', label: t.opvrRow, value: r.opvr,
      formula: before1975 ? `0 — ${f.before1975}`
        : r.pensionBase === 0 ? `0 — ${f.noIncome}`
        : `${formatTenge(r.pensionBase)} × ${pct(3.5)} = ${formatTenge(r.opvr)}${corridorNote(r.pensionBase, f.pensionCorridor)}` },
    { key: 'so', label: t.soRow, value: r.so,
      formula: r.soBase === 0 ? `0 — ${f.noIncome}`
        : soAfterOpv === r.soBase
          ? `(${f.soAfterOpv(formatTenge(baseNum), formatTenge(r.opv))}) × ${pct(5)} = ${formatTenge(r.so)}`
          : `${formatTenge(r.soBase)} × ${pct(5)} = ${formatTenge(r.so)} (${f.soAfterOpv(formatTenge(baseNum), formatTenge(r.opv))} = ${formatTenge(soAfterOpv)}; ${f.soCorridor})` },
    { key: 'vosms', label: t.vosmsRow, value: r.vosms,
      formula: `${String(1.4).replace('.', sep)} × ${formatTenge(MZP_2026)} × ${pct(5)} = ${formatTenge(r.vosms)} — ${f.fixed}` },
  ]
  const contribFormula = `${[r.opv, r.opvr, r.so, r.vosms].map(v => formatTenge(v)).join(' + ')} = ${formatTenge(r.contributionsMonthly)}`
  const totalFormula = `${formatTenge(r.taxMonthly)} + ${formatTenge(r.contributionsMonthly)} = ${formatTenge(r.totalMonthly)}`
  const [openRow, setOpenRow] = useState<string | null>(null)
  const rowHandlers = (key: string) => ({
    onMouseEnter: () => setOpenRow(key),
    onMouseLeave: () => setOpenRow(o => (o === key ? null : o)),
    onFocus: () => setOpenRow(key),
    onBlur: () => setOpenRow(o => (o === key ? null : o)),
    tabIndex: 0,
    'aria-describedby': `nalogi-f-${key}`,
  })
  const Formula = ({ id, text }: { id: string; text: string }) => (
    <div id={`nalogi-f-${id}`} role="tooltip" hidden={openRow !== id}
      className="absolute right-0 top-full z-20 mt-1 max-w-[min(100%,460px)] rounded-xl px-3 py-2 text-[12px] font-mono tabular-nums shadow-lg"
      style={{ background: 'var(--nav-text-primary)', color: 'var(--nav-bg)' }}>
      {text}
    </div>
  )

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
          <div className="relative inline-block cursor-help rounded-md outline-none focus-visible:ring-2 mb-1" {...rowHandlers('total')}>
            <div className="text-3xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
              {formatTenge(r.totalMonthly)}
            </div>
            <div id="nalogi-f-total" role="tooltip" hidden={openRow !== 'total'}
              className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-mono tabular-nums shadow-lg"
              style={{ background: 'var(--nav-text-primary)', color: 'var(--nav-bg)' }}>
              {totalFormula}
            </div>
          </div>
          <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>
            {r.effectivePercent !== null
              ? t.effective(String(r.effectivePercent).replace('.', t.decimalSeparator))
              : t.noIncome}
            <span className="ml-2 opacity-80">· {f.hint}</span>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {rows.map(item => (
              <div key={item.key} className={`${row} relative cursor-help rounded-md outline-none focus-visible:ring-2`} {...rowHandlers(item.key)}>
                <span style={{ color: 'var(--nav-text-secondary)', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{item.label}</span>
                <span className={`font-mono tabular-nums whitespace-nowrap${item.strong ? ' font-semibold' : ''}`} style={{ color: 'var(--nav-text-primary)' }}>
                  {formatTenge(item.value)}
                </span>
                <Formula id={item.key} text={item.formula} />
              </div>
            ))}
            <div className={`${row} relative cursor-help rounded-md outline-none focus-visible:ring-2`} {...rowHandlers('contrib')}>
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{t.contributionsRow}</span>
              <span className="font-mono tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>
                {formatTenge(r.contributionsMonthly)}
              </span>
              <Formula id="contrib" text={contribFormula} />
            </div>
          </div>

          {/* База СО юридически не урегулирована: основная цифра выше идёт по разъяснению
              ГФСС (СО за вычетом ОПВ), здесь второе толкование по буквальному тексту закона.
              Числа второго толкования берутся только из его собственных полей (soLaw,
              contributionsLaw, difference), не из r.so. Нулевая база: заметки нет. */}
          {r.soBase > 0 && (
            <div className="rounded-xl p-3.5 mt-3 text-[13px]" role="note" aria-labelledby="nalogi-so-note-title"
              style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}>
              <div id="nalogi-so-note-title" className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.soNote.title}</div>
              <p className="mb-2">{t.soNote.reason}</p>
              {r.difference > 0 ? (
                <>
                  <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
                    {t.soNote.other(formatTenge(r.soLaw), formatTenge(r.contributionsLaw), formatTenge(r.difference), formatTenge(r.differenceHalfYear))}
                  </p>
                  <p className="mb-2">{t.soNote.advice}</p>
                </>
              ) : (
                <p className="mb-2">{t.soNote.same}</p>
              )}
              {baseNum > 7 * MZP_2026 && <p className="mb-2">{t.soNote.corridor}</p>}
              <Link href={`${t.guideHref}#so-dva-sposoba`} hrefLang={lang === 'kk' ? 'kk' : 'ru'} style={{ color: 'var(--nav-accent)' }}>{t.soNote.more}</Link>
            </div>
          )}

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
