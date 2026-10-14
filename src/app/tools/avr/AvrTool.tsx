'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { generateAVR } from '@/lib/generateAVR'
import { useLanguage } from '@/components/LanguageProvider'
import { formatTenge, guidesIndexPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import BinNameField from '@/lib/tools-i18n/BinNameField'
import { avrDict } from './dict'
import {
  digits, documentRows, documentTotal, localToday, ruDate, validateForm, vatIncluded, VAT_TYPES,
  type Form, type Row, type VatType,
} from './calc'
import { TOOL_UNITS, DEFAULT_UNIT, UNIT_LABELS, unitAria } from '@/lib/tools-i18n/units'

// Бесплатный генератор АВР — близнец /tools/schet: тот же лимит 3 в день
// на браузер, тот же черновик в localStorage, рендер — продуктовым
// generateAVR (форма Р-1 с суммой прописью и кнопкой «Скачать PDF» в окне).
// Бледный знак INVOICES.KZ фоном (showWatermark, docWatermark.ts) — как на
// счёте бесплатного тарифа; у платящих в кабинете его нет. Крючки — лимит и CTA.
// Один и тот же инструмент для /tools/avr, /tools/kk/avr и /tools/en/avr:
// язык интерфейса приходит пропсом (из адреса), а сам бланк всегда русский —
// см. docs/tools-i18n-pattern.md.
const LIMIT = 3
const COUNT_KEY = 'tool-avr-count'
const DRAFT_KEY = 'tool-avr-draft'

// Гайд «документы ИП» есть на ru и kk; en ведёт на русский (помечено в подписи).
const GUIDE_SLUG = 'dokumenty-ip-kazakhstan'

// Дата заполняется на клиенте после монтирования: сервер и браузер живут в
// разных часовых поясах, а модуль на сервере может жить сутками.
const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '', phone: '',
  clientName: '', clientBin: '', clientAddress: '',
  number: '1', date: '', contractNumber: '', contractDate: '',
  vatType: 'no_vat',
  rows: [{ name: '', qty: '1', unit: DEFAULT_UNIT, price: '' }],
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

export default function AvrTool({ lang }: { lang: ToolLang }) {
  const t = avrDict[lang]
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
      // Реквизиты и работы из черновика берём, а вчерашнюю дату акта — нет:
      // иначе акт, сделанный на следующий день, молча печатался бы прошлым
      // числом (то же правило, что в /tools/nakladnaya и /tools/kp). Дату
      // договора не трогаем — она и должна быть в прошлом.
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
      // Окно не открылось — акт никто не увидит, попытку не списываем.
      setError(t.errors.popup)
      track('tool_avr_popup_blocked', { lang })
      return
    }
    track('tool_avr_generate', { lang })
    await generateAVR({
      showWatermark: true,
      number: f.number.trim() || '1',
      date: ruDate(f.date || localToday()),
      contractNumber: f.contractNumber.trim() || undefined,
      contractDate: f.contractDate ? ruDate(f.contractDate) : undefined,
      clientName: f.clientName.trim(),
      clientBin: digits(f.clientBin) || undefined,
      clientAddress: f.clientAddress.trim() || undefined,
      services: documentRows(f.rows),
      total,
      vatType: f.vatType,
      profile: {
        company_name: f.companyName.trim(),
        bin_iin: digits(f.binIin),
        address: f.address.trim(),
        phone: f.phone.trim() || undefined,
        director_name: f.director.trim() || undefined,
      },
    }, win)
    const n = bumpCount()
    setUsed(n)
    if (n >= LIMIT) track('tool_avr_limit', { lang })
  }

  // Клик в регистрацию запоминает язык страницы — /login откроется на нём же.
  const signupClick = () => { setLang(lang); track('tool_avr_signup_click', { lang }) }

  const guidePath = lang === 'kk' ? `/guides/kk/${GUIDE_SLUG}` : `/guides/${GUIDE_SLUG}`

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
          <ToolLangSwitch slug="avr" lang={lang} />
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
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.executorTitle}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Сначала БИН/ИИН с «Найти», под ним название — его и подставит поиск. */}
            <BinNameField id="avr-bin" tool="avr" role="seller" lang={lang}
              className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]"
              label={t.binLabel} placeholder={t.binPlaceholder}
              value={f.binIin} onChange={bin => set({ binIin: bin })} onName={name => set({ companyName: name })}
              inputClass={input} inputStyle={inputStyle} labelClass={label} labelStyle={labelStyle} />
            <div className="sm:col-span-2">
              <label htmlFor="avr-company" className={label} style={labelStyle}>{t.companyLabel}</label>
              <input id="avr-company" className={input} style={inputStyle} placeholder={t.companyPlaceholder} autoComplete="organization" value={f.companyName} onChange={e => set({ companyName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-director" className={label} style={labelStyle}>{t.directorLabel}</label>
              <input id="avr-director" className={input} style={inputStyle} placeholder={t.directorPlaceholder} autoComplete="name" value={f.director} onChange={e => set({ director: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-address" className={label} style={labelStyle}>{t.addressLabel}</label>
              <input id="avr-address" className={input} style={inputStyle} autoComplete="street-address" value={f.address} onChange={e => set({ address: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-phone" className={label} style={labelStyle}>{t.phoneLabel}</label>
              <input id="avr-phone" type="tel" className={input} style={inputStyle} autoComplete="tel" value={f.phone} onChange={e => set({ phone: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.customerTitle}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <BinNameField id="avr-client-bin" tool="avr" role="client" lang={lang}
              className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]"
              label={t.clientBinLabel} placeholder={t.binPlaceholder}
              value={f.clientBin} onChange={bin => set({ clientBin: bin })} onName={name => set({ clientName: name })}
              inputClass={input} inputStyle={inputStyle} labelClass={label} labelStyle={labelStyle} />
            <div className="sm:col-span-2">
              <label htmlFor="avr-client" className={label} style={labelStyle}>{t.clientNameLabel}</label>
              <input id="avr-client" className={input} style={inputStyle} autoComplete="off" value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="avr-client-address" className={label} style={labelStyle}>{t.clientAddressLabel}</label>
              <input id="avr-client-address" className={input} style={inputStyle} autoComplete="off" value={f.clientAddress} onChange={e => set({ clientAddress: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.docTitle}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label htmlFor="avr-number" className={label} style={labelStyle}>{t.numberLabel}</label>
              <input id="avr-number" className={input} style={inputStyle} autoComplete="off" value={f.number} onChange={e => set({ number: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-date" className={label} style={labelStyle}>{t.dateLabel}</label>
              <input id="avr-date" type="date" lang={lang} className={input} style={inputStyle} value={f.date} onChange={e => set({ date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-contract" className={label} style={labelStyle}>{t.contractNumberLabel}</label>
              <input id="avr-contract" className={input} style={inputStyle} autoComplete="off" value={f.contractNumber} onChange={e => set({ contractNumber: e.target.value })} />
            </div>
            <div>
              <label htmlFor="avr-contract-date" className={label} style={labelStyle}>{t.contractDateLabel}</label>
              <input id="avr-contract-date" type="date" lang={lang} className={input} style={inputStyle} value={f.contractDate} onChange={e => set({ contractDate: e.target.value })} />
            </div>
          </div>
          <div className="mb-4 max-w-[220px]">
            <label htmlFor="avr-vat" className={label} style={labelStyle}>{t.vatLabel}</label>
            <select id="avr-vat" className={input} style={inputStyle} value={f.vatType} onChange={e => set({ vatType: e.target.value as VatType })}>
              {VAT_TYPES.map(v => <option key={v} value={v}>{t.vatOptions[v]}</option>)}
            </select>
          </div>

          {f.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[64px_92px_1fr_28px] sm:grid-cols-[minmax(0,1fr)_72px_100px_110px_32px] gap-2 mb-3 sm:mb-2 items-center">
              <input className={`${input} col-span-4 sm:col-span-1`} style={inputStyle} aria-label={t.itemAria(i + 1)} placeholder={t.itemPlaceholder(i + 1)} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={t.qtyAria(i + 1)} placeholder={t.qtyPlaceholder} value={r.qty} onChange={e => setRow(i, { qty: digits(e.target.value).slice(0, 6) })} />
              <select className={`${input} px-2`} style={inputStyle} aria-label={unitAria(lang, i + 1)} value={r.unit || DEFAULT_UNIT} onChange={e => setRow(i, { unit: e.target.value })}>
                {TOOL_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[lang][u]}</option>)}
              </select>
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={t.priceAria(i + 1)} placeholder={t.pricePlaceholder} value={r.price} onChange={e => setRow(i, { price: digits(e.target.value).slice(0, 10) })} />
              <button
                type="button"
                onClick={() => setF(prev => ({ ...prev, rows: prev.rows.length > 1 ? prev.rows.filter((_, j) => j !== i) : prev.rows }))}
                disabled={f.rows.length <= 1}
                className="text-lg leading-none disabled:opacity-30" style={{ color: 'var(--nav-text-muted)' }} aria-label={t.removeRow(i + 1)}>×</button>
            </div>
          ))}
          <div className="flex items-start justify-between flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => setF(prev => ({ ...prev, rows: [...prev.rows, { name: '', qty: '1', unit: DEFAULT_UNIT, price: '' }] }))}
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
            <a href="/login?utm_source=tools&utm_medium=limit&utm_campaign=avr"
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

        <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby="avr-faq">
          <h2 id="avr-faq" className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          {t.faq.map(item => (
            <details key={item.q} className="py-2 border-t first:border-t-0" style={{ borderColor: 'var(--nav-border)' }}>
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>{item.q}</summary>
              <p className="text-[13px] mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
            </details>
          ))}
        </section>

        <ToolCta source="avr" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={accentLink}>{chrome.allTools}</Link>
          <Link href={guidePath} hrefLang={lang === 'en' ? 'ru' : lang} className="text-sm font-semibold" style={accentLink}>
            {t.guideLink}
          </Link>
          <Link href={guidesIndexPath(lang)} className="text-sm font-semibold" style={accentLink}>{chrome.guides}</Link>
        </div>
      </div>
    </div>
  )
}
