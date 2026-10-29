'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { track } from '@vercel/analytics'
import type { NameLookupRole, NameLookupTool } from '@/lib/toolQuota'
import type { ToolLang } from './index'
import { lookupAriaLabel, NAME_LOOKUP_TEXT } from './nameLookup'
import { AUTO_NAME_LOOKUP_ENABLED, createAutoLookup, onlyBinDigits, sharedLookupSession, type AutoLookup, type AutoStatus } from './binAutofill'
import { logToolEvent } from './toolEvents'

// Поле БИН/ИИН для бесплатных документов /tools: название подставляется САМО,
// когда ЧЕЛОВЕК набрал 12-ю цифру (дебаунс, один запрос на уникальный БИН за сессию
// страницы, пустое поле или прошлая подстановка; введённое руками не
// затирается — см. binAutofill.ts). БИН из черновика или запомненных реквизитов
// поиск не будит (иначе перезагрузка тратила бы квоту реестра без действия человека). Кнопка «Найти» осталась ручным запасным
// вариантом и всегда перезаписывает название, это явное действие человека.
// Сервер (/api/tools/name-lookup) сначала смотрит наш кэш, затем живой реестр —
// 3 раза в квартал на это поле этого инструмента (автопоиск ту же квоту и тратит).
// На телефоне поле и кнопка в одну строку: поле сжимается (min-w-0), кнопка нет.

type Props = {
  id: string
  tool: NameLookupTool
  role: NameLookupRole
  lang: ToolLang
  label: string
  placeholder: string
  /** Текущий БИН/ИИН — только цифры, до 12. */
  value: string
  onChange: (bin: string) => void
  /** Текущее название в паре (поле ниже): автопоиск не затирает введённое руками. */
  name: string
  /** Нашли название — родитель кладёт его в поле названия. */
  onName: (name: string) => void
  className?: string
  inputClass: string
  inputStyle: CSSProperties
  labelClass: string
  labelStyle: CSSProperties
}

export default function BinNameField({
  id, tool, role, lang, label, placeholder, value, onChange, name, onName,
  className, inputClass, inputStyle, labelClass, labelStyle,
}: Props) {
  const t = NAME_LOOKUP_TEXT[lang]
  const [status, setStatus] = useState<AutoStatus>('idle')
  // Всё, что нужно контроллеру в момент срабатывания таймера, берём из ref:
  // иначе он видел бы название и колбэки на момент создания.
  const live = useRef({ name, onName, lang })
  useEffect(() => { live.current = { name, onName, lang } })
  const ctl = useRef<AutoLookup | null>(null)
  useEffect(() => {
    const c = createAutoLookup(sharedLookupSession(), {
      tool, role,
      getName: () => live.current.name,
      autoSearch: AUTO_NAME_LOOKUP_ENABLED,
      onStatus: setStatus,
      onName: n => live.current.onName(n),
      onAutofilled: () => {
        track('tool_form_autofill_bin', { tool, role, lang: live.current.lang })
        logToolEvent('tool_form_autofill_bin', tool, { lang: live.current.lang })
      },
    })
    ctl.current = c
    return () => { c.dispose(); ctl.current = null }
  }, [tool, role])

  const bin = onlyBinDigits(value)
  // Последний БИН, набранный в этом поле руками. Если значение пропса от него
  // отличается, БИН пришёл снаружи (черновик, запомненное, сброс): поиск не
  // запускаем, а название рядом считаем принадлежащим этому БИН.
  const typed = useRef(bin)
  useEffect(() => {
    if (typed.current === bin) return
    typed.current = bin
    ctl.current?.adopt(bin)
  }, [bin])
  // Подсказка «название осталось прежним» устарела, как только название поправили.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(s => (s === 'stale' ? 'idle' : s))
  }, [name])

  const canLookup = bin.length === 12 && status !== 'loading'
  const latestBin = useRef(bin)
  useEffect(() => { latestBin.current = bin })

  const lookup = async () => {
    if (!canLookup) return
    setStatus('loading')
    track(`tool_${tool}_bin_lookup`, { role, lang })
    const next = await sharedLookupSession().lookup({ bin, tool, role })
    // Ответ на устаревший БИН (пользователь уже поменял поле) название не трогает.
    if (onlyBinDigits(latestBin.current) !== bin) return
    if (next.name) { ctl.current?.markFilled(next.name, bin); onName(next.name) }
    setStatus(next.status)
  }

  const muted = { color: 'var(--nav-text-muted)' } as const
  const message =
    status === 'loading' ? t.loading
    : status === 'found' ? t.found
    : status === 'miss' ? t.miss
    : status === 'limit' ? t.limit
    : status === 'unavailable' ? t.unavailable
    : status === 'invalid' ? t.invalid
    : status === 'stale' ? t.stale
    : ''

  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass} style={labelStyle}>{label}</label>
      <div className="flex gap-2">
        <input id={id} className={inputClass} style={inputStyle} inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={placeholder}
          value={value ?? ''}
          onChange={e => {
            const next = onlyBinDigits(e.target.value)
            typed.current = next
            onChange(next)
            ctl.current?.change(next) // только живой ввод; сеть трогает, только если автопоиск включён (binAutofill.ts)
          }} />
        <button type="button" onClick={() => void lookup()} disabled={!canLookup}
          aria-label={lookupAriaLabel(t.button, label)}
          className="nav-glass rounded-xl px-3 text-[13px] font-semibold flex-shrink-0 disabled:opacity-50"
          style={{ color: 'var(--nav-accent)' }}>
          {status === 'loading' ? '…' : t.button}
        </button>
      </div>
      <div aria-live="polite">
        {message && (
          <div className="text-[11px] mt-1" style={status === 'found' ? { color: 'var(--nav-success)' } : muted}>{message}</div>
        )}
      </div>
    </div>
  )
}
