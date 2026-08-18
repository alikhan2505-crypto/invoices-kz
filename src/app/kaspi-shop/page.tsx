'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'

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

const EASE = [0.16, 1, 0.3, 1] as const

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
      <div className="relative h-1.5 rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct(floor)}%`, background: 'repeating-linear-gradient(135deg, #FFE2E3 0, #FFE2E3 4px, transparent 4px, transparent 8px)' }}
        />
        {maxPrice !== null && (
          <div
            className="absolute inset-y-0 right-0 rounded-full"
            style={{ width: `${100 - pct(maxPrice)}%`, background: 'repeating-linear-gradient(135deg, #E2F7EE 0, #E2F7EE 4px, transparent 4px, transparent 8px)' }}
          />
        )}
        {competitor !== null && (
          <motion.div
            className="absolute -top-1.5 w-3.5 h-3.5 rounded-full bg-white ring-2 ring-[#1C2056]/30"
            initial={false}
            animate={{ left: `calc(${pct(competitor)}% - 7px)` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        )}
        <motion.div
          className={`absolute -top-1.5 w-3.5 h-3.5 rounded-full ring-2 ring-white shadow ${winning ? 'bg-[#00C880]' : 'bg-[#FF5A5F]'}`}
          initial={false}
          animate={{ left: `calc(${pct(own)}% - 7px)` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>Пол {floor.toLocaleString('ru-KZ')} ₸</span>
        {atFloor && <span className="text-[#FF5A5F] font-medium">Упёрлись в минимум</span>}
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
    <main className="nav-surface-elevated min-h-screen">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={load} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        {connected && sessionStatus === 'session_expired' && (
          <div className="bg-[#FFF4E5] rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-[#B15E00]">Сессия кабинета Kaspi истекла — переподключитесь, чтобы демпинг продолжил работать.</span>
            <button onClick={() => { setConnected(false); setSessionStatus(null) }} className="text-xs bg-[#B15E00] text-white rounded-lg px-3 py-1.5 flex-shrink-0">Переподключиться</button>
          </div>
        )}

        {!connected ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
            className="bg-[#12142E] rounded-[28px] p-6 lg:p-10 mb-4 text-white">
            <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-2">Подключение</div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6">Подключите Kaspi Магазин</h1>
            {connectError && <div className="text-sm text-[#FF8A8E] mb-3">{connectError}</div>}

            {merchantChoices ? (
              <div className="flex flex-col gap-2 max-w-sm">
                <div className="text-xs text-white/40 mb-1">На этом номере найдено магазинов: {merchantChoices.length}. Выберите нужный.</div>
                {merchantChoices.map(m => (
                  <button key={m.id} onClick={() => selectMerchant(m.id)} disabled={connecting}
                    className="w-full text-left bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white hover:border-white/30 transition-colors disabled:opacity-50">
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">ID {m.id}</div>
                  </button>
                ))}
              </div>
            ) : !otpToken ? (
              <div className="flex flex-col gap-2 max-w-sm">
                <input className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white! [-webkit-text-fill-color:#fff]! placeholder:text-white/30 outline-none focus:border-white/30"
                  placeholder="Телефон (как при входе в Kaspi)" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
                <button onClick={startConnect} disabled={connecting}
                  className="mt-1 bg-white text-[#12142E] rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                  {connecting ? 'Отправляем код...' : 'Продолжить'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-sm">
                <div className="text-xs text-white/40 mb-1">Код из SMS отправлен на {phone}</div>
                <input className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white! [-webkit-text-fill-color:#fff]! placeholder:text-white/30 outline-none focus:border-white/30 font-mono tracking-widest"
                  placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                <button onClick={completeConnect} disabled={connecting}
                  className="mt-1 bg-white text-[#12142E] rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                  {connecting ? 'Проверяем...' : 'Подтвердить'}
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <>
            {/* Hero: the one question this page answers, stated as three
                numbers, not buried in per-product rows. */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">{companyName || 'Магазин подключён'}</div>
                  <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Гонка цен сейчас</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={togglePause}
                    className={`text-xs font-medium rounded-full px-3 py-2 transition-colors ${paused ? 'bg-[#FF5A5F]/20 text-[#FF8A8E]' : 'bg-[#00C880]/15 text-[#00C880]'}`}>
                    {paused ? '⏸ На паузе' : '● Работает'}
                  </button>
                  <button onClick={disconnect} className="text-xs font-medium rounded-full px-3 py-2 bg-white/10 text-white/50 hover:text-white/80 transition-colors">
                    Отключить
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 lg:gap-6">
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{winningCount}</div>
                  <div className="text-xs text-white/40 mt-1">из {products.length} — мы дешевле</div>
                </div>
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums text-[#FF8A8E]">{atFloorCount}</div>
                  <div className="text-xs text-white/40 mt-1">упёрлись в минимум</div>
                </div>
                <div>
                  <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{balance}</div>
                  <div className="text-xs text-white/40 mt-1">₸ на балансе · <button onClick={() => setWalletOpen(true)} className="underline underline-offset-2">пополнить</button></div>
                </div>
              </div>
            </motion.div>

            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <div className="text-sm font-semibold text-gray-800 mb-1">Города для отслеживания конкурентов</div>
              <div className="text-[11px] text-gray-400 mb-3">
                {trackedCities.length === 0
                  ? 'Не настроено — цена реагирует на одного эталонного конкурента для всех городов, как раньше.'
                  : `Выбрано: ${trackedCities.length}. Конкурента и цену проверяем отдельно по каждому.`}
                {citiesSaving && ' Сохраняем…'}
              </div>
              {trackedCities.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {availableCities.filter(c => trackedCities.includes(c.code)).map(city => (
                    <button key={city.code} onClick={() => toggleTrackedCity(city.code)}
                      className="text-xs pl-3 pr-2 py-1.5 rounded-full bg-[#1C2056] text-white flex items-center gap-1.5">
                      {city.name}
                      <span className="text-white/50">✕</span>
                    </button>
                  ))}
                </div>
              )}

              {availableCities.length === 0 ? (
                <div className="text-[11px] text-gray-400">Список городов ещё не загружен.</div>
              ) : (
                <>
                  <input value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Найти город…"
                    className="w-full rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 px-3 py-2 text-xs outline-none focus:bg-gray-100" />
                  {citySearch.trim() !== '' && (
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto mt-2">
                      {availableCities
                        .filter(c => !trackedCities.includes(c.code))
                        .filter(c => c.name.toLowerCase().includes(citySearch.trim().toLowerCase()))
                        .map(city => (
                          <button key={city.code} onClick={() => { toggleTrackedCity(city.code); setCitySearch('') }}
                            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200">
                            {city.name}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {companyName && activeCount === 0 && products.length > 0 && (
              <div className="text-xs text-gray-400 mb-4 px-1">{products.length} товаров импортировано и на паузе — включите нужные ниже, чтобы демпинг начал работать.</div>
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
                      className="bg-white rounded-2xl shadow-sm overflow-hidden">
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
                            <div className="text-sm font-semibold text-gray-800 truncate">{p.product_name}</div>
                            <div className="text-[11px] text-gray-400">
                              {STRATEGY_LABELS[p.demping_strategy] || p.demping_strategy} · проверка каждые {p.check_frequency_minutes} мин
                              {p.market_position !== null && p.market_offer_count !== null && (
                                <> · <span className="font-medium text-gray-500" title="Место по цене среди всех продавцов на Kaspi. Kaspi может учитывать не только цену — это оценка.">#{p.market_position} из {p.market_offer_count}</span></>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono font-bold text-sm text-[#1C2056] tabular-nums">{p.own_current_price.toLocaleString('ru-KZ')} ₸</span>
                            <span onClick={e => { e.stopPropagation(); toggleProduct(p.id, p.enabled) }}
                              className={`text-[11px] px-2 py-1 rounded-full cursor-pointer ${p.enabled ? 'bg-[#00C880]/10 text-[#00A468]' : 'bg-gray-100 text-gray-500'}`}>
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
                            <div className="border-t border-gray-100 p-4 pt-3 bg-gray-50/50">
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Минимальная цена</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Максимальная цена</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number" placeholder="—"
                                    value={v.maxPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, maxPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Шаг, ₸</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} />
                                </label>
                              </div>
                              <label className="block mb-2">
                                <span className="text-[11px] text-gray-400 mb-1 block">Стратегия</span>
                                <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                  value={v.strategy} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, strategy: e.target.value } }))}>
                                  {Object.entries(STRATEGY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                              </label>
                              <label className="block mb-2">
                                <span className="text-[11px] text-gray-400 mb-1 block">Исключить города (для этого товара)</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {trackedCities.length === 0 && <span className="text-[11px] text-gray-400">Сначала выберите отслеживаемые города выше.</span>}
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
                                        className={`text-[11px] px-2 py-1 rounded-full ${excluded ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
                                        {cityName}
                                      </button>
                                    )
                                  })}
                                </div>
                              </label>
                              <label className="block mb-3">
                                <span className="text-[11px] text-gray-400 mb-1 block">Не конкурировать с продавцами (ID через запятую)</span>
                                <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                                  value={v.excludedMerchants} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedMerchants: e.target.value } }))} />
                              </label>
                              {trackedCities.length > 0 && (
                                <div className="mb-3">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Цены по городам</span>
                                  {!cityPrices[p.id] && <div className="text-[11px] text-gray-400">Загрузка…</div>}
                                  {cityPrices[p.id] && cityPrices[p.id].length === 0 && (
                                    <div className="text-[11px] text-gray-400">Нет данных ещё — появятся после первой проверки цен по этому товару.</div>
                                  )}
                                  {cityPrices[p.id] && cityPrices[p.id].length > 0 && (
                                    <div className="space-y-1">
                                      {cityPrices[p.id].map(c => (
                                        <div key={c.cityCode} className="flex items-center justify-between text-[11px]">
                                          <span className="text-gray-500">{c.cityName}</span>
                                          <span className="font-mono">
                                            <span className="text-[#1C2056] font-semibold">{c.ownPrice.toLocaleString('ru-KZ')} ₸</span>
                                            {c.competitorPrice !== null && <span className="text-gray-400"> · конкурент {c.competitorPrice.toLocaleString('ru-KZ')} ₸</span>}
                                            {c.marketPosition !== null && c.marketOfferCount !== null && <span className="text-gray-400"> · #{c.marketPosition} из {c.marketOfferCount}</span>}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => suggestPricing(p.id)} disabled={suggestingFor === p.id}
                                  className="flex-1 text-xs bg-white border border-gray-200 text-[#1C2056] rounded-lg px-3 py-2 font-medium">
                                  {suggestingFor === p.id ? 'Думаем...' : '✨ ИИ-подбор цены'}
                                </button>
                                <button onClick={() => saveProductSettings(p.id)}
                                  className="flex-1 text-xs bg-[#1C2056] text-white rounded-lg px-3 py-2 font-medium">
                                  Сохранить
                                </button>
                              </div>
                              <button onClick={() => deleteProduct(p.id)} className="text-[11px] text-gray-400 hover:text-red-500 mt-3">Удалить товар</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {products.length === 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                  <div className="text-sm text-gray-500">Каталог ещё импортируется или пуст.</div>
                  <div className="text-xs text-gray-400 mt-1">Товары появятся здесь после подключения кабинета.</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {walletOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4"
            onClick={() => setWalletOpen(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-t-[28px] lg:rounded-[28px] w-full lg:max-w-sm p-5">
              <div className="text-sm font-semibold text-[#1C2056] mb-1">Пополнить кошелёк</div>
              <div className="text-xs text-gray-400 mb-4">Баланс: {balance.toLocaleString('ru-KZ')} ₸ · проверка цены — 5 ₸</div>
              <div className="flex gap-2 flex-wrap mb-2">
                {[1000, 5000, 10000].map(amount => (
                  <button key={amount} onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${topupAmount === amount ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                    {amount.toLocaleString('ru-KZ')} ₸
                  </button>
                ))}
              </div>
              <input value={topupCustom} onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
                placeholder="Своя сумма, ₸" type="text" inputMode="numeric"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
              <button onClick={() => startTopup((topupAmount ?? Number(topupCustom)) || 0)}
                disabled={toppingUp || !((topupAmount ?? Number(topupCustom)) >= 500)}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
                {toppingUp ? 'Готовим QR...' : 'Пополнить'}
              </button>
              {topupPending && (
                <div className="bg-blue-50 rounded-xl p-3 mt-3">
                  <p className="text-xs text-gray-600 mb-2">Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
                  <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                    className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium block text-center">Оплатить</a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bottom bar: same tab set as the desktop sidebar, since the
          floating sidebar is desktop-only. */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Демпинг</div>
        <button onClick={() => setWalletOpen(true)} className="text-xs text-gray-400">{balance.toLocaleString('ru-KZ')} ₸</button>
      </div>
    </main>
  )
}
