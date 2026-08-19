'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'

const EASE = [0.16, 1, 0.3, 1] as const
const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60000

type NicheProduct = { sku: string; name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null; shopUrl: string | null }

type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: NicheProduct[]
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

// Kaspi's price-range labels are free text ("до 10 000 т", "10 000 - 49 999 т",
// "более 500 000 т"), not a structured min/max -- parsed here so a click can
// filter the already-fetched product cards by which bucket their own price
// falls into. Note this only ever filters the up to 12 cards this page
// already has, not the full (often much larger) count shown next to each
// bucket -- Kaspi's search API isn't re-queried on a filter click.
function parsePriceRangeLabel(label: string): { min: number; max: number } {
  const nums = (label.match(/[\d\s ]+/g) || []).map(s => Number(s.replace(/[\s ]/g, ''))).filter(n => !Number.isNaN(n))
  if (label.includes('до') && nums.length >= 1) return { min: 0, max: nums[0] }
  if (label.includes('более') && nums.length >= 1) return { min: nums[0], max: Infinity }
  if (nums.length >= 2) return { min: nums[0], max: nums[1] }
  return { min: 0, max: Infinity }
}

export default function KaspiShopNiches() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [summary, setSummary] = useState<NicheSummary | null>(null)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activePriceRange, setActivePriceRange] = useState<string | null>(null)
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  const [openProduct, setOpenProduct] = useState<NicheProduct | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setLoading(false)
  }

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
  }

  async function pollResult(checkId: string) {
    const headers = await authHeader()
    const startedAt = Date.now()
    stopPolling()
    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling()
        setSearching(false)
        setLoadError('Проверка заняла слишком много времени. Попробуйте ещё раз.')
        return
      }
      try {
        const res = await fetch(`/api/kaspi-shop/niches/result?checkId=${encodeURIComponent(checkId)}`, { headers })
        const data = await res.json()
        if (!res.ok) { stopPolling(); setSearching(false); setLoadError(data.error || 'Не удалось получить результат'); return }
        if (data.status === 'done') {
          stopPolling()
          setSearching(false)
          setSummary(data.result)
        } else if (data.status === 'error') {
          stopPolling()
          setSearching(false)
          setLoadError(data.error || 'Не удалось проверить нишу')
        }
      } catch {
        stopPolling()
        setSearching(false)
        setLoadError('Не удалось проверить нишу. Проверьте соединение и попробуйте ещё раз.')
      }
    }, POLL_INTERVAL_MS)
  }

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    setLoadError('')
    setSearched(true)
    setSearchedQuery(query.trim())
    setSummary(null)
    setActivePriceRange(null)
    setActiveBrand(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/niches/request', {
        method: 'POST', headers, body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setSearching(false); setLoadError(data.error || 'Не удалось запустить проверку'); return }
      pollResult(data.checkId)
    } catch {
      setSearching(false)
      setLoadError('Не удалось запустить проверку. Проверьте соединение и попробуйте ещё раз.')
    }
  }

  if (loading) return <LoadingSpinner />

  const isEmpty = !!summary && summary.total === 0 && summary.products.length === 0

  return (
    <main className="nav-surface-elevated min-h-screen">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Ниши</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6" style={{ color: 'var(--nav-text-primary)' }}>Проверить идею товара</h1>
          <form onSubmit={e => { e.preventDefault(); doSearch() }} className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Например: термокружка"
              className={`flex-1 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <button type="submit" disabled={searching || !query.trim()}
              className="rounded-xl text-sm font-semibold px-5 py-3 disabled:opacity-40" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {searching ? 'Ищем...' : 'Проверить'}
            </button>
          </form>
          {searching && (
            <div className="mt-4 text-xs" style={{ color: 'var(--nav-text-muted)' }}>Проверка идёт через реальный поиск Kaspi — обычно занимает 15–30 секунд.</div>
          )}
          {summary && !isEmpty && (
            <div className="mt-6 text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
              {summary.total.toLocaleString('ru-KZ')}
              <span className="text-sm font-medium ml-2" style={{ color: 'var(--nav-text-muted)' }}>товаров по запросу «{searchedQuery}»</span>
            </div>
          )}
        </motion.div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={doSearch} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {!searched ? null : searching ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Ищем на Kaspi...</div>
        ) : !summary || isEmpty ? (
          loadError ? null : (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Ничего не нашлось по этому запросу.</div>
            </div>
          )
        ) : (
          <>
            {(summary.priceRanges.length > 0 || summary.topBrands.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {summary.priceRanges.length > 0 && (
                  <div className="nav-glass rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>Диапазоны цен</div>
                    {summary.priceRanges.map((r, i) => {
                      const active = activePriceRange === r.label
                      return (
                        <button key={r.label} onClick={() => setActivePriceRange(v => v === r.label ? null : r.label)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                          style={{ background: active ? 'var(--nav-accent)' : 'transparent', borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
                          <span className="text-sm" style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>{r.label}</span>
                          <span className="text-xs tabular-nums" style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)', opacity: active ? 0.8 : 1 }}>{r.count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {summary.topBrands.length > 0 && (
                  <div className="nav-glass rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>Топ брендов</div>
                    {summary.topBrands.map((b, i) => {
                      const active = activeBrand === b.name
                      return (
                        <button key={b.name} onClick={() => setActiveBrand(v => v === b.name ? null : b.name)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                          style={{ background: active ? 'var(--nav-accent)' : 'transparent', borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
                          <span className="text-sm" style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>{b.name}</span>
                          <span className="text-xs tabular-nums" style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)', opacity: active ? 0.8 : 1 }}>{b.count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {(activePriceRange || activeBrand) && (
              <div className="text-[11px] mb-2 px-1" style={{ color: 'var(--nav-text-muted)' }}>
                Фильтр применяется к показанным ниже {summary.products.length} товарам (не ко всей выдаче Kaspi) —{' '}
                <button onClick={() => { setActivePriceRange(null); setActiveBrand(null) }} className="underline underline-offset-2">сбросить</button>
              </div>
            )}

            {(() => {
              const range = activePriceRange ? parsePriceRangeLabel(activePriceRange) : null
              const filtered = summary.products.filter(p =>
                (!range || (p.price >= range.min && p.price <= range.max)) &&
                (!activeBrand || p.brand === activeBrand)
              )
              if (filtered.length === 0) {
                return (
                  <div className="nav-glass rounded-2xl p-8 text-center">
                    <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Среди показанных товаров нет совпадений с этим фильтром.</div>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {filtered.map((p, i) => (
                    <button key={i} onClick={() => setOpenProduct(p)} className={`nav-glass rounded-2xl p-3 text-left ${CARD_HOVER}`}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full aspect-square rounded-xl object-cover mb-2" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square rounded-xl mb-2" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="text-xs font-semibold line-clamp-2 mb-1" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{p.price.toLocaleString('ru-KZ')} ₸</span>
                        <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--nav-text-muted)' }}><StarIcon />{p.rating.toFixed(1)} ({p.reviewsCount})</span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })()}
          </>
        )}
      </div>

      {openProduct && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setOpenProduct(null)}>
          <div onClick={e => e.stopPropagation()} className="nav-glass rounded-2xl max-w-sm w-full overflow-hidden" style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
            {openProduct.imageUrl ? (
              <img src={openProduct.imageUrl} alt={openProduct.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
            ) : (
              <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
            )}
            <div className="p-4">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{openProduct.name}</div>
              <div className="text-xs mb-3 flex items-center gap-1" style={{ color: 'var(--nav-text-muted)' }}>{openProduct.brand} · <StarIcon />{openProduct.rating.toFixed(1)} ({openProduct.reviewsCount} отзывов)</div>
              <div className="font-mono font-bold text-xl tabular-nums mb-4" style={{ color: 'var(--nav-text-primary)' }}>{openProduct.price.toLocaleString('ru-KZ')} ₸</div>
              {openProduct.shopUrl && (
                <a href={openProduct.shopUrl} target="_blank" rel="noopener noreferrer"
                  className="block text-center text-sm font-medium rounded-xl px-4 py-2.5" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  Открыть на Kaspi ↗
                </a>
              )}
              <button onClick={() => setOpenProduct(null)} className="block w-full text-center text-xs mt-3" style={{ color: 'var(--nav-text-muted)' }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
