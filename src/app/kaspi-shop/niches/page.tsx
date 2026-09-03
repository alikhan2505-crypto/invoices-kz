'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import NicheCollections from '@/components/kaspiShop/NicheCollections'
import { getActivePlan } from '@/lib/plan'

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

// "Trending on Kaspi" passive dashboard types -- separate data flow from
// the NicheSummary search tool above (own state, own fetch, own loading/
// error handling). Mirrors the shape returned by
// GET /api/kaspi-shop/niches/trends -- see that route and
// src/lib/kaspiShop/nicheTrends.ts for where these numbers come from.
type TrendCategory = { key: string; label: string; demandScore: number; totalReviews: number; productCount: number }
type TrendShare = { key: string; label: string; demandScore: number; share: number }
type TrendProductRow = { sku: string; name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null; shopUrl: string | null; score: number; category: string }
type TrendsResponse = {
  computedAt: string | null
  categories: TrendCategory[]
  page: number
  pageSize: number
  totalCategories: number
  categoryOptions: { key: string; label: string }[]
  topShare: TrendShare[]
  trendingAll: TrendProductRow[]
  selectedCategory: string | null
  trendingCategory: TrendProductRow[] | null
}

const TREND_COLORS = ['var(--nav-trend-1)', 'var(--nav-trend-2)', 'var(--nav-trend-3)', 'var(--nav-trend-4)', 'var(--nav-trend-5)', 'var(--nav-trend-6)', 'var(--nav-trend-7)', 'var(--nav-trend-8)']

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

// Donut chart of the top-8 categories' demand share -- hand-rolled inline
// SVG (stroke-dasharray arcs on stacked <circle>s), matching this
// project's own established charting approach within Kaspi Shop
// (FinanceChart on /kaspi-shop/finance is the same pattern: no charting
// library, plain SVG driven by --nav-* CSS variables) rather than
// introducing recharts (used elsewhere in the app, e.g. /profile, but
// not anywhere in Kaspi Shop). Colors come from the validated
// --nav-trend-1..8 categorical palette in globals.css -- see that
// block's comment for the CVD-safety validation summary. A 2px surface
// gap is subtracted from each arc's length (dataviz mark spec: a gap
// between adjacent fills instead of a border). The legend direct-labels
// every segment's name + percentage (never color-only), which is also
// the mitigation for the palette's documented light-mode contrast WARN.
function DemandDonut({ shares }: { shares: TrendShare[] }) {
  if (shares.length === 0) return null
  const size = 176
  const strokeWidth = 26
  const r = (size - strokeWidth) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--nav-border-soft)" strokeWidth={strokeWidth} />
        {shares.map((s, i) => {
          const rawLen = Math.max(0, s.share) * circumference
          const dash = Math.max(0, rawLen - 2)
          const el = (
            <circle key={s.key} cx={c} cy={c} r={r} fill="none" stroke={TREND_COLORS[i % TREND_COLORS.length]}
              strokeWidth={strokeWidth} strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
              strokeDashoffset={-offset} strokeLinecap="butt">
              <title>{`${s.label}: ${(s.share * 100).toFixed(1)}%`}</title>
            </circle>
          )
          offset += rawLen
          return el
        })}
      </svg>
      <div className="flex-1 min-w-0 w-full space-y-1.5">
        {shares.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: TREND_COLORS[i % TREND_COLORS.length] }} />
            <span className="truncate flex-1" style={{ color: 'var(--nav-text-secondary)' }}>{s.label}</span>
            <span className="font-mono tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>{(s.share * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Shared row-table for both "trending across all categories" and
// "trending within one category" -- same columns, `showCategory` just
// toggles the extra column since a single-category table doesn't need to
// repeat its own category name on every row. Each row IS the external
// link to the real Kaspi product page (task requirement); rows without a
// shopUrl (shouldn't normally happen, mapNicheResponse only omits it when
// Kaspi's own card had no shopLink) render as plain non-clickable rows.
function TrendingProductsTable({ products, showCategory, emptyLabel }: { products: TrendProductRow[]; showCategory: boolean; emptyLabel: string }) {
  if (products.length === 0) {
    return <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{emptyLabel}</div>
  }
  const gridCols = showCategory ? 'lg:grid-cols-[2fr_1.1fr_0.8fr_0.7fr_0.7fr_0.6fr]' : 'lg:grid-cols-[2.6fr_0.8fr_0.7fr_0.7fr_0.6fr]'
  return (
    <div className="nav-glass rounded-2xl overflow-hidden">
      <div className={`hidden lg:grid ${gridCols} gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider`}
        style={{ color: 'var(--nav-text-muted)', borderBottom: '1px solid var(--nav-border-soft)' }}>
        <span>Товар</span>
        {showCategory && <span>Категория</span>}
        <span>Цена</span>
        <span>Рейтинг</span>
        <span>Отзывы</span>
        <span>Спрос</span>
      </div>
      {products.map((p, i) => (
        <a key={`${p.sku}-${i}`} href={p.shopUrl || undefined} target={p.shopUrl ? '_blank' : undefined} rel={p.shopUrl ? 'noopener noreferrer' : undefined}
          onClick={e => { if (!p.shopUrl) e.preventDefault() }}
          className={`grid grid-cols-2 ${gridCols} gap-x-2 gap-y-1 items-center px-4 py-3 text-sm transition-colors ${p.shopUrl ? 'hover:bg-[color:var(--nav-bg)]' : 'cursor-default'}`}
          style={{ borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
          <span className="col-span-2 lg:col-span-1 font-medium line-clamp-1 flex items-center gap-1.5" style={{ color: 'var(--nav-text-primary)' }}>
            {p.name}{p.shopUrl && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>↗</span>}
          </span>
          {showCategory && <span className="text-xs lg:text-sm truncate" style={{ color: 'var(--nav-text-secondary)' }}>{p.category}</span>}
          <span className="font-mono tabular-nums text-xs lg:text-sm" style={{ color: 'var(--nav-text-primary)' }}>{p.price.toLocaleString('ru-KZ')} ₸</span>
          <span className="text-xs lg:text-sm flex items-center gap-1" style={{ color: 'var(--nav-text-muted)' }}><StarIcon />{p.rating.toFixed(1)}</span>
          <span className="text-xs lg:text-sm tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{p.reviewsCount.toLocaleString('ru-KZ')}</span>
          <span className="text-xs lg:text-sm font-mono tabular-nums font-semibold" style={{ color: 'var(--nav-accent)' }}>{p.score.toFixed(2)}</span>
        </a>
      ))}
    </div>
  )
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
  // Проверка идеи now costs 5 ₸/check (2026-09-03, same wallet+price the
  // репрайсер's own price checks already debit) -- shown here so the cost
  // isn't a surprise, mirroring the transparency principle already used for
  // AI-агент's own wallet UI.
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  // "Trending on Kaspi" passive dashboard -- its own state, own fetch,
  // deliberately not sharing anything with the search tool's state above
  // (per the task: load this data separately, don't conflate the flows).
  const [trends, setTrends] = useState<TrendsResponse | null>(null)
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [trendsError, setTrendsError] = useState('')
  const [trendsPage, setTrendsPage] = useState(1)
  const [trendCategory, setTrendCategory] = useState('')

  useEffect(() => { checkAccess() }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])
  // Waits for the admin gate in checkAccess() to clear before firing, so
  // a non-admin visitor never even issues the request before being
  // redirected. Re-fires on page/category change only (both start at
  // page=1/'' so this alone covers the initial load once loading flips
  // false).
  useEffect(() => { if (!loading) loadTrends(trendsPage, trendCategory) }, [loading, trendsPage, trendCategory])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const connData = await connRes.json().catch(() => null)
    if (!connData?.connected) { router.push('/kaspi-shop'); return }
    setLoading(false)
    loadWalletBalance()
  }

  async function loadWalletBalance() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/wallet', { headers })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.balance === 'number') setWalletBalance(data.balance)
      }
    } catch { /* price hint just stays hidden */ }
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
          loadWalletBalance() // a real check just debited the wallet server-side
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

  async function loadTrends(page: number, category: string) {
    setTrendsLoading(true)
    setTrendsError('')
    try {
      const headers = await authHeader()
      const params = new URLSearchParams({ page: String(page) })
      if (category) params.set('category', category)
      const res = await fetch(`/api/kaspi-shop/niches/trends?${params.toString()}`, { headers })
      const data = await res.json()
      if (!res.ok) { setTrendsError(data.error || 'Не удалось загрузить тренды'); setTrendsLoading(false); return }
      setTrends(data)
      setTrendsLoading(false)
    } catch {
      setTrendsError('Не удалось загрузить тренды. Проверьте соединение и попробуйте ещё раз.')
      setTrendsLoading(false)
    }
  }

  function goTrendsPage(p: number) {
    if (!trends) return
    const totalPages = Math.max(1, Math.ceil(trends.totalCategories / trends.pageSize))
    setTrendsPage(Math.min(Math.max(1, p), totalPages))
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
      if (!res.ok) {
        setSearching(false)
        setLoadError(data.error === 'insufficient_balance'
          ? 'Недостаточно средств на балансе Kaspi Bot — пополните на странице «Демпинг».'
          : (data.error || 'Не удалось запустить проверку'))
        return
      }
      pollResult(data.checkId)
    } catch {
      setSearching(false)
      setLoadError('Не удалось запустить проверку. Проверьте соединение и попробуйте ещё раз.')
    }
  }

  if (loading) return <LoadingSpinner />

  const isEmpty = !!summary && summary.total === 0 && summary.products.length === 0

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {/* Витрина подборок -- the page's face (2026-08-23 founder
            decision); the keyword search below stays as the secondary
            "проверить свою идею" tool. */}
        <NicheCollections />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Проверка идеи</div>
          <div className="flex items-baseline gap-2 mb-6 flex-wrap">
            <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Проверить идею товара</h2>
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
              5 ₸ за проверку{walletBalance !== null && ` · на балансе ${walletBalance.toLocaleString('ru-KZ')} ₸`}
            </span>
          </div>
          <form onSubmit={e => { e.preventDefault(); doSearch() }} className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Например: термокружка"
              className={`flex-1 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <button type="submit" disabled={searching || !query.trim() || (walletBalance !== null && walletBalance < 5)}
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
              // Compact horizontal cards (2026-08-21 founder request:
              // "привести размеры в порядок" -- the old full-width
              // aspect-square images made each card huge on desktop).
              // Per-product seller counts are NOT in Kaspi's search payload,
              // so the cards honestly show what IS there: brand, rating,
              // reviews, price, the search city and a real Kaspi link.
              // div+role, not <button>: carries a nested <a>.
              return (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
                  {filtered.map((p, i) => (
                    <div key={i} role="button" tabIndex={0} onClick={() => setOpenProduct(p)}
                      className={`nav-glass rounded-2xl p-3 text-left cursor-pointer flex gap-3 ${CARD_HOVER}`}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-16 h-16 rounded-xl flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold line-clamp-2" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                        <div className="text-[11px] mt-0.5 flex items-center gap-1 flex-wrap" style={{ color: 'var(--nav-text-muted)' }}>
                          {p.brand && <span>{p.brand} ·</span>}
                          <span className="flex items-center gap-0.5"><StarIcon />{p.rating.toFixed(1)}</span>
                          <span>· {p.reviewsCount.toLocaleString('ru-KZ')} отзывов</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <span className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{p.price.toLocaleString('ru-KZ')} ₸</span>
                          <span className="text-[11px] flex items-center gap-2" style={{ color: 'var(--nav-text-muted)' }}>
                            Алматы
                            {p.shopUrl && (
                              <a href={p.shopUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Kaspi ↗</a>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </>
        )}

        {/* "Trending on Kaspi" passive dashboard -- ADDS to the search
            tool above, doesn't replace it. Own heading, own data flow
            (trends/trendsLoading/trendsError), refreshed every ~24h by
            the kaspi-shop-niche-trends cron+workflow rather than on every
            page load (see nicheTrends.ts and the trends API route). */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
          className="mt-8">
          <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Тренды Kaspi</div>
              <h2 className="text-xl lg:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Что в тренде на Kaspi прямо сейчас</h2>
            </div>
            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
              Обновляется каждые 24 часа{trends?.computedAt ? ` · обновлено ${new Date(trends.computedAt).toLocaleString('ru-KZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          </div>

          {trendsError && (
            <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
              <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{trendsError}</span>
              <button onClick={() => loadTrends(trendsPage, trendCategory)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
            </div>
          )}

          {trendsLoading && !trends ? (
            <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем тренды...</div>
          ) : trends && trends.categories.length === 0 && !trendsError ? (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Данные ещё не рассчитаны. Первый расчёт появится после ближайшего запуска фонового обновления.</div>
            </div>
          ) : trends && trends.categories.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="nav-glass rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>Категории по спросу</div>
                  {trends.categories.map((c, i) => (
                    <div key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono tabular-nums w-6 flex-shrink-0 text-right" style={{ color: 'var(--nav-text-muted)' }}>{(trends.page - 1) * trends.pageSize + i + 1}</span>
                        <span className="text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{c.label}</span>
                      </div>
                      <span className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>{c.demandScore.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                    <button onClick={() => goTrendsPage(trends.page - 1)} disabled={trends.page <= 1}
                      className="text-xs font-medium disabled:opacity-30" style={{ color: 'var(--nav-accent)' }}>← Назад</button>
                    <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{trends.page} / {Math.max(1, Math.ceil(trends.totalCategories / trends.pageSize))}</span>
                    <button onClick={() => goTrendsPage(trends.page + 1)} disabled={trends.page >= Math.ceil(trends.totalCategories / trends.pageSize)}
                      className="text-xs font-medium disabled:opacity-30" style={{ color: 'var(--nav-accent)' }}>Вперёд →</button>
                  </div>
                </div>

                <div className="nav-glass rounded-2xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>Доля спроса, топ-8 категорий</div>
                  <DemandDonut shares={trends.topShare} />
                </div>
              </div>

              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>Топ товаров в тренде — все категории</div>
              <div className="mb-4">
                <TrendingProductsTable products={trends.trendingAll} showCategory emptyLabel="Нет данных." />
              </div>

              <div className="flex items-center justify-between gap-3 mb-2 px-1 flex-wrap">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>Товары в тренде по категории</div>
                <select value={trendCategory} onChange={e => setTrendCategory(e.target.value)}
                  className={INPUT_CLS} style={{ width: 'auto', minWidth: 220, color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}>
                  <option value="">Выберите категорию…</option>
                  {trends.categoryOptions.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {trendCategory ? (
                <TrendingProductsTable products={trends.trendingCategory || []} showCategory={false} emptyLabel="Для этой категории пока нет данных." />
              ) : (
                <div className="nav-glass rounded-2xl p-8 text-center">
                  <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Выберите категорию выше, чтобы увидеть товары в тренде именно в ней.</div>
                </div>
              )}
            </>
          ) : null}
        </motion.div>
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
    </DesktopShell>
  )
}
