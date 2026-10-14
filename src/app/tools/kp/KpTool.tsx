'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { generateKP } from '@/lib/generateKP'
import { useLanguage } from '@/components/LanguageProvider'
import { formatTenge, isToolLocalized, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { kpDict } from './dict'
import { kpLines, kpRowProblem, kpTotal, kpVatIncluded, localIsoDate, ruDate, type KpRow } from './calc'

// Бесплатный генератор коммерческого предложения — близнец /tools/avr:
// лимит 3 в день на браузер, черновик в localStorage, рендер — продуктовым
// generateKP (окно с кнопкой «Скачать PDF»). Банк в КП намеренно не
// спрашиваем: предложение обычно уходит без платёжных реквизитов, а для
// оплаты есть генератор счёта.
//
// Один компонент на /tools/kp, /tools/kk/kp и /tools/en/kp: язык интерфейса
// приходит пропсом из page.tsx (из адреса). Сам документ печатается по-русски
// на любом языке страницы — см. docs/tools-i18n-pattern.md.
const LIMIT = 3
const COUNT_KEY = 'tool-kp-count'
const DRAFT_KEY = 'tool-kp-draft'

type Form = {
  companyName: string; binIin: string; address: string; director: string; phone: string
  clientName: string
  number: string; date: string; validUntil: string; note: string
  vatType: 'no_vat' | 'vat_16' | 'vat_0'
  rows: KpRow[]
}

// Дата пустая до монтирования: «сегодня» на сервере (UTC) и у посетителя
// (Алматы, UTC+5) до пяти утра — разные дни, и поле расходилось бы при
// гидрации. Ставим её в эффекте по часам посетителя.
const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '', phone: '',
  clientName: '',
  number: '1', date: '', validUntil: '', note: '',
  vatType: 'no_vat',
  rows: [{ name: '', qty: '1', price: '' }],
}

function readCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(COUNT_KEY) || 'null')
    return raw && raw.d === localIsoDate() ? Number(raw.n) || 0 : 0
  } catch { return 0 }
}

function bumpCount(): number {
  const n = readCount() + 1
  try { localStorage.setItem(COUNT_KEY, JSON.stringify({ d: localIsoDate(), n })) } catch {}
  return n
}

const digits = (s: string) => s.replace(/\D/g, '')

export default function KpTool({ lang }: { lang: ToolLang }) {
  const t = kpDict[lang]
  const chrome = TOOL_CHROME[lang]
  const { setLang } = useLanguage()
  const [f, setF] = useState<Form>(EMPTY)
  const [ready, setReady] = useState(false)
  const [used, setUsed] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    setUsed(readCount())
    const today = localIsoDate()
    let next: Form = { ...EMPTY, date: today }
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (draft && typeof draft === 'object' && Array.isArray(draft.rows)) {
        next = { ...EMPTY, ...draft }
        // Реквизиты и позиции из черновика берём, а вчерашнюю дату — нет:
        // новое КП датируется сегодняшним днём, просроченный срок сбрасываем.
        if (!next.date || next.date < today) next.date = today
        if (next.validUntil && next.validUntil < next.date) next.validUntil = ''
      }
    } catch {}
    setF(next)
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch {}
  }, [f, ready])

  const set = (patch: Partial<Form>) => setF(prev => ({ ...prev, ...patch }))
  const setRow = (i: number, patch: Partial<KpRow>) =>
    setF(prev => ({ ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  // Итог считается ровно по тем строкам, что попадут в документ (calc.ts).
  const total = useMemo(() => kpTotal(f.rows), [f.rows])

  const limitReached = used >= LIMIT

  const validate = (): string => {
    if (!f.companyName.trim()) return t.errCompany
    if (digits(f.binIin).length !== 12) return t.errBin
    if (!f.clientName.trim()) return t.errClient
    const rowProblem = kpRowProblem(f.rows)
    if (rowProblem?.kind === 'noRows') return t.errNoRows
    if (rowProblem?.kind === 'rowName') return t.errRowName(rowProblem.n)
    if (rowProblem?.kind === 'rowQty') return t.errRowQty(rowProblem.n)
    if (total <= 0) return t.errTotal
    return ''
  }

  const generate = async () => {
    if (limitReached) return
    const problem = validate()
    setError(problem)
    if (problem) return
    // Окно — синхронно в клике, иначе его съест блокировщик всплывающих окон.
    const win = window.open('', '_blank')
    if (!win) {
      // Окно не открылось — КП никто не увидит, попытку не списываем (как в
      // /tools/nakladnaya). Без этой проверки generateKP пробовал открыть окно
      // ещё раз уже вне клика, его тоже блокировали, а счётчик рос.
      setError(t.errPopup)
      track('tool_kp_popup_blocked', { lang })
      return
    }
    track('tool_kp_generate', { lang, vat: f.vatType })
    await generateKP({
      number: f.number.trim() || '1',
      date: ruDate(f.date || localIsoDate()),
      validUntil: f.validUntil ? ruDate(f.validUntil) : undefined,
      clientName: f.clientName.trim(),
      note: f.note.trim() || undefined,
      services: kpLines(f.rows),
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
    if (n >= LIMIT) track('tool_kp_limit', { lang })
  }

  const input = 'w-full min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none'
  // WebkitTextFillColor обязателен: глобальное `input, select { -webkit-text-fill-color: #111827 }`
  // (globals.css) перебивает `color` в Chrome/Safari, и в тёмной теме ОС
  // набранный текст рисовался почти чёрным по тёмному фону — как у /tools/nalogi.
  const inputStyle = { background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)' } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const
  const hintStyle = { color: 'var(--nav-text-muted)' } as const
  // Ссылка «Выставить счёт»: пока schet есть только на русском, toolLinkPath
  // ведёт с kk/en на русский адрес, а не в 404; сам переключится, когда schet
  // попадёт в LOCALIZED_TOOL_SLUGS.
  const schetLang: ToolLang = isToolLocalized('schet') ? lang : 'ru'

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch slug="kp" lang={lang} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <p className={`text-sm ${t.docLangNote ? 'mb-2' : 'mb-6'}`} style={{ color: 'var(--nav-text-secondary)' }}>
          {t.intro}
        </p>
        {t.docLangNote && (
          <p className="text-[12px] mb-6" style={hintStyle}>{t.docLangNote}</p>
        )}

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.fromTitle}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="kp-company" className={label} style={labelStyle}>{t.companyLabel}</label>
              <input id="kp-company" className={input} style={inputStyle} autoComplete="organization" placeholder={t.companyPlaceholder} value={f.companyName} onChange={e => set({ companyName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-bin" className={label} style={labelStyle}>{t.binLabel}</label>
              <input id="kp-bin" className={input} style={inputStyle} inputMode="numeric" autoComplete="off" placeholder={t.binPlaceholder} value={f.binIin} onChange={e => set({ binIin: digits(e.target.value).slice(0, 12) })} />
            </div>
            <div>
              <label htmlFor="kp-phone" className={label} style={labelStyle}>{t.phoneLabel}</label>
              <input id="kp-phone" type="tel" className={input} style={inputStyle} autoComplete="tel" value={f.phone} onChange={e => set({ phone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-director" className={label} style={labelStyle}>{t.directorLabel}</label>
              <input id="kp-director" className={input} style={inputStyle} autoComplete="name" placeholder={t.directorPlaceholder} value={f.director} onChange={e => set({ director: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-address" className={label} style={labelStyle}>{t.addressLabel}</label>
              <input id="kp-address" className={input} style={inputStyle} autoComplete="street-address" value={f.address} onChange={e => set({ address: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.offerTitle}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="kp-client" className={label} style={labelStyle}>{t.clientLabel}</label>
              <input id="kp-client" className={input} style={inputStyle} autoComplete="off" placeholder={t.clientPlaceholder} value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-number" className={label} style={labelStyle}>{t.numberLabel}</label>
              <input id="kp-number" className={input} style={inputStyle} autoComplete="off" value={f.number} onChange={e => set({ number: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-date" className={label} style={labelStyle}>{t.dateLabel}</label>
              <input id="kp-date" type="date" className={input} style={inputStyle} value={f.date} onChange={e => set({ date: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="kp-valid" className={label} style={labelStyle}>{t.validLabel}</label>
              <input id="kp-valid" type="date" className={input} style={inputStyle} min={f.date || undefined} aria-describedby="kp-valid-hint" value={f.validUntil} onChange={e => set({ validUntil: e.target.value })} />
              <div id="kp-valid-hint" className="text-[11px] mt-1" style={hintStyle}>{t.validHint}</div>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="kp-vat" className={label} style={labelStyle}>{t.vatLabel}</label>
            <select id="kp-vat" className={`${input} max-w-[240px]`} style={inputStyle} value={f.vatType} onChange={e => set({ vatType: e.target.value as Form['vatType'] })}>
              <option value="no_vat">{t.vatNo}</option>
              <option value="vat_16">{t.vat16}</option>
              <option value="vat_0">{t.vat0}</option>
            </select>
            {f.vatType === 'vat_16' && (
              <div className="text-[11px] mt-1.5" style={hintStyle}>{t.vat16Hint}</div>
            )}
          </div>

          {f.rows.map((r, i) => (
            // На телефоне название — на всю ширину, под ним «кол-во / цена / ×»;
            // с sm — всё в одну строку, как раньше.
            <div key={i} className="grid grid-cols-[72px_1fr_32px] sm:grid-cols-[1fr_72px_110px_32px] gap-2 mb-3 sm:mb-2 items-center">
              <input className={`${input} col-span-3 sm:col-span-1`} style={inputStyle} aria-label={t.rowPlaceholder(i + 1)} placeholder={t.rowPlaceholder(i + 1)} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={`${t.qtyPlaceholder} — ${i + 1}`} placeholder={t.qtyPlaceholder} value={r.qty} onChange={e => setRow(i, { qty: digits(e.target.value).slice(0, 6) })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={`${t.pricePlaceholder} — ${i + 1}`} placeholder={t.pricePlaceholder} value={r.price} onChange={e => setRow(i, { price: digits(e.target.value).slice(0, 10) })} />
              <button
                type="button"
                onClick={() => setF(prev => ({ ...prev, rows: prev.rows.length > 1 ? prev.rows.filter((_, j) => j !== i) : prev.rows }))}
                className="text-lg leading-none h-full" style={{ color: 'var(--nav-text-muted)' }} aria-label={t.removeRow(i + 1)}>×</button>
            </div>
          ))}
          <div className="flex items-start justify-between flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => setF(prev => ({ ...prev, rows: [...prev.rows, { name: '', qty: '1', price: '' }] }))}
              className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.addRow}</button>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>
                {t.totalLabel}: {formatTenge(total)}
              </div>
              {f.vatType === 'vat_16' && total > 0 && (
                <div className="text-[11px] mt-0.5" style={hintStyle}>{t.vatIncluded(formatTenge(kpVatIncluded(total)))}</div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="kp-note" className={label} style={labelStyle}>{t.noteLabel}</label>
            <input id="kp-note" className={input} style={inputStyle} value={f.note} onChange={e => set({ note: e.target.value })} />
          </div>
        </div>

        <div aria-live="polite">
          {error && <div role="alert" className="nav-glass rounded-xl p-3.5 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
        </div>

        {limitReached ? (
          <div className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
            <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              {t.limitTitle(LIMIT)}
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.limitBody}
            </p>
            <a href="/login?utm_source=tools&utm_medium=limit&utm_campaign=kp"
              onClick={() => { setLang(lang); track('tool_kp_signup_click', { lang }) }}
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
            <div className="text-[11px] mt-2" style={hintStyle}>
              {t.remaining(LIMIT - used, LIMIT)}
            </div>
          </div>
        )}

        <section className="nav-glass rounded-2xl p-5 mt-6">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          <div className="space-y-3">
            {t.faq.map(item => (
              <div key={item.q}>
                <h3 className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--nav-text-primary)' }}>{item.q}</h3>
                <p className="text-[13px]" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <ToolCta source="kp" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
          <Link href={toolLinkPath('schet', lang)} hrefLang={schetLang} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            {t.nextStep}
          </Link>
        </div>
      </div>
    </div>
  )
}
