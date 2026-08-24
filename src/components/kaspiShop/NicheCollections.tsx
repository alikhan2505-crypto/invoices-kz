'use client'
// «Витрина ниш» -- the face of /kaspi-shop/niches (founder decision
// 2026-08-23, from the competitor-research follow-up: zoomia's curated
// collections were the #1 gap). Self-contained: own fetch, own
// loading/error state, mirrors the page's other two independent data
// flows (keyword search, trends). Honesty rule: only metrics we really
// measure -- отзывы, рейтинг, продавцы, рост отзывов, индекс спроса; no
// invented sales/revenue numbers.
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

const EASE = [0.16, 1, 0.3, 1] as const

type CollectionProduct = {
  sku: string; name: string; brand: string
  price: number; rating: number; reviewsCount: number
  sellersCount: number | null; reviewsDelta7d: number | null
  score: number; imageUrl: string | null; shopUrl: string | null
}
type Collection = { key: string; label: string; description: string; pending?: boolean; products: CollectionProduct[] }
type CollectionsResponse = { computedAt: string | null; collections: Collection[] }

const ICONS: Record<string, string> = {
  'high-demand': '🔥',
  'cheap-entry': '💰',
  'weak-competitors': '🎯',
  'few-sellers': '🏝️',
  'demand-spike': '📈',
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

// Same row-as-external-link table pattern as the page's own
// TrendingProductsTable -- extra columns appear only where the metric
// exists: «Продавцы» for few-sellers, «+7 дн» for demand-spike.
function CollectionTable({ collection }: { collection: Collection }) {
  const showSellers = collection.key === 'few-sellers'
  const showDelta = collection.key === 'demand-spike'
  if (collection.products.length === 0) {
    return (
      <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Пока нет товаров, проходящих пороги этой подборки.
      </div>
    )
  }
  const gridCols = showSellers || showDelta
    ? 'lg:grid-cols-[2.2fr_0.8fr_0.7fr_0.7fr_0.7fr_0.6fr]'
    : 'lg:grid-cols-[2.6fr_0.8fr_0.7fr_0.7fr_0.6fr]'
  return (
    <div className="nav-glass rounded-2xl overflow-hidden">
      <div className={`hidden lg:grid ${gridCols} gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider`}
        style={{ color: 'var(--nav-text-muted)', borderBottom: '1px solid var(--nav-border-soft)' }}>
        <span>Товар</span>
        <span>Цена</span>
        <span>Рейтинг</span>
        <span>Отзывы</span>
        {showSellers && <span>Продавцы</span>}
        {showDelta && <span>+7 дн</span>}
        <span>Спрос</span>
      </div>
      {collection.products.map((p, i) => (
        <a key={`${p.sku}-${i}`} href={p.shopUrl || undefined} target={p.shopUrl ? '_blank' : undefined} rel={p.shopUrl ? 'noopener noreferrer' : undefined}
          onClick={e => { if (!p.shopUrl) e.preventDefault() }}
          className={`grid grid-cols-2 ${gridCols} gap-x-2 gap-y-1 items-center px-4 py-3 text-sm transition-colors ${p.shopUrl ? 'hover:bg-[color:var(--nav-bg)]' : 'cursor-default'}`}
          style={{ borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
          <span className="col-span-2 lg:col-span-1 font-medium line-clamp-1 flex items-center gap-1.5" style={{ color: 'var(--nav-text-primary)' }}>
            {p.name}{p.shopUrl && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>↗</span>}
          </span>
          <span className="font-mono tabular-nums text-xs lg:text-sm" style={{ color: 'var(--nav-text-primary)' }}>{p.price.toLocaleString('ru-KZ')} ₸</span>
          <span className="text-xs lg:text-sm flex items-center gap-1" style={{ color: 'var(--nav-text-muted)' }}><StarIcon />{p.rating.toFixed(1)}</span>
          <span className="text-xs lg:text-sm tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{p.reviewsCount.toLocaleString('ru-KZ')}</span>
          {showSellers && (
            <span className="text-xs lg:text-sm tabular-nums font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{p.sellersCount ?? '—'}</span>
          )}
          {showDelta && (
            <span className="text-xs lg:text-sm tabular-nums font-semibold" style={{ color: 'var(--nav-accent)' }}>+{(p.reviewsDelta7d ?? 0).toLocaleString('ru-KZ')}</span>
          )}
          <span className="text-xs lg:text-sm font-mono tabular-nums font-semibold" style={{ color: 'var(--nav-accent)' }}>{p.score.toFixed(2)}</span>
        </a>
      ))}
    </div>
  )
}

export default function NicheCollections() {
  const [data, setData] = useState<CollectionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi-shop/niches/collections', {
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Не удалось загрузить подборки'); setLoading(false); return }
      setData(json)
      setLoading(false)
    } catch {
      setError('Не удалось загрузить подборки. Проверьте соединение и попробуйте ещё раз.')
      setLoading(false)
    }
  }

  const open = data?.collections.find(c => c.key === openKey) || null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="mb-8">
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Ниши</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Витрина ниш</h1>
        </div>
        <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
          Готовые подборки по реальным метрикам Kaspi · обновляются каждые 24 часа{data?.computedAt ? ` · данные за ${new Date(`${data.computedAt}T00:00:00`).toLocaleDateString('ru-KZ', { day: '2-digit', month: '2-digit' })}` : ''}
        </div>
      </div>

      {error && (
        <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
          <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</span>
          <button onClick={load} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
        </div>
      )}

      {loading && !data ? (
        <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем подборки...</div>
      ) : data && data.computedAt === null ? (
        <div className="nav-glass rounded-2xl p-8 text-center">
          <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Данные ещё не рассчитаны. Первый расчёт появится после ближайшего запуска фонового обновления.</div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4 items-stretch">
            {data.collections.map(c => {
              const active = openKey === c.key
              return (
                <button key={c.key} onClick={() => setOpenKey(k => k === c.key ? null : c.key)}
                  className="nav-glass rounded-2xl p-4 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]"
                  style={{ outline: active ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                  <div className="text-xl mb-1.5">{ICONS[c.key] || '📦'}</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{c.label}</div>
                  <div className="text-[11px] leading-snug mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{c.description}</div>
                  <div className="text-[11px] font-semibold tabular-nums" style={{ color: c.pending ? 'var(--nav-text-muted)' : 'var(--nav-accent)' }}>
                    {c.pending ? 'копим данные' : `${c.products.length} позиций`}
                  </div>
                </button>
              )
            })}
          </div>

          {open && (open.pending ? (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                Копим историю отзывов — подборка «Всплеск спроса» оживёт, когда накопится неделя наблюдений.
              </div>
            </div>
          ) : (
            <CollectionTable collection={open} />
          ))}
        </>
      ) : null}
    </motion.div>
  )
}
