import { placeholderInitial } from '@/lib/storefrontLayout'

// Фото товара/модели. Без фото рисуем не пустой квадрат, а заглушку: первая буква
// названия на мягком фоне акцента. Размер задаёт родитель (по умолчанию квадрат).
export function ProductPhoto({ src, name, className = 'aspect-square', fit = 'cover' }: {
  src: string | null
  name: string
  className?: string
  fit?: 'cover' | 'contain'
}) {
  if (src) {
    return (
      <img src={src} alt={name}
        className={`w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
        style={{ background: 'var(--nav-surface-glass)' }} />
    )
  }
  return (
    <div role="img" aria-label={name}
      className={`w-full flex items-center justify-center select-none ${className}`}
      style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), var(--nav-surface-glass))' }}>
      <span aria-hidden className="text-5xl sm:text-6xl font-bold" style={{ color: 'var(--nav-accent)', opacity: 0.55 }}>
        {placeholderInitial(name)}
      </span>
    </div>
  )
}

// Плашки разделов над сеткой: «Все» и по одной на раздел. На телефоне ряд
// прокручивается в сторону, с lg переносится на новые строки.
export function CategoryChips({ items, active, onChange, allLabel }: {
  items: { key: string; name: string; count: number }[]
  active: string | null
  onChange: (key: string | null) => void
  allLabel: string
}) {
  const chip = (isActive: boolean) => ({
    background: isActive ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
    color: isActive ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
  })
  return (
    <div className="flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible pb-2 mb-6">
      <button onClick={() => onChange(null)} aria-pressed={active === null}
        className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(active === null)}>
        {allLabel}
      </button>
      {items.map(c => (
        <button key={c.key} onClick={() => onChange(c.key)} aria-pressed={active === c.key}
          className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(active === c.key)}>
          {c.name} <span className="tabular-nums opacity-70">{c.count}</span>
        </button>
      ))}
    </div>
  )
}
