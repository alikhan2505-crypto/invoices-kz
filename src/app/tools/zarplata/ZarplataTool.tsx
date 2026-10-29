'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import KkReviewNotice from '@/components/KkReviewNotice'
import {
  BASE_DEDUCTION,
  CAP_20_MZP,
  CAP_40_MZP,
  CAP_50_MZP,
  CAP_7_MZP,
  IPN_THRESHOLD_YEAR,
  MAX_GROSS,
  MRP_2026,
  MZP_2026,
  PAYROLL_CATEGORIES,
  SN_FLOOR_OBJECT,
  SOCIAL_DEDUCTION,
  calculatePayroll,
  grossFromNet,
  minGrossReachingThreshold,
  type EmployerRegime,
  type PayrollCategory,
  type PayrollResult,
  type PayrollWarningCode,
  type ReverseOptions,
} from '@/lib/payroll'
import { formatTenge, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { useToolView } from '@/lib/tools-i18n/useToolEvents'
import { checkedDate, fill, SOURCE_LINKS, zarplataDict } from './dict'

// Калькулятор зарплаты 2026, один и тот же для /tools/zarplata,
// /tools/kk/zarplata и /tools/en/zarplata: язык приходит пропсом из page.tsx
// (из адреса), как у nalogi (docs/tools-i18n-pattern.md). Вся арифметика и
// предупреждения живут в src/lib/payroll.ts (покрыто тестами), здесь только
// ввод, подпись строк и раскладка. Лимитов, квот и серверных роутов нет:
// расчёт локальный, крючок это CTA внизу. Стартовое состояние считается в
// useMemo и честно рендерится на сервере (без window в теле компонента).

const digits = (s: string) => s.replace(/\D/g, '')
// Разряды пробелами прямо в поле: «300 000» читается, «300000» нет.
const grouped = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const WARNING_ORDER: PayrollWarningCode[] = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11']

type Calc =
  | { kind: 'empty' }
  | { kind: 'tooLarge' }
  | { kind: 'ok'; r: PayrollResult; warnings: PayrollWarningCode[]; alternatives: number[] }

function isDisabledCategory(c: PayrollCategory) {
  return c === 'disabled12Indefinite' || c === 'disabled12Term' || c === 'disabled3'
}

export default function ZarplataTool({ lang }: { lang: ToolLang }) {
  const t = zarplataDict[lang]
  const chrome = TOOL_CHROME[lang]
  const sep = t.decimalSeparator
  const date = checkedDate(lang)

  const [mode, setMode] = useState<'gross' | 'net'>('gross')
  const [amount, setAmount] = useState('300000')
  const [category, setCategory] = useState<PayrollCategory>('standard')
  const [baseDeduction, setBaseDeduction] = useState(true)
  const [regime, setRegime] = useState<EmployerRegime>('general')
  const [priorMode, setPriorMode] = useState<'equal' | 'manual'>('equal')
  const [month, setMonth] = useState('1')
  const [prior, setPrior] = useState('')
  const [hire, setHire] = useState(false)
  const [born1975, setBorn1975] = useState(false)
  const [touched, setTouched] = useState(false)
  const [pinned, setPinned] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const disabledCat = isDisabledCategory(category)
  const manual = priorMode === 'manual' && !disabledCat

  const calc = useMemo<Calc>(() => {
    const n = Number(amount) || 0
    if (n <= 0) return { kind: 'empty' }
    const o: ReverseOptions = {
      category,
      baseDeduction,
      employerRegime: regime,
      hireOrFireMonth: hire,
      bornBefore1975: born1975,
      monthIndex: Number(month) || 1,
      priorTaxableCum: manual ? Number(prior) || 0 : undefined,
    }
    if (mode === 'gross') {
      const r = calculatePayroll({ gross: n, ...o })
      return { kind: 'ok', r, warnings: r.warnings, alternatives: [] }
    }
    const rev = grossFromNet(n, o)
    if (rev.tooLarge || !rev.result || (rev.gross ?? 0) > MAX_GROSS) return { kind: 'tooLarge' }
    return { kind: 'ok', r: rev.result, warnings: rev.warnings, alternatives: rev.alternatives }
  }, [amount, mode, category, baseDeduction, regime, hire, born1975, month, manual, prior])

  // Подсказка у выбора месяца: с какой начисленной месяц вообще влияет на результат.
  const monthFrom = useMemo(() => minGrossReachingThreshold({ category, baseDeduction }) ?? MAX_GROSS, [category, baseDeduction])

  const onChange = (fn: () => void) => {
    fn()
    if (!touched) setTouched(true)
  }

  useToolView('zarplata', lang)
  // «Документ» калькулятора это первый расчёт по своим цифрам за загрузку
  // страницы: человек что-то поменял и полторы секунды не печатает (не на
  // каждую цифру). Расчёт по умолчанию не считается (как у nalogi).
  const docSent = useRef(false)
  useEffect(() => {
    if (!touched || docSent.current) return
    const timer = setTimeout(() => {
      docSent.current = true
      logToolEvent('doc', 'zarplata', { lang })
    }, 1500)
    return () => clearTimeout(timer)
  }, [touched, amount, mode, category, baseDeduction, regime, hire, born1975, month, prior, priorMode, lang])

  // Пояснение, закреплённое касанием, закрывается касанием в другом месте и Esc;
  // Esc закрывает и пояснение, открытое наведением мыши.
  useEffect(() => {
    if (!pinned && !hover) return
    const onDown = (e: PointerEvent) => {
      if (!pinned) return
      const el = e.target instanceof Element ? e.target.closest('[data-zp-row]') : null
      if (!el || el.getAttribute('data-zp-row') !== pinned) setPinned(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPinned(null)
      setHover(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned, hover])

  // ----- стили (только токены --nav-*) -----
  // Видимый фокус клавиатуры вместо убранной обводки: кольцо токена --nav-accent.
  // outline-solid обязателен: рядом стоит outline-none (Tailwind 4 кладёт в него
  // --tw-outline-style: none), и без него focus-visible:outline остаётся style none.
  const focusRing = 'focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nav-accent)]'
  const inputCls = `zp-native w-full rounded-xl px-3 py-2.5 text-sm outline-none ${focusRing} min-h-[44px]`
  // WebkitTextFillColor обязателен: глобальное `input, select { -webkit-text-fill-color: ... }`
  // из globals.css перебивает `color` в Chrome/Safari, и в тёмной теме введённые
  // цифры почти не видны (та же ловушка, что у nalogi и KP).
  const inputStyle: CSSProperties = {
    background: 'var(--nav-surface-glass)',
    border: '1px solid var(--nav-border)',
    color: 'var(--nav-text-primary)',
    WebkitTextFillColor: 'var(--nav-text-primary)',
  }
  const labelCls = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle: CSSProperties = { color: 'var(--nav-text-muted)' }
  const hintCls = 'text-[12px] mt-1.5'
  const hintStyle: CSSProperties = { color: 'var(--nav-text-muted)' }
  const checkCls = 'flex items-center gap-3 text-sm cursor-pointer min-h-[44px]'

  const m = formatTenge
  // ₸ в моноширинном шрифте рисуется запасным шрифтом (крупнее и выше базовой линии):
  // знак берём в обычном шрифте и чуть меньше.
  const tenge = (n: number): ReactNode => {
    const text = m(n)
    const i = text.lastIndexOf('₸')
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <span className="font-sans text-[0.85em]">₸</span>
      </>
    )
  }
  const pctText = (x: number) => String(Math.round(x * 10) / 10).replace('.', sep)

  const segBtn = (active: boolean): CSSProperties => ({
    background: active ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
    color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-primary)',
    border: `1px solid ${active ? 'var(--nav-accent)' : 'var(--nav-border)'}`,
  })

  // ----- результат -----
  let resultBlock: ReactNode
  if (calc.kind === 'empty' || calc.kind === 'tooLarge') {
    resultBlock = (
      <p role="status" className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        {calc.kind === 'empty' ? t.empty : t.tooLarge}
      </p>
    )
  } else {
    const r = calc.r
    const d = r.ipnDetail
    const cost = r.employerCost
    const sharePct = r.gross > 0 ? (r.withheld / r.gross) * 100 : 0

    // Формула каждой строки с реальными числами: по наведению мыши и по касанию кнопки «?».
    const rawBase = r.gross - r.opv - r.vosms - d.baseDeduction
    const ipnCalc = `${m(d.base10)} × 10%${d.base15 > 0 ? ` + ${m(d.base15)} × 15%` : ''}`
    const baseText =
      fill(t.exBase, {
        gross: m(r.gross),
        opv: m(r.opv),
        vosms: m(r.vosms),
        ded: m(d.baseDeduction),
        social: d.socialApplied > 0 ? fill(t.exBaseSocial, { sd: m(d.socialApplied) }) : '',
        base: m(rawBase >= 0 ? d.base : rawBase),
      }) + (rawBase < 0 ? t.exBaseNeg : '')
    const explain: Record<string, string> = {
      net: fill(t.exNet, { gross: m(r.gross), opv: m(r.opv), vosms: m(r.vosms), ipn: m(r.ipn), value: m(r.net) }),
      opv: r.exempt.opv ? t.exemptOpv : fill(t.exOpv, { base: m(r.bases.opv), value: m(r.opv), cap: m(CAP_50_MZP) }),
      vosms: r.exempt.vosms ? t.exemptOsms : fill(t.exVosms, { base: m(r.bases.vosms), value: m(r.vosms), cap: m(CAP_20_MZP) }),
      ipn: fill(t.exIpn, { calc: ipnCalc, value: m(r.ipn), threshold: m(IPN_THRESHOLD_YEAR) }),
      base: baseText,
      opvr: r.exempt.opvrBorn1975 ? t.exemptOpvr1975 : r.exempt.opvr ? t.exemptOpvr : fill(t.exOpvr, { base: m(r.bases.opvr), value: m(r.opvr), mzp: m(MZP_2026) }),
      so: r.exempt.so ? t.exemptSo : fill(t.exSo, { base: m(r.bases.so), value: m(r.so), mzp: m(MZP_2026), cap: m(CAP_7_MZP) }),
      sn:
        r.input.employerRegime === 'simplified'
          ? t.exSnSimple
          : r.snFixed
            ? fill(t.exSnSole, { value: m(r.sn) })
            : r.snFloorApplied
            ? fill(t.exSnFloor, { floor: m(SN_FLOOR_OBJECT), value: m(r.sn) })
            : fill(t.exSn, { base: m(r.bases.sn), value: m(r.sn) }),
      oosms: r.exempt.oosms ? t.exemptOsms : fill(t.exOosms, { base: m(r.bases.oosms), value: m(r.oosms), cap: m(CAP_40_MZP) }),
      cost: fill(t.exCost, { gross: m(r.gross), opvr: m(r.opvr), so: m(r.so), sn: m(r.sn), oosms: m(r.oosms), value: m(cost) }),
    }

    const explainButton = (key: string, label: string, margins = '-my-2 -mr-2 ') => {
      const open = pinned === key || hover === key
      return (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`zp-ex-${key}`}
          aria-label={fill(t.explain, { label })}
          onClick={() => setPinned(p => (p === key ? null : key))}
          className={`${margins}flex h-11 w-11 flex-none items-center justify-center rounded-full outline-none ${focusRing}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold"
            style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)', background: 'var(--nav-surface-glass)' }}
          >
            ?
          </span>
        </button>
      )
    }
    const tooltip = (key: string) => (
      <div
        id={`zp-ex-${key}`}
        role="tooltip"
        hidden={!(pinned === key || hover === key)}
        className="absolute left-0 right-0 top-full z-20 mt-0.5 rounded-xl px-3 py-2 text-[12px] leading-snug shadow-lg [overflow-wrap:anywhere]"
        style={{ background: 'var(--nav-text-primary)', color: 'var(--nav-bg)' }}
      >
        {explain[key]}
      </div>
    )
    const hoverProps = (key: string) => ({
      'data-zp-row': key,
      onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHover(key) },
      onPointerLeave: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHover(h => (h === key ? null : h)) },
    })
    const row = (key: string, label: string, value: number, opts: { strong?: boolean; muted?: boolean } = {}) => (
      <div key={key} {...hoverProps(key)} className="relative flex items-center justify-between gap-2 py-1.5 text-sm">
        <span
          className={`min-w-0 flex-1${opts.strong ? ' font-semibold' : ''}`}
          style={{ color: opts.strong ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)' }}
        >
          {label}
        </span>
        <span className={`font-mono tabular-nums whitespace-nowrap${opts.strong ? ' font-semibold' : ''}`} style={{ color: 'var(--nav-text-primary)' }}>
          {tenge(value)}
        </span>
        {explainButton(key, label)}
        {tooltip(key)}
      </div>
    )

    // Составной столбец: доля каждой части в стоимости работника.
    const segments = [
      { key: 'net', label: t.barNet, value: r.net, color: 'var(--nav-accent)' },
      { key: 'withheld', label: t.barWithheld, value: r.withheld, color: 'var(--nav-teal)' },
      { key: 'employer', label: t.barEmployer, value: cost - r.gross, color: 'var(--nav-magenta)' },
    ]
    const barLabel = `${t.barTitle}: ${segments.map(s => `${s.label} ${m(s.value)}`).join(', ')}`

    // Тексты предупреждений собираются из кодов, числа берутся из констант и результата.
    const warningText = (code: PayrollWarningCode): string => {
      switch (code) {
        case 'w1': return fill(r.gross < MZP_2026 ? (r.exempt.opvr ? t.w1NoOpvr : t.warnings.w1) : t.w1Base, { mzp: m(MZP_2026) })
        case 'w4': return fill(r.exempt.opvr ? t.w4NoOpvr : t.warnings.w4, { cap50: m(CAP_50_MZP), cap20: m(CAP_20_MZP), cap40: m(CAP_40_MZP) })
        case 'w5': return fill(t.warnings.w5, { cap7: m(CAP_7_MZP) })
        case 'w6': return fill(t.warnings.w6, { floor: m(SN_FLOOR_OBJECT), value: m(r.sn) })
        case 'w7':
          return r.thresholdMonth !== null
            ? fill(t.warnings.w7, { threshold: m(IPN_THRESHOLD_YEAR), month: r.thresholdMonth })
            : fill(t.w7Manual, { threshold: m(IPN_THRESHOLD_YEAR) })
        case 'w9': return fill(t.warnings.w9, { list: calc.alternatives.map(m).join(', ') })
        case 'w10': return fill(t.warnings.w10, { amount: m(d.socialLimit) })
        default: return t.warnings[code]
      }
    }
    const warnings = WARNING_ORDER.filter(c => calc.warnings.includes(c))

    resultBlock = (
      <>
        {/* Живая область держит только цифры результата; кнопка «?» и подсказка вынесены из неё. */}
        <div {...hoverProps('net')} className="relative">
          <div aria-live="polite" aria-atomic="true">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
              {mode === 'gross' ? t.net : t.gross}
            </div>
            <div className="pr-10 text-3xl font-black font-mono tabular-nums break-all" style={{ color: 'var(--nav-text-primary)' }}>
              {tenge(mode === 'gross' ? r.net : r.gross)}
            </div>
            {mode === 'net' && (
              <div className="text-sm mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.net}: <span className="font-mono tabular-nums">{tenge(r.net)}</span>
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
              {fill(t.withheldLine, { amount: m(r.withheld), share: pctText(sharePct) })}
            </div>
          </div>
          <div className="absolute right-0 top-3.5">{explainButton('net', mode === 'gross' ? t.net : t.gross, '')}</div>
          {tooltip('net')}
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={labelStyle}>{t.barTitle}</div>
          <div role="img" aria-label={barLabel} className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--nav-border)' }}>
            {segments.map(s =>
              s.value > 0 ? (
                <div key={s.key} style={{ width: `${(s.value / cost) * 100}%`, minWidth: 3, background: s.color }} />
              ) : null,
            )}
          </div>
          <ul className="mt-2 grid gap-1 text-[12px]" style={{ color: 'var(--nav-text-secondary)' }}>
            {segments.map(s => (
              <li key={s.key} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1">{s.label}</span>
                <span className="font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>
                  {tenge(s.value)} · {pctText((s.value / cost) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.groupEmployee}</div>
          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {row('opv', t.opv, r.opv)}
            {row('vosms', t.vosms, r.vosms)}
            {row('ipn', t.ipn, r.ipn)}
            {row('base', t.base, d.base)}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.groupEmployer}</div>
          <div role="group" aria-label={t.regime} className="grid gap-2 mb-1 sm:grid-cols-3">
            {([['general', t.regimeGeneral], ['soleGeneral', t.regimeSole], ['simplified', t.regimeSimple]] as const).map(([v, text]) => (
              <button
                key={v}
                type="button"
                aria-pressed={regime === v}
                onClick={() => onChange(() => setRegime(v))}
                className={`rounded-xl px-2 py-2 text-[13px] font-semibold min-h-[44px] outline-none ${focusRing}`}
                style={{ ...segBtn(regime === v), touchAction: 'manipulation' }}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {row('opvr', t.opvr, r.opvr)}
            {row('so', t.so, r.so)}
            {row('sn', r.snFixed ? t.snSole : r.input.employerRegime === 'simplified' ? t.snNone : t.sn, r.sn)}
            {row('oosms', t.oosms, r.oosms)}
          </div>
        </div>

        <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--nav-border)' }}>
          {row('cost', t.cost, cost, { strong: true })}
          <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.state}</span>
            <span className="font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.totalToState)}</span>
          </div>
        </div>

        {warnings.length > 0 && (
          <div
            role="status"
            className="rounded-xl p-3.5 mt-3 text-[13px]"
            style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-warning)', color: 'var(--nav-text-primary)' }}
          >
            <ul className="grid gap-2">
              {warnings.map(c => <li key={c}>{warningText(c)}</li>)}
            </ul>
          </div>
        )}
      </>
    )
  }

  const consts: Array<[string, number]> = [
    [t.consts.mrp, MRP_2026],
    [t.consts.mzp, MZP_2026],
    [t.consts.deduction, BASE_DEDUCTION],
    [t.consts.threshold, IPN_THRESHOLD_YEAR],
    [t.consts.cap50, CAP_50_MZP],
    [t.consts.cap20, CAP_20_MZP],
    [t.consts.cap40, CAP_40_MZP],
    [t.consts.cap7, CAP_7_MZP],
    [t.consts.floor, SN_FLOOR_OBJECT],
  ]
  const sources: Array<[string, string]> = [
    [t.srcNk, SOURCE_LINKS.nk],
    [t.srcSoc, SOURCE_LINKS.soc],
    [t.srcOsms, SOURCE_LINKS.osms],
    [t.srcBudget, SOURCE_LINKS.budget],
    [t.srcSoRules, SOURCE_LINKS.soRules],
    [t.srcOsmsRules, SOURCE_LINKS.osmsRules],
  ]
  const hintFor = (c: PayrollCategory) =>
    c === 'standard' ? null : fill(t.categoryHint[c], { amount: m(SOCIAL_DEDUCTION[c as keyof typeof SOCIAL_DEDUCTION] ?? 0) })
  const catHint = hintFor(category)

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      {/* Нативные поля, флажки и переключатели рисуются в цветовой схеме страницы:
          без ручного выбора темы по ОС, при ручном выборе по data-theme. Правило локальное
          (только поля калькулятора), общий color-scheme на :root не трогаем. */}
      <style>{`.zp-native{color-scheme:light dark}:root[data-theme="light"] .zp-native{color-scheme:light}:root[data-theme="dark"] .zp-native{color-scheme:dark}`}</style>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch slug="zarplata" lang={lang} />
        </div>

        {/* Плашка «текст проверяется» (реестр: src/lib/kkReview.ts): под шапкой, над заголовком; для ru/en и вне реестра её нет. */}
        {lang === 'kk' && <KkReviewNotice className="mb-4 sm:mb-5" />}

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          {fill(t.intro, { mrp: m(MRP_2026), mzp: m(MZP_2026), date })}
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div role="group" aria-label={t.modeLabel} className="grid grid-cols-2 gap-2 mb-4">
            {([['gross', t.modeGross], ['net', t.modeNet]] as const).map(([v, text]) => (
              <button
                key={v}
                type="button"
                aria-pressed={mode === v}
                onClick={() => onChange(() => setMode(v))}
                className={`rounded-xl px-2 py-2 text-sm font-semibold min-h-[44px] outline-none ${focusRing}`}
                style={{ ...segBtn(mode === v), touchAction: 'manipulation' }}
              >
                {text}
              </button>
            ))}
          </div>

          <div className="grid gap-4">
            <div>
              <label htmlFor="zp-amount" className={labelCls} style={labelStyle}>
                {mode === 'gross' ? t.amountGross : t.amountNet}
              </label>
              <input
                id="zp-amount"
                className={`${inputCls} font-mono tabular-nums`}
                style={inputStyle}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={grouped(amount)}
                onChange={e => onChange(() => setAmount(digits(e.target.value).slice(0, 9)))}
              />
            </div>

            <div>
              <label htmlFor="zp-category" className={labelCls} style={labelStyle}>{t.category}</label>
              <select
                id="zp-category"
                className={inputCls}
                style={inputStyle}
                value={category}
                aria-describedby={catHint ? 'zp-category-hint' : undefined}
                onChange={e => onChange(() => setCategory(e.target.value as PayrollCategory))}
              >
                {PAYROLL_CATEGORIES.map(c => <option key={c} value={c}>{t.categories[c]}</option>)}
              </select>
              {catHint && <div id="zp-category-hint" className={hintCls} style={hintStyle}>{catHint}</div>}
            </div>

            <div>
              <label className={checkCls} style={{ color: 'var(--nav-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={born1975}
                  aria-describedby="zp-born-hint"
                  onChange={e => onChange(() => setBorn1975(e.target.checked))}
                  className="zp-native h-5 w-5 flex-none"
                  style={{ accentColor: 'var(--nav-accent)' }}
                />
                <span>{t.born1975}</span>
              </label>
              <div id="zp-born-hint" className={hintCls} style={hintStyle}>{t.born1975Hint}</div>
            </div>

            <div>
              <label className={checkCls} style={{ color: 'var(--nav-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={baseDeduction}
                  aria-describedby="zp-deduction-hint"
                  onChange={e => onChange(() => setBaseDeduction(e.target.checked))}
                  className="zp-native h-5 w-5 flex-none"
                  style={{ accentColor: 'var(--nav-accent)' }}
                />
                <span>{fill(t.deduction, { amount: m(BASE_DEDUCTION) })}</span>
              </label>
              <div id="zp-deduction-hint" className={hintCls} style={hintStyle}>{t.deductionHint}</div>
            </div>

            <details className="group rounded-xl" style={{ border: '1px solid var(--nav-border)' }}>
              <summary
                className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold outline-none ${focusRing}`}
                style={{ color: 'var(--nav-text-primary)' }}
              >
                <span className="flex flex-col gap-0.5 py-1">
                  <span>{t.advanced}</span>
                  <span className="text-xs font-normal" style={{ color: 'var(--nav-text-muted)' }}>{t.advancedHint}</span>
                </span>
                <span aria-hidden="true" className="transition-transform group-open:rotate-45" style={{ color: 'var(--nav-text-muted)' }}>+</span>
              </summary>
              <div className="grid gap-4 px-3 pb-3 pt-1">
                {!disabledCat && (
                  <div role="radiogroup" aria-label={t.priorModeLabel} className="grid gap-0.5">
                    {([['equal', t.priorEqual], ['manual', t.priorManual]] as const).map(([v, text]) => (
                      <label key={v} className={checkCls} style={{ color: 'var(--nav-text-primary)' }}>
                        <input
                          type="radio"
                          name="zp-prior-mode"
                          checked={priorMode === v}
                          onChange={() => onChange(() => setPriorMode(v))}
                          className="zp-native h-5 w-5 flex-none"
                          style={{ accentColor: 'var(--nav-accent)' }}
                        />
                        <span>{text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {!manual ? (
                  <div>
                    <label htmlFor="zp-month" className={labelCls} style={labelStyle}>{t.month}</label>
                    <select
                      id="zp-month"
                      className={inputCls}
                      style={inputStyle}
                      value={month}
                      aria-describedby="zp-month-hint"
                      onChange={e => onChange(() => setMonth(e.target.value))}
                    >
                      {t.months.map((name, i) => <option key={name} value={String(i + 1)}>{`${i + 1}. ${name}`}</option>)}
                    </select>
                    <div id="zp-month-hint" className={hintCls} style={hintStyle}>{fill(t.monthHint, { from: m(monthFrom) })}</div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="zp-prior" className={labelCls} style={labelStyle}>{t.prior}</label>
                    <input
                      id="zp-prior"
                      className={`${inputCls} font-mono tabular-nums`}
                      style={inputStyle}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby="zp-prior-hint"
                      value={grouped(prior)}
                      onChange={e => onChange(() => setPrior(digits(e.target.value).slice(0, 12)))}
                    />
                    <div id="zp-prior-hint" className={hintCls} style={hintStyle}>{t.priorHint}</div>
                  </div>
                )}

                <div>
                  <label className={checkCls} style={{ color: 'var(--nav-text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={hire}
                      aria-describedby="zp-hire-hint"
                      onChange={e => onChange(() => setHire(e.target.checked))}
                      className="zp-native h-5 w-5 flex-none"
                      style={{ accentColor: 'var(--nav-accent)' }}
                    />
                    <span>{t.hire}</span>
                  </label>
                  <div id="zp-hire-hint" className={hintCls} style={hintStyle}>{t.hireHint}</div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4">
          {resultBlock}

          {calc.kind === 'ok' && (
            <>
              <p role="note" className="text-[12px] mt-3" style={{ color: 'var(--nav-text-muted)' }}>{t.noteRounding}</p>

              <details className="group mt-3">
                <summary
                  className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden flex min-h-[44px] items-center justify-between gap-3 rounded-lg text-sm font-semibold outline-none ${focusRing}`}
                  style={{ color: 'var(--nav-text-primary)' }}
                >
                  <span>{t.how}</span>
                  <span aria-hidden="true" className="transition-transform group-open:rotate-45" style={{ color: 'var(--nav-text-muted)' }}>+</span>
                </summary>
                <ul className="grid gap-2 text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.howSteps.map(step => <li key={step}>{step}</li>)}
                </ul>
                <dl className="text-[13px] divide-y" style={{ borderColor: 'var(--nav-border)' }}>
                  {consts.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="min-w-0 flex-1" style={{ color: 'var(--nav-text-secondary)' }}>{label}</dt>
                      <dd className="font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>{tenge(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[12px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{fill(t.checkedOn, { date })}</p>
              </details>
            </>
          )}
        </div>

        <div className="text-[12px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          <p className="mb-1">{t.noteScope}</p>
          <ul className="mb-2 list-disc space-y-0.5 pl-5">
            {t.noteScopeList.map(item => <li key={item}>{item}</li>)}
          </ul>
          {t.disclaimer}{' '}
          <Link href={t.guideHref} hrefLang={lang === 'kk' ? 'kk' : 'ru'} style={{ color: 'var(--nav-accent)' }}>{t.guideLink}</Link>.
        </div>

        <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby="zp-deadlines">
          <h2 id="zp-deadlines" className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.deadlinesTitle}</h2>
          <p className="text-[13px] mb-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{t.deadlineMonthly}</p>
          <p className="text-[13px]" style={{ color: 'var(--nav-text-secondary)' }}>{t.deadlineReturn}</p>
        </section>

        <section className="nav-glass rounded-2xl p-5 mt-4" aria-labelledby="zp-sources">
          <h2 id="zp-sources" className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{fill(t.sourcesTitle, { date })}</h2>
          <ul className="grid gap-1.5 text-[13px]">
            {sources.map(([text, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--nav-accent)' }}>{text}</a>
              </li>
            ))}
          </ul>
        </section>

        <section className="nav-glass rounded-2xl p-5 mt-4" aria-labelledby="zp-faq">
          <h2 id="zp-faq" className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            {t.faq.map(item => (
              <details key={item.q} className="py-2.5 group">
                <summary
                  className={`text-sm font-semibold cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-start justify-between gap-3 rounded-lg outline-none ${focusRing}`}
                  style={{ color: 'var(--nav-text-primary)' }}
                >
                  <span>{item.q}</span>
                  <span aria-hidden="true" className="transition-transform group-open:rotate-45 flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>+</span>
                </summary>
                <p className="text-[13px] mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <ToolCta source="zarplata" lang={lang} />

        <div className="mt-6 flex gap-x-4 gap-y-2 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
          <Link href={toolLinkPath('nalogi', lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.taxesIpLink}</Link>
          <Link href={toolLinkPath('schet', lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.createInvoice}</Link>
        </div>
      </div>
    </div>
  )
}
