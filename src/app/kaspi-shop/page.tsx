'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { KASPI_SHOP_CONNECTIONS_CHANGED_EVENT } from '@/components/KaspiShopStoreSwitcher'

type Product = {
  id: string
  kaspi_sku: string
  kaspi_master_sku: string | null
  product_name: string
  brand: string
  store_id: string
  stock_count: number
  own_current_price: number
  floor_price: number
  max_price: number | null
  undercut_step: number
  check_frequency_minutes: number
  enabled: boolean
  last_checked_at: string | null
  last_competitor_price: number | null
  demping_strategy: string
  excluded_city_codes: string[]
  excluded_merchant_ids: string[]
  market_position: number | null
  market_offer_count: number | null
}

const STRATEGY_LABELS: Record<string, string> = {
  undercut_leader: 'Быть 1-м',
  match_leader: 'Цена лидера',
  stay_above_leader: 'Держаться над лидером',
  be_second: 'Быть 2-м',
}

// Plain-language explanation of each strategy, shown under the strategy
// picker for whichever option is currently selected (works on mobile too,
// unlike a hover tooltip). Wording verified against the real math in
// pricing.ts computeRepriceCandidate -- keep the two in sync.
const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  undercut_leader: 'Цена всегда на «Шаг» ₸ ниже самого дешёвого конкурента — вы первые по цене. Ниже минимальной цены не опускается.',
  match_leader: 'Повторяет цену самого дешёвого конкурента один в один — вы наравне с лидером, не роняя цену дальше.',
  stay_above_leader: 'Цена на «Шаг» ₸ выше самого дешёвого конкурента — вы рядом с лидером, но не участвуете в гонке вниз.',
  be_second: 'Цена на «Шаг» ₸ выше второго по дешевизне конкурента — дешевле всех, кроме лидера. Если конкурент один — на «Шаг» выше него.',
}

const STRATEGY_COMMON_NOTE = 'Без конкурентов: цена сразу поднимается от минимума, а после 3 проверок подряд без конкурентов растёт на «Шаг» за проверку до максимальной.'

// Russian plural for «продавец» (1 продавец / 2 продавца / 5 продавцов).
function pluralSellers(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'продавец'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'продавца'
  return 'продавцов'
}

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const
const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

// Always normalizes to +7, regardless of whether the seller types the
// domestic 8-prefix or the international 7 -- the leading digit is
// discarded either way and replaced with the hardcoded +7.
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return ''
  let result = '+7'
  if (digits.length > 1) result += ' ' + digits.slice(1, 4)
  if (digits.length > 4) result += ' ' + digits.slice(4, 7)
  if (digits.length > 7) result += ' ' + digits.slice(7, 11)
  return result
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="4" width="5" height="16" rx="1.5" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" />
    </svg>
  )
}

function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

// Same checkmark glyph as src/app/kaspi-shop/profit/page.tsx's CheckIcon --
// not imported (that file is out of scope to touch) but replicated exactly
// rather than reusing XIcon for a "selected" state, which read as "remove".
function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  )
}

// The core mechanic of this whole feature is a race: our price against the
// lowest competitor, bounded below by a floor we never cross. Everywhere
// else in this UI that gets summarized as three numbers in a row -- here
// it's drawn as an actual position on a track, because "am I winning right
// now" is the one question a seller opens this page to answer.
function PriceLadder({ own, competitor, floor, maxPrice }: { own: number; competitor: number | null; floor: number; maxPrice: number | null }) {
  const gaugeTop = Math.max(own, competitor ?? own, floor, maxPrice ?? 0) * 1.15
  const span = Math.max(gaugeTop - floor, 1)
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - floor) / span) * 100))
  const winning = competitor !== null && own <= competitor
  const atFloor = own <= floor + 0.01

  return (
    <div className="pt-1">
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--nav-border-soft)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct(floor)}%`, background: 'repeating-linear-gradient(135deg, var(--nav-critical) 0, var(--nav-critical) 4px, transparent 4px, transparent 8px)', opacity: 0.18 }}
        />
        {maxPrice !== null && (
          <div
            className="absolute inset-y-0 right-0 rounded-full"
            style={{ width: `${100 - pct(maxPrice)}%`, background: 'repeating-linear-gradient(135deg, var(--nav-success) 0, var(--nav-success) 4px, transparent 4px, transparent 8px)', opacity: 0.18 }}
          />
        )}
        {competitor !== null && (
          <motion.div
            className="absolute -top-1.5 w-3.5 h-3.5 rounded-full"
            style={{ background: 'var(--nav-surface-chrome)', boxShadow: '0 0 0 2px var(--nav-text-muted)' }}
            initial={false}
            animate={{ left: `calc(${pct(competitor)}% - 7px)` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        )}
        <motion.div
          className="absolute -top-1.5 w-3.5 h-3.5 rounded-full"
          style={{ background: winning ? 'var(--nav-success)' : 'var(--nav-critical)', boxShadow: '0 0 0 2px var(--nav-bg)' }}
          initial={false}
          animate={{ left: `calc(${pct(own)}% - 7px)` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
        <span>Пол {floor.toLocaleString('ru-KZ')} ₸</span>
        {atFloor && <span className="font-semibold" style={{ color: 'var(--nav-critical)' }}>Упёрлись в минимум</span>}
        {competitor !== null && <span>Конкурент {competitor.toLocaleString('ru-KZ')} ₸</span>}
        {maxPrice !== null && <span>Потолок {maxPrice.toLocaleString('ru-KZ')} ₸</span>}
      </div>
    </div>
  )
}

// The four summary numbers Northline's equivalent page leads with, computed
// from our own kaspi_shop_tracked_products (see GET /api/kaspi-shop/products'
// `stats`) -- small cards in a row, same nav-glass/CARD_HOVER treatment as
// the rest of this page rather than a second "hero" style.
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}>
      <div className="text-2xl font-black font-mono tabular-nums" style={{ color: accent || 'var(--nav-text-primary)' }}>{value}</div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{label}</div>
    </div>
  )
}

export default function KaspiShop() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  // Opened from the store switcher's "+ Добавить магазин" (?addStore=1) --
  // reuses the same connect flow as the mandatory first-connect dialog, just
  // dismissible since the user already has at least one working store.
  const [addingStore, setAddingStore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cityPrices, setCityPrices] = useState<Record<string, { cityCode: string; cityName: string; ownPrice: number; competitorPrice: number | null; marketPosition: number | null; marketOfferCount: number | null }[]>>({})

  const [phone, setPhone] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [merchantChoices, setMerchantChoices] = useState<{ id: string; name: string }[] | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupPending, setTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)
  const [walletOpen, setWalletOpen] = useState(false)

  // Stats cards + "Применить сейчас" / "Добавить несколько" -- see
  // GET /api/kaspi-shop/products for how stats is computed server-side, and
  // /api/kaspi-shop/apply-now's route comment for why apply-now can't fetch
  // fresh competitor prices synchronously here (Vercel's IPs are blocked by
  // Kaspi -- the real fetch happens in GitHub Actions).
  const [stats, setStats] = useState<{ totalRules: number; activeCount: number; readyToApply: number; blockedAtFloor: number } | null>(null)
  const [applyingNow, setApplyingNow] = useState(false)
  const [applyNowMessage, setApplyNowMessage] = useState('')
  const [syncingCatalog, setSyncingCatalog] = useState(false)

  const MAX_BULK_ITEMS = 100
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkStep, setBulkStep] = useState<'select' | 'config'>('select')
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkFloorPrice, setBulkFloorPrice] = useState('')
  const [bulkMaxPrice, setBulkMaxPrice] = useState('')
  const [bulkUndercutStep, setBulkUndercutStep] = useState('100')
  const [bulkStrategy, setBulkStrategy] = useState('undercut_leader')
  const [bulkFrequency, setBulkFrequency] = useState('15')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const [suggestingFor, setSuggestingFor] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, { floorPrice: string; maxPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string; stockCount: string }>>({})
  const [trackedCities, setTrackedCities] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<{ code: string; name: string }[]>([])
  const [citiesSaving, setCitiesSaving] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (searchParams.get('addStore') === '1') {
      setAddingStore(true)
      window.history.replaceState(null, '', '/kaspi-shop')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  // Shared by load() and saveTrackedCities() -- GET /settings/cities is the
  // single source of truth for availableCities (real names when
  // city_lookup_cache has them, lazily seeded on first call if it's empty,
  // raw codes as a last resort -- see that route for the full chain).
  // Returns null on any non-ok response (e.g. not connected yet) so callers
  // can leave the existing state alone instead of clobbering it with an
  // empty list.
  async function fetchAvailableCities(headers: Record<string, string>): Promise<{ code: string; name: string }[] | null> {
    const res = await fetch('/api/kaspi-shop/settings/cities', { headers })
    if (!res.ok) return null
    const data = await res.json()
    return (data.cities || []).map((c: any) => ({ code: c.code, name: String(c.name) }))
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const [productsRes, walletRes, cities] = await Promise.all([
        fetch('/api/kaspi-shop/products', { headers }),
        fetch('/api/kaspi-shop/wallet', { headers }),
        fetchAvailableCities(headers),
      ])
      if (productsRes.ok) {
        const data = await productsRes.json()
        const list: Product[] = data.products || []
        setProducts(list)
        setStats(data.stats || null)
        setEditValues(prev => {
          const next = { ...prev }
          for (const p of list) {
            if (!next[p.id]) {
              next[p.id] = {
                floorPrice: String(p.floor_price),
                maxPrice: p.max_price !== null ? String(p.max_price) : '',
                undercutStep: String(p.undercut_step),
                strategy: p.demping_strategy || 'undercut_leader',
                excludedCities: (p.excluded_city_codes || []).join(', '),
                excludedMerchants: (p.excluded_merchant_ids || []).join(', '),
                stockCount: String(p.stock_count ?? 0),
              }
            }
          }
          return next
        })
      }
      if (walletRes.ok) {
        const data = await walletRes.json()
        setBalance(data.balance ?? 0)
        setConnected(!!data.connected)
        setPaused(!!data.paused)
        setSessionStatus(data.sessionStatus ?? null)
        setCompanyName(data.companyName ?? null)
        setTrackedCities(data.trackedCityCodes || [])
      }
      if (cities) setAvailableCities(cities)
    } catch (e: any) {
      console.error('Kaspi Shop load error:', e.message)
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function startConnect() {
    if (!phone) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect', { method: 'POST', headers, body: JSON.stringify({ phone }) })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) { setConnectError(data.error || 'Не удалось подключиться'); return }
    setOtpToken(data.otpToken)
  }

  async function completeConnect() {
    if (!otpToken || !otpCode) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect/otp', { method: 'POST', headers, body: JSON.stringify({ otpToken, code: otpCode }) })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) { setConnectError(data.error || 'Не удалось подтвердить код'); return }
    setOtpToken(null)
    setOtpCode('')
    if (data.status === 'merchant_required') {
      setSessionToken(data.sessionToken)
      setMerchantChoices(data.merchants)
      return
    }
    setConnected(true)
    setAddingStore(false)
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    load()
  }

  async function selectMerchant(merchantId: string) {
    if (!sessionToken) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect/select-merchant', { method: 'POST', headers, body: JSON.stringify({ sessionToken, merchantId }) })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) { setConnectError(data.error || 'Не удалось подключить магазин'); return }
    setSessionToken(null)
    setMerchantChoices(null)
    setConnected(true)
    setAddingStore(false)
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    load()
  }

  async function togglePause() {
    const next = !paused
    setPaused(next)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
  }

  async function saveTrackedCities(codes: string[]) {
    const previous = trackedCities
    setTrackedCities(codes)
    setCitiesSaving(true)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/settings/cities', { method: 'PATCH', headers, body: JSON.stringify({ trackedCityCodes: codes }) })
    if (!res.ok) {
      // Revert the optimistic chip toggle -- without this a chip stayed
      // selected in the UI even when the save failed (e.g. not connected,
      // or the new >15 cap rejected it), silently diverging from what's
      // actually stored server-side.
      setTrackedCities(previous)
    } else {
      // The PATCH may have just seeded city_lookup_cache for the first
      // time (a fresh connect's best-effort seed can still miss, e.g. a
      // session that was expired at connect time and only later renewed) --
      // re-read availableCities so newly-available names show up now,
      // instead of only after a manual page reload.
      const refreshed = await fetchAvailableCities(headers)
      if (refreshed) setAvailableCities(refreshed)
    }
    setCitiesSaving(false)
  }

  function toggleTrackedCity(code: string) {
    const next = trackedCities.includes(code) ? trackedCities.filter(c => c !== code) : [...trackedCities, code]
    saveTrackedCities(next)
  }

  async function disconnect() {
    if (!confirm('Отключить кабинет Kaspi? Отслеживаемые товары и их настройки будут удалены — при повторном подключении каталог импортируется заново.')) return
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/settings', { method: 'DELETE', headers })
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    // A remaining store (if any) auto-activates server-side on disconnect --
    // reload so this page picks up its data instead of showing an empty
    // "not connected" state while another store is actually now active.
    window.location.href = '/kaspi-shop'
  }

  async function startTopup(amountTenge: number) {
    if (amountTenge < 500) return
    setToppingUp(true)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/wallet/topup', { method: 'POST', headers, body: JSON.stringify({ amountTenge }) })
    const data = await res.json()
    setToppingUp(false)
    if (!res.ok) return
    setTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
    pollTopupStatus(data.topup_id)
  }

  function pollTopupStatus(topupId: string) {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/wallet/topup-status?topup_id=${topupId}`, { headers })
      const data = await res.json()
      if (data.status === 'paid') { clearInterval(interval); setTopupPending(null); load() }
      else if (data.status === 'expired' || attempts >= 30) { clearInterval(interval); setTopupPending(null) }
    }, 5000)
  }

  async function toggleProduct(id: string, enabled: boolean) {
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', { method: 'PATCH', headers, body: JSON.stringify({ id, enabled: !enabled }) })
    load()
  }

  async function deleteProduct(id: string) {
    if (!confirm('Удалить товар из демпинга? Правило и его настройки будут удалены у нас — сам товар на Kaspi это не трогает.')) return
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    setExpandedId(null)
    load()
  }

  async function saveProductSettings(id: string) {
    const v = editValues[id]
    if (!v) return
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/products', {
      method: 'PATCH', headers,
      body: JSON.stringify({
        id,
        floor_price: Number(v.floorPrice),
        max_price: v.maxPrice.trim() === '' ? null : Number(v.maxPrice),
        undercut_step: Number(v.undercutStep),
        demping_strategy: v.strategy,
        excluded_city_codes: v.excludedCities.split(',').map(s => s.trim()).filter(Boolean),
        excluded_merchant_ids: v.excludedMerchants.split(',').map(s => s.trim()).filter(Boolean),
        stock_count: Number(v.stockCount) || 0,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.stockPushed) setApplyNowMessage('Остаток отправлен на Kaspi — применится в течение часа.')
    else if (data.stockPushWarning) setApplyNowMessage(data.stockPushWarning)
    setExpandedId(null)
    load()
  }

  async function suggestPricing(id: string) {
    setSuggestingFor(id)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/products/suggest-pricing', { method: 'POST', headers, body: JSON.stringify({ productId: id }) })
    const data = await res.json()
    setSuggestingFor(null)
    if (!res.ok) return
    setEditValues(prev => ({ ...prev, [id]: { ...prev[id], floorPrice: String(data.floorPrice), undercutStep: String(data.undercutStep) } }))
  }

  // Forces an immediate check-cycle run instead of waiting out each
  // product's check_frequency_minutes schedule -- see
  // /api/kaspi-shop/apply-now's route comment for why this can't complete
  // synchronously (real Kaspi fetches only work from GitHub Actions, not
  // Vercel). The route responds as soon as it has queued the run, so this
  // polls the product list a couple of times afterwards rather than
  // expecting fresh numbers in the response itself.
  async function applyNow() {
    if (applyingNow) return
    setApplyingNow(true)
    setApplyNowMessage('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/apply-now', { method: 'POST', headers, body: JSON.stringify({}) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setApplyNowMessage(data.error || 'Не удалось запустить проверку')
      setApplyingNow(false)
      return
    }
    setApplyNowMessage(`Запущено для ${data.queued} товар(ов) — цены обновятся в течение минуты`)
    setTimeout(load, 15000)
    setTimeout(() => { load(); setApplyingNow(false); setApplyNowMessage('') }, 35000)
  }

  // On-demand catalog re-import -- same dedup-safe import as connect time,
  // without a fresh phone/SMS login. Needed when a product is restored to
  // sale (or added on Kaspi) after the connect-time import.
  async function syncCatalog() {
    if (syncingCatalog) return
    setSyncingCatalog(true)
    setApplyNowMessage('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/catalog/sync', { method: 'POST', headers })
    const data = await res.json().catch(() => ({}))
    setSyncingCatalog(false)
    if (!res.ok) {
      setApplyNowMessage(data.error || 'Не удалось обновить каталог')
      return
    }
    setApplyNowMessage(`Каталог обновлён: ${data.imported} товар(ов)`)
    load()
  }

  function openBulkAdd() {
    setBulkOpen(true)
    setBulkStep('select')
    setBulkSearch('')
    setBulkSelected(new Set())
    setBulkFloorPrice('')
    setBulkMaxPrice('')
    setBulkUndercutStep('100')
    setBulkStrategy('undercut_leader')
    setBulkFrequency('15')
    setBulkError('')
  }

  function toggleBulkSelect(id: string) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BULK_ITEMS) next.add(id)
      return next
    })
  }

  // Searches the products already loaded on this page (GET
  // /api/kaspi-shop/products already returns every one of the seller's
  // tracked rows, which -- per finalizeConnection.ts -- already mirrors
  // their whole Kaspi catalog, imported disabled by default) instead of a
  // new catalog-search endpoint: no extra round trip, and no repeated
  // authenticated Kaspi API calls just to power a search box.
  const bulkFiltered = (() => {
    const q = bulkSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter(p => p.product_name.toLowerCase().includes(q) || p.kaspi_sku.toLowerCase().includes(q))
  })()

  async function submitBulkAdd() {
    setBulkSubmitting(true)
    setBulkError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/products/bulk', {
      method: 'POST', headers,
      body: JSON.stringify({
        productIds: Array.from(bulkSelected),
        floorPrice: Number(bulkFloorPrice),
        maxPrice: bulkMaxPrice.trim() === '' ? null : Number(bulkMaxPrice),
        undercutStep: Number(bulkUndercutStep),
        dempingStrategy: bulkStrategy,
        checkFrequencyMinutes: Number(bulkFrequency),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBulkSubmitting(false)
    if (!res.ok) { setBulkError(data.error || 'Не удалось применить настройки'); return }
    setBulkOpen(false)
    load()
  }

  if (loading) return <LoadingSpinner />

  const winningCount = products.filter(p => p.last_competitor_price !== null && p.own_current_price <= p.last_competitor_price).length
  const atFloorCount = products.filter(p => p.own_current_price <= p.floor_price + 0.01).length
  const activeCount = products.filter(p => p.enabled).length

  // Which cities this product's demping actually covers (store-level tracked
  // cities minus the product's own exclusions); no tracked cities configured
  // means the legacy single-reference-competitor mode = «Все города».
  function productRegionLabel(p: Product): string {
    if (trackedCities.length === 0) return 'Все города'
    const codes = trackedCities.filter(code => !(p.excluded_city_codes || []).includes(code))
    if (codes.length === 0) return 'Все города исключены'
    const names = codes.map(code => availableCities.find(c => c.code === code)?.name || code)
    return names.length <= 2 ? names.join(', ') : `${names.length} городов`
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={load} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {connected && sessionStatus === 'session_expired' && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>Сессия кабинета Kaspi истекла — переподключитесь, чтобы демпинг продолжил работать.</span>
            <button onClick={() => { setConnected(false); setSessionStatus(null) }} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Переподключиться</button>
          </div>
        )}

        {(!connected || addingStore) ? (
          /* Centered connect dialog (2026-08-20, founder): the connect form
             used to render as a full-width inline card flush to the top-left,
             which read as a broken/half-empty page. Now it floats as a true
             centered modal over the page, same treatment as the app's other
             dialogs (bank picker, wallet). Dismissible only when reached via
             "+ Добавить магазин" while already connected -- the mandatory
             first-connect case has nothing else on the page to interact with. */
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/30">
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              className="relative nav-glass rounded-[24px] w-full max-w-md p-6 lg:p-8 max-h-[84vh] overflow-y-auto"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
              {connected && (
                <button onClick={() => { setAddingStore(false); setPhone(''); setOtpToken(null); setOtpCode(''); setMerchantChoices(null); setSessionToken(null); setConnectError('') }}
                  className="absolute top-5 right-5 text-lg leading-none" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              )}
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--nav-text-muted)' }}>Подключение</div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: 'var(--nav-text-primary)' }}>{connected ? 'Добавьте ещё один магазин' : 'Подключите Kaspi Магазин'}</h1>
              {connectError && <div className="text-sm mb-3" style={{ color: 'var(--nav-critical)' }}>{connectError}</div>}

              {merchantChoices ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>На этом номере найдено магазинов: {merchantChoices.length}. Выберите нужный.</div>
                  {merchantChoices.map(m => (
                    <button key={m.id} onClick={() => selectMerchant(m.id)} disabled={connecting}
                      className="w-full text-left nav-glass rounded-xl px-4 py-3 text-sm transition-colors hover:border-[color:var(--nav-accent)] disabled:opacity-50"
                      style={{ color: 'var(--nav-text-primary)' }}>
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>ID {m.id}</div>
                    </button>
                  ))}
                </div>
              ) : !otpToken ? (
                <div className="flex flex-col gap-2">
                  <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    placeholder="Телефон (как при входе в Kaspi)" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
                  <button onClick={startConnect} disabled={connecting}
                    className="mt-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {connecting ? 'Отправляем код...' : 'Продолжить'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Код из SMS отправлен на {phone}</div>
                  <input className={`${INPUT_CLS} font-mono tracking-widest`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                  <button onClick={completeConnect} disabled={connecting}
                    className="mt-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {connecting ? 'Проверяем...' : 'Подтвердить'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <>
            {/* Top row (2026-08-21 founder layout request: "скомпанованнее"):
                hero on the left (2/3), city picker beside it on the right --
                the stats row below stays full-width as the second line. */}
            <div className="grid lg:grid-cols-3 gap-4 mb-4 items-stretch">
            {/* Hero: the one question this page answers, stated as three
                numbers, not buried in per-product rows. */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>{companyName || 'Магазин подключён'}</div>
                  <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Гонка цен сейчас</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={togglePause}
                    className="text-xs font-bold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
                    style={{ background: paused ? 'var(--nav-critical)' : 'var(--nav-success)', color: '#fff' }}>
                    {paused ? <PauseIcon /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#fff' }} />}
                    {paused ? 'На паузе' : 'Работает'}
                  </button>
                  <button onClick={disconnect} className="nav-glass text-xs font-medium rounded-full px-3 py-2 transition-colors" style={{ color: 'var(--nav-text-muted)' }}>
                    Отключить
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 lg:gap-6">
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{winningCount}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>из {products.length} — мы дешевле</div>
                </div>
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-critical)' }}>{atFloorCount}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>упёрлись в минимум</div>
                </div>
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{balance}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                    ₸ на балансе · <button onClick={() => setWalletOpen(true)} className="underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>пополнить</button>
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="nav-glass rounded-2xl p-4">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Города для отслеживания конкурентов</div>
              <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                {trackedCities.length === 0
                  ? 'Не настроено — цена реагирует на одного эталонного конкурента для всех городов, как раньше.'
                  : `Выбрано: ${trackedCities.length}. Конкурента и цену проверяем отдельно по каждому.`}
                {citiesSaving && ' Сохраняем…'}
              </div>
              {trackedCities.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {availableCities.filter(c => trackedCities.includes(c.code)).map(city => (
                    <button key={city.code} onClick={() => toggleTrackedCity(city.code)}
                      className="text-xs pl-3 pr-2 py-1.5 rounded-full flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {city.name}
                      <XIcon size={11} />
                    </button>
                  ))}
                </div>
              )}

              {availableCities.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Список городов ещё не загружен.</div>
              ) : (
                <>
                  <input value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Найти город…"
                    className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  {citySearch.trim() !== '' && (
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto mt-2">
                      {availableCities
                        .filter(c => !trackedCities.includes(c.code))
                        .filter(c => c.name.toLowerCase().includes(citySearch.trim().toLowerCase()))
                        .map(city => (
                          <button key={city.code} onClick={() => { toggleTrackedCity(city.code); setCitySearch('') }}
                            className="nav-glass whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition-colors hover:bg-[var(--nav-accent)] hover:text-[var(--nav-accent-ink)] hover:border-[color:var(--nav-accent)]"
                            style={{ color: 'var(--nav-text-secondary)' }}>
                            {city.name}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
            </div>

            {companyName && activeCount === 0 && products.length > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: 'var(--nav-text-muted)' }}>{products.length} товаров импортировано и на паузе — включите нужные ниже, чтобы демпинг начал работать.</div>
            )}

            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Правила демпинга</div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={syncCatalog} disabled={syncingCatalog}
                  className="nav-glass text-xs font-semibold rounded-full px-4 py-2 transition-transform hover:-translate-y-0.5 disabled:opacity-60" style={{ color: 'var(--nav-text-secondary)' }}>
                  {syncingCatalog ? 'Обновляем…' : 'Обновить каталог'}
                </button>
                <button onClick={openBulkAdd}
                  className="nav-glass text-xs font-semibold rounded-full px-4 py-2 transition-transform hover:-translate-y-0.5" style={{ color: 'var(--nav-accent)' }}>
                  Добавить несколько
                </button>
                <button onClick={applyNow} disabled={applyingNow || !stats || stats.activeCount === 0}
                  className="text-xs font-semibold rounded-full px-4 py-2 flex items-center gap-1.5 disabled:opacity-50 transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {applyingNow ? 'Проверяем...' : 'Применить сейчас'}
                </button>
              </div>
            </div>
            {applyNowMessage && (
              <div className="text-[11px] mb-3 px-1" style={{ color: 'var(--nav-text-muted)' }}>{applyNowMessage}</div>
            )}

            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <StatCard label="Всего правил" value={stats.totalRules} />
                <StatCard label="Активных" value={stats.activeCount} accent="var(--nav-success)" />
                <StatCard label="Готовы применить" value={stats.readyToApply} accent="var(--nav-accent)" />
                <StatCard label="Заблокировано порогом" value={stats.blockedAtFloor} accent="var(--nav-critical)" />
              </div>
            )}

            {/* Card grid (2026-08-21 founder request): each product is a card
                with the live price, competitor, region, seller count and a
                real Kaspi link. An expanded card spans the full row so its
                settings form keeps comfortable width. */}
            <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
              <AnimatePresence initial={false}>
                {products.map((p, i) => {
                  const otherSellers = p.market_offer_count !== null ? Math.max(0, p.market_offer_count - 1) : null
                  return (
                    <motion.div key={p.id}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE, delay: Math.min(i * 0.04, 0.3) }}
                      className={`nav-glass rounded-2xl overflow-hidden ${CARD_HOVER}`}>
                      {/* div, not <button>: the card carries a real nested <a>
                          (Kaspi link), which is invalid inside a button.
                          Clicking opens the settings as a centered modal
                          (2026-08-21 founder request) instead of expanding
                          the card inline to full width. */}
                      <div role="button" tabIndex={0} onClick={() => {
                        setExpandedId(p.id)
                        if (!cityPrices[p.id] && trackedCities.length > 0) {
                          authHeader().then(headers =>
                            fetch(`/api/kaspi-shop/products/city-prices?id=${p.id}`, { headers })
                              .then(res => res.ok ? res.json() : { cities: [] })
                              .then(data => setCityPrices(prev => ({ ...prev, [p.id]: data.cities || [] })))
                          )
                        }
                      }} className="w-full text-left p-4 cursor-pointer">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" title={p.product_name} style={{ color: 'var(--nav-text-primary)' }}>{p.product_name}</div>
                            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                              {STRATEGY_LABELS[p.demping_strategy] || p.demping_strategy} · проверка каждые {p.check_frequency_minutes} мин
                            </div>
                          </div>
                          <span onClick={e => { e.stopPropagation(); toggleProduct(p.id, p.enabled) }}
                            className="text-[11px] px-2 py-1 rounded-full cursor-pointer font-semibold flex-shrink-0"
                            style={{ background: p.enabled ? 'var(--nav-success)' : 'var(--nav-text-muted)', color: '#fff' }}>
                            {p.enabled ? 'Активно' : 'Пауза'}
                          </span>
                        </div>
                        <div className="flex items-end justify-between gap-3 mb-2">
                          <div>
                            <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Наша цена на Kaspi</div>
                            <div className="font-mono font-bold text-xl tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{p.own_current_price.toLocaleString('ru-KZ')} ₸</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Конкурент</div>
                            <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>
                              {p.last_competitor_price !== null ? `${p.last_competitor_price.toLocaleString('ru-KZ')} ₸` : '—'}
                            </div>
                          </div>
                        </div>
                        <PriceLadder own={p.own_current_price} competitor={p.last_competitor_price} floor={p.floor_price} maxPrice={p.max_price} />
                        <div className="flex items-center justify-between gap-2 flex-wrap mt-2.5">
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                            <span title="Города, по которым демпингуется этот товар">{productRegionLabel(p)}</span>
                            {p.stock_count > 0 && <span title="Остаток, который отправляется на Kaspi вместе с ценой">Остаток: {p.stock_count} шт</span>}
                            {otherSellers !== null && (
                              <span title="Продавцы этого товара на Kaspi, кроме вас. Место по цене среди всех — это оценка.">
                                {otherSellers} {pluralSellers(otherSellers)} кроме вас{p.market_position !== null ? ` · вы #${p.market_position}` : ''}
                              </span>
                            )}
                          </div>
                          {p.kaspi_master_sku && (
                            <a href={`https://kaspi.kz/shop/p/-${p.kaspi_master_sku}/`} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>
                              Открыть на Kaspi ↗
                            </a>
                          )}
                        </div>
                      </div>

                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {products.length === 0 && (
                <div className="nav-glass rounded-2xl p-8 text-center col-span-full">
                  <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Каталог ещё импортируется или пуст.</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>Товары появятся здесь после подключения кабинета — или нажмите «Обновить каталог» выше.</div>
                </div>
              )}
            </div>

            {/* Product settings as a centered modal (2026-08-21 founder
                request: "карточка плывёт в центр и открывается как модал"
                instead of expanding inline). Same dialog treatment as the
                app's other modals (connect, wallet, bank picker). */}
            <AnimatePresence>
              {(() => {
                const p = products.find(x => x.id === expandedId)
                if (!p) return null
                const v = editValues[p.id] || { floorPrice: String(p.floor_price), maxPrice: p.max_price !== null ? String(p.max_price) : '', undercutStep: String(p.undercut_step), strategy: p.demping_strategy, excludedCities: '', excludedMerchants: '', stockCount: String(p.stock_count ?? 0) }
                return (
                  <motion.div key="productSettings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30"
                    onClick={() => setExpandedId(null)}>
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="relative nav-glass rounded-[24px] w-full max-w-xl max-h-[86vh] overflow-y-auto"
                      style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
                      onClick={e => e.stopPropagation()}>
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
                      <div className="p-5 lg:p-6">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold tracking-wider uppercase mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>Настройки демпинга</div>
                            <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{p.product_name}</div>
                          </div>
                          <button onClick={() => setExpandedId(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
                        </div>
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                                <label className="block">
                                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Минимальная цена</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Максимальная цена</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" placeholder="—" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.maxPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, maxPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Шаг, ₸</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Остаток, шт</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" placeholder="0" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.stockCount} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, stockCount: e.target.value } }))} />
                                </label>
                              </div>
                              <label className="block mb-2">
                                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Стратегия</span>
                                <select className={`${INPUT_CLS} px-2 py-1.5`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}
                                  value={v.strategy} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, strategy: e.target.value } }))}>
                                  {Object.entries(STRATEGY_LABELS).map(([key, label]) => <option key={key} value={key} title={STRATEGY_DESCRIPTIONS[key]}>{label}</option>)}
                                </select>
                              </label>
                              <div className="rounded-lg px-3 py-2 mb-2 text-[11px] leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                                {STRATEGY_DESCRIPTIONS[v.strategy] || ''} {STRATEGY_COMMON_NOTE}
                              </div>
                              <label className="block mb-2">
                                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Исключить города (для этого товара)</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {trackedCities.length === 0 && <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Сначала выберите отслеживаемые города выше.</span>}
                                  {trackedCities.map(code => {
                                    const excluded = v.excludedCities.split(',').map(s => s.trim()).filter(Boolean).includes(code)
                                    const cityName = availableCities.find(c => c.code === code)?.name || code
                                    return (
                                      <button key={code} type="button"
                                        onClick={() => {
                                          const current = v.excludedCities.split(',').map(s => s.trim()).filter(Boolean)
                                          const next = excluded ? current.filter(c => c !== code) : [...current, code]
                                          setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedCities: next.join(', ') } }))
                                        }}
                                        className="text-[11px] px-2 py-1 rounded-full font-medium transition-colors"
                                        style={excluded ? { background: 'var(--nav-critical)', color: '#fff' } : { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-secondary)', border: '1px solid var(--nav-border-soft)' }}>
                                        {cityName}
                                      </button>
                                    )
                                  })}
                                </div>
                              </label>
                              <label className="block mb-3">
                                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Не конкурировать с продавцами (ID через запятую)</span>
                                <input className={`${INPUT_CLS} px-2 py-1.5`} style={{ color: 'var(--nav-text-primary)' }}
                                  value={v.excludedMerchants} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedMerchants: e.target.value } }))} />
                              </label>
                              {trackedCities.length > 0 && (
                                <div className="mb-3">
                                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цены по городам</span>
                                  {!cityPrices[p.id] && <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>}
                                  {cityPrices[p.id] && cityPrices[p.id].length === 0 && (
                                    <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Нет данных ещё — появятся после первой проверки цен по этому товару.</div>
                                  )}
                                  {cityPrices[p.id] && cityPrices[p.id].length > 0 && (
                                    <div className="space-y-1">
                                      {cityPrices[p.id].map(c => (
                                        <div key={c.cityCode} className="flex items-center justify-between text-[11px]">
                                          <span style={{ color: 'var(--nav-text-secondary)' }}>{c.cityName}</span>
                                          <span className="font-mono">
                                            <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{c.ownPrice.toLocaleString('ru-KZ')} ₸</span>
                                            {c.competitorPrice !== null && <span style={{ color: 'var(--nav-text-muted)' }}> · конкурент {c.competitorPrice.toLocaleString('ru-KZ')} ₸</span>}
                                            {c.marketPosition !== null && c.marketOfferCount !== null && <span style={{ color: 'var(--nav-text-muted)' }}> · #{c.marketPosition} из {c.marketOfferCount}</span>}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => suggestPricing(p.id)} disabled={suggestingFor === p.id}
                                  className="flex-1 text-xs nav-glass rounded-lg px-3 py-2 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
                                  <SparkleIcon /> {suggestingFor === p.id ? 'Думаем...' : 'ИИ-подбор цены'}
                                </button>
                                <button onClick={() => saveProductSettings(p.id)}
                                  className="flex-1 text-xs rounded-lg px-3 py-2 font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                                  Сохранить
                                </button>
                              </div>
                              <button onClick={() => deleteProduct(p.id)}
                                className="mt-3 text-[11px] font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors"
                                style={{ color: 'var(--nav-critical)', border: '1px solid var(--nav-critical)' }}>
                                <TrashIcon /> Удалить товар
                              </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )
              })()}
            </AnimatePresence>
          </>
        )}
      </div>

      <AnimatePresence>
        {walletOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4"
            onClick={() => setWalletOpen(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={e => e.stopPropagation()}
              className="relative nav-glass rounded-t-[24px] lg:rounded-[24px] w-full lg:max-w-sm p-5"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Пополнить кошелёк</div>
              <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>Баланс: {balance.toLocaleString('ru-KZ')} ₸ · проверка цены — 5 ₸</div>
              <div className="flex gap-2 flex-wrap mb-2">
                {[1000, 5000, 10000].map(amount => (
                  <button key={amount} onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    style={topupAmount === amount ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                    {amount.toLocaleString('ru-KZ')} ₸
                  </button>
                ))}
              </div>
              <input value={topupCustom} onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
                placeholder="Своя сумма, ₸" type="text" inputMode="numeric"
                className="w-full border-b py-2 text-sm outline-none mb-3 bg-transparent"
                style={{ borderColor: 'var(--nav-border-soft)', color: 'var(--nav-text-primary)' }} />
              <button onClick={() => startTopup((topupAmount ?? Number(topupCustom)) || 0)}
                disabled={toppingUp || !((topupAmount ?? Number(topupCustom)) >= 500)}
                className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {toppingUp ? 'Готовим QR...' : 'Пополнить'}
              </button>
              {topupPending && (
                <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--nav-accent-soft)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
                  <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                    className="w-full rounded-xl py-2.5 text-sm font-medium block text-center" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Оплатить</a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Добавить несколько" -- select N of the seller's own already-imported
          products (search is client-side over the `products` array this page
          already has loaded, see bulkFiltered/openBulkAdd above), then apply
          one shared floor/max/step/strategy/frequency config to all of them
          at once via POST /api/kaspi-shop/products/bulk. Same centered
          nav-glass dialog treatment as the connect flow above, since this is
          also a short multi-step flow, not a persistent panel. */}
      <AnimatePresence>
        {bulkOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4"
            onClick={() => setBulkOpen(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={e => e.stopPropagation()}
              className="relative nav-glass rounded-t-[24px] lg:rounded-[24px] w-full lg:max-w-lg p-5 max-h-[86vh] flex flex-col"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />

              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                  {bulkStep === 'select' ? 'Добавить несколько' : 'Общие настройки'}
                </div>
                <button onClick={() => setBulkOpen(false)} style={{ color: 'var(--nav-text-muted)' }}><XIcon size={16} /></button>
              </div>

              {bulkStep === 'select' ? (
                <>
                  <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    Выбрано: {bulkSelected.size} / {MAX_BULK_ITEMS}
                  </div>
                  <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} placeholder="Найти по названию или SKU…"
                    className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <div className="flex-1 overflow-y-auto mt-3 -mx-1 px-1 space-y-1.5">
                    {bulkFiltered.length === 0 && (
                      <div className="text-[11px] py-4 text-center" style={{ color: 'var(--nav-text-muted)' }}>Ничего не найдено.</div>
                    )}
                    {bulkFiltered.map(p => {
                      const checked = bulkSelected.has(p.id)
                      return (
                        <button key={p.id} type="button" onClick={() => toggleBulkSelect(p.id)}
                          className="w-full text-left nav-glass rounded-xl px-3 py-2.5 text-sm flex items-center gap-3 transition-colors"
                          style={checked ? { borderColor: 'var(--nav-accent)', background: 'var(--nav-accent-soft)' } : undefined}>
                          <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                            style={{ background: checked ? 'var(--nav-accent)' : 'transparent', border: `1.5px solid ${checked ? 'var(--nav-accent)' : 'var(--nav-border)'}` }}>
                            {checked && <XIcon size={10} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium" style={{ color: 'var(--nav-text-primary)' }}>{p.product_name}</span>
                            <span className="block text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                              SKU {p.kaspi_sku} · {p.own_current_price.toLocaleString('ru-KZ')} ₸ {p.enabled && <span style={{ color: 'var(--nav-success)' }}>· уже активен</span>}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={() => setBulkStep('config')} disabled={bulkSelected.size === 0}
                    className="mt-3 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Далее ({bulkSelected.size})
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>Применится ко всем {bulkSelected.size} выбранным товарам.</div>
                  {bulkError && <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{bulkError}</div>}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Минимальная цена</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkFloorPrice} onChange={e => setBulkFloorPrice(e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Максимальная цена</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" placeholder="—" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkMaxPrice} onChange={e => setBulkMaxPrice(e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Шаг, ₸</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkUndercutStep} onChange={e => setBulkUndercutStep(e.target.value)} />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Стратегия</span>
                      <select className={`${INPUT_CLS} px-2 py-1.5`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}
                        value={bulkStrategy} onChange={e => setBulkStrategy(e.target.value)}>
                        {Object.entries(STRATEGY_LABELS).map(([key, label]) => <option key={key} value={key} title={STRATEGY_DESCRIPTIONS[key]}>{label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Частота проверки, мин</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkFrequency} onChange={e => setBulkFrequency(e.target.value)} />
                    </label>
                    <div className="col-span-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                      {STRATEGY_DESCRIPTIONS[bulkStrategy] || ''} {STRATEGY_COMMON_NOTE}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkStep('select')}
                      className="flex-1 text-xs nav-glass rounded-lg px-3 py-2.5 font-medium" style={{ color: 'var(--nav-text-secondary)' }}>
                      Назад
                    </button>
                    <button onClick={submitBulkAdd} disabled={bulkSubmitting || !bulkFloorPrice || !bulkUndercutStep}
                      className="flex-[2] text-sm rounded-lg px-3 py-2.5 font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {bulkSubmitting ? 'Применяем...' : `Применить к ${bulkSelected.size} товарам`}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
    </DesktopShell>
  )
}
