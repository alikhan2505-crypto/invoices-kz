'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSource1688Access, type Source1688Product } from './source1688Client'

// «Топ продаж на Kaspi» над формой калькулятора маржи (30.10.2026): продавец выбирает товар из
// списка самых востребованных, название и цена подставляются в калькулятор, ниже кнопка «Найти на
// 1688». Данные те же, что в «Нишах» (/api/kaspi-shop/niches/trends: «трендовые товары»: рейтинг
// спроса по отзывам, не продажи в штуках). Пока включён админ-гейт видит только админ.

interface TrendRow {
  sku: string
  name: string
  price: number
  rating: number
  reviewsCount: number
  brand: string
  imageUrl: string | null
  category?: string
}

interface TrendsResponse {
  categoryOptions: { key: string; label: string }[]
  trendingAll: TrendRow[]
  trendingCategory: TrendRow[] | null
}

export default function TopSellersPicker({ selectedSku, onPick }: {
  selectedSku: string | null
  onPick: (p: Source1688Product & { sku: string }) => void
}) {
  const allowed = useSource1688Access()
  const [category, setCategory] = useState('')
  const [options, setOptions] = useState<{ key: string; label: string }[]>([])
  const [rows, setRows] = useState<TrendRow[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const qs = category ? `?category=${encodeURIComponent(category)}` : ''
        const res = await fetch(`/api/kaspi-shop/niches/trends${qs}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
        const json = (await res.json().catch(() => null)) as TrendsResponse | null
        if (cancelled) return
        if (!res.ok || !json) { setState('error'); return }
        setOptions(json.categoryOptions ?? [])
        setRows((category ? json.trendingCategory : json.trendingAll) ?? [])
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [allowed, category])

  if (!allowed) return null

  return (
    <section className="mb-5" aria-labelledby="top-sellers-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="top-sellers-title" className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>Топ продаж на Kaspi</h2>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>
          Категория
          <select value={category} onChange={e => { setState('loading'); setCategory(e.target.value) }}
            className="rounded-lg px-2 py-1.5 text-[13px] min-h-11 outline-none"
            style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}>
            <option value="">Все категории</option>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {state === 'loading' && <p className="text-[12px] py-4" style={{ color: 'var(--nav-text-muted)' }} role="status">Загружаю топ…</p>}
      {state === 'error' && <p className="text-[12px] py-4" style={{ color: 'var(--nav-critical)' }} role="alert">Не удалось загрузить топ продаж. Название можно ввести вручную ниже.</p>}
      {state === 'ready' && rows.length === 0 && <p className="text-[12px] py-4" style={{ color: 'var(--nav-text-muted)' }}>В этой категории пока нет данных.</p>}

      {state === 'ready' && rows.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollSnapType: 'x proximity' }}>
          {rows.map(r => {
            const on = r.sku === selectedSku
            return (
              <li key={r.sku} className="flex-none w-40" style={{ scrollSnapAlign: 'start' }}>
                <button type="button" aria-pressed={on}
                  onClick={() => onPick({ sku: r.sku, name: r.name, price: r.price, brand: r.brand, category: r.category ?? null, imageUrl: r.imageUrl })}
                  className="w-full h-full text-left rounded-xl p-2.5 min-h-11"
                  style={{ border: `1px solid ${on ? 'var(--nav-accent)' : 'var(--nav-border)'}`, background: on ? 'var(--nav-accent-soft)' : 'var(--nav-surface-glass)' }}>
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" loading="lazy" className="w-full h-20 object-contain rounded-lg mb-2" style={{ background: '#fff' }} />
                  )}
                  <span className="block text-[12px] font-medium line-clamp-2" style={{ color: 'var(--nav-text-primary)' }}>{r.name}</span>
                  <span className="block text-[12px] font-mono tabular-nums mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{r.price.toLocaleString('ru-KZ')} ₸</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
