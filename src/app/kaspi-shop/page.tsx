'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { formatKzPhone } from '@/lib/kzPhone'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { KASPI_SHOP_CONNECTIONS_CHANGED_EVENT } from '@/components/KaspiShopStoreSwitcher'
import KaspiTour from './KaspiTour'
import { getActivePlan } from '@/lib/plan'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { useCrossHref } from '@/lib/useCrossHref'
import { useAppDialog } from '@/components/AppDialog'
import { connectErrorMessage, connectUiText } from '@/lib/kaspiShop/connectMessages'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader from '@/components/PageHeader'
import PageContainer, { PROSE_WIDE_CLS } from '@/components/PageContainer'
import {
  DEFAULT_CHECK_FREQUENCY_MINUTES, PRICE_CHANGE_TENGE, PRICE_MODEL_NOTE, apiErrorMessage, applyNowBlockReason, applyNowSuccessText,
  catalogSyncShouldReload, effectiveCheckPeriodMinutes, floorFarConfirmText, formatTenge, isActiveProduct, isFloorFarResponse, lowBalanceWarning, periodLabel,
  pluralProducts, suggestionBlockReason, summarizeSchedule, validateBulkSettings, validateProductSettings,
} from '@/lib/kaspiShop/dempingForm'
import { FLOOR_LOW_SHARE } from '@/lib/kaspiShop/productSettings'

type Product = {
  id: string
  kaspi_sku: string
  kaspi_master_sku: string | null
  point_city_codes: string[] | null
  product_name: string
  brand: string
  store_id: string
  stock_count: number
  own_current_price: number
  floor_price: number
  max_price: number | null
  // Себестоимость из раздела «Прибыль»: нужна ИИ-подбору цены.
  cogs_amount?: number | null
  undercut_step: number
  check_frequency_minutes: number
  enabled: boolean
  // false = снят с продажи на Kaspi: бот такой товар не проверяет и денег не берёт.
  // Пусто у старых строк = в продаже.
  available_for_sale?: boolean | null
  last_checked_at: string | null
  last_competitor_price: number | null
  demping_strategy: string
  excluded_city_codes: string[]
  excluded_merchant_ids: string[]
  market_position: number | null
  market_offer_count: number | null
  competitor_snapshot: { merchantName: string | null; price: number; merchantId?: string }[] | null
}

// Multi-line native tooltip text for the "Конкурент" price -- who, at what
// price, from the same snapshot the price decision itself used (leader
// city's offers, own merchant already excluded).
function competitorTooltip(snapshot: Product['competitor_snapshot']): string | undefined {
  if (!snapshot || snapshot.length === 0) return undefined
  return snapshot
    .map(o => `${o.merchantName || 'Продавец'} — ${o.price.toLocaleString('ru-KZ')} ₸${o.merchantId ? ` (ID ${o.merchantId})` : ''}`)
    .join('\n')
}

type EditValues = { floorPrice: string; maxPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string; stockCount: string }

// Форма настроек товара из сохранённого товара. Вызывается при каждом открытии
// панели и после успешного сохранения: раньше форма заполнялась один раз, и
// несохранённые правки показывались при повторном открытии как будто сохранённые.
function editFromProduct(p: Product): EditValues {
  return {
    floorPrice: String(p.floor_price),
    maxPrice: p.max_price !== null ? String(p.max_price) : '',
    undercutStep: String(p.undercut_step),
    strategy: p.demping_strategy || 'undercut_leader',
    excludedCities: (p.excluded_city_codes || []).join(', '),
    excludedMerchants: (p.excluded_merchant_ids || []).join(', '),
    stockCount: String(p.stock_count ?? 0),
  }
}

type OtherStore = { id: string; companyName: string }

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
function PriceLadder({ own, competitor, floor, maxPrice, enabled }: { own: number; competitor: number | null; floor: number; maxPrice: number | null; enabled: boolean }) {
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
        {atFloor && (enabled
          ? <span className="font-semibold" style={{ color: 'var(--nav-critical)' }}>Упёрлись в минимум</span>
          // Товар ещё не включён: минимум просто равен цене с момента импорта. Это не тревога, а «не настроено».
          : <span>Минимум не задан</span>)}
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

// Шаг подключения магазина: кнопка никогда не остаётся навсегда на
// «Проверяем...». Сеть упала, сервер вернул не-JSON или ответ не пришёл за
// 2 минуты -- показываем понятную ошибку вместо вечного ожидания.
async function postConnectStep(url: string, headers: HeadersInit, body: unknown): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) })
    const data = await res.json().catch(() => ({}))
    // 401 приходит с английским «Unauthorized»: человеку нужна понятная фраза и путь (обновить страницу).
    const error = res.ok ? undefined : res.status === 401 ? 'Вход устарел. Обновите страницу и войдите заново.' : data.error
    return { ok: res.ok, status: res.status, data, error }
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return {
      ok: false,
      status: 0,
      data: {},
      error: timedOut
        ? 'Kaspi долго не отвечает. Обновите страницу -- если магазин уже подключился, он появится сам.'
        : 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    }
  }
}

// Кнопка «Позже» в окне подключения (17.10.2026). Окно закрывает всю страницу,
// а на телефоне ещё и перекрывало верхнюю панель с меню -- человек без магазина
// не мог ни открыть меню, ни уйти. Остальной текст этой страницы пока русский.
const LATER_TEXT: Record<Lang, string> = { ru: 'Позже', kk: 'Кейінірек', en: 'Later' }

export default function KaspiShop() {
  // Окно подключения закрывает страницу без PageHeader, поэтому заголовок вкладки ставим и здесь (строка та же, что у PageHeader).
  usePageDocumentTitle('Демпинг')
  const router = useRouter()
  const { lang } = useLanguage()
  const crossHref = useCrossHref()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  // Shadows window.alert / window.confirm for this component -- see
  // src/components/AppDialog.tsx. Every confirm below is awaited: a Promise
  // is truthy, so `if (confirm(...))` would silently pass.
  const { alert, confirm, dialogElement } = useAppDialog()
  // Opened from the store switcher's "+ Добавить магазин" (?addStore=1) --
  // reuses the same connect flow as the mandatory first-connect dialog, just
  // dismissible since the user already has at least one working store.
  const [addingStore, setAddingStore] = useState(false)
  const [loadError, setLoadError] = useState('')
  // true только после УСПЕШНОГО ответа /wallet. Пока он false, «не подключён»
  // не выводим: упавший запрос не должен показывать подключённому продавцу
  // обязательное окно «Подключите Kaspi Магазин» (аудит Kaspi 2026-11-06, K12).
  const [connectionKnown, setConnectionKnown] = useState(false)
  // Список товаров реально пришёл (пустой список после сбоя не равен «товаров нет»).
  const [productsLoaded, setProductsLoaded] = useState(false)
  // Другие магазины пользователя: из окна переподключения можно уйти в них.
  const [otherStores, setOtherStores] = useState<OtherStore[]>([])
  const [reconnectDismissed, setReconnectDismissed] = useState(false)
  // «+ Добавить магазин» при истёкшей сессии активного: это новый магазин, а не переподключение.
  const [addingNew, setAddingNew] = useState(false)
  const [switchError, setSwitchError] = useState('')
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
  // После подключения: что-то загрузилось не целиком (иначе первый экран молча показывает неполный список).
  const [connectNotice, setConnectNotice] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  // Kaspi уже принял одноразовый код из SMS, но дальнейший шаг не удался
  // (сеть). Сервер вернул resumeToken: «Повторить» шлёт его БЕЗ кода.
  const [resumeToken, setResumeToken] = useState<string | null>(null)
  // Короткая техническая причина (ECONNRESET, TIMEOUT...) мелким серым шрифтом.
  const [connectErrorDetail, setConnectErrorDetail] = useState('')
  // Защита от двойного нажатия: state обновляется асинхронно, ref -- сразу.
  const connectInFlight = useRef(false)
  const [merchantChoices, setMerchantChoices] = useState<{ id: string; name: string }[] | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupError, setTopupError] = useState('')
  const [topupPending, setTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)
  const [walletOpen, setWalletOpen] = useState(false)
  // Audit finding (2026-09-02): GET /api/kaspi-shop/wallet/history already
  // existed (own product-scoped debits, deliberately excludes topups -- see
  // that route) but no page ever called it -- a seller could top up and see
  // the balance move but never see what it was spent on. Loaded once per
  // modal open rather than on page load, since it's only relevant here.
  const [walletHistory, setWalletHistory] = useState<{ label: string; amount: number; createdAt: string }[] | null>(null)

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
  const [bulkFrequency, setBulkFrequency] = useState(String(DEFAULT_CHECK_FREQUENCY_MINUTES))
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const [suggestingFor, setSuggestingFor] = useState<string | null>(null)
  const [suggestError, setSuggestError] = useState('')
  const [suggestion, setSuggestion] = useState<{ id: string; floorPrice: number; undercutStep: number; reasoning: string } | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  // «Включить демпинг для этого товара после сохранения»: по умолчанию да для товара на паузе.
  const [enableOnSave, setEnableOnSave] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [editValues, setEditValues] = useState<Record<string, EditValues>>({})
  // Открытая панель настроек: load() не должен затирать правки, которые человек
  // сейчас вводит, поэтому читает id отсюда, а не из замыкания.
  const expandedIdRef = useRef<string | null>(null)
  useEffect(() => { expandedIdRef.current = expandedId }, [expandedId])
  // Таймеры опроса после «Применить сейчас»; снимаем при уходе со страницы.
  const applyTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { applyTimers.current.forEach(clearTimeout) }, [])
  const [trackedCities, setTrackedCities] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<{ code: string; name: string }[]>([])
  const [citiesSaving, setCitiesSaving] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    // Deps on searchParams (not []): KaspiShopStoreSwitcher's "+ Добавить
    // магазин" does a client-side router.push('/kaspi-shop?addStore=1')
    // from an already-mounted /kaspi-shop -- a mount-only effect here missed
    // that navigation entirely (real bug found 2026-09-03: the button did
    // nothing when clicked from Демпинг itself, only worked when arriving
    // fresh from another page).
    const addStore = searchParams.get('addStore')
    if (addStore === '1' || addStore === 'new') {
      setAddingStore(true)
      // '1' при истёкшей сессии активного магазина = «переподключить»;
      // 'new' = добавить другой магазин (переключатель при истёкшем активном).
      setAddingNew(addStore === 'new')
      setReconnectDismissed(false)
      window.history.replaceState(null, '', '/kaspi-shop')
    }
  }, [searchParams])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    if (!walletOpen) return
    async function loadHistory() {
      try {
        const headers = await authHeader()
        const res = await fetch('/api/kaspi-shop/wallet/history', { headers })
        if (res.ok) {
          const data = await res.json()
          setWalletHistory(Array.isArray(data.entries) ? data.entries : [])
        }
      } catch { /* modal just keeps the amount picker, no history list */ }
    }
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletOpen])

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

  async function load(opts: { refreshEdit?: string } = {}) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/upgrade'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const [productsRes, walletRes, cities, connectionsRes] = await Promise.all([
        fetch('/api/kaspi-shop/products', { headers }),
        fetch('/api/kaspi-shop/wallet', { headers }),
        // Города и список магазинов вторичны: их сбой не должен ронять страницу.
        fetchAvailableCities(headers).catch(() => null),
        fetch('/api/kaspi-shop/connections', { headers }).catch(() => null),
      ])
      // Любой не-ok ответ - это ошибка загрузки с кнопкой «Повторить», а не
      // «магазин не подключён» и не «товаров нет».
      let failure = ''
      if (productsRes.ok) {
        const data = await productsRes.json()
        const list: Product[] = data.products || []
        setProducts(list)
        setProductsLoaded(true)
        setStats(data.stats || null)
        setEditValues(prev => {
          const next = { ...prev }
          for (const p of list) {
            // Новые товары заполняем всегда; открытую панель не трогаем (там
            // идёт ввод), кроме товара, который только что сохранили.
            if (!next[p.id] || p.id === opts.refreshEdit || p.id !== expandedIdRef.current) next[p.id] = editFromProduct(p)
          }
          return next
        })
      } else {
        const data = await productsRes.json().catch(() => ({}))
        failure = apiErrorMessage(productsRes.status, data, 'Не удалось загрузить товары. Попробуйте ещё раз.')
      }
      if (walletRes.ok) {
        const data = await walletRes.json()
        setBalance(data.balance ?? 0)
        setConnected(!!data.connected)
        setConnectionKnown(true)
        setPaused(!!data.paused)
        setSessionStatus(data.sessionStatus ?? null)
        setCompanyName(data.companyName ?? null)
        setTrackedCities(data.trackedCityCodes || [])
      } else {
        const data = await walletRes.json().catch(() => ({}))
        failure = failure || apiErrorMessage(walletRes.status, data, 'Не удалось загрузить баланс и подключение. Попробуйте ещё раз.')
      }
      if (connectionsRes && connectionsRes.ok) {
        const data = await connectionsRes.json().catch(() => null)
        const list: { id: string; companyName: string; isActive: boolean }[] = Array.isArray(data?.connections) ? data.connections : []
        setOtherStores(list.filter(c => !c.isActive).map(c => ({ id: c.id, companyName: c.companyName })))
      }
      if (cities) setAvailableCities(cities)
      if (failure) setLoadError(failure)
    } catch (e: any) {
      console.error('Kaspi Shop load error:', e.message)
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  // «Повторить» в плашке ошибки: показываем загрузку, чтобы нажатие было заметно.
  async function retryLoad() {
    setLoading(true)
    await load()
  }

  // Сессия кабинета истекла: до того как просить телефон и код из SMS, один раз тихо
  // пробуем получить новую по сохранённому единому входу Kaspi (10.11.2026, см.
  // /api/kaspi-shop/session/refresh). Получилось -- страница сама оживает, SMS не нужен.
  // Не вышло -- ничего не меняется: обычное окно подключения. Раз на магазин за открытие
  // страницы; сервер дополнительно не пускает чаще раза в минуту.
  const silentRefreshKey = useRef<string | null>(null)
  const [silentTrying, setSilentTrying] = useState(false)
  useEffect(() => {
    if (!connectionKnown || !connected || sessionStatus !== 'session_expired' || addingNew) return
    const key = companyName || 'store'
    if (silentRefreshKey.current === key) return
    silentRefreshKey.current = key
    setSilentTrying(true)
    ;(async () => {
      try {
        const headers = await authHeader()
        const res = await fetch('/api/kaspi-shop/session/refresh', { method: 'POST', headers })
        const data = await res.json().catch(() => null)
        if (res.ok && (data?.status === 'refreshed' || data?.status === 'busy')) {
          window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
          await load()
        }
      } catch {
        // сеть или сервер: остаётся обычный вход по SMS
      } finally {
        setSilentTrying(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionKnown, connected, sessionStatus, addingNew, companyName])

  async function startConnect() {
    if (!phone) return
    if (connectInFlight.current) return
    connectInFlight.current = true
    setConnecting(true)
    setConnectError('')
    setConnectErrorDetail('')
    try {
      const headers = await authHeader()
      const r = await postConnectStep('/api/kaspi-shop/connect', headers, { phone })
      if (!r.ok) {
        const localized = connectErrorMessage(lang, r.data?.code, { step: 'phone', resumable: false, scope: r.data?.scope, retryAfterSec: r.data?.retryAfterSec })
        setConnectError(localized || r.error || 'Не удалось подключиться')
        setConnectErrorDetail(typeof r.data?.detail === 'string' ? r.data.detail : '')
        return
      }
      setOtpToken(r.data.otpToken)
    } finally {
      connectInFlight.current = false
      setConnecting(false)
    }
  }

  // Обычный путь: otpToken + код из SMS. После сбоя сети УЖЕ ПОСЛЕ принятия
  // кода (resumeToken) -- «Повторить»: тот же эндпоинт, но с resumeToken и без
  // кода, одноразовый код повторно не отправляется.
  async function completeConnect() {
    const resuming = !!resumeToken
    if (connectInFlight.current) return
    if (!resuming && (!otpToken || !otpCode)) return
    connectInFlight.current = true
    setConnecting(true)
    setConnectError('')
    setConnectErrorDetail('')
    let r: Awaited<ReturnType<typeof postConnectStep>>
    try {
      const headers = await authHeader()
      // Reconnecting an expired session already knows which store it's for --
      // tells the API to auto-pick the already-connected merchant instead of
      // showing the same picker used for genuinely adding a new store.
      const isReconnect = connected && sessionStatus === 'session_expired' && !addingNew
      r = await postConnectStep(
        '/api/kaspi-shop/connect/otp',
        headers,
        resuming ? { otpToken: resumeToken, isReconnect } : { otpToken, code: otpCode, isReconnect },
      )
    } finally {
      connectInFlight.current = false
      setConnecting(false)
    }
    if (!r.ok) {
      // Код уже принят Kaspi, поэтому при повторе токен сохраняется при ЛЮБОМ
      // сбое, кроме окончательного ответа (токен недействителен, переход
      // на чужой адрес, на номере нет магазинов -- 400 без resumeToken).
      // Сетевой сбой, 401/403, 5xx и не-JSON от Vercel -- не окончательные:
      // иначе человек вернулся бы к форме с уже потраченным кодом.
      const fresh = typeof r.data?.resumeToken === 'string' && r.data.resumeToken ? r.data.resumeToken : null
      const terminal = r.data?.code === 'invalid_token' || r.data?.code === 'redirect_off_site' ||
        (r.status === 400 && r.data?.resumable !== true)
      const nextResume = fresh || (resuming && !terminal ? resumeToken : null)
      setResumeToken(nextResume)
      if (resuming && !nextResume) setOtpCode('') // потраченный код не подставляем
      if (r.data?.code === 'otp_rejected') setOtpCode('') // неверный код стираем: человек вводит новый
      const localized = connectErrorMessage(lang, r.data?.code, { step: 'otp', resumable: !!nextResume })
      // Сохранённый токен + ответ без нашего кода (401/403/5xx/не-JSON): сырой
      // «Unauthorized» не показываем -- человеку нужно одно: нажать «Повторить».
      const keptMsg = nextResume && !fresh && r.status > 0
        ? connectErrorMessage(lang, 'kaspi_unreachable', { step: 'otp', resumable: true })
        : null
      setConnectError(localized || keptMsg || r.error || 'Не удалось подтвердить код')
      setConnectErrorDetail(typeof r.data?.detail === 'string' ? r.data.detail : '')
      return
    }
    const data = r.data
    setOtpToken(null)
    setResumeToken(null)
    setOtpCode('')
    if (data.status === 'merchant_required') {
      setSessionToken(data.sessionToken)
      setMerchantChoices(data.merchants)
      return
    }
    setConnected(true)
    setAddingStore(false)
    setAddingNew(false)
    if (data.importComplete === false) setConnectNotice(`Магазин подключён, но товары загрузились не полностью${typeof data.importedProducts === 'number' ? ` (загружено ${data.importedProducts})` : ''}. Нажмите «Обновить каталог»: остальные подтянутся.`)
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    load()
  }

  async function selectMerchant(merchantId: string) {
    if (!sessionToken) return
    setConnecting(true)
    setConnectError('')
    const headers = await authHeader()
    const r = await postConnectStep('/api/kaspi-shop/connect/select-merchant', headers, { sessionToken, merchantId })
    setConnecting(false)
    if (!r.ok) { setConnectError(r.error || 'Не удалось подключить магазин'); return }
    setSessionToken(null)
    setMerchantChoices(null)
    if (r.data?.importComplete === false) setConnectNotice(`Магазин подключён, но товары загрузились не полностью${typeof r.data.importedProducts === 'number' ? ` (загружено ${r.data.importedProducts})` : ''}. Нажмите «Обновить каталог»: остальные подтянутся.`)
    setConnected(true)
    setAddingStore(false)
    setAddingNew(false)
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    load()
  }

  // Переход в другой подключённый магазин прямо из окна переподключения: при
  // истёкшей сессии оно закрывает и боковое меню, и переключатель магазинов.
  async function switchStore(connectionId: string) {
    setSwitchError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/connections/switch', { method: 'POST', headers, body: JSON.stringify({ connectionId }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSwitchError(apiErrorMessage(res.status, data, 'Не удалось переключить магазин.'))
        return
      }
      window.location.href = '/kaspi-shop'
    } catch {
      setSwitchError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
    }
  }

  // Закрытие окна подключения. При истёкшей сессии его можно закрыть, только
  // если есть другой магазин, куда перейти (кнопку показываем при otherStores).
  function closeConnectDialog(dismissReconnect: boolean) {
    setAddingStore(false)
    setAddingNew(false)
    setPhone(''); setOtpToken(null); setResumeToken(null); setOtpCode(''); setMerchantChoices(null); setSessionToken(null)
    setConnectError(''); setConnectErrorDetail(''); setSwitchError('')
    if (dismissReconnect) setReconnectDismissed(true)
  }

  async function togglePause() {
    const previous = paused
    const next = !previous
    setPaused(next)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
      if (!res.ok) {
        // Откатываем переключатель: иначе кнопка показывала «На паузе», а на
        // сервере бот продолжал работать (и списывать деньги).
        setPaused(previous)
        const data = await res.json().catch(() => ({}))
        await alert(apiErrorMessage(res.status, data, 'Не удалось переключить паузу.'))
      }
    } catch {
      setPaused(previous)
      await alert('Нет связи с сервером. Пауза не изменена, попробуйте ещё раз.')
    }
  }

  async function saveTrackedCities(codes: string[]) {
    const previous = trackedCities
    setTrackedCities(codes)
    setCitiesSaving(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/settings/cities', { method: 'PATCH', headers, body: JSON.stringify({ trackedCityCodes: codes }) })
      if (!res.ok) {
        // Revert the optimistic chip toggle -- without this a chip stayed
        // selected in the UI even when the save failed (e.g. not connected,
        // or the new >15 cap rejected it), silently diverging from what's
        // actually stored server-side.
        setTrackedCities(previous)
        const data = await res.json().catch(() => ({}))
        await alert(apiErrorMessage(res.status, data, 'Не удалось сохранить города.'))
      } else {
        // The PATCH may have just seeded city_lookup_cache for the first
        // time (a fresh connect's best-effort seed can still miss, e.g. a
        // session that was expired at connect time and only later renewed) --
        // re-read availableCities so newly-available names show up now,
        // instead of only after a manual page reload.
        const refreshed = await fetchAvailableCities(headers).catch(() => null)
        if (refreshed) setAvailableCities(refreshed)
      }
    } catch {
      setTrackedCities(previous)
      await alert('Нет связи с сервером. Города не сохранены, попробуйте ещё раз.')
    } finally {
      setCitiesSaving(false)
    }
  }

  function toggleTrackedCity(code: string) {
    const next = trackedCities.includes(code) ? trackedCities.filter(c => c !== code) : [...trackedCities, code]
    saveTrackedCities(next)
  }

  async function disconnect() {
    if (!(await confirm('Отключить кабинет Kaspi? Отслеживаемые товары и их настройки будут удалены — при повторном подключении каталог импортируется заново.'))) return
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/settings', { method: 'DELETE', headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        await alert(apiErrorMessage(res.status, data, 'Не удалось отключить магазин.'))
        return
      }
    } catch {
      await alert('Нет связи с сервером. Магазин не отключён, попробуйте ещё раз.')
      return
    }
    window.dispatchEvent(new Event(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT))
    // A remaining store (if any) auto-activates server-side on disconnect --
    // reload so this page picks up its data instead of showing an empty
    // "not connected" state while another store is actually now active.
    window.location.href = '/kaspi-shop'
  }

  async function startTopup(amountTenge: number) {
    if (amountTenge < 500) return
    setToppingUp(true)
    setTopupError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/wallet/topup', { method: 'POST', headers, body: JSON.stringify({ amountTenge }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTopupError(apiErrorMessage(res.status, data, 'Не удалось создать платёж. Попробуйте ещё раз.'))
        return
      }
      setTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
      pollTopupStatus(data.topup_id)
    } catch {
      setTopupError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
    } finally {
      setToppingUp(false)
    }
  }

  function pollTopupStatus(topupId: string) {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      try {
        const headers = await authHeader()
        const res = await fetch(`/api/kaspi-shop/wallet/topup-status?topup_id=${topupId}`, { headers })
        const data = await res.json().catch(() => ({}))
        if (data.status === 'paid') { clearInterval(interval); setTopupPending(null); load() }
        else if (data.status === 'expired' || attempts >= 30) { clearInterval(interval); setTopupPending(null) }
      } catch {
        // сеть мигнула: следующий опрос через 5 секунд попробует снова
        if (attempts >= 30) { clearInterval(interval); setTopupPending(null) }
      }
    }, 5000)
  }

  // Переключатель «Активно/Пауза» на карточке: сразу меняем вид, но если сервер
  // отказал (403, 400, 500), возвращаем как было и говорим почему. Раньше ответ
  // не читался вовсе, и карточка врала о состоянии правила.
  async function toggleProduct(id: string, enabled: boolean) {
    if (togglingIds.has(id)) return
    // Включаем товар, у которого минимум равен цене: снижать некуда, бот будет «работать» вхолостую.
    const target = products.find(p => p.id === id)
    if (!enabled && target && target.own_current_price > 0 && target.floor_price >= target.own_current_price - 0.01 &&
      !(await confirm('Минимальная цена у этого товара равна текущей цене, поэтому бот не сможет её снижать. Включить всё равно? Задать минимум можно в настройках товара.'))) return
    setTogglingIds(prev => new Set(prev).add(id))
    const revert = () => setProducts(prev => prev.map(p => (p.id === id ? { ...p, enabled } : p)))
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, enabled: !enabled } : p)))
    let ok = false
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products', { method: 'PATCH', headers, body: JSON.stringify({ id, enabled: !enabled }) })
      if (res.ok) {
        ok = true
      } else {
        const data = await res.json().catch(() => ({}))
        revert()
        await alert(apiErrorMessage(res.status, data, 'Не удалось переключить товар.'))
      }
    } catch {
      revert()
      await alert('Нет связи с сервером. Состояние товара не изменено, попробуйте ещё раз.')
    } finally {
      setTogglingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
    if (ok) load()
  }

  async function deleteProduct(id: string) {
    if (!(await confirm('Удалить товар из демпинга? Правило и его настройки будут удалены у нас — сам товар на Kaspi это не трогает.'))) return
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSettingsError(apiErrorMessage(res.status, data, 'Не удалось удалить товар.'))
        return
      }
    } catch {
      setSettingsError('Нет связи с сервером. Товар не удалён, попробуйте ещё раз.')
      return
    }
    setExpandedId(null)
    load()
  }

  // Сохранение настроек товара. Панель закрывается только после ответа ok;
  // при отказе сервера она остаётся открытой с его сообщением, а после успеха
  // форма заполняется заново из перечитанного товара (раньше load() не трогал
  // уже существующие значения, и форма показывала несохранённое как сохранённое).
  async function saveProductSettings(id: string) {
    const v = editValues[id]
    if (!v || savingSettings) return
    // Пустой минимум больше не уходит как 0, запятая и пробелы понимаются.
    const checked = validateProductSettings(v)
    if (!checked.ok) { setSettingsError(checked.error); return }
    const current = products.find(p => p.id === id)
    // Включаем вместе с сохранением, только если минимум реально ниже цены (иначе бот ничего не снизит).
    const enableNow = !!current && !current.enabled && enableOnSave && current.own_current_price > 0 && checked.floor < current.own_current_price
    setSavingSettings(true)
    setSettingsError('')
    try {
      const headers = await authHeader()
      const send = async (confirmFloor: boolean) => {
        const res = await fetch('/api/kaspi-shop/products', {
          method: 'PATCH', headers,
          body: JSON.stringify({
            id,
            floor_price: checked.floor,
            max_price: checked.max,
            undercut_step: checked.step,
            demping_strategy: v.strategy,
            excluded_city_codes: v.excludedCities.split(',').map(s => s.trim()).filter(Boolean),
            excluded_merchant_ids: v.excludedMerchants.split(',').map(s => s.trim()).filter(Boolean),
            ...(enableNow ? { enabled: true } : {}),
            ...(confirmFloor ? { confirmFloor: true } : {}),
          }),
        })
        const data = await res.json().catch(() => ({}))
        return { res, data }
      }
      let { res, data } = await send(false)
      // Минимум сильно выше цены (или максимум сильно ниже): спрашиваем и, если
      // продавец согласен, повторяем запрос с confirmFloor.
      if (isFloorFarResponse(res.status, data)) {
        const question = floorFarConfirmText(data)
        if (question) {
          if (!(await confirm(question))) {
            setSettingsError('Настройки не сохранены: проверьте минимальную и максимальную цену.')
            return
          }
          ;({ res, data } = await send(true))
        }
      }
      if (!res.ok) {
        setSettingsError(apiErrorMessage(res.status, data, 'Не удалось сохранить настройки.'))
        return
      }
      setExpandedId(null)
      // Подтверждение словами: сохранено ли и включён ли товар (раньше окно просто закрывалось).
      const periodMin = effectiveCheckPeriodMinutes(current?.check_frequency_minutes ?? DEFAULT_CHECK_FREQUENCY_MINUTES)
      setApplyNowMessage(enableNow
        ? `Сохранено. Бот включён для «${current?.product_name ?? 'товара'}»: он проверяет цену ${periodLabel(periodMin, periodMin)}.`
        : current && !current.enabled
          ? 'Сохранено. Товар пока на паузе: чтобы бот начал работать, нажмите «Включить» на карточке.'
          : 'Сохранено.')
      await load({ refreshEdit: id })
    } catch {
      setSettingsError('Нет связи с сервером. Настройки не сохранены, попробуйте ещё раз.')
    } finally {
      setSavingSettings(false)
    }
  }

  // ИИ-подбор: только оценка. Нужны себестоимость и цена конкурента (кнопка
  // неактивна без них), ответ показывается вместе с пояснением модели и
  // оговоркой «это оценка»; ошибки видны, а не глотаются.
  async function suggestPricing(p: Product) {
    const blocked = suggestionBlockReason(p, (cityPrices[p.id] || []).some(c => c.competitorPrice !== null))
    if (blocked) { setSuggestError(blocked); return }
    setSuggestingFor(p.id)
    setSuggestError('')
    setSuggestion(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products/suggest-pricing', { method: 'POST', headers, body: JSON.stringify({ productId: p.id }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSuggestError(apiErrorMessage(res.status, data, 'ИИ-подбор не сработал. Попробуйте ещё раз.'))
        return
      }
      const floor = Number(data.floorPrice)
      const step = Number(data.undercutStep)
      if (!Number.isFinite(floor) || floor <= 0 || !Number.isFinite(step) || step < 0) {
        setSuggestError('ИИ вернул непонятный ответ. Попробуйте ещё раз.')
        return
      }
      if (typeof p.cogs_amount === 'number' && p.cogs_amount > 0 && floor < p.cogs_amount) {
        setSuggestError(`ИИ предложил минимум ${formatTenge(floor)}, это ниже себестоимости ${formatTenge(p.cogs_amount)}. Попробуйте ещё раз.`)
        return
      }
      setEditValues(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || editFromProduct(p)), floorPrice: String(floor), undercutStep: String(step) } }))
      setSuggestion({ id: p.id, floorPrice: floor, undercutStep: step, reasoning: typeof data.reasoning === 'string' ? data.reasoning : '' })
    } catch {
      setSuggestError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
    } finally {
      setSuggestingFor(null)
    }
  }

  // Forces an immediate check-cycle run instead of waiting out each
  // product's check_frequency_minutes schedule -- see
  // /api/kaspi-shop/apply-now's route comment for why this can't complete
  // synchronously (real Kaspi fetches only work from GitHub Actions, not
  // Vercel). The route responds as soon as it has queued the run, so this
  // polls the product list a few times afterwards rather than expecting
  // fresh numbers in the response itself. Проверка бесплатна (5 ₸ берётся только
  // за изменение цены ботом), поэтому подтверждения со стоимостью нет; запуск у
  // большого списка идёт минутами, не «в течение минуты».
  async function applyNow() {
    if (applyingNow) return
    // Те же причины отказа, что показаны под кнопкой: пауза, мёртвая сессия, нет
    // включённых товаров в продаже, баланс меньше 5 ₸.
    if (applyNowBlockReason({ paused, sessionStatus, activeCount: products.filter(isActiveProduct).length, balance })) return
    setApplyingNow(true)
    setApplyNowMessage('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/apply-now', { method: 'POST', headers, body: JSON.stringify({}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setApplyNowMessage(apiErrorMessage(res.status, data, 'Не удалось запустить проверку'))
        setApplyingNow(false)
        return
      }
      setApplyNowMessage(applyNowSuccessText(data))
      applyTimers.current.forEach(clearTimeout)
      applyTimers.current = [
        setTimeout(() => { load() }, 15_000),
        // Кнопка снова доступна через минуту; повторный запуск сервер всё равно держит за лимитом раз в 10 минут.
        setTimeout(() => { load(); setApplyingNow(false) }, 60_000),
        setTimeout(() => { load() }, 150_000),
        setTimeout(() => { load(); setApplyNowMessage('') }, 300_000),
      ]
    } catch {
      setApplyNowMessage('Нет связи с сервером. Проверка не запущена, деньги не списаны.')
      setApplyingNow(false)
    }
  }

  // On-demand catalog re-import -- same dedup-safe import as connect time,
  // without a fresh phone/SMS login. Needed when a product is restored to
  // sale (or added on Kaspi) after the connect-time import.
  async function syncCatalog() {
    if (syncingCatalog) return
    setSyncingCatalog(true)
    setApplyNowMessage('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/catalog/sync', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setApplyNowMessage(apiErrorMessage(res.status, data, 'Не удалось обновить каталог'))
        // Неполный импорт: часть товаров уже записана, без перечитывания их не видно.
        if (catalogSyncShouldReload(false, data)) load()
        return
      }
      setApplyNowMessage(`Каталог обновлён: ${data.imported} товар(ов)`)
      load()
    } catch {
      setApplyNowMessage('Нет связи с сервером. Каталог не обновлён, попробуйте ещё раз.')
    } finally {
      setSyncingCatalog(false)
    }
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
    setBulkFrequency(String(DEFAULT_CHECK_FREQUENCY_MINUTES))
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

  // «Выбрать все найденные»: до 100 за раз, остальные можно взять следующим заходом.
  function selectAllFound() {
    setBulkSelected(prev => {
      const next = new Set(prev)
      for (const p of bulkFiltered) {
        if (next.size >= MAX_BULK_ITEMS) break
        next.add(p.id)
      }
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
    if (bulkSubmitting) return
    // Запятая и пробелы понимаются, пустой минимум не уходит как 0.
    const checked = validateBulkSettings({ floorPrice: bulkFloorPrice, maxPrice: bulkMaxPrice, undercutStep: bulkUndercutStep, frequency: bulkFrequency })
    if (!checked.ok) { setBulkError(checked.error); return }
    // Минимум меньше половины цены у части выбранных: чаще всего потерян ноль (как и в окне одного товара).
    const lowShare = products.filter(p => bulkSelected.has(p.id) && p.own_current_price > 0 && checked.floor < p.own_current_price * FLOOR_LOW_SHARE).length
    if (lowShare > 0 && !(await confirm(`У ${lowShare} ${lowShare === 1 ? 'товара' : 'товаров'} из выбранных минимум ${formatTenge(checked.floor)} меньше половины текущей цены. Бот сможет опустить цену до него. Не пропущен ли ноль? Применить?`))) return
    setBulkSubmitting(true)
    setBulkError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products/bulk', {
        method: 'POST', headers,
        body: JSON.stringify({
          productIds: Array.from(bulkSelected),
          floorPrice: checked.floor,
          maxPrice: checked.max,
          undercutStep: checked.step,
          dempingStrategy: bulkStrategy,
          checkFrequencyMinutes: checked.frequency,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBulkError(apiErrorMessage(res.status, data, 'Не удалось применить настройки')); return }
      setBulkOpen(false)
      // Итог словами: сколько включено и какие товары пропущены (у них цена ниже общего минимума).
      const updated = typeof data?.updated === 'number' ? data.updated : null
      const skippedList: { name?: string | null }[] = Array.isArray(data?.skipped) ? data.skipped : []
      if (updated !== null) {
        const names = skippedList.slice(0, 3).map(x => x.name || 'без названия').join(', ')
        setApplyNowMessage(
          `Включено ${updated} ${pluralProducts(updated)}.` +
          (skippedList.length > 0
            ? ` Пропущено ${skippedList.length}: у них цена ниже или выше заданных границ (${names}${skippedList.length > 3 ? ' и др.' : ''}). Задайте им минимум отдельно.`
            : ''),
        )
      }
      load()
    } catch {
      setBulkError('Нет связи с сервером. Настройки не применены, попробуйте ещё раз.')
    } finally {
      setBulkSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const winningCount = products.filter(p => p.last_competitor_price !== null && p.own_current_price <= p.last_competitor_price).length
  const atFloorCount = products.filter(p => p.enabled && p.own_current_price <= p.floor_price + 0.01).length
  // Products whose floor is still exactly the price they were imported at.
  // finalizeConnection seeds floor_price = own_current_price, which is a safe
  // default — no bot should start cutting prices the moment a shop connects —
  // but it also means the repricer has nowhere to go. Until the floor is
  // lowered, an enabled product can never undercut anyone, and the counter
  // above reads "упёрлись в минимум", which sounds like a hard-fought race
  // rather than a floor nobody has set yet.
  const untouchedFloorCount = products.filter(
    p => p.own_current_price > 0 && Math.abs(p.own_current_price - p.floor_price) < 0.01
  ).length
  // Только что подключённый магазин: все товары на паузе. Вместо красных счётчиков показываем спокойный
  // список «что сделать» (прогон воронки 07.11.2026: новичок видел «всё красное» сразу после подключения).
  const freshStore = products.length > 0 && products.every(p => !p.enabled)
  // «Активных» = включённые И в продаже: снятые с продажи бот не проверяет.
  const activeCount = products.filter(isActiveProduct).length
  // «Работает» при нуле включённых товаров вводило в заблуждение: бот ничего не делает (аудит 02.11.2026).
  const idleNoProducts = !paused && activeCount === 0
  // Расписание проверок: сколько товаров бот реально проверяет и как часто (запуски
  // идут раз в 10 минут, период округляется до целого числа тиков). Денег в этой
  // оценке нет: проверка бесплатна, а число изменений цены заранее не известно.
  const schedule = summarizeSchedule(products)
  const balanceWarning = lowBalanceWarning(balance, schedule, paused)
  const applyBlockReason = applyNowBlockReason({ paused, sessionStatus, activeCount, balance })
  // То же для окна «Добавить несколько»: выбранные товары будут включены с общей частотой.
  const bulkFreq = Number(bulkFrequency.replace(/[\s ]/g, '').replace(',', '.'))
  const bulkSchedule = Number.isInteger(bulkFreq) && bulkFreq >= 5
    ? summarizeSchedule(Array.from(bulkSelected).map(() => ({ enabled: true, check_frequency_minutes: bulkFreq })))
    : null

  // Состояние бота. Когда включённых товаров нет, это не кнопка паузы, а обычная метка.
  const statusPill = idleNoProducts ? (
    <span className="text-xs font-semibold rounded-full px-3 py-2 inline-flex items-center"
      style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)', border: '1px solid var(--nav-border)' }}>
      Пока не запущен
    </span>
  ) : (
    <button onClick={togglePause}
      className="text-xs font-bold rounded-full px-3 min-h-[44px] flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
      style={{ background: paused ? 'var(--nav-critical)' : 'var(--nav-success-solid)', color: paused ? '#fff' : 'var(--nav-success-ink)' }}>
      {paused ? <PauseIcon /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />}
      {paused ? 'На паузе. Возобновить' : 'Работает'}
    </button>
  )
  const headerControls = (
    <>
      {statusPill}
      <button onClick={disconnect} className="nav-glass text-xs font-medium rounded-full px-3 min-h-[44px] transition-colors" style={{ color: 'var(--nav-text-muted)' }}>
        Отключить
      </button>
    </>
  )

  // Which cities this product's demping actually covers: manually tracked
  // cities win; with none picked, auto mode checks the product's own point
  // cities («Авто: Шымкент»); no known point cities = the legacy
  // single-reference mode («Все города»).
  function productRegionLabel(p: Product): string {
    if (trackedCities.length === 0) {
      const auto = (p.point_city_codes || []).filter(code => !(p.excluded_city_codes || []).includes(code))
      if (auto.length === 0) return 'Все города'
      const names = auto.map(code => availableCities.find(c => c.code === code)?.name || code)
      return `Авто: ${names.length <= 2 ? names.join(', ') : `${names.length} городов`}`
    }
    const codes = trackedCities.filter(code => !(p.excluded_city_codes || []).includes(code))
    if (codes.length === 0) return 'Все города исключены'
    const names = codes.map(code => availableCities.find(c => c.code === code)?.name || code)
    return names.length <= 2 ? names.join(', ') : `${names.length} городов`
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            {loadError.startsWith('Вход устарел')
              ? <a href="/login?next=/kaspi-shop/overview" className="text-xs font-semibold rounded-lg px-3 py-2.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Войти заново</a>
              : <button onClick={retryLoad} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>}
          </div>
        )}

        {(() => {
        // Founder, 2026-09-03: don't show any real content -- not even this
        // page's own repricer rules -- once the live Kaspi session has died;
        // send the seller straight into the same connect dialog instead of a
        // banner they have to notice and click through first. The dialog
        // below already doubles as "reconnect" for an existing store (see
        // needsReconnect usages inside it), same idea
        // KaspiShopStoreSwitcher's own session_expired button already relies
        // on (?addStore=1 opens this same dialog).
        const needsReconnect = connected && sessionStatus === 'session_expired' && !addingNew
        // Запрос баланса и подключения не удался: «не подключён» не утверждаем,
        // окно подключения не показываем - только плашка ошибки выше с «Повторить».
        if (!connectionKnown) return null
        // Окно переподключения можно закрыть, если есть другой магазин: иначе оно
        // перекрывало и меню, и переключатель магазинов (K46).
        const canDismissReconnect = needsReconnect && otherStores.length > 0
        if (needsReconnect && reconnectDismissed && canDismissReconnect && !addingStore) {
          return (
            <div className="nav-glass rounded-2xl p-5 lg:p-6 max-w-xl">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                {`Сессия магазина «${companyName || 'Kaspi'}» истекла`}
              </div>
              <p className="text-[13px] mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
                Товары и настройки сохранены, но данные скрыты, пока вы не войдёте в этот магазин ещё раз. Можно переподключить его или открыть другой магазин.
              </p>
              {switchError && <div className="text-xs mb-3" role="alert" style={{ color: 'var(--nav-critical)' }}>{switchError}</div>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setReconnectDismissed(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                  Переподключить
                </button>
                {otherStores.map(s => (
                  <button key={s.id} onClick={() => switchStore(s.id)}
                    className="nav-glass rounded-xl px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>
                    {`Открыть «${s.companyName}»`}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        return (!connected || addingStore || needsReconnect) ? (
          /* Centered connect dialog (2026-08-20, founder): the connect form
             used to render as a full-width inline card flush to the top-left,
             which read as a broken/half-empty page. Now it floats as a true
             centered modal over the page, same treatment as the app's other
             dialogs (bank picker, wallet). Dismissible only when reached via
             "+ Добавить магазин" while already connected -- the mandatory
             first-connect case has nothing else on the page to interact with. */
          <div className="fixed inset-x-0 bottom-0 top-14 lg:top-0 z-50 flex items-center justify-center p-3 bg-black/30">
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              className="relative nav-glass rounded-[24px] w-full max-w-md p-6 lg:p-8 max-h-[84dvh] overflow-y-auto"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
              {((connected && !needsReconnect) || canDismissReconnect) && (
                <button aria-label="Закрыть" onClick={() => closeConnectDialog(needsReconnect)}
                  className="absolute top-5 right-5 text-lg leading-none" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              )}
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--nav-text-muted)' }}>Подключение</div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: 'var(--nav-text-primary)' }}>
                {needsReconnect ? 'Сессия истекла — переподключитесь' : connected ? 'Добавьте ещё один магазин' : 'Подключите Kaspi Магазин'}
              </h1>
              {needsReconnect && (
                <p className="text-sm mb-4 -mt-3" style={{ color: 'var(--nav-text-secondary)' }}>
                  Товары и настройки сохранены — просто войдите в тот же магазин ещё раз, чтобы обновить сессию.
                </p>
              )}
              {needsReconnect && silentTrying && (
                <p className="text-sm mb-4" role="status" style={{ color: 'var(--nav-text-secondary)' }}>
                  Пробуем продлить сессию без SMS…
                </p>
              )}
              {connectError && (
                <div className="mb-3" role="alert">
                  <div className="text-sm" style={{ color: 'var(--nav-critical)' }}>{connectError}</div>
                  {connectErrorDetail && (
                    <div className="text-[11px] mt-1 font-mono break-all" style={{ color: 'var(--nav-text-muted)' }}>
                      {connectUiText(lang).techReason}: {connectErrorDetail}
                    </div>
                  )}
                </div>
              )}

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
                <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void startConnect() }}>
                  <p className="text-[13px] leading-relaxed mb-1" style={{ color: 'var(--nav-text-secondary)' }}>
                    Введите номер, на который оформлен кабинет <b>Kaspi Магазин</b> (не личное приложение Kaspi.kz). Kaspi пришлёт на него SMS с кодом. Пароль от кабинета мы не видим.
                  </p>
                  <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} aria-label="Телефон кабинета Kaspi Магазин"
                    placeholder="Телефон (как при входе в Kaspi)" value={phone} onChange={e => setPhone(formatKzPhone(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="go" />
                  <button type="submit" disabled={connecting}
                    className="mt-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {connecting ? 'Отправляем код...' : 'Получить SMS-код'}
                  </button>
                </form>
              ) : (
                <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void completeConnect() }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Код из SMS отправлен на {phone}</div>
                  <input className={`${INPUT_CLS} font-mono tracking-widest`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} aria-label="Код из SMS"
                    placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} enterKeyHint="go"
                    autoFocus disabled={!!resumeToken || connecting} />
                  <button type="submit" disabled={connecting}
                    className="mt-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {connecting ? 'Проверяем...' : resumeToken ? connectUiText(lang).retry : 'Подтвердить'}
                  </button>
                  {connecting && (
                    <p role="status" className="text-xs text-center" style={{ color: 'var(--nav-text-muted)' }}>
                      Подключаем магазин и загружаем ваши товары. Это может занять до минуты, не закрывайте страницу.
                    </p>
                  )}
                  {/* Опечатка в номере или пропавшее SMS не должны быть тупиком: выход виден сразу, не после ошибки. */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4">
                    <button type="button" disabled={connecting}
                      onClick={() => { setOtpToken(null); setResumeToken(null); setOtpCode(''); setConnectError(''); setConnectErrorDetail('') }}
                      className="min-h-[44px] rounded-xl text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50"
                      style={{ color: 'var(--nav-text-secondary)' }}>
                      {connectError ? connectUiText(lang).newCode : 'Изменить номер или отправить код ещё раз'}
                    </button>
                  </div>
                </form>
              )}
              {/* Истёкшая сессия активного магазина, но есть другой: можно открыть его,
                  не переподключая этот (K46). */}
              {canDismissReconnect && !otpToken && !merchantChoices && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                  <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>Или откройте другой магазин:</div>
                  {switchError && <div className="text-xs mb-2" role="alert" style={{ color: 'var(--nav-critical)' }}>{switchError}</div>}
                  <div className="flex flex-col gap-2">
                    {otherStores.map(s => (
                      <button key={s.id} onClick={() => switchStore(s.id)}
                        className="w-full text-left nav-glass rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:border-[color:var(--nav-accent)]"
                        style={{ color: 'var(--nav-text-primary)' }}>
                        {s.companyName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Выход из обязательного окна: пока магазин не подключён (или
                  сессия истекла), закрыть его нечем, кроме этой кнопки.
                  Возвращаемся в кабинет счетов с плашкой «вернуться в Kaspi Bot». */}
              {(!connected || needsReconnect) && (
                <a href={crossHref('invoices', '/dashboard', 'kaspiShop', '/kaspi-shop')}
                  className="mt-3 flex items-center justify-center min-h-[44px] rounded-xl text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ color: 'var(--nav-text-secondary)' }}>
                  {LATER_TEXT[lang]}
                </a>
              )}
            </motion.div>
          </div>
        ) : (
          <>
            {/* Тур первого входа — только когда магазин подключён. */}
            <KaspiTour />
            <PageHeader
              title="Демпинг"
              subtitle={companyName || 'Магазин подключён'}
              stackRightOnMobile
              right={headerControls}
            />
            {connectNotice && (
              <div role="status" className="rounded-2xl p-4 mb-4 flex items-start justify-between gap-3 text-[13px]" style={{ border: '1px solid var(--nav-critical)', color: 'var(--nav-text-primary)' }}>
                <span>{connectNotice}</span>
                <button type="button" aria-label="Закрыть" onClick={() => setConnectNotice('')} className="min-w-[44px] min-h-[44px] -m-3 text-lg leading-none" style={{ color: 'var(--nav-text-muted)' }}>×</button>
              </div>
            )}
            {/* Top row (2026-08-21 founder layout request: "скомпанованнее"):
                hero on the left (2/3), city picker beside it on the right --
                the stats row below stays full-width as the second line. */}
            <div className="grid lg:grid-cols-3 gap-4 mb-4 items-stretch">
            {/* Hero: the one question this page answers, stated as three
                numbers, not buried in per-product rows. */}
            <motion.div data-tour="kaspi-hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 lg:col-span-2">
        {balanceWarning && (
          <div role="alert" className="rounded-2xl p-4 lg:p-5 mb-4" style={{ border: '1px solid var(--nav-critical)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-critical)' }}>
              {balanceWarning.title}
            </div>
            <p className={`text-[13px] ${PROSE_WIDE_CLS}`} style={{ color: 'var(--nav-text-secondary)' }}>
              {balanceWarning.message}{' '}
              <button onClick={() => setWalletOpen(true)} className="underline underline-offset-2 font-semibold" style={{ color: 'var(--nav-accent)' }}>Пополнить баланс</button>
            </p>
          </div>
        )}
        {freshStore && (
          <div data-testid="first-run-checklist" className="rounded-2xl p-4 lg:p-5 mb-4" style={{ background: 'var(--nav-accent-soft)', border: '1px solid var(--nav-border)' }}>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
              Магазин подключён: загружено товаров {products.length}. Осталось включить бота
            </div>
            <ol className={`text-[13px] space-y-1.5 mb-4 list-decimal pl-5 ${PROSE_WIDE_CLS}`} style={{ color: 'var(--nav-text-secondary)' }}>
              <li><b>Задайте минимальную цену</b>: ниже неё бот цену не опустит. Сейчас у товаров минимум равен цене, и снижать некуда.</li>
              <li><b>Включите товары</b>: массовое окно задаёт минимум и сразу включает выбранные.</li>
              <li>
                <b>Проверьте баланс</b>: на нём {Number.isFinite(Number(balance)) ? Number(balance).toLocaleString('ru-KZ') : balance} ₸. Проверки цен бесплатны, 5 ₸ берётся только за каждое изменение цены ботом.
              </li>
            </ol>
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={openBulkAdd}
                className="min-h-[44px] rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                Задать минимум и включить
              </button>
              <button onClick={() => setWalletOpen(true)}
                className="nav-glass min-h-[44px] rounded-xl px-4 text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>
                Пополнить баланс
              </button>
              <a href="/kaspi-shop/margin" className="text-[13px] underline underline-offset-2 min-h-[44px] inline-flex items-center" style={{ color: 'var(--nav-accent)' }}>
                Как посчитать минимум
              </a>
            </div>
          </div>
        )}
        {!freshStore && untouchedFloorCount > 0 && (
          <div className="nav-glass rounded-2xl p-4 lg:p-5 mb-4" style={{ borderLeft: '3px solid var(--nav-critical)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
              {untouchedFloorCount === products.length
                ? 'Минимальная цена не задана ни у одного товара'
                : `Минимальная цена не задана у ${untouchedFloorCount} товаров из ${products.length}`}
            </div>
            <p className={`text-[13px] ${PROSE_WIDE_CLS}`} style={{ color: 'var(--nav-text-secondary)' }}>
              При подключении магазина минимум выставляется равным текущей цене — чтобы бот ничего не уронил без
              вашего ведома. Но пока минимум равен цене, <b>снижать некуда: демпинг не сможет обойти конкурента</b>.
              Задайте минимум ниже текущей цены — по одному товару или сразу всем через массовое изменение.
              Посчитать безопасный минимум можно в <a href="/kaspi-shop/margin" style={{ color: 'var(--nav-accent)' }}>калькуляторе маржи</a>.
            </p>
          </div>
        )}

              {!freshStore && (
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
              )}
              {schedule.count === 0 && !freshStore && (
                <p data-testid="price-model-note" className="text-[12px] mt-5 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                  {PRICE_MODEL_NOTE}
                </p>
              )}
              {schedule.count > 0 && (
                <p data-testid="running-cost" className="text-[12px] mt-5 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                  {paused
                    ? `Демпинг на паузе: проверки не идут, деньги не списываются. После включения бот проверяет цены ${periodLabel(schedule.minPeriod, schedule.maxPeriod)}.`
                    : `${PRICE_MODEL_NOTE} За одну проверку товара списывается не больше ${PRICE_CHANGE_TENGE} ₸, даже если цена изменилась в нескольких городах. Бот проверяет цены ${periodLabel(schedule.minPeriod, schedule.maxPeriod)}.`}
                </p>
              )}
            </motion.div>

            <div data-tour="kaspi-cities" className="nav-glass rounded-2xl p-4">
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

            {companyName && products.length > 0 && products.every(p => !p.enabled) && (
              <div className="text-xs mb-4 px-1" style={{ color: 'var(--nav-text-muted)' }}>{products.length} товаров импортировано и на паузе — включите нужные ниже, чтобы демпинг начал работать.</div>
            )}

            <div data-tour="kaspi-rules" className="flex items-center justify-between gap-3 mb-3 flex-wrap">
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
                <button onClick={applyNow} disabled={applyingNow || !stats || applyBlockReason !== null}
                  className="text-xs font-semibold rounded-full px-4 py-2 flex items-center gap-1.5 disabled:opacity-50 transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {applyingNow ? 'Проверяем...' : 'Применить сейчас'}
                </button>
              </div>
            </div>
            {applyNowMessage ? (
              <div role="status" className="text-[11px] mb-3 px-1" style={{ color: 'var(--nav-text-muted)' }}>{applyNowMessage}</div>
            ) : stats && applyBlockReason ? (
              <div data-testid="apply-now-reason" className="text-[11px] mb-3 px-1" style={{ color: 'var(--nav-text-muted)' }}>
                {`«Применить сейчас» недоступна. ${applyBlockReason}`}
              </div>
            ) : null}

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
            <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-3 items-start">
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
                        setEnableOnSave(!p.enabled)
                        // Форма всегда открывается с сохранёнными значениями: правки,
                        // которые не сохранили в прошлый раз, не должны выдавать себя за сохранённые.
                        setEditValues(prev => ({ ...prev, [p.id]: editFromProduct(p) }))
                        setSettingsError('')
                        setSuggestError('')
                        setSuggestion(null)
                        if (!cityPrices[p.id] && trackedCities.length > 0) {
                          authHeader().then(headers =>
                            fetch(`/api/kaspi-shop/products/city-prices?id=${p.id}`, { headers })
                              .then(res => res.ok ? res.json() : { cities: [] })
                              .then(data => setCityPrices(prev => ({ ...prev, [p.id]: data.cities || [] })))
                              .catch(() => { /* «Загрузка…» остаётся только пока идёт запрос; без данных покажем пусто */ setCityPrices(prev => ({ ...prev, [p.id]: [] })) })
                          )
                        }
                      }} className="w-full text-left p-4 cursor-pointer">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" title={p.product_name} style={{ color: 'var(--nav-text-primary)' }}>{p.product_name}</div>
                            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                              {STRATEGY_LABELS[p.demping_strategy] || p.demping_strategy} · проверка примерно раз в {effectiveCheckPeriodMinutes(p.check_frequency_minutes)} мин
                            </div>
                          </div>
                          <span role="button" tabIndex={0} aria-label={p.enabled ? 'Поставить товар на паузу' : 'Включить демпинг для товара'}
                            onClick={e => { e.stopPropagation(); toggleProduct(p.id, p.enabled) }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleProduct(p.id, p.enabled) } }}
                            className="flex-shrink-0 -my-3 -mr-2 px-2 min-h-[44px] inline-flex items-center cursor-pointer">
                            <span className="text-[11px] px-2.5 py-1.5 rounded-full font-semibold"
                              style={{ background: p.enabled ? 'var(--nav-success-solid)' : 'var(--nav-accent-soft)', color: p.enabled ? 'var(--nav-success-ink)' : 'var(--nav-accent)', border: p.enabled ? 'none' : '1px solid var(--nav-accent)' }}>
                              {p.enabled ? 'Активно' : 'Включить'}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-end justify-between gap-3 mb-2">
                          <div>
                            <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Наша цена на Kaspi</div>
                            <div className="font-mono font-bold text-xl tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{p.own_current_price.toLocaleString('ru-KZ')} ₸</div>
                          </div>
                          <div className="text-right" title={competitorTooltip(p.competitor_snapshot)}>
                            <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Конкурент</div>
                            <div className={`font-mono text-sm tabular-nums ${p.competitor_snapshot?.length ? 'underline decoration-dotted underline-offset-2' : ''}`} style={{ color: 'var(--nav-text-secondary)' }}>
                              {p.last_competitor_price !== null ? `${p.last_competitor_price.toLocaleString('ru-KZ')} ₸` : '—'}
                            </div>
                          </div>
                        </div>
                        <PriceLadder own={p.own_current_price} competitor={p.last_competitor_price} floor={p.floor_price} maxPrice={p.max_price} enabled={p.enabled} />
                        <div className="flex items-center justify-between gap-2 flex-wrap mt-2.5">
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                            <span title="Города, по которым демпингуется этот товар">{productRegionLabel(p)}</span>
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

              {/* Пустой список после сбоя запроса не равен «товаров нет»: ошибка и
                  «Повторить» уже показаны плашкой выше. */}
              {products.length === 0 && productsLoaded && (
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
                const v = editValues[p.id] || editFromProduct(p)
                const suggestBlock = suggestionBlockReason(p, (cityPrices[p.id] || []).some(c => c.competitorPrice !== null))
                return (
                  <motion.div key="productSettings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30"
                    onClick={() => setExpandedId(null)}>
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="relative nav-glass rounded-[24px] w-full max-w-xl max-h-[86dvh] overflow-y-auto"
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
                              <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                                Сейчас на Kaspi: <b className="tabular-nums">{p.own_current_price.toLocaleString('ru-KZ')} ₸</b>
                                {p.last_competitor_price !== null && <> · у лидера: <b className="tabular-nums">{p.last_competitor_price.toLocaleString('ru-KZ')} ₸</b></>}
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <label className="block">
                                  <span className="text-[11px] mb-1 block min-h-[28px] leading-tight" style={{ color: 'var(--nav-text-muted)' }}>Минимальная цена</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} inputMode="decimal" />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] mb-1 block min-h-[28px] leading-tight" style={{ color: 'var(--nav-text-muted)' }}>Максимальная цена</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" placeholder="—" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.maxPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, maxPrice: e.target.value } }))} inputMode="decimal" />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] mb-1 block min-h-[28px] leading-tight" style={{ color: 'var(--nav-text-muted)' }}>Шаг, ₸</span>
                                  <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" style={{ color: 'var(--nav-text-primary)' }}
                                    value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} inputMode="decimal" />
                                </label>
                              </div>
                              <div className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                                <b>Минимум</b>: ниже этой цены бот цену не опустит. Введите свою закупку + комиссию Kaspi + доставку + прибыль, которую не хотите терять
                                (<a href="/kaspi-shop/margin" style={{ color: 'var(--nav-accent)' }}>посчитать в калькуляторе</a>).{' '}
                                <b>Максимум</b> необязателен: выше этой цены бот не поднимет. <b>Шаг</b>: на сколько тенге ниже конкурента ставить цену.
                              </div>
                              {/* Остатки живут по складам/городам (founder,
                                  2026-08-21) -- в «Управлении товарами», в
                                  модалке «Цена и остатки», как у Kaspi. Тут
                                  их поле только вводило в заблуждение. */}
                              <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                                Остатки по складам — на странице <span className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Управление товарами → Цена и остатки</span>.
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
                              {settingsError && (
                                <div className="text-xs mb-2" role="alert" style={{ color: 'var(--nav-critical)' }}>{settingsError}</div>
                              )}
                              {!p.enabled && (
                                <label className="flex items-center gap-2 mb-3 text-xs min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
                                  <input type="checkbox" checked={enableOnSave} onChange={e => setEnableOnSave(e.target.checked)} className="w-4 h-4" />
                                  Включить демпинг для этого товара после сохранения
                                </label>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => suggestPricing(p)} disabled={suggestingFor === p.id || !!suggestBlock}
                                  className="flex-1 text-xs nav-glass rounded-lg px-3 py-2 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
                                  <SparkleIcon /> {suggestingFor === p.id ? 'Думаем...' : 'ИИ-подбор цены'}
                                </button>
                                <button onClick={() => saveProductSettings(p.id)} disabled={savingSettings}
                                  className="flex-1 text-xs rounded-lg px-3 py-2 font-medium disabled:opacity-60" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                                  {savingSettings ? 'Сохраняем...' : !p.enabled && enableOnSave ? 'Сохранить и включить' : 'Сохранить'}
                                </button>
                              </div>
                              {suggestBlock && (
                                <div className="text-[11px] mt-2" data-testid="suggest-block" style={{ color: 'var(--nav-text-muted)' }}>{suggestBlock}</div>
                              )}
                              {suggestError && (
                                <div className="text-xs mt-2" role="alert" style={{ color: 'var(--nav-critical)' }}>{suggestError}</div>
                              )}
                              {suggestion && suggestion.id === p.id && (
                                <div className="rounded-lg px-3 py-2 mt-2 text-[11px] leading-relaxed" data-testid="suggest-result" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                                  <div className="font-semibold mb-0.5" style={{ color: 'var(--nav-text-primary)' }}>
                                    {`Оценка ИИ: минимум ${formatTenge(suggestion.floorPrice)}, шаг ${formatTenge(suggestion.undercutStep)}`}
                                  </div>
                                  {suggestion.reasoning && <div className="mb-1">{suggestion.reasoning}</div>}
                                  Это оценка, а не расчёт и не гарантия. Цифры подставлены в поля выше, но ещё не сохранены: сверьте их со своей маржой и нажмите «Сохранить».
                                </div>
                              )}
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
        )
        })()}
      </PageContainer>

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
              <div className="text-xs mb-4" style={{ color: 'var(--nav-text-muted)' }}>Баланс: {balance.toLocaleString('ru-KZ')} ₸ · {PRICE_CHANGE_TENGE} ₸ за каждое изменение цены ботом</div>
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
                placeholder="Своя сумма, ₸" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                className="w-full border-b py-2 text-sm outline-none mb-3 bg-transparent"
                style={{ borderColor: 'var(--nav-border-soft)', color: 'var(--nav-text-primary)' }} />
              <button onClick={() => startTopup((topupAmount ?? Number(topupCustom)) || 0)}
                disabled={toppingUp || !((topupAmount ?? Number(topupCustom)) >= 500)}
                className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {toppingUp ? 'Готовим QR...' : 'Пополнить'}
              </button>
              {topupError && <div className="text-xs mt-2" role="alert" style={{ color: 'var(--nav-critical)' }}>{topupError}</div>}
              {topupPending && (
                <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--nav-accent-soft)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
                  <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                    className="w-full rounded-xl py-2.5 text-sm font-medium block text-center" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Оплатить</a>
                </div>
              )}
              {walletHistory !== null && walletHistory.length > 0 && (
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--nav-text-muted)' }}>Последние списания</div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {walletHistory.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" style={{ color: 'var(--nav-text-secondary)' }}>{entry.label}</span>
                        <span className="flex-shrink-0 font-mono tabular-nums" style={{ color: 'var(--nav-critical)' }}>
                          −{Math.abs(entry.amount).toLocaleString('ru-KZ')} ₸
                        </span>
                      </div>
                    ))}
                  </div>
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
              className="relative nav-glass rounded-t-[24px] lg:rounded-[24px] w-full lg:max-w-lg p-5 max-h-[86dvh] flex flex-col overflow-y-auto"
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
                  <div className="text-[11px] mb-3 flex items-center justify-between gap-2" style={{ color: 'var(--nav-text-muted)' }}>
                    <span>
                      Выбрано: {bulkSelected.size} / {MAX_BULK_ITEMS}
                      {bulkSelected.size >= MAX_BULK_ITEMS && ' · максимум за один раз, остальные возьмите следующим заходом'}
                    </span>
                    {bulkFiltered.length > 0 && (
                      <button type="button" onClick={selectAllFound} className="font-semibold underline underline-offset-2 min-h-[44px] flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>
                        Выбрать все найденные
                      </button>
                    )}
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
                  <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>Применится ко всем {bulkSelected.size} выбранным товарам. Они сразу включатся: бот начнёт проверять цены.</div>
                  {bulkError && <div className="text-xs mb-3" role="alert" style={{ color: 'var(--nav-critical)' }}>{bulkError}</div>}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Минимальная цена</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkFloorPrice} onChange={e => setBulkFloorPrice(e.target.value)} inputMode="decimal" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Максимальная цена</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" placeholder="—" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkMaxPrice} onChange={e => setBulkMaxPrice(e.target.value)} inputMode="decimal" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Шаг, ₸</span>
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkUndercutStep} onChange={e => setBulkUndercutStep(e.target.value)} inputMode="decimal" />
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
                      <input className={`${INPUT_CLS} font-mono px-2 py-1.5`} type="text" autoComplete="off" style={{ color: 'var(--nav-text-primary)' }}
                        value={bulkFrequency} onChange={e => setBulkFrequency(e.target.value)} inputMode="numeric" pattern="[0-9]*" />
                    </label>
                    <div className="col-span-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                      {STRATEGY_DESCRIPTIONS[bulkStrategy] || ''} {STRATEGY_COMMON_NOTE}
                    </div>
                    {bulkSchedule && (
                      <div data-testid="bulk-cost" className="col-span-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                        <div className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                          {PRICE_MODEL_NOTE}
                        </div>
                        {`${bulkSchedule.count} ${pluralProducts(bulkSchedule.count)}: бот проверяет цены ${periodLabel(bulkSchedule.minPeriod, bulkSchedule.maxPeriod)}. За каждое изменение цены деньги списываются с баланса (сейчас ${formatTenge(balance)}), при балансе меньше ${PRICE_CHANGE_TENGE} ₸ бот цены не меняет.`}
                        {balance < PRICE_CHANGE_TENGE && (
                          <div className="font-semibold mt-1" style={{ color: 'var(--nav-critical)' }}>
                            {`Баланс меньше ${PRICE_CHANGE_TENGE} ₸: бот не сможет менять цены. Пополните баланс до запуска.`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkStep('select')}
                      className="flex-1 text-xs nav-glass rounded-lg px-3 py-2.5 font-medium" style={{ color: 'var(--nav-text-secondary)' }}>
                      Назад
                    </button>
                    <button onClick={submitBulkAdd} disabled={bulkSubmitting || !bulkFloorPrice || !bulkUndercutStep}
                      className="flex-[2] text-sm rounded-lg px-3 py-2.5 font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {bulkSubmitting ? 'Применяем...' : `Применить и включить (${bulkSelected.size})`}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {dialogElement}
    </main>
    </DesktopShell>
  )
}
