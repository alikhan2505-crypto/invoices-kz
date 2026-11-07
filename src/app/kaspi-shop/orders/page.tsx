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
import { paginateOrders, partialLoadMessage, almatyDateStamp } from '@/lib/kaspiShop/ordersPaging'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'
import { getActivePlan } from '@/lib/plan'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import KaspiAccessRetry from '@/components/kaspiShop/KaspiAccessRetry'
import { checkKaspiConnection } from '@/lib/kaspiShop/connectionGuard'

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

// Ключ загруженного списка: вкладка + город + поиск.
function ordersKey(status: string, cityId: string, orderCode: string): string {
  return `${status}|${cityId}|${orderCode}`
}

function KaspiShopOrdersInner() {
  // Заголовок вкладки и на время загрузки (PageHeader ещё не отрисован); строка та же, что ставит PageHeader.
  usePageDocumentTitle('Заказы')
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || ORDER_STATUS_TABS[0].value

  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loadedCount, setLoadedCount] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Нейтральное сообщение после действия (выгрузка, накладные): не ошибка, поэтому не в loadError
  // (у того кнопка «Повторить» перезагружает список).
  const [notice, setNotice] = useState('')
  // Список не получен (сбой Kaspi): пустой экран не должен читаться как «заказов нет».
  const [listFailed, setListFailed] = useState(false)
  // Для какой вкладки/города/поиска загружен список orders. Пока он не совпал с текущими,
  // список на экране чужой: его не показываем и по нему не действуем (аудит K1/K2).
  const [loadedKey, setLoadedKey] = useState('')
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

  // Kaspi hard-caps a single list request at 10 orders (confirmed in
  // cabinetApi.ts -- requesting 50 is rejected outright), so "show
  // everything, no pagination" means fetching pages 0..N ourselves and
  // concatenating them client-side rather than asking Kaspi for more per
  // page. Capped like exportExcel's own 500-order cap: a status with more
  // than that is not what this list view is for.
  const PAGE_SIZE = 10
  const LOAD_ALL_CAP = 500
  const prevStatus = useRef(status)
  // Счётчик запусков loadOrders: ответ медленного прежнего запуска (например «Архив» на
  // 50 запросов), пришедший после переключения вкладки, не имеет права затереть список
  // новой вкладки и погасить её индикатор загрузки (аудит K1).
  const reqId = useRef(0)

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
    if (prevStatus.current !== status) { prevStatus.current = status; setDateMode('all') }
    loadOrders(status, cityId, orderCodeSearch)
    loadCounts()
  }, [status, cityId, orderCodeSearch, loading])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/upgrade'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    // Сбой запроса не равен «не подключён»: показываем «Повторить», а не уводим
    // подключённого продавца на окно подключения (аудит Kaspi 2026-11-06, K12).
    const access = await checkKaspiConnection(session?.access_token)
    if (access.kind === 'error') { setAccessError(access.message); return }
    if (access.kind === 'redirect') { router.push('/kaspi-shop'); return }
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

  // Fetches every page for forStatus/forCityId/forOrderCode and concatenates
  // them into one list -- sequential, not Promise.all, because this hits
  // Kaspi's own cabinet API, which the codebase has already found picky
  // about request shape/rate under load (see PAGE_SIZE's own size:50
  // rejection). setLoadedCount along the way so the loading state can show
  // progress instead of sitting on "Загружаем заказы..." for however long a
  // few dozen sequential requests take.
  async function loadOrders(forStatus: string, forCityId: string = '', forOrderCode: string = '') {
    const id = ++reqId.current
    const isStale = () => id !== reqId.current
    const key = ordersKey(forStatus, forCityId, forOrderCode)
    setOrdersLoading(true)
    setLoadError('')
    setListFailed(false)
    setNotice('')
    setSelected(new Set())
    setPackingConfirmedMessage('')
    setLoadedCount(0)
    try {
      const headers = await authHeader()
      const cityParam = forCityId ? `&cityId=${encodeURIComponent(forCityId)}` : ''
      const orderCodeParam = forOrderCode ? `&orderCode=${encodeURIComponent(forOrderCode)}` : ''
      const outcome = await paginateOrders<Order>({
        pageSize: PAGE_SIZE,
        cap: LOAD_ALL_CAP,
        shouldStop: isStale,
        onProgress: n => { if (!isStale()) setLoadedCount(n) },
        fetchPage: async p => {
          const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}&page=${p}${cityParam}${orderCodeParam}`, { headers })
          const data = await res.json().catch(() => ({}))
          // Сбой приходит как 502 с текстом (и sessionExpired) -- это не «пустая страница».
          if (!res.ok) return { orders: [], total: 0, failed: true, sessionExpired: !!data.sessionExpired, error: data.error || 'Не удалось загрузить заказы' }
          return { orders: (data.orders || []) as Order[], total: Number(data.total) || 0, sessionExpired: !!data.sessionExpired }
        },
      })
      if (outcome.aborted || isStale()) return
      setLoadedKey(key)
      if (outcome.sessionExpired) {
        setSessionExpired(true)
        setOrders([]); setTotal(0)
        setListFailed(true)
        setLoadError(outcome.error || 'Сессия Kaspi истекла — переподключите магазин')
        return
      }
      if (outcome.failed) {
        // Не затираем total нулём и не выдаём набранное за полный список.
        setOrders(outcome.orders)
        setListFailed(outcome.orders.length === 0)
        setTotal(outcome.orders.length > 0 ? outcome.total : 0)
        setLoadError(outcome.orders.length > 0
          ? partialLoadMessage(outcome.orders.length, outcome.total, true)
          : (outcome.error || 'Не удалось загрузить заказы'))
        return
      }
      setOrders(outcome.orders)
      setTotal(outcome.total)
      if (outcome.capped) setLoadError(`Показаны первые ${LOAD_ALL_CAP} заказов из ${outcome.total} — сузьте фильтром по городу или поиском по номеру`)
      else if (!outcome.complete) setLoadError(partialLoadMessage(outcome.orders.length, outcome.total, false) + ', повторите')
    } catch (e: any) {
      if (isStale()) return
      setLoadedKey(key)
      setListFailed(true)
      setLoadError('Не удалось загрузить заказы. Проверьте соединение и попробуйте ещё раз.')
      setOrders([])
      setTotal(0)
    } finally {
      if (!isStale()) setOrdersLoading(false)
    }
  }

  async function loadCounts() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/counters', { headers })
      const data = await res.json().catch(() => null)
      if (data?.sessionExpired) setSessionExpired(true)
      // Сбой (502) оставляет прежние числа на вкладках, а не обнуляет их.
      if (!res.ok || !data?.counts) return
      setCounts(data.counts)
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

  function deselectAll() {
    setSelected(new Set())
  }

  // Every order for the current status/filters is already in `orders` --
  // loadOrders fetches all of it up front, not just one 10-item page -- so
  // "select all" is just selecting what's already on screen, no extra
  // network round-trip needed.
  function selectAllVisible() {
    setSelected(new Set(visibleOrders.map(o => o.code)))
  }

  // Переключение «Все» / «Завтра до 20:00» меняет, какие карточки видны, поэтому выбор
  // сбрасывается: иначе действия уходили бы по скрытым заказам (аудит K2).
  function changeDateMode(mode: DeliveryDateMode) {
    setDateMode(mode)
    setSelected(new Set())
  }

  async function printWaybills(format: 'a4' | 'a6') {
    if (selectedVisibleCodes.length === 0 || printing) return
    setPrinting(format)
    setLoadError('')
    setNotice('')
    try {
      const headers = await authHeader()
      // Только то, что выбрано И видно сейчас (то же число, что в счётчике над кнопками).
      const res = await fetch('/api/kaspi-shop/orders/waybills', {
        method: 'POST', headers, body: JSON.stringify({ orderCodes: selectedVisibleCodes, format }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.sessionExpired) setSessionExpired(true)
        setLoadError(data.error || 'Не удалось получить накладные')
        return
      }
      const missingHeader = res.headers.get('x-missing-orders')
      if (missingHeader) {
        const missing = missingHeader.split(',').filter(Boolean)
        setNotice(`Скачаны накладные для ${selectedVisibleCodes.length - missing.length} из ${selectedVisibleCodes.length} заказов. Для остальных накладной ещё нет (появится в течение 5 минут): ${missing.join(', ')}.`)
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
    if (selectedVisibleOrders.length === 0 || confirmingPacking) return
    setConfirmingPacking(true)
    setLoadError('')
    setNotice('')
    setPackingConfirmedMessage('')
    try {
      const headers = await authHeader()
      // Отправляем только выбранные И видимые заказы: ровно то, что показывает счётчик «Выбрано».
      const selectedOrders = selectedVisibleOrders
        .map(o => ({ orderCode: o.code, quantity: o.items.reduce((sum, it) => sum + it.quantity, 0) }))
      if (selectedOrders.some(o => o.quantity < 1)) {
        setLoadError('У одного из выбранных заказов нет позиций, подтвердить упаковку нельзя. Снимите его с выбора.')
        return
      }
      const res = await fetch('/api/kaspi-shop/orders/confirm-packing', {
        method: 'POST', headers, body: JSON.stringify({ orders: selectedOrders }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.sessionExpired) setSessionExpired(true)
        setLoadError(data.error || 'Не удалось подтвердить упаковку')
        return
      }
      await Promise.all([loadOrders(status, cityId, orderCodeSearch), loadCounts()])
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
    setNotice('')
    try {
      const headers = await authHeader()
      const cityParam = cityId ? `&cityId=${encodeURIComponent(cityId)}` : ''
      const res = await fetch(`/api/kaspi-shop/orders/export?status=${encodeURIComponent(status)}${cityParam}`, { headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.sessionExpired) setSessionExpired(true)
        setLoadError(data.error || 'Не удалось выгрузить заказы')
        return
      }
      // Точное число строк в файле: «выгружено N» без «возможно обрезано» вслепую.
      const exportedCount = Number(res.headers.get('x-exported-count'))
      const totalCount = Number(res.headers.get('x-total-count'))
      if (Number.isFinite(exportedCount) && res.headers.get('x-exported-count') !== null) {
        if (res.headers.get('x-truncated') === 'true') {
          setLoadError(`Выгружено ${exportedCount} из ${totalCount} заказов — файл неполный (лимит 500 заказов или Kaspi прервал ответ), повторите`)
        } else {
          setNotice(`Выгружено заказов: ${exportedCount}`)
        }
      } else if (res.headers.get('x-truncated') === 'true') {
        setLoadError('Выгрузка неполная — повторите')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zakazy_${status}_${almatyDateStamp()}.xlsx`
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

  const currentKey = ordersKey(status, cityId, orderCodeSearch)
  // Список принадлежит текущей вкладке только когда ключи совпали; до этого (кадр между
  // сменой вкладки и стартом загрузки) он чужой и не показывается.
  const listIsCurrent = loadedKey === currentKey
  const visibleOrders = !listIsCurrent ? [] : (BULK_SELECTABLE_STATUSES.includes(status) ? filterByDeliveryCutoff(orders, dateMode) : orders)
  // Массовые действия только по выбранным И видимым заказам; счётчик показывает их же число.
  const selectedVisibleOrders = visibleOrders.filter(o => selected.has(o.code))
  const selectedVisibleCodes = selectedVisibleOrders.map(o => o.code)
  // В режиме поиска по номеру карточки из любых статусов: выбор и массовые кнопки выключены.
  const bulkEnabled = BULK_SELECTABLE_STATUSES.includes(status) && !orderCodeSearch
  const listPending = ordersLoading || !listIsCurrent

  if (loading) {
    return accessError
      ? <KaspiAccessRetry message={accessError} onRetry={() => { setAccessError(''); checkAccess() }} />
      : <LoadingSpinner />
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
        <PageHeader title="Заказы" />
        {sessionExpired && <SessionExpiredBanner />}

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" value={orderCodeInput} onChange={e => setOrderCodeInput(e.target.value)}
              placeholder="Поиск по номеру заказа"
              className="nav-glass rounded-full px-3 py-1.5 max-sm:min-h-10 text-xs font-medium outline-none w-44"
              style={{ color: 'var(--nav-text-primary)' }} />
            <select value={cityId} onChange={e => setCityId(e.target.value)}
              className="nav-glass rounded-full px-3 py-1.5 max-sm:min-h-10 text-xs font-medium" style={{ color: 'var(--nav-text-primary)' }}>
              <option value="">Все города</option>
              {cityOptions.map(c => <option key={c.cityId} value={c.cityId}>{c.cityName}</option>)}
            </select>
            <button onClick={exportExcel} disabled={exporting}
              className="nav-glass text-xs font-semibold rounded-full px-3 py-1.5 max-sm:min-h-10 disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
              {exporting ? 'Экспорт...' : 'Выгрузить в Excel'}
            </button>
            <div className="relative flex items-center gap-0.5 nav-glass rounded-full p-[3px]">
              {([['type', 'По виду'], ['date', 'По дате']] as const).map(([value, label]) => {
                const active = groupBy === value
                return (
                  <button key={value} onClick={() => setGroupBy(g => g === value ? null : value)}
                    className="relative px-3 py-1.5 max-sm:min-h-10 rounded-full text-xs font-medium transition-colors"
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
            <button onClick={() => loadOrders(status, cityId, orderCodeSearch)} className="text-xs font-semibold rounded-lg px-3 py-1.5 max-sm:min-h-10 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {notice && (
          <div className="nav-glass rounded-2xl p-3 mb-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{notice}</div>
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
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 hide-scrollbar tabs-scroll-fade">
          {ORDER_STATUS_TABS.map(tab => {
            const active = status === tab.value
            return (
              <button key={tab.value} onClick={() => router.push(`/kaspi-shop/orders?status=${tab.value}`)}
                className="relative overflow-hidden flex-shrink-0 rounded-full px-3 py-1.5 max-sm:min-h-10 text-xs font-semibold whitespace-nowrap transition-colors"
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

        {bulkEnabled && (
          <div className="flex gap-2 mb-4">
            {([['all', 'Все'], ['tomorrow', 'Завтра до 20:00']] as const).map(([value, label]) => {
              const active = dateMode === value
              return (
                <button key={value} onClick={() => changeDateMode(value)}
                  className="rounded-full px-3 py-1.5 max-sm:min-h-10 text-xs font-semibold transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'var(--nav-accent)' : 'var(--nav-surface-glass)' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {bulkEnabled && !listPending && visibleOrders.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <button onClick={selectAllVisible}
              className="nav-glass text-xs font-semibold rounded-full px-3 py-1.5 max-sm:min-h-10" style={{ color: 'var(--nav-text-primary)' }}>
              {/* Число = сколько реально выберется (видимые карточки); при неполной загрузке говорим об этом. */}
              {orders.length < total ? `Выбрать загруженные (${visibleOrders.length} из ${total})` : `Выбрать все (${visibleOrders.length})`}
            </button>
            {selectedVisibleOrders.length > 0 && (
              <button onClick={deselectAll}
                className="nav-glass text-xs font-semibold rounded-full px-3 py-1.5 max-sm:min-h-10" style={{ color: 'var(--nav-text-secondary)' }}>
                Снять выбор
              </button>
            )}
          </div>
        )}

        {bulkEnabled && status === PACKING_STATUS && selectedVisibleOrders.length > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selectedVisibleOrders.length}</span>
            <button onClick={confirmPackingAction} disabled={confirmingPacking}
              className="text-xs font-medium rounded-lg px-3 py-2 max-sm:min-h-10 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
              {confirmingPacking ? 'Подтверждаем...' : 'Я упаковал, сформировать накладные'}
            </button>
          </div>
        )}

        {packingConfirmedMessage && (
          <div className="rounded-2xl p-3 mb-4 text-sm" style={{ background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }}>{packingConfirmedMessage}</div>
        )}

        {bulkEnabled && WAYBILL_PRINTABLE_STATUSES.includes(status) && selectedVisibleOrders.length > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selectedVisibleOrders.length}</span>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => printWaybills('a4')} disabled={printing !== null}
                className="text-xs font-medium rounded-lg px-3 py-2 max-sm:min-h-10 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing === 'a4' ? 'Готовим PDF...' : <><span className="sm:hidden">Накладные А4</span><span className="hidden sm:inline">Скачать накладные в формате А4</span></>}
              </button>
              <button onClick={() => printWaybills('a6')} disabled={printing !== null}
                className="text-xs font-medium rounded-lg px-3 py-2 max-sm:min-h-10 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing === 'a6' ? 'Готовим PDF...' : <><span className="sm:hidden">Накладные А6</span><span className="hidden sm:inline">Скачать накладные в формате А6</span></>}
              </button>
            </div>
          </div>
        )}

        {listPending ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
            {loadedCount > PAGE_SIZE ? `Загружаем заказы... (${loadedCount})` : 'Загружаем заказы...'}
          </div>
        ) : visibleOrders.length === 0 ? (
          // При сбое загрузки пустой список -- не «заказов нет»: причину уже показывает красная плашка выше.
          listFailed ? null : (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              {orders.length > 0 && dateMode === 'tomorrow' ? 'Среди загруженных заказов нет заказов на завтра до 20:00.' : 'Заказов в этом статусе нет.'}
            </div>
          </div>
          )
        ) : (() => {
          const CARD_GRID = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 min-[2000px]:grid-cols-10 gap-2.5'

          function renderCard(o: Order, i: number) {
            const firstItem = o.items[0]
            const extraCount = o.items.length - 1
            const selectable = bulkEnabled
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
                      className="flex-shrink-0 rounded-full p-2 -m-1.5 transition-colors hover:opacity-70" style={{ color: 'var(--nav-text-muted)' }}>
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
                      className="flex-shrink-0 rounded-full p-2 -m-1.5 transition-colors hover:opacity-70" style={{ color: 'var(--nav-success)' }}>
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

        {listIsCurrent && !listPending && orders.length < total && (
          <div className="mt-4 text-xs" style={{ color: 'var(--nav-text-muted)' }}>Показаны первые {orders.length} из {total}</div>
        )}
      </PageContainer>

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
              className="relative nav-glass rounded-[24px] w-full max-w-md max-h-[86dvh] overflow-y-auto"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-success), var(--nav-teal))' }} />
              <div className="p-5 lg:p-6">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Запросить отзыв</div>
                  <button onClick={() => setReviewModal(null)} aria-label="Закрыть" className="text-lg leading-none flex-shrink-0 p-2 -m-2" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
                </div>
                <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                  Kaspi скрывает телефон клиента в своём API — введите номер, который видите в кабинете Kaspi. Откроется WhatsApp с готовым текстом, отправляете вы сами.
                </p>

                <label className="block mb-3">
                  <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Телефон клиента</span>
                  <input type="tel" inputMode="tel" autoComplete="off" placeholder="+7 707 123 45 67" value={reviewModal.phone}
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
                  style={{ background: normalized ? 'var(--nav-success-solid)' : 'var(--nav-border-soft)', color: normalized ? 'var(--nav-success-ink)' : 'var(--nav-text-muted)', cursor: normalized ? 'pointer' : 'not-allowed' }}>
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
