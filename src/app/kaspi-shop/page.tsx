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
}

export default function KaspiShop() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [balance, setBalance] = useState(0)
  const [products, setProducts] = useState<Product[]>([])

  const [apiToken, setApiToken] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  const [newProduct, setNewProduct] = useState({
    kaspiSku: '', productName: '', brand: '', storeId: '', stockCount: '0',
    ownCurrentPrice: '', floorPrice: '', undercutStep: '', checkFrequencyMinutes: '15',
  })
  const [addingProduct, setAddingProduct] = useState(false)

  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupPending, setTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const [productsRes, walletRes] = await Promise.all([
        fetch('/api/kaspi-shop/products', { headers }),
        fetch('/api/kaspi-shop/wallet', { headers }),
      ])
      if (productsRes.ok) {
        const data = await productsRes.json()
        setProducts(data.products || [])
      }
      if (walletRes.ok) {
        const data = await walletRes.json()
        setBalance(data.balance ?? 0)
        setConnected(!!data.connected)
        setPaused(!!data.paused)
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

  async function connect() {
    if (!apiToken || !merchantId || !companyName) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connect', {
      method: 'POST', headers,
      body: JSON.stringify({ apiToken, merchantId, companyName }),
    })
    const data = await res.json()
    if (!res.ok) {
      setConnectError(data.error || 'Не удалось подключиться')
      setConnecting(false)
      return
    }
    setConnected(true)
    setConnecting(false)
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

  async function addProduct() {
    const { kaspiSku, productName, brand, storeId, stockCount, ownCurrentPrice, floorPrice, undercutStep, checkFrequencyMinutes } = newProduct
    if (!kaspiSku || !productName || !brand || !storeId || !ownCurrentPrice || !floorPrice || !undercutStep) return
    setAddingProduct(true)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', {
      method: 'POST', headers,
      body: JSON.stringify({
        kaspiSku, productName, brand, storeId,
        stockCount: Number(stockCount), ownCurrentPrice: Number(ownCurrentPrice),
        floorPrice: Number(floorPrice), undercutStep: Number(undercutStep),
        checkFrequencyMinutes: Number(checkFrequencyMinutes),
      }),
    })
    setNewProduct({ kaspiSku: '', productName: '', brand: '', storeId: '', stockCount: '0', ownCurrentPrice: '', floorPrice: '', undercutStep: '', checkFrequencyMinutes: '15' })
    setAddingProduct(false)
    load()
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

        {!connected ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-1">Подключить Kaspi Магазин</div>
            <div className="text-xs text-gray-400 mb-3">
              Токен API — в вашем кабинете продавца Kaspi: Настройки → Токен API → Сформировать.
            </div>
            {connectError && <div className="text-xs text-red-500 mb-2">{connectError}</div>}
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Токен API"
              value={apiToken} onChange={e => setApiToken(e.target.value)} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="ID продавца (merchantId)"
              value={merchantId} onChange={e => setMerchantId(e.target.value)} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Название компании"
              value={companyName} onChange={e => setCompanyName(e.target.value)} />
            <button onClick={connect} disabled={connecting}
              className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
              {connecting ? 'Подключаем...' : 'Подключить'}
            </button>
          </div>
        ) : null}

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
          <div className="space-y-2 mb-3">
            {products.map(p => (
              <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{p.product_name}</span>
                  <button onClick={() => toggleProduct(p.id, p.enabled)}
                    className={`text-xs px-2 py-0.5 rounded-full ${p.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {p.enabled ? 'Активно' : 'Пауза'}
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  Наша цена: {p.own_current_price} ₸ · Конкурент: {p.last_competitor_price ?? '—'} ₸ · Пол: {p.floor_price} ₸ · Шаг: {p.undercut_step} ₸
                </div>
                <div className="text-xs text-gray-400">Проверка каждые {p.check_frequency_minutes} мин</div>
                <button onClick={() => deleteProduct(p.id)} className="text-xs text-red-500 mt-1">Удалить</button>
              </div>
            ))}
            {products.length === 0 && <div className="text-xs text-gray-400">Пока нет товаров</div>}
          </div>

          <div className="text-xs text-gray-500 mb-2 mt-3">Добавить товар</div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="SKU на Kaspi"
            value={newProduct.kaspiSku} onChange={e => setNewProduct({ ...newProduct, kaspiSku: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Название товара"
            value={newProduct.productName} onChange={e => setNewProduct({ ...newProduct, productName: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Бренд"
            value={newProduct.brand} onChange={e => setNewProduct({ ...newProduct, brand: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Код склада (storeId из кабинета Kaspi)"
            value={newProduct.storeId} onChange={e => setNewProduct({ ...newProduct, storeId: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Остаток на складе" type="number"
              value={newProduct.stockCount} onChange={e => setNewProduct({ ...newProduct, stockCount: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Текущая цена, ₸" type="number"
              value={newProduct.ownCurrentPrice} onChange={e => setNewProduct({ ...newProduct, ownCurrentPrice: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Минимальная цена (пол), ₸" type="number"
              value={newProduct.floorPrice} onChange={e => setNewProduct({ ...newProduct, floorPrice: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Шаг отступа, ₸" type="number"
              value={newProduct.undercutStep} onChange={e => setNewProduct({ ...newProduct, undercutStep: e.target.value })} />
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Частота проверки, минут" type="number"
            value={newProduct.checkFrequencyMinutes} onChange={e => setNewProduct({ ...newProduct, checkFrequencyMinutes: e.target.value })} />
          <button onClick={addProduct} disabled={addingProduct}
            className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
            {addingProduct ? 'Добавляем...' : 'Добавить товар'}
          </button>
        </div>
      </div>

      <AppNav />
    </main>
  )
}
