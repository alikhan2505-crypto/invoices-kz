'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { KAZAKHSTAN_BANKS, OTHER_BANK } from '@/lib/kazakhstanBanks'
import ToolCta from '../ToolCta'

// Бесплатный генератор счёта на оплату — лид-магнит под самый частотный
// документный запрос («счёт на оплату образец/скачать»). Правило основателя
// для бесплатных тулов (12.10.2026): цеплять на регистрацию и ограничивать —
// 3 счёта в день на браузер (localStorage), в самом счёте — водяная строка
// invoices.kz (showWatermark у общего generateInvoicePDF, тот же шаблон, что
// печатает продукт).
const LIMIT = 3
const COUNT_KEY = 'tool-schet-count'
const DRAFT_KEY = 'tool-schet-draft'

type Row = { name: string; qty: string; price: string }

type Form = {
  companyName: string; binIin: string; address: string; director: string; phone: string
  bankBik: string; otherBankName: string; otherBankBik: string; iik: string; kbe: string
  clientName: string; clientBin: string
  number: string; date: string; dueDate: string
  vatType: 'no_vat' | 'vat_16' | 'vat_0'
  note: string
  rows: Row[]
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY: Form = {
  companyName: '', binIin: '', address: '', director: '', phone: '',
  bankBik: '', otherBankName: '', otherBankBik: '', iik: '', kbe: '19',
  clientName: '', clientBin: '',
  number: '1', date: today(), dueDate: '',
  vatType: 'no_vat',
  note: '',
  rows: [{ name: '', qty: '1', price: '' }],
}

// 12.10.2026 → «12.10.2026» для шаблона счёта (formatDate продукта работает
// от timestamp'ов, здесь дата приходит из <input type=date>).
const ruDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

function readCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(COUNT_KEY) || 'null')
    return raw && raw.d === today() ? Number(raw.n) || 0 : 0
  } catch { return 0 }
}

function bumpCount(): number {
  const n = readCount() + 1
  try { localStorage.setItem(COUNT_KEY, JSON.stringify({ d: today(), n })) } catch {}
  return n
}

const digits = (s: string) => s.replace(/\D/g, '')

export default function SchetTool() {
  const [f, setF] = useState<Form>(EMPTY)
  const [used, setUsed] = useState(0)
  const [error, setError] = useState('')

  // Черновик переживает перезагрузку: заполнять реквизиты заново — главная
  // причина бросить такой инструмент на середине.
  useEffect(() => {
    setUsed(readCount())
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (draft && typeof draft === 'object' && Array.isArray(draft.rows)) setF({ ...EMPTY, ...draft })
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch {}
  }, [f])

  const set = (patch: Partial<Form>) => setF(prev => ({ ...prev, ...patch }))
  const setRow = (i: number, patch: Partial<Row>) =>
    setF(prev => ({ ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const total = useMemo(
    () => f.rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.price) || 0), 0),
    [f.rows],
  )

  const bank = f.bankBik === OTHER_BANK
    ? { name: f.otherBankName.trim(), bik: digits(f.otherBankBik) }
    : (() => {
        const b = KAZAKHSTAN_BANKS.find(b => b.bik === f.bankBik)
        return b ? { name: b.name, bik: b.bik } : { name: '', bik: '' }
      })()

  const limitReached = used >= LIMIT

  const validate = (): string => {
    if (!f.companyName.trim()) return 'Укажите название вашего ИП или ТОО'
    if (digits(f.binIin).length !== 12) return 'БИН/ИИН поставщика — 12 цифр'
    if (!bank.name || bank.bik.length !== 8) return 'Выберите банк (или заполните название и 8-значный БИК)'
    if (f.iik.trim().length < 20) return 'ИИК — 20 символов, начинается с KZ'
    if (!f.clientName.trim()) return 'Укажите название клиента'
    if (digits(f.clientBin).length !== 12) return 'БИН/ИИН клиента — 12 цифр'
    const rows = f.rows.filter(r => r.name.trim())
    if (rows.length === 0) return 'Добавьте хотя бы одну позицию'
    if (total <= 0) return 'Сумма счёта должна быть больше нуля'
    return ''
  }

  const generate = async () => {
    if (limitReached) return
    const problem = validate()
    setError(problem)
    if (problem) return
    // Окно открываем синхронно в клике — иначе блокировщик всплывающих окон
    // съест результат (тот же паттерн, что у печати счёта в продукте).
    const win = window.open('', '_blank')
    track('tool_schet_generate')
    const html = await generateInvoicePDF({
      number: f.number.trim() || '1',
      date: ruDate(f.date),
      clientName: f.clientName.trim(),
      clientBin: digits(f.clientBin),
      clientEmail: '',
      services: f.rows
        .filter(r => r.name.trim())
        .map(r => ({ name: r.name.trim(), qty: Number(r.qty) || 1, price: Number(r.price) || 0 })),
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
    if (win) { win.document.write(html); win.document.close() }
    const n = bumpCount()
    setUsed(n)
    if (n >= LIMIT) track('tool_schet_limit')
  }

  const input = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none'
  const inputStyle = { background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' } as const
  const label = 'text-[11px] font-semibold uppercase tracking-wide block mb-1.5'
  const labelStyle = { color: 'var(--nav-text-muted)' } as const

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>invoices.kz</Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Счёт на оплату — онлайн, бесплатно
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          Заполните реквизиты — получите готовый счёт по форме, принятой в Казахстане: с БИК из справочника
          банков, суммой прописью и НДС, если нужен. Без регистрации, {LIMIT} счёта в день.
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>Поставщик — вы</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={label} style={labelStyle}>Название ИП / ТОО *</label>
              <input className={input} style={inputStyle} placeholder="ИП Иванов / ТОО «Ромашка»" value={f.companyName} onChange={e => set({ companyName: e.target.value })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>БИН / ИИН *</label>
              <input className={input} style={inputStyle} inputMode="numeric" placeholder="12 цифр" value={f.binIin} onChange={e => set({ binIin: digits(e.target.value).slice(0, 12) })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Банк *</label>
              <select className={input} style={inputStyle} value={f.bankBik} onChange={e => set({ bankBik: e.target.value })}>
                <option value="">Выберите банк</option>
                {KAZAKHSTAN_BANKS.map(b => <option key={b.bik} value={b.bik}>{b.name}</option>)}
                <option value={OTHER_BANK}>Другой банк…</option>
              </select>
            </div>
            {f.bankBik === OTHER_BANK && (
              <>
                <div>
                  <label className={label} style={labelStyle}>Название банка *</label>
                  <input className={input} style={inputStyle} value={f.otherBankName} onChange={e => set({ otherBankName: e.target.value })} />
                </div>
                <div>
                  <label className={label} style={labelStyle}>БИК *</label>
                  <input className={input} style={inputStyle} placeholder="8 символов" value={f.otherBankBik} onChange={e => set({ otherBankBik: e.target.value.toUpperCase().slice(0, 8) })} />
                </div>
              </>
            )}
            <div>
              <label className={label} style={labelStyle}>ИИК (счёт KZ…) *</label>
              <input className={input} style={inputStyle} placeholder="KZ…" value={f.iik} onChange={e => set({ iik: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 20) })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>КБе</label>
              <input className={input} style={inputStyle} value={f.kbe} onChange={e => set({ kbe: digits(e.target.value).slice(0, 2) })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Руководитель</label>
              <input className={input} style={inputStyle} placeholder="для строки подписи" value={f.director} onChange={e => set({ director: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} style={labelStyle}>Адрес</label>
              <input className={input} style={inputStyle} value={f.address} onChange={e => set({ address: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>Клиент — кому счёт</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label} style={labelStyle}>Название клиента *</label>
              <input className={input} style={inputStyle} value={f.clientName} onChange={e => set({ clientName: e.target.value })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>БИН / ИИН клиента *</label>
              <input className={input} style={inputStyle} inputMode="numeric" placeholder="12 цифр" value={f.clientBin} onChange={e => set({ clientBin: digits(e.target.value).slice(0, 12) })} />
            </div>
          </div>
          <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
            Не уверены в контрагенте? Проверьте его бесплатно: <Link href="/tools/kontragent" style={{ color: 'var(--nav-accent)' }}>проверка по БИН</Link>.
          </div>
        </div>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>Счёт</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className={label} style={labelStyle}>Номер *</label>
              <input className={input} style={inputStyle} value={f.number} onChange={e => set({ number: e.target.value })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Дата *</label>
              <input type="date" className={input} style={inputStyle} value={f.date} onChange={e => set({ date: e.target.value })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Оплатить до</label>
              <input type="date" className={input} style={inputStyle} value={f.dueDate} onChange={e => set({ dueDate: e.target.value })} />
            </div>
            <div>
              <label className={label} style={labelStyle}>НДС</label>
              <select className={input} style={inputStyle} value={f.vatType} onChange={e => set({ vatType: e.target.value as Form['vatType'] })}>
                <option value="no_vat">Без НДС</option>
                <option value="vat_16">С НДС 16%</option>
                <option value="vat_0">НДС 0%</option>
              </select>
            </div>
          </div>

          {f.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_72px_110px_32px] gap-2 mb-2 items-center">
              <input className={input} style={inputStyle} placeholder={`Товар или услуга ${i + 1}`} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
              <input className={input} style={inputStyle} inputMode="numeric" placeholder="Кол-во" value={r.qty} onChange={e => setRow(i, { qty: digits(e.target.value).slice(0, 6) })} />
              <input className={input} style={inputStyle} inputMode="numeric" placeholder="Цена, ₸" value={r.price} onChange={e => setRow(i, { price: digits(e.target.value).slice(0, 10) })} />
              <button
                onClick={() => setF(prev => ({ ...prev, rows: prev.rows.length > 1 ? prev.rows.filter((_, j) => j !== i) : prev.rows }))}
                className="text-lg leading-none" style={{ color: 'var(--nav-text-muted)' }} aria-label="Удалить позицию">×</button>
            </div>
          ))}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
            <button onClick={() => setF(prev => ({ ...prev, rows: [...prev.rows, { name: '', qty: '1', price: '' }] }))}
              className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>+ Добавить позицию</button>
            <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>
              Итого: {total.toLocaleString('ru-RU')} ₸
            </div>
          </div>
          <div className="mt-3">
            <label className={label} style={labelStyle}>Примечание (попадёт в счёт)</label>
            <input className={input} style={inputStyle} value={f.note} onChange={e => set({ note: e.target.value })} />
          </div>
        </div>

        {error && <div className="nav-glass rounded-xl p-3.5 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        {limitReached ? (
          <div className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
            <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              {LIMIT} бесплатных счёта на сегодня созданы
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              В кабинете invoices.kz счета без лимита и без водяного знака: реквизиты сохраняются один раз,
              номера считаются сами, видно, когда клиент открыл счёт, а оплату можно принять через Kaspi.
              Регистрация бесплатная, по ссылке на почту.
            </p>
            <a href="/login?utm_source=tools&utm_medium=limit&utm_campaign=schet"
              onClick={() => track('tool_schet_signup_click')}
              className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              Зарегистрироваться бесплатно
            </a>
          </div>
        ) : (
          <div className="mb-4">
            <button onClick={generate}
              className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              Создать счёт — откроется для печати и скачивания
            </button>
            <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
              Осталось {LIMIT - used} из {LIMIT} бесплатных счётов сегодня · в счёте будет строка «Создано на invoices.kz»
            </div>
          </div>
        )}

        <ToolCta source="schet" />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/tools" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>← Все инструменты</Link>
          <Link href="/guides/kak-vystavit-schet-ip" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            Что обязательно должно быть в счёте →
          </Link>
        </div>
      </div>
    </div>
  )
}
