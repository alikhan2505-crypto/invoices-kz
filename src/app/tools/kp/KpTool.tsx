'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { generateKP } from '@/lib/generateKP'
import { useLanguage } from '@/components/LanguageProvider'
import { formatTenge, isToolLocalized, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import { kpDict } from './dict'
import { UNIT_LABELS, unitAria } from '@/lib/tools-i18n/units'
import { kpLines, kpRowProblem, kpTotal, kpVatIncluded, localIsoDate, ruDate, KP_UNITS, KP_DEFAULT_UNIT, type KpRow } from './calc'

// Бесплатный генератор коммерческого предложения — близнец /tools/avr:
// черновик в localStorage, рендер — продуктовым generateKP (окно с кнопкой
// «Скачать PDF»). Банк в КП намеренно не спрашиваем: предложение обычно уходит
// без платёжных реквизитов, а для оплаты есть генератор счёта.
//
// Лимит — 3 КП на IP в квартал, считает СЕРВЕР (/api/tools/kp/quota, решение
// основателя 14.10.2026; раньше было 3 в день в localStorage, который
// очищается одной кнопкой). Название клиента по БИН ищется само
// (/api/tools/kp/client-name): кэш реестров, затем живой реестр в пределах
// своего квартального бюджета.
//
// Один компонент на /tools/kp, /tools/kk/kp и /tools/en/kp: язык интерфейса
// приходит пропсом из page.tsx (из адреса). Сам документ печатается по-русски
// на любом языке страницы — см. docs/tools-i18n-pattern.md.
const DEFAULT_LIMIT = 3
const DRAFT_KEY = 'tool-kp-draft'

type Quota = { remaining: number; limit: number; resetsAt: string }
type Lookup = 'idle' | 'loading' | 'found' | 'miss' | 'limit' | 'unavailable'

type Form = {
  companyName: string; binIin: string; address: string; director: string; phone: string; email: string
  clientName: string
  clientBin: string
  clientAddress: string; clientPhone: string; clientEmail: string
  number: string; date: string; validUntil: string; note: string
  vatType: 'no_vat' | 'vat_16' | 'vat_0'
  rows: KpRow[]
}

// Дата пустая до монтирования: «сегодня» на сервере (UTC) и у посетителя
// (Алматы, UTC+5) до пяти утра — разные дни, и поле расходилось бы при
// гидрации. Ставим её в эффекте по часам посетителя.
const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '', phone: '', email: '',
  clientName: '', clientBin: '', clientAddress: '', clientPhone: '', clientEmail: '',
  number: '1', date: '', validUntil: '', note: '',
  vatType: 'no_vat',
  rows: [{ name: '', qty: '1', unit: KP_DEFAULT_UNIT, price: '' }],
}

function parseQuota(data: unknown): Quota | null {
  const d = data as Partial<Quota> | null
  if (!d || typeof d.remaining !== 'number' || typeof d.resetsAt !== 'string') return null
  return { remaining: d.remaining, limit: typeof d.limit === 'number' ? d.limit : DEFAULT_LIMIT, resetsAt: d.resetsAt }
}

const digits = (s: string) => s.replace(/\D/g, '')

export default function KpTool({ lang }: { lang: ToolLang }) {
  const t = kpDict[lang]
  const chrome = TOOL_CHROME[lang]
  const { setLang } = useLanguage()
  const [f, setF] = useState<Form>(EMPTY)
  const [ready, setReady] = useState(false)
  // null — квота ещё не пришла (или сервер не ответил): подсказку не рисуем,
  // а кнопка всё равно спросит сервер при нажатии.
  const [quota, setQuota] = useState<Quota | null>(null)
  const [generating, setGenerating] = useState(false)
  // Последний набранный БИН: ответ на устаревший БИН (пользователь уже
  // поменял поле) не должен перезаписать название.
  const latestBin = useRef('')
  // БИН, по которым в этой вкладке уже ничего не нашли: автопоиск их повторно
  // не шлёт (стёр цифру и набрал снова — не тратим живой бюджет 6/квартал).
  // Ручная «Найти» спрашивает сервер всегда.
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/tools/kp/quota', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setQuota(parseQuota(data)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
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
    latestBin.current = next.clientBin
    setF(next)
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch {}
  }, [f, ready])

  const set = (patch: Partial<Form>) => setF(prev => ({ ...prev, ...patch }))
  // Согласие на рассылку для email поставщика — галочка стоит по умолчанию
  // (решение основателя 14.10.2026); снять можно здесь и по ссылке
  // «Отписаться» в любом письме (политика конфиденциальности, раздел целей).
  const [marketingConsent, setMarketingConsent] = useState(true)

  // Название клиента по БИН — ТОЛЬКО по кнопке «Найти» (решение основателя
  // 14.10.2026: без автоподбора — нажал, значит уверен в цифрах). Кнопка
  // активна при ровно 12 цифрах. Сервер отдаёт только название: сначала кэш
  // реестров (бесплатно), затем живой реестр — не больше 3 раз на IP в квартал.
  const [binLookup, setBinLookup] = useState<Lookup>('idle')
  const lookupClient = async (bin: string) => {
    if (bin.length !== 12) return
    setBinLookup('loading')
    track('tool_kp_bin_lookup', { lang })
    let next: Lookup = 'unavailable'
    let name: string | null = null
    try {
      const res = await fetch('/api/tools/kp/client-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.found && typeof data.name === 'string' && data.name.trim()) {
        name = data.name.trim()
        next = 'found'
      } else if (res.ok && data?.reason === 'not_found') {
        next = 'miss'
      } else if (res.ok && data?.reason === 'limit') {
        next = 'limit'
      }
    } catch {}
    if (latestBin.current !== bin) return
    if (name) {
      const found = name
      setF(prev => ({ ...prev, clientName: found }))
    }
    setBinLookup(next)
  }
  const onClientBinChange = (raw: string) => {
    const bin = digits(raw).slice(0, 12)
    const changed = bin !== latestBin.current
    latestBin.current = bin
    set({ clientBin: bin })
    if (!changed) return
    setBinLookup('idle')
  }
  const setRow = (i: number, patch: Partial<KpRow>) =>
    setF(prev => ({ ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  // Итог считается ровно по тем строкам, что попадут в документ (calc.ts).
  const total = useMemo(() => kpTotal(f.rows), [f.rows])

  const limitReached = quota !== null && quota.remaining <= 0

  const validate = (): string => {
    if (!f.companyName.trim()) return t.errCompany
    if (digits(f.binIin).length !== 12) return t.errBin
    if (f.clientBin && digits(f.clientBin).length !== 12) return t.errClientBin
    if (!f.clientName.trim()) return t.errClient
    const rowProblem = kpRowProblem(f.rows)
    if (rowProblem?.kind === 'noRows') return t.errNoRows
    if (rowProblem?.kind === 'rowName') return t.errRowName(rowProblem.n)
    if (rowProblem?.kind === 'rowQty') return t.errRowQty(rowProblem.n)
    if (total <= 0) return t.errTotal
    return ''
  }

  const generate = async () => {
    if (limitReached || generating) return
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
    setGenerating(true)
    // Заглушку закрываем (document.close): иначе поток документа остаётся
    // открытым, и generateKP дописал бы КП ПОСЛЕ «…» — заглушка попала бы
    // в начало КП и в PDF. После close следующий write начинает документ заново.
    try {
      win.document.write('<!doctype html><meta charset="utf-8"><p style="font:14px system-ui,sans-serif;padding:24px;color:#555">…</p>')
      win.document.close()
    } catch {}
    // Списываем КП на сервере ДО генерации: лимит 3 в квартал на IP держит
    // только сервер. Отказ — закрываем пустое окно и показываем карточку лимита.
    let claimed: Quota | null = null
    let status = 0
    try {
      const res = await fetch('/api/tools/kp/quota', { method: 'POST', cache: 'no-store' })
      status = res.status
      const data = await res.json().catch(() => null)
      if (res.ok) claimed = parseQuota(data)
      else if (res.status === 429) setQuota(parseQuota(data) ?? { remaining: 0, limit: DEFAULT_LIMIT, resetsAt: quota?.resetsAt ?? '' })
    } catch {}
    if (!claimed) {
      try { win.close() } catch {}
      setGenerating(false)
      if (status === 429) {
        track('tool_kp_limit', { lang })
      } else {
        setError(t.errUnavailable)
      }
      return
    }
    setQuota(claimed)
    track('tool_kp_generate', { lang, vat: f.vatType })
    try {
      await generateKP({
        showWatermark: true,
        number: f.number.trim() || '1',
        date: ruDate(f.date || localIsoDate()),
        validUntil: f.validUntil ? ruDate(f.validUntil) : undefined,
        clientName: f.clientName.trim(),
        clientBin: digits(f.clientBin) || undefined,
      clientAddress: f.clientAddress.trim() || undefined,
      clientPhone: f.clientPhone.trim() || undefined,
      clientEmail: f.clientEmail.trim() || undefined,
        note: f.note.trim() || undefined,
        services: kpLines(f.rows),
        total,
        vatType: f.vatType,
        profile: {
          company_name: f.companyName.trim(),
          bin_iin: digits(f.binIin),
          address: f.address.trim(),
          phone: f.phone.trim() || undefined,
          email: f.email.trim() || undefined,
          director_name: f.director.trim() || undefined,
        },
      }, win)
      // Email поставщика — в базу контактов только с согласием. Email
      // покупателя не сохраняется никогда. Ошибка записи КП не ломает.
      const email = f.email.trim()
      if (marketingConsent && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fetch('/api/tools/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'kp', contact: email }),
        }).catch(() => {})
      }
    } finally {
      setGenerating(false)
    }
    if (claimed.remaining <= 0) track('tool_kp_limit', { lang })
  }

  const input = 'w-full min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none'
  // WebkitTextFillColor обязателен: глобальное `input, select { -webkit-text-fill-color: #111827 }`
  // (globals.css) перебивает `color` в Chrome/Safari, и в тёмной теме ОС
  // набранный текст рисовался почти чёрным по тёмному фону — как у /tools/nalogi.
  const inputStyle = { background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)' } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const
  const hintStyle = { color: 'var(--nav-text-muted)' } as const
  // Ссылка «Выставить счёт»: toolLinkPath ведёт на языковую версию schet
  // (переведён 14.10.2026); непереведённый инструмент открылся бы по-русски.
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
            <div>
              <label htmlFor="kp-email" className={label} style={labelStyle}>{t.emailLabel}</label>
              <input id="kp-email" type="email" className={input} style={inputStyle} autoComplete="email" value={f.email} onChange={e => set({ email: e.target.value })} />
              <label className="flex items-start gap-2 mt-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--nav-text-muted)' }}>
                <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-[#5B4CE0] flex-shrink-0" checked={marketingConsent} onChange={e => setMarketingConsent(e.target.checked)} />
                <span>{t.marketingConsent}{' '}<a href="https://invoices.kz/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--nav-accent)' }}>{t.privacyLink}</a></span>
              </label>
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.offerTitle}</h2>
          <div className="grid gap-3 mb-3">
            <div className="sm:max-w-[50%]">
              <label htmlFor="kp-client-bin" className={label} style={labelStyle}>{t.clientBinLabel}</label>
              <div className="flex gap-2">
                <input id="kp-client-bin" className={input} style={inputStyle} inputMode="numeric" autoComplete="off" placeholder={t.binPlaceholder} value={f.clientBin}
                  onChange={e => onClientBinChange(e.target.value)} />
                <button type="button" onClick={() => void lookupClient(f.clientBin)} disabled={f.clientBin.length !== 12 || binLookup === 'loading'}
                  aria-label={t.lookupAria}
                  className="nav-glass rounded-xl px-3 text-[13px] font-semibold flex-shrink-0 disabled:opacity-50"
                  style={{ color: 'var(--nav-accent)' }}>
                  {binLookup === 'loading' ? '…' : t.lookupButton}
                </button>
              </div>
              <div aria-live="polite">
                {binLookup === 'loading' && <div className="text-[11px] mt-1" style={hintStyle}>{t.lookupLoading}</div>}
                {binLookup === 'found' && <div className="text-[11px] mt-1" style={{ color: 'var(--nav-success)' }}>{t.lookupFound}</div>}
                {binLookup === 'miss' && <div className="text-[11px] mt-1" style={hintStyle}>{t.lookupMiss}</div>}
                {binLookup === 'limit' && <div className="text-[11px] mt-1" style={hintStyle}>{t.lookupLimit}</div>}
                {binLookup === 'unavailable' && <div className="text-[11px] mt-1" style={hintStyle}>{t.lookupUnavailable}</div>}
              </div>
            </div>
            <div>
              <label htmlFor="kp-client" className={label} style={labelStyle}>{t.clientLabel}</label>
              <input id="kp-client" className={input} style={inputStyle} autoComplete="off" placeholder={t.clientPlaceholder} value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
          </div>
          {/* Адрес, телефон и email покупателя — как у поставщика (правка основателя 14.10). */}
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label htmlFor="kp-client-address" className={label} style={labelStyle}>{t.clientAddressLabel}</label>
              <input id="kp-client-address" className={input} style={inputStyle} autoComplete="off" value={f.clientAddress} onChange={e => set({ clientAddress: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-client-phone" className={label} style={labelStyle}>{t.clientPhoneLabel}</label>
              <input id="kp-client-phone" type="tel" className={input} style={inputStyle} autoComplete="off" value={f.clientPhone} onChange={e => set({ clientPhone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kp-client-email" className={label} style={labelStyle}>{t.clientEmailLabel}</label>
              <input id="kp-client-email" type="email" className={input} style={inputStyle} autoComplete="off" value={f.clientEmail} onChange={e => set({ clientEmail: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
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
            // На телефоне название — на всю ширину, под ним «кол-во / ед. / цена / ×»;
            // с sm — всё в одну строку.
            <div key={i} className="grid grid-cols-[64px_92px_1fr_28px] sm:grid-cols-[1fr_72px_100px_110px_32px] gap-2 mb-3 sm:mb-2 items-center">
              <input className={`${input} col-span-4 sm:col-span-1`} style={inputStyle} aria-label={t.rowPlaceholder(i + 1)} placeholder={t.rowPlaceholder(i + 1)} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={`${t.qtyPlaceholder} — ${i + 1}`} placeholder={t.qtyPlaceholder} value={r.qty} onChange={e => setRow(i, { qty: digits(e.target.value).slice(0, 6) })} />
              <select className={`${input} px-2`} style={inputStyle} aria-label={unitAria(lang, i + 1)} value={r.unit || KP_DEFAULT_UNIT} onChange={e => setRow(i, { unit: e.target.value })}>
                {KP_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[lang][u]}</option>)}
              </select>
              <input className={input} style={inputStyle} inputMode="numeric" aria-label={`${t.pricePlaceholder} — ${i + 1}`} placeholder={t.pricePlaceholder} value={r.price} onChange={e => setRow(i, { price: digits(e.target.value).slice(0, 10) })} />
              <button
                type="button"
                onClick={() => setF(prev => ({ ...prev, rows: prev.rows.length > 1 ? prev.rows.filter((_, j) => j !== i) : prev.rows }))}
                className="text-lg leading-none h-full" style={{ color: 'var(--nav-text-muted)' }} aria-label={t.removeRow(i + 1)}>×</button>
            </div>
          ))}
          <div className="flex items-start justify-between flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => setF(prev => ({ ...prev, rows: [...prev.rows, { name: '', qty: '1', unit: KP_DEFAULT_UNIT, price: '' }] }))}
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
              {t.limitTitle(quota?.limit ?? DEFAULT_LIMIT)}
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              {quota?.resetsAt ? `${t.limitReset(quota.resetsAt)} ` : ''}{t.limitBody}
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
            <button type="button" onClick={generate} disabled={generating} aria-busy={generating}
              className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {t.generate}
            </button>
            {quota && (
              <div className="text-[11px] mt-2" style={hintStyle}>
                {t.remaining(quota.remaining, quota.limit)}
              </div>
            )}
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
