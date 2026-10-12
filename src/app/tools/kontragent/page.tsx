'use client'
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { track } from '@vercel/analytics'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import ToolCta from '../ToolCta'

const EASE = [0.16, 1, 0.3, 1] as const

// Публичный срез ответа /api/tools/kontragent — без адреса, руководителя и
// ОКЭД: они остаются за регистрацией, роут отдаёт только hasFullCard.
interface PublicCompany {
  bin: string
  name: string
  status: string | null
  registeredAt: string | null
  source: 'egov' | 'kgd'
  isVatPayer: boolean | null
  vatRegisteredAt: string | null
  isUnreliable: boolean | null
  isLiquidating: boolean | null
  totalArrear: number | null
  taxArrear: number | null
  hasFullCard: boolean
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'limit' }
  | { kind: 'busy' }
  | { kind: 'notFound'; remaining: number | null }
  | { kind: 'found'; company: PublicCompany; remaining: number | null }

const tenge = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`

// Тройственность каждого вердикта (чисто / проблема / не удалось проверить)
// сохраняется до экрана: молчание из-за упавшего запроса никогда не должно
// читаться как «контрагент в порядке» — то же правило, что во внутренней
// проверке на /create.
function Verdict({ ok, label, okText, badText, unknownText }: {
  ok: boolean | null
  label: string
  okText: string
  badText: string
  unknownText: string
}) {
  const color = ok === null ? 'var(--nav-text-muted)' : ok ? 'var(--nav-success)' : 'var(--nav-critical)'
  const icon = ok === null ? '?' : ok ? '✓' : '!'
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
        style={{ background: color, color: '#fff' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{label}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>
          {ok === null ? unknownText : ok ? okText : badText}
        </div>
      </div>
    </div>
  )
}

export default function KontragentTool() {
  const [bin, setBin] = useState('')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const valid = isValidBin(bin)

  const check = async () => {
    if (!valid || outcome.kind === 'loading') return
    setOutcome({ kind: 'loading' })
    track('tool_kontragent_check')
    try {
      const res = await fetch('/api/tools/kontragent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin: normalizeBin(bin) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        if (data?.error === 'busy') { setOutcome({ kind: 'busy' }); return }
        track('tool_kontragent_limit')
        setOutcome({ kind: 'limit' })
        return
      }
      if (!res.ok) {
        setOutcome({ kind: 'error', message: typeof data?.error === 'string' && data.error !== 'limit' ? data.error : 'Не получилось проверить, попробуйте ещё раз' })
        return
      }
      const remaining = typeof data?.remaining === 'number' ? data.remaining : null
      if (!data?.found) { setOutcome({ kind: 'notFound', remaining }); return }
      setOutcome({ kind: 'found', company: data.company as PublicCompany, remaining })
    } catch {
      setOutcome({ kind: 'error', message: 'Не получилось проверить — проверьте интернет и попробуйте ещё раз' })
    }
  }

  const remaining = outcome.kind === 'found' || outcome.kind === 'notFound' ? outcome.remaining : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
            invoices.kz
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Проверка контрагента по БИН
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
          Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным данным
          КГД РК и реестра юридических лиц. Бесплатно: 3 проверки в день.
        </p>

        <div className="nav-glass rounded-2xl p-5 mb-4">
          <label htmlFor="bin" className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--nav-text-muted)' }}>
            БИН / ИИН контрагента
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              id="bin"
              inputMode="numeric"
              placeholder="12 цифр"
              value={bin}
              onChange={e => setBin(normalizeBin(e.target.value).slice(0, 12))}
              onKeyDown={e => { if (e.key === 'Enter') check() }}
              className="flex-1 min-w-[200px] rounded-xl px-4 py-3 text-base font-mono tracking-wider outline-none"
              style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}
            />
            <button
              onClick={check}
              disabled={!valid || outcome.kind === 'loading'}
              className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              {outcome.kind === 'loading' ? 'Проверяем…' : 'Проверить'}
            </button>
          </div>
          {remaining !== null && (
            <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
              Осталось {remaining} из 3 бесплатных проверок сегодня
            </div>
          )}
        </div>

        {outcome.kind === 'error' && (
          <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{outcome.message}</div>
        )}

        {outcome.kind === 'busy' && (
          <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Инструмент сегодня перегружен — попробуйте завтра. Внутри платформы проверки работают без общей очереди.
          </div>
        )}

        {outcome.kind === 'notFound' && (
          <div className="nav-glass rounded-2xl p-5 mb-4">
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>По этому БИН ничего не нашлось</div>
            <p className="text-[13px]" style={{ color: 'var(--nav-text-secondary)' }}>
              Ни в реестре юридических лиц, ни в базе КГД. Проверьте цифры — или это очень свежая регистрация,
              реестры обновляются с задержкой до суток.
            </p>
          </div>
        )}

        {outcome.kind === 'limit' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
            className="nav-glass nav-card-accent rounded-2xl p-6 mb-4">
            <div className="text-base font-bold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              3 бесплатные проверки на сегодня закончились
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
              В кабинете invoices.kz проверки без лимита — плюс полная карточка контрагента
              (адрес, руководитель, вид деятельности) и автозаполнение реквизитов прямо в счёте.
              Регистрация бесплатная, по ссылке на почту.
            </p>
            <a
              href="/login?utm_source=tools&utm_medium=limit&utm_campaign=kontragent"
              onClick={() => track('tool_kontragent_signup_click')}
              className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              Зарегистрироваться бесплатно
            </a>
          </motion.div>
        )}

        {outcome.kind === 'found' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
            className="nav-glass rounded-2xl p-5 mb-4">
            <div className="mb-3">
              <div className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>{outcome.company.name}</div>
              <div className="text-[13px] mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
                БИН {outcome.company.bin}
                {outcome.company.status ? ` · ${outcome.company.status}` : ''}
                {outcome.company.registeredAt ? ` · зарегистрирован ${outcome.company.registeredAt}` : ''}
              </div>
              {outcome.company.source === 'kgd' && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                  Данные КГД: для ИП государство публикует только имя и дату регистрации — пустые поля здесь не ошибка.
                </div>
              )}
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--nav-border)' }}>
              <Verdict
                ok={outcome.company.isUnreliable === null ? null : !outcome.company.isUnreliable}
                label="Неблагонадёжность"
                okText="Не числится в списке неблагонадёжных налогоплательщиков КГД"
                badText="Числится в списке неблагонадёжных — работать с предоплатой рискованно"
                unknownText="Не удалось проверить — это не значит, что всё в порядке"
              />
              <Verdict
                ok={outcome.company.isLiquidating === null ? null : !outcome.company.isLiquidating}
                label="Ликвидация"
                okText="Не находится в процессе ликвидации"
                badText="Находится на стадии ликвидации по данным КГД"
                unknownText="Не удалось проверить — это не значит, что всё в порядке"
              />
              <Verdict
                ok={outcome.company.totalArrear === null ? null : outcome.company.totalArrear <= 0}
                label="Налоговая задолженность"
                okText="Задолженности перед бюджетом нет"
                badText={outcome.company.totalArrear !== null && outcome.company.totalArrear > 0
                  ? `Долг ${tenge(outcome.company.totalArrear)}${outcome.company.taxArrear !== null && outcome.company.taxArrear !== outcome.company.totalArrear ? ` (из них налоги ${tenge(outcome.company.taxArrear)})` : ''}`
                  : 'Есть задолженность'}
                unknownText="Не удалось проверить — это не значит, что долга нет"
              />
              <Verdict
                ok={outcome.company.isVatPayer === null ? null : true}
                label="НДС"
                okText={outcome.company.isVatPayer
                  ? `Плательщик НДС${outcome.company.vatRegisteredAt ? ` с ${outcome.company.vatRegisteredAt}` : ''}`
                  : 'Не является плательщиком НДС'}
                badText=""
                unknownText="Не удалось проверить статус НДС"
              />
            </div>

            {outcome.company.hasFullCard && (
              <div className="rounded-xl p-4 mt-3" style={{ background: 'var(--nav-surface-glass)', border: '1px dashed var(--nav-border)' }}>
                <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                  🔒 Адрес, руководитель и вид деятельности — в полной карточке
                </div>
                <p className="text-[12px] mb-2.5" style={{ color: 'var(--nav-text-secondary)' }}>
                  После бесплатной регистрации реквизиты контрагента подставляются в счёт автоматически.
                </p>
                <a
                  href="/login?utm_source=tools&utm_medium=fullcard&utm_campaign=kontragent"
                  onClick={() => track('tool_kontragent_fullcard_click')}
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--nav-accent)' }}
                >
                  Открыть полную карточку →
                </a>
              </div>
            )}
          </motion.div>
        )}

        <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          Источники: ГБД «Юридические лица» (data.egov.kz) и сервисы портала КГД РК. Данные обновляются
          реестрами с задержкой до суток; результат носит справочный характер.
        </div>

        <ToolCta source="kontragent" />

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/tools" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>← Все инструменты</Link>
          <Link href="/guides" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>Гайды по документам →</Link>
        </div>
      </div>
    </div>
  )
}
