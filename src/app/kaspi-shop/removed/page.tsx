'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { extractAttributes } from '@/lib/kaspiShop/salesAnalytics'

const EASE = [0.16, 1, 0.3, 1] as const

type OfferPoint = { storeCode: string; cityName: string | null; stockCount: number | null }

type Offer = {
  sku: string
  masterSku: string | null
  title: string
  brandName: string | null
  minPrice: number
  points: OfferPoint[]
}

type Tab = 'active' | 'removed'

// Per-row lifecycle: idle -> busy (request in flight) -> sent (Kaspi
// accepted, processes asynchronously -- the cabinet's own UI shows the same
// «В обработке» state, usually done within the hour).
type RowState = 'idle' | 'busy' | 'sent'

function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 5v14M15 5v14" />
    </svg>
  )
}

type StockEntry = {
  storeCode: string
  cityId: string | null
  cityName: string | null
  price: number | null
  stockCount: number | null
  available: string | null
}

type StockModalState = {
  offer: Offer
  loading: boolean
  error: string
  masterSku: string | null
  model: string
  entries: StockEntry[]
  edits: Record<string, { price: string; stockCount: string }>
  saving: boolean
  saved: boolean
}

export default function KaspiShopProductAvailability() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [active, setActive] = useState<Offer[]>([])
  const [removed, setRemoved] = useState<Offer[]>([])
  // «В продаже» first (founder request) -- these are the products being
  // worked with; load() flips to the removed tab only when there is
  // nothing on sale at all.
  const [tab, setTab] = useState<Tab>('active')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [stockModal, setStockModal] = useState<StockModalState | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/removed-products', { headers })
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || 'Не удалось загрузить товары')
      } else {
        setActive(data.active || [])
        setRemoved(data.removed || [])
        if ((data.active || []).length === 0 && (data.removed || []).length > 0) setTab('removed')
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function openStockModal(offer: Offer) {
    setStockModal({ offer, loading: true, error: '', masterSku: null, model: '', entries: [], edits: {}, saving: false, saved: false })
    const headers = await authHeader()
    const res = await fetch(`/api/kaspi-shop/offer-stocks?sku=${encodeURIComponent(offer.sku)}`, { headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStockModal(prev => prev ? { ...prev, loading: false, error: data.error || 'Не удалось загрузить данные точек' } : prev)
      return
    }
    const entries: StockEntry[] = data.entries || []
    const edits: Record<string, { price: string; stockCount: string }> = {}
    for (const e of entries) {
      edits[e.storeCode] = {
        price: e.price !== null ? String(e.price) : (data.minPrice !== null ? String(data.minPrice) : ''),
        stockCount: e.stockCount !== null ? String(e.stockCount) : '',
      }
    }
    setStockModal(prev => prev ? {
      ...prev, loading: false,
      masterSku: data.masterSku ?? null,
      model: data.model || offer.title,
      entries, edits,
    } : prev)
  }

  async function saveStockModal() {
    if (!stockModal || stockModal.saving) return
    const payloadEntries = stockModal.entries
      .filter(e => e.cityId)
      .map(e => ({
        storeCode: e.storeCode,
        cityId: e.cityId,
        price: Number(stockModal.edits[e.storeCode]?.price),
        stockCount: stockModal.edits[e.storeCode]?.stockCount.trim() === '' ? null : Number(stockModal.edits[e.storeCode]?.stockCount),
      }))
      .filter(e => Number.isFinite(e.price) && e.price > 0)
    if (payloadEntries.length === 0) {
      setStockModal(prev => prev ? { ...prev, error: 'Нет точек с городом и ценой — сохранять нечего.' } : prev)
      return
    }
    setStockModal(prev => prev ? { ...prev, saving: true, error: '' } : prev)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/offer-stocks', {
      method: 'POST', headers,
      body: JSON.stringify({ sku: stockModal.offer.sku, masterSku: stockModal.masterSku, model: stockModal.model, entries: payloadEntries }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      const failMsg = (data.results || []).filter((r: any) => !r.ok).map((r: any) => `${r.storeCode}: ${r.message}`).join('; ')
      setStockModal(prev => prev ? { ...prev, saving: false, error: data.error || failMsg || 'Не удалось сохранить' } : prev)
      return
    }
    setStockModal(prev => prev ? { ...prev, saving: false, saved: true } : prev)
    // Auto-close shortly after the success notice (founder request) --
    // unless the user already started editing again (any input resets
    // `saved`), in which case the modal stays put.
    setTimeout(() => {
      setStockModal(prev => (prev && prev.saved && !prev.saving ? null : prev))
    }, 2000)
  }

  async function toggle(sku: string, action: 'restore' | 'remove') {
    setRowStates(prev => ({ ...prev, [sku]: 'busy' }))
    setRowErrors(prev => ({ ...prev, [sku]: '' }))
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/removed-products', { method: 'POST', headers, body: JSON.stringify({ sku, action }) })
    const data = await res.json()
    if (!res.ok) {
      setRowStates(prev => ({ ...prev, [sku]: 'idle' }))
      setRowErrors(prev => ({ ...prev, [sku]: data.error || 'Не удалось выполнить операцию' }))
      return
    }
    setRowStates(prev => ({ ...prev, [sku]: 'sent' }))
  }

  if (loading) return <LoadingSpinner />

  const tabOffers = tab === 'removed' ? removed : active
  // Filter above the grid (founder request 2026-08-22): with 500+ removed
  // offers, finding one specific product by scrolling was impractical.
  const query = search.trim().toLowerCase()
  const matchesQuery = (o: Offer) => !query || o.title.toLowerCase().includes(query) || o.sku.toLowerCase().includes(query)
  const offers = tabOffers.filter(matchesQuery)
  // Tab pill counts reflect the active search filter too (founder request
  // 2026-08-22) -- previously always showed the full unfiltered totals even
  // while a query was narrowing the list below them.
  const removedCount = removed.filter(matchesQuery).length
  const activeCount = active.filter(matchesQuery).length

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Kaspi Bot</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Управление товарами</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--nav-text-secondary)' }}>
            Снимайте товары с продажи и возвращайте обратно — как в кабинете Kaspi, но прямо отсюда. Обе операции Kaspi
            обрабатывает сам, обычно в течение часа. При снятии с продажи правило демпинга для товара автоматически
            выключается, чтобы репрайсер случайно не вернул его в продажу.
          </p>
        </motion.div>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-1.5">
            {([['removed', `Сняты с продажи (${removedCount})`], ['active', `В продаже (${activeCount})`]] as [Tab, string][]).map(([key, label]) => {
              const selected = tab === key
              return (
                <button key={key} onClick={() => setTab(key)}
                  className="relative px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                  style={selected
                    ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                    : { color: 'var(--nav-text-secondary)' }}>
                  {label}
                </button>
              )
            })}
          </div>
          {/* Search filter (founder request 2026-08-22) -- with 500+
              removed offers, finding one product by name was impractical. */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или SKU..."
            className="text-sm rounded-full px-4 py-1.5 outline-none w-full sm:w-64"
            style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }} />
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => { setLoading(true); load() }} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {!loadError && offers.length === 0 && (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
              {tab === 'removed' ? 'Снятых с продажи товаров нет' : 'Товаров в продаже нет'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
              {tab === 'removed' ? 'Все товары активного магазина сейчас в продаже.' : 'Недавно отправленные товары Kaspi может ещё обрабатывать.'}
            </div>
          </div>
        )}

        {/* Same card grid as the Демпинг page (2026-08-21 founder request)
            -- compact cards, up to 4 per row on wide screens. */}
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
          {offers.map((offer, i) => {
            const state = rowStates[offer.sku] || 'idle'
            const error = rowErrors[offer.sku]
            const action = tab === 'removed' ? 'restore' : 'remove'
            // Whole card opens «Цена и остатки» now (founder feedback
            // 2026-08-22: "не могу зайти в карточку и изменить параметры" --
            // only the small text link at the bottom was clickable before).
            const cardOpensStockModal = tab === 'active' && state !== 'sent'
            return (
              <motion.div key={offer.sku}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
                onClick={cardOpensStockModal ? () => openStockModal(offer) : undefined}
                className={`nav-glass rounded-2xl p-4 ${cardOpensStockModal ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}>
                <div className="text-sm font-semibold truncate" title={offer.title} style={{ color: 'var(--nav-text-primary)' }}>{offer.title}</div>
                <div className="text-[11px] mb-1.5" style={{ color: 'var(--nav-text-muted)' }}>
                  {offer.brandName ? `${offer.brandName} · ` : ''}{offer.sku}
                </div>
                {/* Цвет/размер (founder request 2026-08-22): извлечены из
                    названия товара, тем же способом, что и ABC-разрезы на
                    Финансах -- Kaspi не отдаёт характеристики отдельно. */}
                {(() => {
                  const { color, size } = extractAttributes(offer.title)
                  if (!color && !size) return null
                  return (
                    <div className="flex items-center gap-1.5 mb-2">
                      {color && (
                        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>{color}</span>
                      )}
                      {size && (
                        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>Размер {size}</span>
                      )}
                    </div>
                  )
                })()}
                {/* Город точки + остаток по ней (founder request 2026-08-21);
                    остаток «не указан» = безопасное состояние по формулировке
                    самого Kaspi. */}
                <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                  {(offer.points || []).length === 0
                    ? 'Все города'
                    : (offer.points || []).map(pt => `${pt.cityName || pt.storeCode}: ${pt.stockCount !== null ? `${pt.stockCount} шт` : 'остаток не указан'}`).join(' · ')}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Цена</div>
                    <div className="font-mono font-bold text-xl tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                      {offer.minPrice.toLocaleString('ru-KZ')} ₸
                    </div>
                  </div>
                  {state === 'sent' ? (
                    <span className="text-[11px] font-semibold rounded-full px-3 py-2 text-center" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                      Kaspi обрабатывает
                    </span>
                  ) : action === 'restore' ? (
                    <button onClick={e => { e.stopPropagation(); toggle(offer.sku, 'restore') }} disabled={state === 'busy'}
                      className="text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      <RestoreIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Вернуть в продажу'}
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); toggle(offer.sku, 'remove') }} disabled={state === 'busy'}
                      className="nav-glass text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ color: 'var(--nav-critical)' }}>
                      <PauseIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Снять с продажи'}
                    </button>
                  )}
                </div>
                {cardOpensStockModal && (
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--nav-accent)' }}>
                    Цена и остатки →
                  </div>
                )}
                {error && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* «Цена и остатки» -- per-point (склад/город) price+stock editor,
          mirroring the cabinet's own modal; saves go through the captured
          ON_SALE__PRICE_SAVE chain, one save per point. */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setStockModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-md max-h-[86vh] overflow-y-auto"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>Цена и остатки</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{stockModal.offer.title}</div>
                </div>
                <button onClick={() => setStockModal(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>
              <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                Как в кабинете Kaspi: цена и остаток по каждой точке. Остаток можно оставить пустым — товар останется в продаже без учёта остатков.
              </p>

              {stockModal.loading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем точки…</div>}

              {!stockModal.loading && stockModal.entries.length === 0 && !stockModal.error && (
                <div className="text-xs py-4" style={{ color: 'var(--nav-text-secondary)' }}>
                  Не удалось распознать точки товара в данных Kaspi — управляйте ценой и остатками пока через кабинет Kaspi.
                </div>
              )}

              {stockModal.entries.map(e => (
                <div key={e.storeCode} className="rounded-xl p-3 mb-2" style={{ background: 'var(--nav-bg)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
                    {e.cityName ? `${e.cityName} · ` : ''}{e.storeCode}
                    {!e.cityId && <span className="font-normal" style={{ color: 'var(--nav-text-muted)' }}> — город не распознан, сохранение недоступно</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена, ₸</span>
                      <input type="number" disabled={!e.cityId}
                        className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                        style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                        value={stockModal.edits[e.storeCode]?.price ?? ''}
                        onChange={ev => setStockModal(prev => prev ? { ...prev, saved: false, edits: { ...prev.edits, [e.storeCode]: { ...prev.edits[e.storeCode], price: ev.target.value } } } : prev)} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Остаток, шт</span>
                      <input type="number" placeholder="Не указан" disabled={!e.cityId}
                        className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                        style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                        value={stockModal.edits[e.storeCode]?.stockCount ?? ''}
                        onChange={ev => setStockModal(prev => prev ? { ...prev, saved: false, edits: { ...prev.edits, [e.storeCode]: { ...prev.edits[e.storeCode], stockCount: ev.target.value } } } : prev)} />
                    </label>
                  </div>
                </div>
              ))}

              {stockModal.error && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-critical)' }}>{stockModal.error}</div>}
              {stockModal.saved && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-success)' }}>Отправлено — Kaspi применит изменения в течение часа.</div>}

              {stockModal.entries.some(e => e.cityId) && (
                <button onClick={saveStockModal} disabled={stockModal.saving}
                  className="w-full mt-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {stockModal.saving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </main>
    </DesktopShell>
  )
}
