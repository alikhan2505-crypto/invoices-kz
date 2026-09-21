'use client'
import { useState } from 'react'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { SECTIONS } from '@/components/SiteNav'
import KaspiShopStoreSwitcher from '@/components/KaspiShopStoreSwitcher'
import { ShellContext } from '@/components/shellContext'
import { PRODUCTS, SELECTABLE_KEYS, type ProductKey } from '@/lib/products'
import { productCabinetHref } from '@/lib/crossProduct'
import { useEffectivePath } from '@/lib/useEffectivePath'
import { useMyProducts } from '@/lib/useMyProducts'

const TEXT: Record<Lang, { switchProduct: string; all: string; menu: string; close: string }> = {
  ru: { switchProduct: 'Сменить продукт', all: 'Все продукты', menu: 'Меню', close: 'Закрыть' },
  kk: { switchProduct: 'Өнімді ауыстыру', all: 'Барлық өнімдер', menu: 'Мәзір', close: 'Жабу' },
  en: { switchProduct: 'Switch product', all: 'All products', menu: 'Menu', close: 'Close' },
}

// Cabinet layout from the founder's mock (21.09.2026): a left sidebar with only
// this product's sections, a product switcher on top. The pages themselves are
// unchanged -- they render inside; <SiteNav /> renders nothing here.
export default function ProductShell({ product, children }: { product: ProductKey; children: React.ReactNode }) {
  const { lang } = useLanguage()
  const path = useEffectivePath()
  const [open, setOpen] = useState(false)
  const [mine] = useMyProducts()
  const [hostname] = useState(() => (typeof window === 'undefined' ? '' : window.location.hostname))
  const t = TEXT[lang]

  const def = PRODUCTS.find((p) => p.key === product)!
  const section = SECTIONS.find((s) => s.key === product)
  const links = section?.links ?? []
  const bestMatch = links
    .filter((l) => path === l.href || path.startsWith(l.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const switchable = PRODUCTS.filter((p) => !p.locked && p.key !== 'salon' && (mine === null ? SELECTABLE_KEYS.includes(p.key) : mine.includes(p.key) || p.key === product))

  const panel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: def.bg }} aria-hidden="true" />
          <span className="text-[15px] font-bold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>{def.name}</span>
        </div>
        <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }} htmlFor="shell-product-switch">{t.switchProduct}</label>
        <select
          id="shell-product-switch"
          value={product}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__all') window.location.href = 'https://invoices.kz/products'
            else if (v !== product) window.location.href = productCabinetHref(v as ProductKey, hostname)
          }}
          className="w-full rounded-xl px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }}
        >
          {switchable.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          <option value="__all">{t.all}…</option>
        </select>
        {product === 'kaspiShop' && <div className="mt-3"><KaspiShopStoreSwitcher /></div>}
      </div>

      <nav aria-label={def.name} className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {links.map((l) => {
          const active = l.href === bestMatch
          return (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className="flex items-center min-h-[40px] px-3 rounded-xl text-[14px] font-medium mb-0.5 transition-colors"
              style={{
                background: active ? 'var(--nav-accent-soft, var(--nav-surface-glass))' : 'transparent',
                color: active ? 'var(--nav-accent)' : 'var(--nav-text-secondary)',
              }}
            >
              {l.label[lang]}
            </a>
          )
        })}
      </nav>

      <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--nav-border)' }}>
        <a href="https://invoices.kz/products" className="text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>← {t.all}</a>
      </div>
    </div>
  )

  return (
    <ShellContext.Provider value={true}>
      <div className="product-shell" style={{ '--shell-left': '272px' } as React.CSSProperties}>
        {/* Desktop: fixed sidebar card, same floating gap as DesktopShell's card. */}
        <aside className="hidden lg:block fixed top-3 left-3 bottom-3 w-[248px] z-30 rounded-[28px] overflow-hidden shadow-2xl ring-1 ring-black/5 nav-glass" aria-label={def.name}>
          {panel}
        </aside>

        {/* Mobile: sticky top bar + drawer. */}
        <div className="lg:hidden sticky top-0 z-40 h-14 flex items-center gap-2 px-2 nav-glass" style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.menu}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-xl"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            ☰
          </button>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: def.bg }} aria-hidden="true" />
          <span className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{def.name}</span>
        </div>
        {open && (
          <div className="lg:hidden fixed inset-0 z-50">
            <button type="button" aria-label={t.close} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute top-0 left-0 bottom-0 w-[280px] max-w-[85vw] nav-glass shadow-2xl" style={{ background: 'var(--nav-bg)' }}>
              {panel}
            </div>
          </div>
        )}

        <div className="product-shell-main">{children}</div>
      </div>
    </ShellContext.Provider>
  )
}
