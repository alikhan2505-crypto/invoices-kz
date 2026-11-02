'use client'
import { useState } from 'react'

// Поле для цены и количества. Заменяет <input type="number" value={x || ''}>: у такого поля при вводе
// «0» значение 0 превращалось в пустую строку и стирало набранное, поэтому «0,5» набрать было нельзя;
// запятая и пробелы терялись, а на iPhone крутилась прокрутка колесом (аудит 02.11.2026).
// Текст хранится как набран, число уходит наружу по мере ввода; если снаружи значение поменяли
// (шаблон, копия счёта), показывается оно.

/** Число из набранного текста: запятая или точка, пробелы (и неразрывные) не мешают; пусто = 0; мусор = NaN. */
export function parseDecimalText(raw: string): number {
  const s = raw.replace(/[\s  ]/g, '').replace(',', '.')
  if (s === '') return 0
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN
  return Number(s)
}

const ALLOWED = /^[\d\s  .,]*$/

export default function DecimalField({ value, onValue, className, style, placeholder, ariaLabel }: {
  value: number
  onValue: (n: number) => void
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(value ? String(value) : '')
  const shown = parseDecimalText(text) === (value || 0) ? text : (value ? String(value) : '')
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={16}
      className={className}
      style={style}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={shown}
      onChange={(e) => {
        const next = e.target.value
        if (!ALLOWED.test(next)) return
        const n = parseDecimalText(next)
        if (Number.isNaN(n)) return
        setText(next)
        onValue(n)
      }}
    />
  )
}
