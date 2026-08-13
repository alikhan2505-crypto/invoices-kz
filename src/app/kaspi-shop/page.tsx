'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { backLabel } from '@/lib/a11yLabels'
import AppNav from '@/components/AppNav'

type Product = {
  id: string
  kaspi_sku: string
  product_name: string
  brand: string
  store_id: string
  stock_count: number
  own_current_price: number
  floor_price: number
  undercut_step: number
  check_frequency_minutes: number
  enabled: boolean
  last_checked_at: string | null
  last_competitor_price: number | null
  demping_strategy: string
  excluded_city_codes: string[]
  excluded_merchant_ids: string[]
}

const STRATEGY_LABELS: Record<string, string> = {
  undercut_leader: 'Быть 1-м (подрезать конкурента)',
  match_leader: 'Цена лидера',
  stay_above_leader: 'Держаться над лидером',
  be_second: 'Быть 2-м',
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

  // Connect flow: phone + merchantId -> OTP code, matching the real
  // idmc.shop.kaspi.kz login (confirmed live 2026-08-13 -- phone + SMS
  // code only, no separate password for this login method).
  const [phone, setPhone] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')

  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupPending, setTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)

  const [suggestingFor, setSuggestingFor] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, { floorPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string }>>({})

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    // Kaspi Shop is a brand-new, still-being-verified feature -- admin-only
    // for now (see the matching gate in AppNav.tsx) so existing customers
    // don't stumble into it before it's ready. Same admin-check pattern as
    // /admin (src/app/admin/page.tsx) -- remove once ready for everyone.
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const [productsRes, walletRes] = await Promise.all([
        fetch('/api/kaspi-shop/products', { headers }),
        fetch('/api/kaspi-shop/wallet', { headers }),
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
      }
    } catch (e: any) {
      // A rejected fetch (offline, DNS failure) throws rather than
      // resolving to a non-ok response -- without this catch, the .ok
      // checks above are never reached and the page was left stuck on
      // the loading spinner forever with no way to retry.
      console.error('Kaspi Shop load error:', e.message)
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function startConnect() {
    if (!phone || !merchantId) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect', {
      method: 'POST', headers,
      body: JSON.stringify({ phone, merchantId }),
    })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) {
      setConnectError(data.error || 'Не удалось подключиться')
      return
    }
    setOtpToken(data.otpToken)
  }

  async function completeConnect() {
    if (!otpToken || !otpCode) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect/otp', {
      method: 'POST', headers,
      body: JSON.stringify({ otpToken, code: otpCode, merchantId }),
    })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) {
      setConnectError(data.error || 'Не удалось подтвердить код')
      return
    }
    setOtpToken(null)
    setOtpCode('')
    setConnected(true)
    load()
  }

  async function togglePause() {
    const next = !paused
    setPaused(next)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
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

  // Same short-poll pattern as /profile/acquiring's own Kaspi Pay top-up --
  // stops after ~2.5 minutes (a QR that's still unpaid by then is most
  // likely abandoned, not about to be paid this session).
  function pollTopupStatus(topupId: string) {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/wallet/topup-status?topup_id=${topupId}`, { headers })
      const data = await res.json()
      if (data.status === 'paid') {
        clearInterval(interval)
        setTopupPending(null)
        load()
      } else if (data.status === 'expired' || attempts >= 30) {
        clearInterval(interval)
        setTopupPending(null)
      }
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
    const res = await fetch('/api/kaspi-shop/products/suggest-pricing', {
      method: 'POST', headers,
      body: JSON.stringify({ productId: id }),
    })
    const data = await res.json()
    setSuggestingFor(null)
    if (!res.ok) return
    setEditValues(prev => ({
      ...prev,
      [id]: { ...prev[id], floorPrice: String(data.floorPrice), undercutStep: String(data.undercutStep) },
    }))
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-gray-50 pb-20 lg:pb-0 lg:pl-[144px]">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="back-btn text-gray-400 text-xl" aria-label={backLabel('ru')}>‹</button>
        <span className="font-semibold text-[#1C2056]">Kaspi Магазин</span>
      </div>

      <div className="max-w-lg lg:max-w-4xl mx-auto p-4 space-y-4">
        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={load} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">
              Повторить
            </button>
          </div>
        )}

        {connected && sessionStatus === 'session_expired' && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3">
            <span className="text-sm text-red-600">Сессия кабинета Kaspi истекла — переподключитесь, чтобы демпинг продолжил работать.</span>
            <button onClick={() => { setConnected(false); setSessionStatus(null) }} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">
              Переподключиться
            </button>
          </div>
        )}

        {!connected ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-1">Подключить Kaspi Магазин</div>
            <div className="text-xs text-gray-400 mb-3">
              ID продавца — в вашем кабинете Kaspi, в правом верхнем углу («ID - ...»). Название компании подтянется автоматически.
            </div>
            {connectError && <div className="text-xs text-red-500 mb-2">{connectError}</div>}

            {!otpToken ? (
              <>
                <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Телефон (как при входе в Kaspi)"
                  value={phone} onChange={e => setPhone(e.target.value)} />
                <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="ID продавца (merchantId)"
                  value={merchantId} onChange={e => setMerchantId(e.target.value)} />
                <button onClick={startConnect} disabled={connecting}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {connecting ? 'Отправляем код...' : 'Продолжить'}
                </button>
              </>
            ) : (
              <>
                <div className="text-xs text-gray-500 mb-2">Код из SMS отправлен на {phone}</div>
                <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Код из SMS"
                  value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                <button onClick={completeConnect} disabled={connecting}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {connecting ? 'Проверяем...' : 'Подтвердить'}
                </button>
              </>
            )}
          </div>
        ) : null}

        {connected && companyName && (
          <div className="text-xs text-gray-400 px-1">Подключено: {companyName}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-[#1C2056]">Баланс Kaspi Shop Wallet</div>
              <div className="text-xs text-gray-400">{balance} кредитов · 1 кредит = 5 ₸</div>
            </div>
            <button onClick={togglePause}
              className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${paused ? 'bg-red-500' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${paused ? 'left-7' : 'left-1'}`}></span>
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mb-2">
            {[1000, 5000, 10000].map(amount => (
              <button key={amount}
                onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${topupAmount === amount ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                {amount.toLocaleString('ru-KZ')} ₸
              </button>
            ))}
          </div>
          <input value={topupCustom}
            onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
            placeholder="Своя сумма, ₸" type="text" inputMode="numeric"
            className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-2" />
          <button onClick={() => startTopup((topupAmount ?? Number(topupCustom)) || 0)}
            disabled={toppingUp || !((topupAmount ?? Number(topupCustom)) >= 500)}
            className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
            {toppingUp ? 'Готовим QR...' : 'Пополнить'}
          </button>

          {topupPending && (
            <div className="bg-blue-50 rounded-xl p-3 mt-3">
              <p className="text-xs text-gray-600 mb-2">Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
              <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium block text-center">
                Оплатить
              </a>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-3">Отслеживаемые товары</div>
          <div className="space-y-3 mb-3">
            {products.map(p => {
              const v = editValues[p.id] || { floorPrice: String(p.floor_price), undercutStep: String(p.undercut_step), strategy: p.demping_strategy, excludedCities: '', excludedMerchants: '' }
              return (
                <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">{p.product_name}</span>
                    <button onClick={() => toggleProduct(p.id, p.enabled)}
                      className={`text-xs px-2 py-0.5 rounded-full ${p.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {p.enabled ? 'Активно' : 'Пауза'}
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    Наша цена: {p.own_current_price} ₸ · Конкурент: {p.last_competitor_price ?? '—'} ₸
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input className="border rounded-lg px-2 py-1.5 text-xs" placeholder="Минимальная цена (пол)" type="number"
                      value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} />
                    <input className="border rounded-lg px-2 py-1.5 text-xs" placeholder="Шаг, ₸" type="number"
                      value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} />
                  </div>
                  <select className="w-full border rounded-lg px-2 py-1.5 text-xs mb-2"
                    value={v.strategy} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, strategy: e.target.value } }))}>
                    {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <input className="w-full border rounded-lg px-2 py-1.5 text-xs mb-2" placeholder="Исключить города (коды через запятую)"
                    value={v.excludedCities} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedCities: e.target.value } }))} />
                  <input className="w-full border rounded-lg px-2 py-1.5 text-xs mb-2" placeholder="Не конкурировать с продавцами (ID через запятую)"
                    value={v.excludedMerchants} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedMerchants: e.target.value } }))} />

                  <div className="flex gap-2">
                    <button onClick={() => suggestPricing(p.id)} disabled={suggestingFor === p.id}
                      className="flex-1 text-xs bg-gray-100 text-[#1C2056] rounded-lg px-3 py-1.5">
                      {suggestingFor === p.id ? 'Думаем...' : 'ИИ-подбор цены'}
                    </button>
                    <button onClick={() => saveProductSettings(p.id)}
                      className="flex-1 text-xs bg-[#1C2056] text-white rounded-lg px-3 py-1.5">
                      Сохранить
                    </button>
                  </div>
                  <button onClick={() => deleteProduct(p.id)} className="text-xs text-red-500 mt-2">Удалить</button>
                </div>
              )
            })}
            {products.length === 0 && <div className="text-xs text-gray-400">Пока нет товаров — подключите кабинет, чтобы импортировать каталог</div>}
          </div>
        </div>
      </div>

      <AppNav />
    </main>
  )
}
