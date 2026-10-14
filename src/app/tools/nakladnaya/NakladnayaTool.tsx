'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { generateNakladnaya } from '@/lib/generateNakladnaya'
import { useLanguage } from '@/components/LanguageProvider'
import { formatTenge, guidesIndexPath, toolPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { nakladnayaDict } from './dict'
import {
  digits, documentRows, documentTotal, localToday, ruDate, validateForm, vatIncluded,
  type Form, type Row, type VatType,
} from './calc'

// Бесплатный генератор накладной (З-2) — близнец /tools/avr: лимит 3 в день
// на браузер, черновик в localStorage, рендер — продуктовым
// generateNakladnaya (окно с кнопкой «Скачать PDF»).
// Один и тот же инструмент для /tools/nakladnaya, /tools/kk/nakladnaya и
// /tools/en/nakladnaya: язык интерфейса приходит пропсом (из адреса), а сам
// бланк всегда русский — см. docs/tools-i18n-pattern.md.
const LIMIT = 3
const COUNT_KEY = 'tool-nakladnaya-count'
const DRAFT_KEY = 'tool-nakladnaya-draft'
const VAT_TYPES: VatType[] = ['no_vat', 'vat_16', 'vat_0']

// Дата заполняется на клиенте после монтирования: сервер и браузер живут в
// разных часовых поясах, а модуль на сервере может жить сутками.
const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '',
  clientName: '', clientBin: '',
  number: '1', date: '',
  vatType: 'no_vat',
  rows: [{ name: '', qty: '1', price: '' }],
}

function readCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(COUNT_KEY) || 'null')
    return raw && raw.d === localToday() ? Number(raw.n) || 0 : 0
  } catch { return 0 }
}

function bumpCount(): number {
  const n = readCount() + 1
  try { localStorage.setItem(COUNT_KEY, JSON.stringify({ d: localToday(), n })) } catch {}
  return n
}

export default function NakladnayaTool({ lang }: { lang: ToolLang }) {
  const t = nakladnayaDict[lang]
  const chrome = TOOL_CHROME[lang]
  const { setLang } = useLanguage()
  const [f, setF] = useState<Form>(EMPTY)
  const [used, setUsed] = useState(0)
  const [error, setError] = useState('')
  // Черновик пишем только после того, как прочитали сохранённый, — иначе
  // первый же эффект сохранения затёр бы его пустой формой (в dev React
  // запускает эффекты дважды, и черновик терялся бы).
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUsed(readCount())
    let draft: Partial<Form> | null = null
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (raw && typeof raw === 'object' && Array.isArray(raw.rows)) draft = raw
    } catch {}
    setF(prev => {
      const next: Form = { ...prev, ...(draft || {}) }
      // Реквизиты и товары из черновика берём, а вчерашнюю дату — нет: иначе
      // накладная, сделанная на следующий день, молча печаталась бы прошлым
      // числом (то же правило, что в /tools/kp). Дата на будущее остаётся.
      const today = localToday()
      if (!next.date || next.date < today) next.date = today
      if (!VAT_TYPES.includes(next.vatType)) next.vatType = 'no_vat'
      if (next.rows.length === 0) next.rows = EMPTY.rows
      return next
    })
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch {}
  }, [f, ready])

  const set = (patch: Partial<Form>) => setF(prev => ({ ...prev, ...patch }))
  const setRow = (i: number, patch: Partial<Row>) =>
    setF(prev => ({ ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  // Итог — по тем же строкам и той же формуле, что попадут в документ.
  const total = useMemo(() => documentTotal(f.rows), [f.rows])
  const vat = vatIncluded(total, f.vatType)

  const limitReached = used >= LIMIT

  const generate = async () => {
    if (limitReached) return
    const problem = validateForm(f, t.errors)
    setError(problem)
    if (problem) return
    // Окно — синхронно в клике, иначе его съест блокировщик всплывающих окон.
    const win = window.open('', '_blank')
    if (!win) {
      // Окно не открылось — накладную никто не увидит, попытку не списываем.
      setError(t.errors.popup)
      track('tool_nakladnaya_popup_blocked', { lang })
      return
    }
    track('tool_nakladnaya_generate', { lang })
    await generateNakladnaya({
      number: f.number.trim() || '1',
      date: ruDate(f.date || localToday()),
      clientName: f.clientName.trim(),
      clientBin: digits(f.clientBin) || undefined,
      services: documentRows(f.rows).map(r => ({ ...r, type: 'product' as const })),
      total,
      vatType: f.vatType,
      profile: {
        company_name: f.companyName.trim(),
        bin_iin: digits(f.binIin),
        address: f.address.trim(),
        director_name: f.director.trim() || undefined,
      },
    }, win)
    const n = bumpCount()
    setUsed(n)
    if (n >= LIMIT) track('tool_nakladnaya_limit', { lang })
  }

  // Клик в регистрацию запоминает язык страницы — /login откроется на нём же.
  const signupClick = () => { setLang(lang); track('tool_nakladnaya_signup_click', { lang }) }

  const input = 'w-full min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none'
  // WebkitTextFillColor обязателен: глобальное `input { -webkit-text-fill-color:
  // #111827 }` в globals.css в Chrome/Safari перебивает `color`, и при тёмной
  // теме ОС (без data-theme="dark") введённый текст был почти чёрным на тёмном.
  const inputStyle = {
    background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)',
    color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)',
  } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const
  const accentLink = { color: 'var(--nav-accent)' } as const

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch slug="nakladnaya" lang={lang} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <div className="mb-6">
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            {t.intro(LIMIT)}
          </p>
          {t.docLangNote && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
              {t.docLangNote}
            </p>
          )}
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.supplierTitle}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="nk-company" className={label} style={labelStyle}>{t.companyLabel}</label>
              <input id="nk-company" className={input} style={inputStyle} placeholder={t.companyPlaceholder} autoComplete="organization" value={f.companyName} onChange={e => set({ companyName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="nk-bin" className={label} style={labelStyle}>{t.binLabel}</label>
              <input id="nk-bin" className={input} style={inputStyle} inputMode="numeric" autoComplete="off" placeholder={t.binPlaceholder} value={f.binIin} onChange={e => set({ binIin: digits(e.target.value).slice(0, 12) })} />
            </div>
            <div>
              <label htmlFor="nk-director" className={label} style={labelStyle}>{t.directorLabel}</label>
              <input id="nk-director" className={input} style={inputStyle} placeholder={t.directorPlaceholder} autoComplete="name" value={f.director} onChange={e => set({ director: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nk-address" className={label} style={labelStyle}>{t.addressLabel}</label>
              <input id="nk-address" className={input} style={inputStyle} autoComplete="street-address" value={f.address} onChange={e => set({ address: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.recipientTitle}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nk-client" className={label} style={labelStyle}>{t.clientNameLabel}</label>
              <input id="nk-client" className={input} style={inputStyle} autoComplete="off" value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="nk-client-bin" className={label} style={labelStyle}>{t.clientBinLabel}</label>
              <input id="nk-client-bin" className={input} style={inputStyle} inputMode="numeric" autoComplete="off" placeholder={t.binPlaceholder} value={f.clientBin} onChange={e => set({ clientBin: digits(e.target.value).slice(0, 12) })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.docTitle}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label htmlFor="nk-number" className={label} style={labelStyle}>{t.numberLabel}</label>
              <input id="nk-number" className={input} style={inputStyle} autoComplete="off" value={f.number} onChange={e => set({ number: e.target.value })} />
            </div>
            <div>
              <label htmlFor="nk-date" className={label} style={labelStyle}>{t.dateLabel}</label>
              <input id="nk-date" type="date" lang={lang} className={input} style={inputStyle} value={f.date} onChange={e => set({ date: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="nk-vat" className={label} style={labelStyle}>{t.vatLabel}</label>
              <select id="nk-vat" className={input} style={inputStyle} value={f.vatType} onChange={e => set({ vatType: e.target.value as VatType })}>
                {VAT_TYPES.map(v => <option key={v} value={v}>{t.vatOptions[v]}</option>)}
              </select>
            </div>
          </div>

          {f.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_96px_28px] sm:grid-cols-[minmax(0,1fr)_72px_110px_32px] gap-2 mb-2 items-center">
              <input className={input} style={inputStyle} aria-label={t.itemAria(i + 1)} placeholder={t.itemPlaceholder(i + 1)} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={t.qtyAria(i + 1)} placeholder={t.qtyPlaceholder} value={r.qty} onChange={e => setRow(i, { qty: digits(e.target.value).slice(0, 6) })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={t.priceAria(i + 1)} placeholder={t.pricePlaceholder} value={r.price} onChange={e => setRow(i, { price: digits(e.target.value).slice(0, 10) })} />
              <button
                type="button"
                onClick={() => setF(prev => ({ ...prev, rows: prev.rows.length > 1 ? prev.rows.filter((_, j) => j !== i) : prev.rows }))}
                disabled={f.rows.length <= 1}
                className="text-lg leading-none disabled:opacity-30" style={{ color: 'var(--nav-text-muted)' }} aria-label={t.removeRow(i + 1)}>×</button>
            </div>
          ))}
          <div className="flex items-start justify-between flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => setF(prev => ({ ...prev, rows: [...prev.rows, { name: '', qty: '1', price: '' }] }))}
              className="text-sm font-semibold" style={accentLink}>{t.addRow}</button>
            <div className="text-right" aria-live="polite">
              <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>
                {t.total(formatTenge(total))}
              </div>
              {f.vatType === 'vat_16' && total > 0 && (
                <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.vatIncluded(formatTenge(vat))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div aria-live="polite">
          {error && <div className="nav-glass rounded-xl p-3.5 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
        </div>

        {limitReached ? (
          <div className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
            <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              {t.limitTitle(LIMIT)}
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.limitBody}
            </p>
            <a href="/login?utm_source=tools&utm_medium=limit&utm_campaign=nakladnaya"
              onClick={signupClick}
              className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {t.limitButton}
            </a>
          </div>
        ) : (
          <div className="mb-4">
            <button type="button" onClick={generate}
              className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {t.generate}
            </button>
            <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
              {t.remaining(LIMIT - used, LIMIT)}
            </div>
          </div>
        )}

        <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby="nk-faq">
          <h2 id="nk-faq" className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          {t.faq.map(item => (
            <details key={item.q} className="py-2 border-t first:border-t-0" style={{ borderColor: 'var(--nav-border)' }}>
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>{item.q}</summary>
              <p className="text-[13px] mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
            </details>
          ))}
        </section>

        <ToolCta source="nakladnaya" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={accentLink}>{chrome.allTools}</Link>
          {/* У склейки накладных с 14.10.2026 свои kk/en-адреса. */}
          <Link href={toolPath('waybills', lang)} className="text-sm font-semibold" style={accentLink}>
            {t.waybillsLink}
          </Link>
          <Link href={guidesIndexPath(lang)} className="text-sm font-semibold" style={accentLink}>{chrome.guides}</Link>
        </div>
      </div>
    </div>
  )
}
