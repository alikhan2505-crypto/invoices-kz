'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { calculateIpTaxes, MZP_2026 } from '@/lib/ipTaxes'
import ToolCta from '../ToolCta'

// Калькулятор налогов ИП на упрощёнке — 2026. Чистая логика и границы
// взносов живут в src/lib/ipTaxes.ts (покрыто тестами); страница только
// собирает ввод и показывает разбор. Лимита нет: расчёт локальный и ничего
// не стоит, крючок — CTA, как у калькулятора маржи.
const digits = (s: string) => s.replace(/\D/g, '')
const tenge = (n: number) => `${n.toLocaleString('ru-RU')} ₸`

export default function NalogiTool() {
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

  const onChange = (fn: () => void) => { fn(); if (!touched) { setTouched(true); track('tool_nalogi_calc') } }

  const input = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none'
  const inputStyle = { background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const
  const row = 'flex items-center justify-between py-2 text-sm'

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <BrandWordmark height={15} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Налоги ИП на упрощёнке — 2026
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          По новому Налоговому кодексу: налог <b>4%</b> с дохода (в регионе может быть 2–6%) плюс взносы
          «за себя». Введите цифры — увидите, сколько уходит в месяц и за полугодие.
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label} style={labelStyle}>Доход (выручка) в месяц, ₸</label>
              <input className={input} style={inputStyle} inputMode="numeric" value={income}
                onChange={e => onChange(() => setIncome(digits(e.target.value).slice(0, 12)))} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Ставка налога в вашем регионе, %</label>
              <select className={input} style={inputStyle} value={rate} onChange={e => onChange(() => setRate(e.target.value))}>
                <option value="2">2% — минимум вилки маслихата</option>
                <option value="3">3%</option>
                <option value="4">4% — базовая ставка кодекса</option>
                <option value="5">5%</option>
                <option value="6">6% — максимум вилки</option>
              </select>
            </div>
            <div>
              <label className={label} style={labelStyle}>Доход для взносов «за себя», ₸ в месяц</label>
              <input className={input} style={inputStyle} inputMode="numeric" value={base}
                onChange={e => onChange(() => setBase(digits(e.target.value).slice(0, 12)))} />
              <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                Вы заявляете его сами, минимум для расчёта — 1 МЗП ({MZP_2026.toLocaleString('ru-RU')} ₸). 0 — дохода не было.
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>
                <input type="checkbox" checked={before1975} onChange={e => onChange(() => setBefore1975(e.target.checked))}
                  className="w-4 h-4 accent-[#5B4CE0]" />
                Родился(ась) до 1975 года — без ОПВР
              </label>
            </div>
          </div>
        </div>

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Итого в месяц</div>
          <div className="text-3xl font-black font-mono tabular-nums mb-1" style={{ color: 'var(--nav-text-primary)' }}>
            {tenge(r.totalMonthly)}
          </div>
          <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>
            {r.effectivePercent !== null ? `${String(r.effectivePercent).replace('.', ',')}% от выручки` : 'выручка не указана'}
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
            <div className={row}>
              <span style={{ color: 'var(--nav-text-secondary)' }}>Налог по упрощёнке ({rate}%)</span>
              <span className="font-mono tabular-nums font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.taxMonthly)}</span>
            </div>
            <div className={row}>
              <span style={{ color: 'var(--nav-text-secondary)' }}>ОПВ — пенсионный, 10%</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.opv)}</span>
            </div>
            <div className={row}>
              <span style={{ color: 'var(--nav-text-secondary)' }}>ОПВР — 3,5% (1975 г.р. и младше)</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.opvr)}</span>
            </div>
            <div className={row}>
              <span style={{ color: 'var(--nav-text-secondary)' }}>СО — соцотчисления, 5%</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.so)}</span>
            </div>
            <div className={row}>
              <span style={{ color: 'var(--nav-text-secondary)' }}>ВОСМС — медстрахование, фикс.</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{tenge(r.vosms)}</span>
            </div>
          </div>

          <div className="rounded-xl p-3.5 mt-3 text-[13px]" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
            Налог платится раз в полугодие с формой 910: за 6 месяцев при таком доходе — <b>{tenge(r.taxHalfYear)}</b>
            {' '}(до 25 августа и до 25 февраля). Взносы — ежемесячно до 25 числа.
          </div>
        </div>

        <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          Расчёт по ставкам 2026 года (НК № 214-VIII, МЗП 85 000 ₸). Ставку региона уточните в решении маслихата.
          Это ориентир, а не налоговая консультация. Подробный разбор —{' '}
          <Link href="/guides/nalogi-ip-uproshchenka-2026" style={{ color: 'var(--nav-accent)' }}>в гайде о налогах ИП</Link>.
        </div>

        <ToolCta source="nalogi" />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/tools" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>← Все инструменты</Link>
          <Link href="/tools/schet" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>Выставить счёт онлайн →</Link>
        </div>
      </div>
    </div>
  )
}
