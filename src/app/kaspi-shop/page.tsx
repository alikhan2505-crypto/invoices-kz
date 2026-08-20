'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

type Product = {
  id: string
  kaspi_sku: string
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

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
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

export default function KaspiShop() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
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

  const [suggestingFor, setSuggestingFor] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, { floorPrice: string; maxPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string }>>({})
  const [trackedCities, setTrackedCities] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<{ code: string; name: string }[]>([])
  const [citiesSaving, setCitiesSaving] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  useEffect(() => { load() }, [])

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
    setConnected(false)
    setProducts([])
    setCompanyName(null)
    setSessionStatus(null)
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
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  async function saveProductSettings(id: string) {
    const v = editValues[id]
    if (!v) return
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', {
      method: 'PATCH', headers,
      body: JSON.stringify({
        id,
        floor_price: Number(v.floorPrice),
        max_price: v.maxPrice.trim() === '' ? null : Number(v.maxPrice),
        undercut_step: Number(v.undercutStep),
        demping_strategy: v.strategy,
        excluded_city_codes: v.excludedCities.split(',').map(s => s.trim()).filter(Boolean),
        excluded_merchant_ids: v.excludedMerchants.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
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

  if (loading) return <LoadingSpinner />

  const winningCount = products.filter(p => p.last_competitor_price !== null && p.own_current_price <= p.last_competitor_price).length
  const atFloorCount = products.filter(p => p.own_current_price <= p.floor_price + 0.01).length
  const activeCount = products.filter(p => p.enabled).length

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

        {!connected ? (
          /* Centered connect dialog (2026-08-20, founder): the connect form
             used to render as a full-width inline card flush to the top-left,
             which read as a broken/half-empty page. Now it floats as a true
             centered modal over the page, same treatment as the app's other
             dialogs (bank picker, wallet). Not dismissible -- without a
             connection there is nothing else on this page to interact with. */
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/30">
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              className="relative nav-glass rounded-[24px] w-full max-w-md p-6 lg:p-8 max-h-[84vh] overflow-y-auto"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--nav-text-muted)' }}>Подключение</div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: 'var(--nav-text-primary)' }}>Подключите Kaspi Магазин</h1>
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
            {/* Hero: the one question this page answers, stated as three
                numbers, not buried in per-product rows. */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
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

            <div className="nav-glass rounded-2xl p-4 mb-4">
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

            {companyName && activeCount === 0 && products.length > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: 'var(--nav-text-muted)' }}>{products.length} товаров импортировано и на паузе — включите нужные ниже, чтобы демпинг начал работать.</div>
            )}

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {products.map((p, i) => {
                  const v = editValues[p.id] || { floorPrice: String(p.floor_price), maxPrice: p.max_price !== null ? String(p.max_price) : '', undercutStep: String(p.undercut_step), strategy: p.demping_strategy, excludedCities: '', excludedMerchants: '' }
                  const expanded = expandedId === p.id
                  return (
                    <motion.div key={p.id}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE, delay: Math.min(i * 0.04, 0.3) }}
                      className={`nav-glass rounded-2xl overflow-hidden ${CARD_HOVER}`}>
                      <button onClick={() => {
                        const next = expanded ? null : p.id
                        setExpandedId(next)
                        if (next && !cityPrices[p.id] && trackedCities.length > 0) {
                          authHeader().then(headers =>
                            fetch(`/api/kaspi-shop/products/city-prices?id=${p.id}`, { headers })
                              .then(res => res.ok ? res.json() : { cities: [] })
                              .then(data => setCityPrices(prev => ({ ...prev, [p.id]: data.cities || [] })))
                          )
                        }
                      }} className="w-full text-left p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{p.product_name}</div>
                            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                              {STRATEGY_LABELS[p.demping_strategy] || p.demping_strategy} · проверка каждые {p.check_frequency_minutes} мин
                              {p.market_position !== null && p.market_offer_count !== null && (
                                <> · <span className="font-medium" style={{ color: 'var(--nav-text-secondary)' }} title="Место по цене среди всех продавцов на Kaspi. Kaspi может учитывать не только цену — это оценка.">#{p.market_position} из {p.market_offer_count}</span></>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{p.own_current_price.toLocaleString('ru-KZ')} ₸</span>
                            <span onClick={e => { e.stopPropagation(); toggleProduct(p.id, p.enabled) }}
                              className="text-[11px] px-2 py-1 rounded-full cursor-pointer font-semibold"
                              style={{ background: p.enabled ? 'var(--nav-success)' : 'var(--nav-text-muted)', color: '#fff' }}>
                              {p.enabled ? 'Активно' : 'Пауза'}
                            </span>
                          </div>
                        </div>
                        <PriceLadder own={p.own_current_price} competitor={p.last_competitor_price} floor={p.floor_price} maxPrice={p.max_price} />
                      </button>

                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
                            <div className="p-4 pt-3" style={{ borderTop: '1px solid var(--nav-border-soft)', background: 'var(--nav-bg)' }}>
                              <div className="grid grid-cols-3 gap-2 mb-2">
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
                              </div>
                              <label className="block mb-2">
                                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Стратегия</span>
                                <select className={`${INPUT_CLS} px-2 py-1.5`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}
                                  value={v.strategy} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, strategy: e.target.value } }))}>
                                  {Object.entries(STRATEGY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                              </label>
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
                              <button onClick={() => deleteProduct(p.id)} className="text-[11px] mt-3 transition-colors" style={{ color: 'var(--nav-text-muted)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--nav-critical)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--nav-text-muted)')}>
                                Удалить товар
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {products.length === 0 && (
                <div className="nav-glass rounded-2xl p-8 text-center">
                  <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Каталог ещё импортируется или пуст.</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>Товары появятся здесь после подключения кабинета.</div>
                </div>
              )}
            </div>
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
    </main>
    </DesktopShell>
  )
}
