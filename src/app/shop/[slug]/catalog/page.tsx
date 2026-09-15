'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import WholesaleCartBar from '@/components/kaspiShop/WholesaleCartBar'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }
type Category = { id: string; name: string; sortOrder: number }

const EASE = [0.16, 1, 0.3, 1] as const

function LogoMark() {
  return <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Same grouping shape as the existing flat storefront's groupProducts
// (shop/[slug]/page.tsx) -- pure, no I/O. A model with no category goes into
// a trailing "Другое" group; a seller who never made a category gets one
// flat "Все" group.
function groupModels(models: Model[], categories: Category[]): { id: string | null; name: string; models: Model[] }[] {
  if (categories.length === 0) return [{ id: null, name: '', models }]
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = sorted.map(c => ({ id: c.id as string | null, name: c.name, models: models.filter(m => m.categoryId === c.id) }))
  const uncategorized = models.filter(m => !sorted.some(c => c.id === m.categoryId))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Другое', models: uncategorized })
  return groups.filter(g => g.models.length > 0)
}

export default function WholesaleCatalogPage() {
  const params = useParams<{ slug: string }>()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}/wholesale`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return }
        setCompanyName(data.companyName || '')
        setModels(Array.isArray(data.models) ? data.models : [])
        setCategories(Array.isArray(data.categories) ? data.categories : [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
  if (notFound) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Витрина не найдена</div>

  const groups = groupModels(models, categories)
  const visibleGroups = activeCategory ? groups.filter(g => g.id === activeCategory) : groups

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-6xl mx-auto p-4 lg:p-6 pb-32">
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark />
          <h1 className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{companyName}</h1>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            <button onClick={() => setActiveCategory(null)}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: activeCategory === null ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: activeCategory === null ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
              Все
            </button>
            {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)}
                className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: activeCategory === c.id ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: activeCategory === c.id ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {models.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет моделей в каталоге</div>
        ) : (
          <div className="space-y-8">
            {visibleGroups.map(group => (
              <div key={group.id || group.name || 'all'}>
                {group.name && (
                  <h2 className="text-lg font-bold mb-4 pb-2 border-b" style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border)' }}>{group.name}</h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {group.models.map((m, i) => (
                    <motion.a
                      key={m.id}
                      href={`/shop/${params.slug}/catalog/${m.id}`}
                      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                      className="nav-glass rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md"
                    >
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="p-3 sm:p-4">
                        <div className="text-sm font-semibold mb-2 line-clamp-2" style={{ color: 'var(--nav-text-primary)' }}>{m.name}</div>
                        <div className="text-base sm:text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(m.price)}</div>
                      </div>
                    </motion.a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <WholesaleCartBar slug={params.slug} />
    </div>
  )
}
