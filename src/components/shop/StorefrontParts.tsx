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

// Название раздела на десктопе: первая плитка раздела в общей сетке (см.
// STOREFRONT_GRID). На телефоне вместо неё обычный заголовок над сеткой раздела.
export function CategoryTile({ name, count }: { name: string; count: number }) {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center gap-3 text-center rounded-2xl p-5 border border-[color:var(--nav-border-soft)]"
      style={{ background: 'var(--nav-accent-soft)' }}>
      <h2 className="text-xl font-bold break-words max-w-full" style={{ color: 'var(--nav-text-primary)' }}>{name}</h2>
      <span className="rounded-full px-3 py-0.5 text-sm font-semibold tabular-nums"
        style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>{count}</span>
    </div>
  )
}

export function CategoryHeading({ name }: { name: string }) {
  return (
    <h2 className="lg:hidden text-lg font-bold mb-4 pb-2 border-b" style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border)' }}>{name}</h2>
  )
}
