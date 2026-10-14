'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { track } from '@vercel/analytics'
import type { NameLookupRole, NameLookupTool } from '@/lib/toolQuota'
import type { ToolLang } from './index'
import { lookupAriaLabel, NAME_LOOKUP_TEXT, parseNameLookupResponse, type NameLookupStatus } from './nameLookup'

// Поле БИН/ИИН с кнопкой «Найти» для бесплатных документов /tools: название
// подставляется ТОЛЬКО по кнопке (без автопоиска), кнопка активна при ровно
// 12 цифрах. Сервер (/api/tools/name-lookup) сначала смотрит наш кэш, затем
// живой реестр — 3 раза в квартал на это поле этого инструмента.
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
  /** Нашли название — родитель кладёт его в поле названия. */
  onName: (name: string) => void
  className?: string
  inputClass: string
  inputStyle: CSSProperties
  labelClass: string
  labelStyle: CSSProperties
}

// String(): черновик из localStorage — чужие данные, там может оказаться не строка.
const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(0, 12)

export default function BinNameField({
  id, tool, role, lang, label, placeholder, value, onChange, onName,
  className, inputClass, inputStyle, labelClass, labelStyle,
}: Props) {
  const t = NAME_LOOKUP_TEXT[lang]
  const [status, setStatus] = useState<NameLookupStatus>('idle')
  // Ответ на устаревший БИН (пользователь уже поменял поле) название не трогает.
  const latest = useRef(value)
  useEffect(() => { latest.current = value }, [value])

  const bin = onlyDigits(value)
  const canLookup = bin.length === 12 && status !== 'loading'

  const lookup = async () => {
    if (!canLookup) return
    setStatus('loading')
    track(`tool_${tool}_bin_lookup`, { role, lang })
    let next: { status: NameLookupStatus; name: string | null } = { status: 'unavailable', name: null }
    try {
      const res = await fetch('/api/tools/name-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin, tool, role }),
      })
      next = parseNameLookupResponse(res.ok, await res.json().catch(() => null))
    } catch {}
    if (onlyDigits(latest.current) !== bin) return
    if (next.name) onName(next.name)
    setStatus(next.status)
  }

  const muted = { color: 'var(--nav-text-muted)' } as const
  const message =
    status === 'loading' ? t.loading
    : status === 'found' ? t.found
    : status === 'miss' ? t.miss
    : status === 'limit' ? t.limit
    : status === 'unavailable' ? t.unavailable
    : ''

  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass} style={labelStyle}>{label}</label>
      <div className="flex gap-2">
        <input id={id} className={inputClass} style={inputStyle} inputMode="numeric" autoComplete="off" placeholder={placeholder}
          value={value ?? ''}
          onChange={e => {
            const v = onlyDigits(e.target.value)
            latest.current = v
            onChange(v)
            setStatus('idle')
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
