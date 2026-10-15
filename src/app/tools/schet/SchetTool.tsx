'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { track } from '@vercel/analytics'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { KAZAKHSTAN_BANKS, OTHER_BANK } from '@/lib/kazakhstanBanks'
import { useLanguage } from '@/components/LanguageProvider'
import { formatTenge, toolLinkPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import ToolCta from '@/lib/tools-i18n/ToolCta'
import BinNameField from '@/lib/tools-i18n/BinNameField'
import { claimDocSlot, DOC_QUOTA_DEFAULT_LIMIT, useDocQuota } from '@/lib/tools-i18n/docQuota'
import { schetDict } from './dict'
import {
  digits, documentRows, documentTotal, localToday, resolveBank, ruDate, validateForm, vatIncluded,
  VAT_TYPES, type Form, type Row, type VatType,
} from './calc'
import { TOOL_UNITS, DEFAULT_UNIT, UNIT_LABELS, unitAria } from '@/lib/tools-i18n/units'

// Бесплатный генератор счёта на оплату — лид-магнит под самый частотный
// документный запрос («счёт на оплату образец/скачать»). Правило основателя
// для бесплатных тулов (12.10.2026): цеплять на регистрацию и ограничивать —
// 3 счёта на IP в квартал, считает СЕРВЕР (/api/tools/doc-quota, решение
// основателя 15.10.2026 — как у КП; раньше было 3 в день в localStorage,
// который очищается одной кнопкой), в самом счёте — водяная строка
// invoices.kz (showWatermark у общего generateInvoicePDF, тот же шаблон, что
// печатает продукт).
// Один и тот же инструмент для /tools/schet, /tools/kk/schet и
// /tools/en/schet: язык интерфейса приходит пропсом (из адреса), а сам счёт
// всегда русский — см. docs/tools-i18n-pattern.md.
const DRAFT_KEY = 'tool-schet-draft'
// Снятая галочка рассылки хранится отдельно от черновика: email из черновика
// возвращается после перезагрузки, и без этого ключа галочка вставала бы
// обратно — следующий документ отправил бы email вопреки отказу.
const CONSENT_KEY = 'tool-schet-consent'

// Дата заполняется на клиенте после монтирования: сервер и браузер живут в
// разных часовых поясах, а модуль на сервере может жить сутками.
const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '', phone: '', email: '',
  bankBik: '', otherBankName: '', otherBankBik: '', iik: '', kbe: '19',
  clientName: '', clientBin: '',
  number: '1', date: '', dueDate: '',
  vatType: 'no_vat',
  note: '',
  rows: [{ name: '', qty: '1', unit: DEFAULT_UNIT, price: '' }],
}

// Статья о реквизитах счёта есть на ru и kk; английской нет — en ведёт на русскую.
const guidePath = (lang: ToolLang) =>
  lang === 'kk' ? '/guides/kk/kak-vystavit-schet-ip' : '/guides/kak-vystavit-schet-ip'

export default function SchetTool({ lang }: { lang: ToolLang }) {
  const t = schetDict[lang]
  const chrome = TOOL_CHROME[lang]
  const { setLang } = useLanguage()
  const [f, setF] = useState<Form>(EMPTY)
  // Остаток на квартал — с сервера (/api/tools/doc-quota); null — ещё не пришёл.
  const [quota, setQuota] = useDocQuota('schet')
  const [error, setError] = useState('')
  // Черновик пишем только после того, как прочитали сохранённый, — иначе
  // первый же эффект сохранения затёр бы его пустой формой (в dev React
  // запускает эффекты дважды, и черновик терялся бы).
  const [ready, setReady] = useState(false)

  // Черновик переживает перезагрузку: заполнять реквизиты заново — главная
  // причина бросить такой инструмент на середине.
  useEffect(() => {
    try { if (localStorage.getItem(CONSENT_KEY) === '0') setMarketingConsent(false) } catch {}
    let draft: Partial<Form> | null = null
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (raw && typeof raw === 'object' && Array.isArray(raw.rows)) draft = raw
    } catch {}
    setF(prev => {
      const next: Form = { ...prev, ...(draft || {}) }
      // Реквизиты и позиции из черновика берём, а вчерашнюю дату — нет: иначе
      // счёт, сделанный на следующий день, молча печатался бы прошлым числом
      // (то же правило, что в /tools/kp и /tools/nakladnaya).
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
  // Согласие на рассылку для email продавца — галочка стоит по умолчанию
  // (решение основателя 14.10.2026, как в /tools/kp); снять можно здесь и по
  // ссылке «Отписаться» в любом письме (политика конфиденциальности).
  const [marketingConsent, setMarketingConsent] = useState(true)
  const changeConsent = (on: boolean) => {
    setMarketingConsent(on)
    try { localStorage.setItem(CONSENT_KEY, on ? '1' : '0') } catch {}
  }
  // Пока документ собирается (generate асинхронный), второй клик игнорируем:
  // иначе двойной клик открыл бы два окна, списал две попытки и дважды
  // записал email. Ref — чтобы защита не зависела от перерисовки.
  const [generating, setGenerating] = useState(false)
  const busy = useRef(false)
  const setRow = (i: number, patch: Partial<Row>) =>
    setF(prev => ({ ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  // Итог — по тем же строкам и той же формуле, что попадут в документ.
  const total = useMemo(() => documentTotal(f.rows), [f.rows])
  const vat = vatIncluded(total, f.vatType)

  const limitReached = quota !== null && quota.remaining <= 0

  const generate = async () => {
    if (limitReached || busy.current) return
    const problem = validateForm(f, t.errors)
    setError(problem)
    if (problem) return
    // Окно открываем синхронно в клике — иначе блокировщик всплывающих окон
    // съест результат (тот же паттерн, что у печати счёта в продукте).
    const win = window.open('', '_blank')
    if (!win) {
      // Окно не открылось — счёт никто не увидит, попытку не списываем.
      setError(t.errors.popup)
      track('tool_schet_popup_blocked', { lang })
      return
    }
    busy.current = true
    setGenerating(true)
    // Заглушку закрываем (document.close), как в /tools/kp: следующий write
    // начнёт документ заново, а не допишет его после «…».
    try {
      win.document.write('<!doctype html><meta charset="utf-8"><p style="font:14px system-ui,sans-serif;padding:24px;color:#555">…</p>')
      win.document.close()
    } catch {}
    // Занимаем документ на сервере ДО генерации: лимит 3 в квартал на IP
    // держит только сервер. Квартал исчерпан — закрываем пустое окно и
    // показываем карточку лимита; сервер/сеть недоступны — документ не делаем.
    const claim = await claimDocSlot('schet')
    if (claim.kind !== 'ok') {
      try { win.close() } catch {}
      busy.current = false
      setGenerating(false)
      if (claim.kind === 'limit') {
        setQuota(claim.quota ?? { remaining: 0, limit: quota?.limit ?? DOC_QUOTA_DEFAULT_LIMIT, resetsAt: quota?.resetsAt ?? '' })
        track('tool_schet_limit', { lang })
      } else {
        setError(t.errors.unavailable)
      }
      return
    }
    setQuota(claim.quota)
    track('tool_schet_generate', { lang })
    try {
      const bank = resolveBank(f)
      const html = await generateInvoicePDF({
        number: f.number.trim() || '1',
        date: ruDate(f.date || localToday()),
        clientName: f.clientName.trim(),
        clientBin: digits(f.clientBin),
        clientEmail: '',
        services: documentRows(f.rows),
        total,
        note: f.note.trim() || undefined,
        vatType: f.vatType,
        dueDate: f.dueDate ? ruDate(f.dueDate) : undefined,
        profile: {
          company_name: f.companyName.trim(),
          bin_iin: digits(f.binIin),
          address: f.address.trim(),
          director_name: f.director.trim(),
          phone: f.phone.trim() || undefined,
        },
        bank: { bank_name: bank.name, iik: f.iik.trim().toUpperCase(), bik: bank.bik, kbe: f.kbe.trim() || '19' },
        showWatermark: true,
      })
      win.document.write(html)
      win.document.close()
      // Email продавца — в базу контактов только с согласием и только после того,
      // как документ открылся. Данные покупателя не отправляются никогда. Ошибка
      // записи документу не мешает. Сам email в бланк не печатается.
      const email = f.email.trim()
      if (marketingConsent && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fetch('/api/tools/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'schet', contact: email }),
        }).catch(() => {})
      }
      if (claim.quota.remaining <= 0) track('tool_schet_limit', { lang })
    } catch {
      // Сборка документа упала уже после того, как слот занят: закрываем
      // окно с «…» и говорим об ошибке, а не оставляем человека с пустой
      // вкладкой. Слот не возвращаем — генерация идёт в браузере, и «вернуть»
      // по запросу клиента значило бы обнулять лимит одним вызовом.
      try { win.close() } catch {}
      setError(t.errors.failed)
    } finally {
      busy.current = false
      setGenerating(false)
    }
  }

  // Клик в регистрацию запоминает язык страницы — /login откроется на нём же.
  const signupClick = () => { setLang(lang); track('tool_schet_signup_click', { lang }) }

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
          <ToolLangSwitch slug="schet" lang={lang} />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <div className="mb-6">
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            {t.intro(DOC_QUOTA_DEFAULT_LIMIT)}
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
            {/* Сначала БИН/ИИН с «Найти», под ним название — его и подставит поиск. */}
            <BinNameField id="sc-bin" tool="schet" role="seller" lang={lang}
              className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]"
              label={t.binLabel} placeholder={t.binPlaceholder}
              value={f.binIin} onChange={bin => set({ binIin: bin })} onName={name => set({ companyName: name })}
              inputClass={input} inputStyle={inputStyle} labelClass={label} labelStyle={labelStyle} />
            <div className="sm:col-span-2">
              <label htmlFor="sc-company" className={label} style={labelStyle}>{t.companyLabel}</label>
              <input id="sc-company" className={input} style={inputStyle} placeholder={t.companyPlaceholder} autoComplete="organization" value={f.companyName} onChange={e => set({ companyName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sc-bank" className={label} style={labelStyle}>{t.bankLabel}</label>
              <select id="sc-bank" className={input} style={inputStyle} value={f.bankBik} onChange={e => set({ bankBik: e.target.value })}>
                <option value="">{t.bankPlaceholder}</option>
                {KAZAKHSTAN_BANKS.map(b => <option key={b.bik} value={b.bik}>{b.name}</option>)}
                <option value={OTHER_BANK}>{t.otherBank}</option>
              </select>
            </div>
            {f.bankBik === OTHER_BANK && (
              <>
                <div>
                  <label htmlFor="sc-other-bank" className={label} style={labelStyle}>{t.otherBankNameLabel}</label>
                  <input id="sc-other-bank" className={input} style={inputStyle} autoComplete="off" value={f.otherBankName} onChange={e => set({ otherBankName: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="sc-other-bik" className={label} style={labelStyle}>{t.otherBankBikLabel}</label>
                  <input id="sc-other-bik" className={input} style={inputStyle} autoComplete="off" placeholder={t.otherBankBikPlaceholder} value={f.otherBankBik} onChange={e => set({ otherBankBik: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 8) })} />
                </div>
              </>
            )}
            <div>
              <label htmlFor="sc-iik" className={label} style={labelStyle}>{t.iikLabel}</label>
              <input id="sc-iik" className={input} style={inputStyle} autoComplete="off" placeholder={t.iikPlaceholder} value={f.iik} onChange={e => set({ iik: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 20) })} />
            </div>
            <div>
              <label htmlFor="sc-kbe" className={label} style={labelStyle}>{t.kbeLabel}</label>
              <input id="sc-kbe" className={input} style={inputStyle} inputMode="numeric" autoComplete="off" value={f.kbe} onChange={e => set({ kbe: digits(e.target.value).slice(0, 2) })} />
            </div>
            <div>
              <label htmlFor="sc-director" className={label} style={labelStyle}>{t.directorLabel}</label>
              <input id="sc-director" className={input} style={inputStyle} placeholder={t.directorPlaceholder} autoComplete="name" value={f.director} onChange={e => set({ director: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="sc-address" className={label} style={labelStyle}>{t.addressLabel}</label>
              <input id="sc-address" className={input} style={inputStyle} autoComplete="street-address" value={f.address} onChange={e => set({ address: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sc-email" className={label} style={labelStyle}>{t.emailLabel}</label>
              <input id="sc-email" type="email" className={input} style={inputStyle} autoComplete="email" value={f.email} onChange={e => set({ email: e.target.value })} />
              <label className="flex items-start gap-2 mt-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--nav-text-muted)' }}>
                <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-[#5B4CE0] flex-shrink-0" checked={marketingConsent} onChange={e => changeConsent(e.target.checked)} />
                <span>{t.marketingConsent}{' '}<a href="https://invoices.kz/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--nav-accent)' }}>{t.privacyLink}</a></span>
              </label>
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.clientTitle}</div>
          <div className="grid gap-3">
            <BinNameField id="sc-client-bin" tool="schet" role="client" lang={lang}
              className="sm:max-w-[calc(50%-0.375rem)]"
              label={t.clientBinLabel} placeholder={t.binPlaceholder}
              value={f.clientBin} onChange={bin => set({ clientBin: bin })} onName={name => set({ clientName: name })}
              inputClass={input} inputStyle={inputStyle} labelClass={label} labelStyle={labelStyle} />
            <div>
              <label htmlFor="sc-client" className={label} style={labelStyle}>{t.clientNameLabel}</label>
              <input id="sc-client" className={input} style={inputStyle} autoComplete="off" value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
          </div>
          <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
            {t.checkHint}<Link href={toolLinkPath('kontragent', lang)} style={accentLink}>{t.checkLink}</Link>{t.checkAfter}
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.invoiceTitle}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label htmlFor="sc-number" className={label} style={labelStyle}>{t.numberLabel}</label>
              <input id="sc-number" className={input} style={inputStyle} autoComplete="off" value={f.number} onChange={e => set({ number: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sc-date" className={label} style={labelStyle}>{t.dateLabel}</label>
              <input id="sc-date" type="date" lang={lang} className={input} style={inputStyle} value={f.date} onChange={e => set({ date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sc-due" className={label} style={labelStyle}>{t.dueDateLabel}</label>
              <input id="sc-due" type="date" lang={lang} className={input} style={inputStyle} value={f.dueDate} onChange={e => set({ dueDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sc-vat" className={label} style={labelStyle}>{t.vatLabel}</label>
              <select id="sc-vat" className={input} style={inputStyle} value={f.vatType} onChange={e => set({ vatType: e.target.value as VatType })}>
                {VAT_TYPES.map(v => <option key={v} value={v}>{t.vatOptions[v]}</option>)}
              </select>
            </div>
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
              {(f.vatType === 'vat_16' || f.vatType === 'vat_0') && total > 0 && (
                <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.vatIncluded(formatTenge(vat), f.vatType === 'vat_16' ? 16 : 0)}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="sc-note" className={label} style={labelStyle}>{t.noteLabel}</label>
            <input id="sc-note" className={input} style={inputStyle} autoComplete="off" value={f.note} onChange={e => set({ note: e.target.value })} />
          </div>
        </div>

        <div aria-live="polite">
          {error && <div className="nav-glass rounded-xl p-3.5 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
        </div>

        {limitReached ? (
          <div className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
            <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              {t.limitTitle(quota?.limit ?? DOC_QUOTA_DEFAULT_LIMIT)}
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              {quota?.resetsAt ? `${t.limitReset(quota.resetsAt)} ` : ''}{t.limitBody}
            </p>
            <a href="/login?utm_source=tools&utm_medium=limit&utm_campaign=schet"
              onClick={signupClick}
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
              <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                {t.remaining(quota.remaining, quota.limit)}
              </div>
            )}
          </div>
        )}

        <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby="sc-faq">
          <h2 id="sc-faq" className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
          {t.faq.map(item => (
            <details key={item.q} className="py-2 border-t first:border-t-0" style={{ borderColor: 'var(--nav-border)' }}>
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>{item.q}</summary>
              <p className="text-[13px] mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
            </details>
          ))}
        </section>

        <ToolCta source="schet" lang={lang} />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={accentLink}>{chrome.allTools}</Link>
          <Link href={guidePath(lang)} className="text-sm font-semibold" style={accentLink}>
            {t.guideLink}
          </Link>
        </div>
      </div>
    </div>
  )
}
