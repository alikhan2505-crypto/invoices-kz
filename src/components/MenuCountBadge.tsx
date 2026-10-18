'use client'
import { useLanguage } from './LanguageProvider'
import { formatBadgeCount } from '@/lib/kaspiShop/menuCounts'
import { menuCountLabel } from '@/lib/i18n/menuCounts'

// Маленькая плашка справа в строке бокового меню: сколько в работе. Нет числа
// (0, ещё не загружено, Kaspi не ответил) -- нет и плашки, строка не меняется.
// Цвета только из токенов --nav-*. Цифра всегда --nav-text-primary (контраст
// выше 7:1 и в светлой, и в тёмной теме; акцентный цвет на своём же полупрозрачном
// фоне в тёмной теме давал только 3.2:1). В активной строке (фон --nav-accent-soft)
// плашка темнее/ярче тем же акцентом, иначе она слилась бы с фоном строки.
export default function MenuCountBadge({ count, active }: { count: number | null | undefined; active: boolean }) {
  const { lang } = useLanguage()
  const text = formatBadgeCount(count)
  if (text === null || typeof count !== 'number') return null
  const label = menuCountLabel(count, lang)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="flex-shrink-0 inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[11px] font-bold tabular-nums leading-none"
      style={{
        background: active ? 'color-mix(in srgb, var(--nav-accent) 38%, transparent)' : 'var(--nav-accent-soft)',
        color: 'var(--nav-text-primary)',
      }}
    >
      {text}
    </span>
  )
}
