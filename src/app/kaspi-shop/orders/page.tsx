'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { ORDER_STATUS_TABS, BULK_SELECTABLE_STATUSES, WAYBILL_PRINTABLE_STATUSES, PACKING_STATUS } from '@/lib/kaspiShop/orderStatuses'
import { filterByDeliveryCutoff, type DeliveryDateMode } from '@/lib/kaspiShop/ordersFilters'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const
const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Same glyph as SiteNav.tsx/review page's WhatsAppIcon -- this codebase's
// established per-file inline-SVG convention rather than a shared import.
function WhatsAppIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

// Audit finding (2026-09-02): orders/[code]/page.tsx was fully built but no
// card ever linked to it -- the only click handler on a card toggles bulk
// selection. This icon gives cards an explicit second affordance instead of
// overloading the same click for both, so selection keeps working exactly
// as before.
function ChevronRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  cityId: string | null
  cityName: string | null
  plannedDeliveryDate: string | null
  items: { code: string; name: string; imageUrl: string | null; quantity: number }[]
}

function KaspiShopOrdersInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || ORDER_STATUS_TABS[0].value

  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState<'a4' | 'a6' | null>(null)
  const [confirmingPacking, setConfirmingPacking] = useState(false)
  const [packingConfirmedMessage, setPackingConfirmedMessage] = useState('')
  // «Запросить отзыв» -- fully client-side, nothing persisted (Kaspi masks
  // the real customer phone in every order API response we can read, so
  // the seller types the number they already see in Kaspi's own cabinet).
  // See docs/superpowers/specs/2026-08-26-kaspi-orders-review-request-design.md.
  const [reviewModal, setReviewModal] = useState<{ orderCode: string; phone: string; text: string } | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [groupBy, setGroupBy] = useState<'type' | 'date' | null>(null)
  const [cityId, setCityId] = useState('')
  const [cityOptions, setCityOptions] = useState<{ cityId: string; cityName: string }[]>([])
  const [dateMode, setDateMode] = useState<DeliveryDateMode>('all')
  const [exporting, setExporting] = useState(false)
  const [orderCodeInput, setOrderCodeInput] = useState('')
  const [orderCodeSearch, setOrderCodeSearch] = useState('')

  const PAGE_SIZE = 10
  const prevStatus = useRef(status)
  const prevCityId = useRef(cityId)
  const prevOrderCodeSearch = useRef(orderCodeSearch)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => {
    if (loading) return
    loadCityOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  // Debounced so each keystroke doesn't fire a live Kaspi search request --
  // only settles into orderCodeSearch (which triggers the fetch effect
  // below) once the seller pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setOrderCodeSearch(orderCodeInput.trim()), 500)
    return () => clearTimeout(t)
  }, [orderCodeInput])
  useEffect(() => {
    if (loading) return
    // A status, city, or order-code-search switch resets to page 0 -- skip
    // this render's fetch (it'd use the stale page from before the switch)
    // and let the resulting setPage(0) re-trigger this effect with the
    // right value.
    const statusChanged = prevStatus.current !== status
    const cityChanged = prevCityId.current !== cityId
    const orderCodeChanged = prevOrderCodeSearch.current !== orderCodeSearch
    prevStatus.current = status
    prevCityId.current = cityId
    prevOrderCodeSearch.current = orderCodeSearch
    if (statusChanged) {
      setPage(0)
      setDateMode('all')
      loadCounts()
      if (page === 0) loadOrders(status, 0, cityId, orderCodeSearch)
      return
    }
    if (cityChanged || orderCodeChanged) {
      setPage(0)
      if (page === 0) loadOrders(status, 0, cityId, orderCodeSearch)
      return
    }
    loadOrders(status, page, cityId, orderCodeSearch)
    loadCounts()
  }, [status, page, cityId, orderCodeSearch, loading])

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
    if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }
    setLoading(false)
  }

  async function loadCityOptions() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/cities', { headers })
      if (!res.ok) { setCityOptions([]); return }
      const data = await res.json()
      setCityOptions(data.cities || [])
    } catch {
      setCityOptions([])
    }
  }

  async function loadOrders(forStatus: string, forPage: number, forCityId: string = '', forOrderCode: string = '') {
    setOrdersLoading(true)
    setLoadError('')
    setSelected(new Set())
    setPackingConfirmedMessage('')
    try {
      const headers = await authHeader()
      const cityParam = forCityId ? `&cityId=${encodeURIComponent(forCityId)}` : ''
      const orderCodeParam = forOrderCode ? `&orderCode=${encodeURIComponent(forOrderCode)}` : ''
      const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}&page=${forPage}${cityParam}${orderCodeParam}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить заказы'); setOrders([]); setTotal(0); return }
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      if (data.sessionExpired) setSessionExpired(true)
    } catch (e: any) {
      setLoadError('Не удалось загрузить заказы. Проверьте соединение и попробуйте ещё раз.')
      setOrders([])
      setTotal(0)
    } finally {
      setOrdersLoading(false)
    }
  }

  async function loadCounts() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/counters', { headers })
      if (!res.ok) return
      const data = await res.json()
      setCounts(data.counts || {})
      if (data.sessionExpired) setSessionExpired(true)
    } catch {
      // Badge counts are a nice-to-have -- a failure here shouldn't block
      // the order list itself from showing.
    }
  }

  function toggleSelected(code: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  async function printWaybills(format: 'a4' | 'a6') {
    if (selected.size === 0 || printing) return
    setPrinting(format)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/waybills', {
        method: 'POST', headers, body: JSON.stringify({ orderCodes: Array.from(selected), format }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось получить накладные')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nakladnye_${format}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setLoadError('Не удалось получить накладные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setPrinting(null)
    }
  }

  // The real cabinet's «Я упаковал, сформировать накладные» -- накладные
  // don't exist until this fires, and Kaspi moves the order to Передача the
  // instant it succeeds (confirmed live 2026-08-26), so a full reload of
  // both the list and the sidebar-style counts is exactly what's needed.
  async function confirmPackingAction() {
    if (selected.size === 0 || confirmingPacking) return
    setConfirmingPacking(true)
    setLoadError('')
    setPackingConfirmedMessage('')
    try {
      const headers = await authHeader()
      const selectedOrders = orders
        .filter(o => selected.has(o.code))
        .map(o => ({ orderCode: o.code, quantity: o.items.reduce((sum, it) => sum + it.quantity, 0) }))
      const res = await fetch('/api/kaspi-shop/orders/confirm-packing', {
        method: 'POST', headers, body: JSON.stringify({ orders: selectedOrders }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Не удалось подтвердить упаковку')
        return
      }
      await Promise.all([loadOrders(status, page, cityId), loadCounts()])
      setPackingConfirmedMessage('Накладные появятся на вкладке «Передача» в течение 5 минут.')
    } catch {
      setLoadError('Не удалось подтвердить упаковку. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setConfirmingPacking(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const cityParam = cityId ? `&cityId=${encodeURIComponent(cityId)}` : ''
      const res = await fetch(`/api/kaspi-shop/orders/export?status=${encodeURIComponent(status)}${cityParam}`, { headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось выгрузить заказы')
        return
      }
      if (res.headers.get('x-truncated') === 'true') {
        setLoadError('Выгружены первые 500 заказов — список обрезан')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zakazy_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setLoadError('Не удалось выгрузить заказы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setExporting(false)
    }
  }

  const visibleOrders = BULK_SELECTABLE_STATUSES.includes(status) ? filterByDeliveryCutoff(orders, dateMode) : orders

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" value={orderCodeInput} onChange={e => setOrderCodeInput(e.target.value)}
              placeholder="Поиск по номеру заказа"
              className="nav-glass rounded-full px-3 py-1.5 text-xs font-medium outline-none w-44"
              style={{ color: 'var(--nav-text-primary)' }} />
            <select value={cityId} onChange={e => setCityId(e.target.value)}
              className="nav-glass rounded-full px-3 py-1.5 text-xs font-medium" style={{ color: 'var(--nav-text-primary)' }}>
              <option value="">Все города</option>
              {cityOptions.map(c => <option key={c.cityId} value={c.cityId}>{c.cityName}</option>)}
            </select>
            <button onClick={exportExcel} disabled={exporting}
              className="nav-glass text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
              {exporting ? 'Экспорт...' : 'Выгрузить в Excel'}
            </button>
            <div className="relative flex items-center gap-0.5 nav-glass rounded-full p-[3px]">
              {([['type', 'По виду'], ['date', 'По дате']] as const).map(([value, label]) => {
                const active = groupBy === value
                return (
                  <button key={value} onClick={() => setGroupBy(g => g === value ? null : value)}
                    className="relative px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {active && (
                      <motion.span layoutId="groupByPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative" style={{ zIndex: 1 }}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadOrders(status, page, cityId, orderCodeSearch)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {orderCodeSearch && (
          <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
            Поиск по номеру заказа «{orderCodeSearch}» — ищет по всем статусам, вкладка ниже не учитывается
          </div>
        )}

        {/* Order-status filter chips -- used to be a desktop-only nested
            subnav inside KaspiShopSidebar, which left mobile with no way to
            filter by status at all. Now page-local and works at every
            width; the sidebar's own duplicate submenu goes away once that
            component is replaced by SiteNav in a later pass. */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {ORDER_STATUS_TABS.map(tab => {
            const active = status === tab.value
            return (
              <button key={tab.value} onClick={() => router.push(`/kaspi-shop/orders?status=${tab.value}`)}
                className="relative overflow-hidden flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'transparent' : 'var(--nav-surface-glass)' }}>
                {active && (
                  <motion.span layoutId="orderStatusPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{tab.label}{!!counts[tab.value] && ` ${counts[tab.value]}`}</span>
              </button>
            )
          })}
        </div>

        {BULK_SELECTABLE_STATUSES.includes(status) && (
          <div className="flex gap-2 mb-4">
            {([['all', 'Все'], ['tomorrow', 'Завтра до 20:00']] as const).map(([value, label]) => {
              const active = dateMode === value
              return (
                <button key={value} onClick={() => setDateMode(value)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'var(--nav-accent)' : 'var(--nav-surface-glass)' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {status === PACKING_STATUS && selected.size > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selected.size}</span>
            <button onClick={confirmPackingAction} disabled={confirmingPacking}
              className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
              {confirmingPacking ? 'Подтверждаем...' : 'Я упаковал, сформировать накладные'}
            </button>
          </div>
        )}

        {packingConfirmedMessage && (
          <div className="rounded-2xl p-3 mb-4 text-sm" style={{ background: 'var(--nav-success)', color: '#fff' }}>{packingConfirmedMessage}</div>
        )}

        {WAYBILL_PRINTABLE_STATUSES.includes(status) && selected.size > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selected.size}</span>
            <div className="flex gap-2">
              <button onClick={() => printWaybills('a4')} disabled={printing !== null}
                className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing === 'a4' ? 'Готовим PDF...' : 'Скачать накладные в формате А4'}
              </button>
              <button onClick={() => printWaybills('a6')} disabled={printing !== null}
                className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing === 'a6' ? 'Готовим PDF...' : 'Скачать накладные в формате А6'}
              </button>
            </div>
          </div>
        )}

        {ordersLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказы...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              {orders.length > 0 && dateMode === 'tomorrow' ? 'На этой странице нет заказов на завтра до 20:00.' : 'Заказов в этом статусе нет.'}
            </div>
          </div>
        ) : (() => {
          const CARD_GRID = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5'

          function renderCard(o: Order, i: number) {
            const firstItem = o.items[0]
            const extraCount = o.items.length - 1
            const selectable = BULK_SELECTABLE_STATUSES.includes(status)
            return (
              <motion.div key={o.code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.02, 0.2) }}
                onClick={() => selectable && toggleSelected(o.code)}
                className={`relative nav-glass rounded-xl overflow-hidden ${selectable ? `cursor-pointer ${CARD_HOVER}` : ''}`}
                style={selectable && selected.has(o.code) ? { boxShadow: '0 0 0 2px var(--nav-success)' } : undefined}>
                {selectable && (
                  <input type="checkbox" checked={selected.has(o.code)} onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelected(o.code)}
                    className="absolute top-1.5 left-1.5 z-10 accent-[var(--nav-success)] w-3.5 h-3.5" />
                )}
                {firstItem?.imageUrl ? (
                  <img src={firstItem.imageUrl} alt={firstItem.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                ) : (
                  <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                )}
                <div className="p-2">
                  <div className="text-[11px] font-semibold line-clamp-2 min-h-[2em]" style={{ color: 'var(--nav-text-primary)' }}>
                    {firstItem?.name || `Заказ №${o.code}`}
                    {extraCount > 0 && <span style={{ color: 'var(--nav-text-muted)', fontWeight: 400 }}> +{extraCount}</span>}
                  </div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--nav-text-muted)' }}>{o.customerFirstName} {o.customerLastName}</div>
                  <div className="text-[10px] font-mono truncate" style={{ color: 'var(--nav-text-muted)' }}>№{o.code}</div>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <div className="font-mono font-bold text-xs tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{o.totalPrice.toLocaleString('ru-KZ')} ₸</div>
                    <button type="button" aria-label="Подробнее о заказе"
                      onClick={e => { e.stopPropagation(); router.push(`/kaspi-shop/orders/${o.code}`) }}
                      className="flex-shrink-0 rounded-full p-1 transition-colors hover:opacity-70" style={{ color: 'var(--nav-text-muted)' }}>
                      <ChevronRightIcon />
                    </button>
                    <button type="button" aria-label="Запросить отзыв в WhatsApp"
                      onClick={e => {
                        e.stopPropagation()
                        const name = firstItem?.name || `Заказ №${o.code}`
                        setReviewModal({
                          orderCode: o.code,
                          phone: '',
                          text: `Здравствуйте! Спасибо за заказ «${name}» 🙏 Будем очень благодарны, если оставите отзыв на Kaspi — это помогает нам и другим покупателям.`,
                        })
                      }}
                      className="flex-shrink-0 rounded-full p-1 transition-colors hover:opacity-70" style={{ color: 'var(--nav-success)' }}>
                      <WhatsAppIcon />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          }

          if (!groupBy) {
            return <div className={CARD_GRID}>{visibleOrders.map((o, i) => renderCard(o, i))}</div>
          }

          const groups = new Map<string, Order[]>()
          for (const o of visibleOrders) {
            const key = groupBy === 'type'
              ? (o.items[0]?.name || 'Без названия')
              : new Date(o.creationTime).toLocaleDateString('ru-KZ')
            const list = groups.get(key) || []
            list.push(o)
            groups.set(key, list)
          }
          const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
            groupBy === 'date' ? b[1][0].creationTime.localeCompare(a[1][0].creationTime) : b[1].length - a[1].length
          )

          return (
            <div className="space-y-5">
              {sortedGroups.map(([key, groupOrders]) => (
                <div key={key}>
                  <div className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--nav-text-secondary)' }}>
                    {key} <span style={{ color: 'var(--nav-text-muted)', fontWeight: 400 }}>· {groupOrders.length}</span>
                  </div>
                  <div className={CARD_GRID}>{groupOrders.map((o, i) => renderCard(o, i))}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{page * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE + orders.length, total)} из {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Назад</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE + orders.length >= total}
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Дальше</button>
            </div>
          </div>
        )}
      </div>

      {/* «Запросить отзыв» -- pure client-side wa.me deep link, no send on
          our side (see the design doc's header comment above the state
          declaration). Same modal shell as removed/page.tsx's «Цена и
          остатки». */}
      {reviewModal && (() => {
        const normalized = normalizeKzPhone(reviewModal.phone)
        const phoneInvalid = reviewModal.phone.trim().length > 0 && !normalized
        return (
          <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setReviewModal(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="relative nav-glass rounded-[24px] w-full max-w-md max-h-[86vh] overflow-y-auto"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-success), var(--nav-teal))' }} />
              <div className="p-5 lg:p-6">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Запросить отзыв</div>
                  <button onClick={() => setReviewModal(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
                </div>
                <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                  Kaspi скрывает телефон клиента в своём API — введите номер, который видите в кабинете Kaspi. Откроется WhatsApp с готовым текстом, отправляете вы сами.
                </p>

                <label className="block mb-3">
                  <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Телефон клиента</span>
                  <input type="tel" placeholder="+7 707 123 45 67" value={reviewModal.phone}
                    onChange={e => setReviewModal(prev => prev ? { ...prev, phone: e.target.value } : prev)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border"
                    style={{ borderColor: phoneInvalid ? 'var(--nav-critical)' : 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                  {phoneInvalid && (
                    <span className="text-[10px] mt-1 block" style={{ color: 'var(--nav-critical)' }}>Похоже, это не казахстанский номер</span>
                  )}
                </label>

                <label className="block mb-4">
                  <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Текст сообщения</span>
                  <textarea value={reviewModal.text} rows={4}
                    onChange={e => setReviewModal(prev => prev ? { ...prev, text: e.target.value } : prev)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border resize-none"
                    style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                </label>

                <a href={normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(reviewModal.text)}` : undefined}
                  target="_blank" rel="noopener noreferrer"
                  aria-disabled={!normalized}
                  onClick={e => { if (!normalized) e.preventDefault(); else setReviewModal(null) }}
                  className="block text-center w-full rounded-xl py-2.5 text-sm font-semibold"
                  style={{ background: normalized ? 'var(--nav-success)' : 'var(--nav-border-soft)', color: normalized ? '#fff' : 'var(--nav-text-muted)', cursor: normalized ? 'pointer' : 'not-allowed' }}>
                  Открыть WhatsApp
                </a>
              </div>
            </motion.div>
          </div>
        )
      })()}
    </main>
    </DesktopShell>
  )
}

export default function KaspiShopOrders() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <KaspiShopOrdersInner />
    </Suspense>
  )
}
