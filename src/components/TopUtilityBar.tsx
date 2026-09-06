'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'

type WalletKey = 'unified'
type Panel = 'wallet' | 'notifications' | 'help' | 'account' | null

// Carries the mass-announcement welcome-bonus link's intent (?claimBonus=1)
// across a forced /login detour -- same "survive the login round-trip"
// purpose as postLoginRedirect.ts, but a bare boolean rather than a path, so
// it doesn't need that helper's exact-path allowlist.
const PENDING_BONUS_KEY = 'invoices.pendingWelcomeBonus'

// How long an untouched QR is shown before it is retired for a fresh one.
// Kaspi's own window is ~5 minutes; /kaspi-api and /upgrade already shorten
// the visible wait to a minute, and this widget follows them.
const IDLE_QR_MS = 60_000

interface HistoryEntry {
  label: string
  amount: number
  createdAt: string
}

interface WalletBreakdown {
  topup: number
  commission: number
  kaspi_shop_check: number
  ai_agent_reply: number
}

interface NotificationItem {
  id: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

interface WalletConfig {
  key: WalletKey
  label: string
  adminOnly: boolean
  balanceUrl: string
  historyUrl: string
  topupUrl: string
  topupStatusUrl: string
  amountField: 'amount' | 'amountTenge'
  minAmount: number
  presets: number[]
  formatBalance: (n: number) => string
}

const WALLETS: WalletConfig[] = [
  {
    key: 'unified', label: 'Кошелёк', adminOnly: false,
    balanceUrl: '/api/kaspi/wallet', historyUrl: '/api/kaspi/wallet/history',
    topupUrl: '/api/kaspi/wallet/topup', topupStatusUrl: '/api/kaspi/wallet/topup-status',
    amountField: 'amount', minAmount: 1000, presets: [1000, 2000, 5000, 10000],
    formatBalance: (n: number) => `${n.toLocaleString('ru-KZ')} ₸`,
  },
]

const BREAKDOWN_SEGMENTS: { key: keyof Omit<WalletBreakdown, 'topup'>; label: string; color: string }[] = [
  { key: 'commission', label: 'Счета', color: 'var(--nav-accent)' },
  { key: 'kaspi_shop_check', label: 'Kaspi Bot', color: 'var(--nav-teal)' },
  { key: 'ai_agent_reply', label: 'ИИ-агент', color: 'var(--nav-magenta)' },
]

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ч назад`
  return `${Math.floor(hr / 24)} дн назад`
}

// Russian plural agreement for "день" (1 день / 2 дня / 5 дней).
function pluralDays(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'дня'
  return 'дней'
}

// The ledger API (src/app/api/kaspi/wallet/history/route.ts) only returns
// {label, amount, createdAt} -- no category -- so operation dots are
// approximated from the label text it already sends (matches the same
// TYPE_LABELS strings that route uses) rather than touching that API,
// which is out of scope for this component-only pass. Topups (amount >= 0)
// always get the success dot regardless of label.
function walletDotColor(entry: HistoryEntry): string {
  if (entry.amount >= 0) return 'var(--nav-success)'
  if (entry.label.includes('Kaspi Bot')) return 'var(--nav-teal)'
  if (entry.label.includes('ИИ-агент')) return 'var(--nav-magenta)'
  return 'var(--nav-accent)'
}

export default function TopUtilityBar() {
  const router = useRouter()
  const pathname = usePathname()
  const reduceMotion = !!useReducedMotion()
  const [loggedIn, setLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [bonusClaimMessage, setBonusClaimMessage] = useState<string | null>(null)

  // Wallet state
  const [balances, setBalances] = useState<Partial<Record<WalletKey, number>>>({})
  const [activeWallet, setActiveWallet] = useState<WalletKey>('unified')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [breakdown, setBreakdown] = useState<WalletBreakdown | null>(null)
  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupError, setTopupError] = useState('')
  // `amount` and `expires_at` ride along so the QR can be reissued in place
  // when Kaspi's ~5-minute window closes. Before that, an expired code just
  // dumped the customer back to the amount picker with "время оплаты
  // истекло" -- the one real customer who ever tried to top up lost two
  // payments that way on 2026-09-01 and never came back.
  const [topupPending, setTopupPending] = useState<
    { topup_id: string; payment_link: string; amount: number; expires_at: number } | null
  >(null)
  const [topupSecondsLeft, setTopupSecondsLeft] = useState(0)
  const [topupRefreshing, setTopupRefreshing] = useState(false)
  // Kaspi's 'Wait' status: the customer is on the confirmation screen right
  // now. While true, the idle force-refresh below must not pull the code out
  // from under them -- same guarantee /kaspi-api and /upgrade make. Read by
  // the poll's closure, so it needs the ref (state alone would be stale
  // there without adding it to the interval's dependency array, which would
  // tear the interval down on every flip).
  const [topupScanning, setTopupScanning] = useState(false)
  const topupScanningRef = useRef(false)
  // When the current code (QR or phone push) was minted -- the 60s idle
  // deadline counts from here, not from Kaspi's own ~5-minute expiry.
  const topupCreatedAtRef = useRef(0)
  // Payment pushed into the customer's own Kaspi app instead of a QR they'd
  // need a second device to scan. Subscriptions have had this for a while;
  // the wallet only offered the QR.
  const [topupPhone, setTopupPhone] = useState('')
  const [topupPhoneOpen, setTopupPhoneOpen] = useState(false)
  const [topupPhoneSending, setTopupPhoneSending] = useState(false)
  // True while a pushed request is outstanding: there is no QR to show or
  // refresh, so the countdown and the reissue path both stand down.
  const [topupPhoneSent, setTopupPhoneSent] = useState(false)
  // True once Kaspi reports the push declined/rejected (or it lapsed
  // unanswered) -- a dedicated screen rather than a transient error line, so
  // "try again" is an actual button instead of the customer having to notice
  // an error string and re-fill the amount from scratch.
  const [topupPhoneDeclined, setTopupPhoneDeclined] = useState(false)
  const [topupQrDataUrl, setTopupQrDataUrl] = useState<string | null>(null)
  const [showTopup, setShowTopup] = useState(false)
  // "Заработано через Kaspi" (paid invoices, last 30 days) and the tariff
  // row's "used this month" count -- both real, fetched only when the
  // wallet panel actually opens (not worth loading on every page mount).
  const [kaspiEarned30d, setKaspiEarned30d] = useState<number | null>(null)
  const [monthInvoiceCount, setMonthInvoiceCount] = useState<number | null>(null)

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const refreshBalances = useCallback(async (wallets: WalletConfig[], headers: Record<string, string>) => {
    const results = await Promise.all(wallets.map(async w => {
      const res = await fetch(w.balanceUrl, { headers })
      if (!res.ok) return [w.key, undefined] as const
      const data = await res.json()
      return [w.key, Number(data.balance) || 0] as const
    }))
    setBalances(prev => {
      const next = { ...prev }
      for (const [key, value] of results) if (value !== undefined) next[key] = value
      return next
    })
  }, [])

  const refreshUnreadCount = useCallback(async (headers: Record<string, string>) => {
    const res = await fetch('/api/notifications', { headers })
    if (!res.ok) return
    const data = await res.json()
    setUnreadCount(data.unreadCount || 0)
  }, [])

  useEffect(() => {
    async function init() {
      // Mass-announcement welcome-bonus link (?claimBonus=1) can land on
      // this page while the visitor is logged out -- the common case for an
      // email link, since /dashboard's own auth guard bounces to /login
      // without preserving the query string. Persisted here, before the
      // auth check below, so the intent survives that forced detour; the
      // actual claim happens further down, once a real user exists.
      if (new URLSearchParams(window.location.search).get('claimBonus') === '1') {
        window.history.replaceState(null, '', window.location.pathname)
        try { localStorage.setItem(PENDING_BONUS_KEY, '1') } catch {}
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setLoggedIn(true)
      setEmail(user.email || '')
      setUserId(user.id)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_admin, company_name, plan, plan_expires_at, trial_expires_at, bonus_expires_at')
        .eq('id', user.id).maybeSingle()
      const admin = !!profileData?.is_admin
      setIsAdmin(admin)
      setCompanyName(profileData?.company_name || '')
      setProfile(profileData)
      const headers = await authHeader()
      const visible = WALLETS.filter(w => !w.adminOnly || admin)
      refreshBalances(visible, headers)
      refreshUnreadCount(headers)

      // Reads the flag captured near the top of this function, not the URL
      // directly -- by the time a logged-out visitor's login detour lands
      // back here, the query string from the original click is long gone.
      let pendingBonus = false
      try { pendingBonus = localStorage.getItem(PENDING_BONUS_KEY) === '1' } catch {}
      if (pendingBonus) {
        try { localStorage.removeItem(PENDING_BONUS_KEY) } catch {}
        try {
          const res = await fetch('/api/wallet/claim-welcome-bonus', { method: 'POST', headers })
          const data = await res.json().catch(() => null)
          if (res.ok && data?.claimed) {
            setBonusClaimMessage(`Начислено ${data.amount} ₸ — добро пожаловать!`)
            refreshBalances(visible, headers)
          } else if (res.ok && data?.reason === 'already_claimed') {
            setBonusClaimMessage('Бонус уже был получен ранее.')
          }
          if (res.ok && data && (data.claimed || data.reason === 'already_claimed')) {
            // Not openPanel('wallet') -- its closure over `userId` state
            // would still see the pre-setUserId(user.id) value this early in
            // the same init() call. selectWallet/loadWalletExtras do what
            // openPanel does for the wallet case, using user.id directly.
            // Opened for BOTH outcomes -- a second visit to the same link
            // must still show something, not silently do nothing.
            setPanel('wallet')
            selectWallet(activeWallet)
            loadWalletExtras(user.id)
          }
        } catch {
          // Silent -- a failed claim attempt shouldn't block the rest of the page.
        }
      }
    }
    init()
  }, [refreshBalances, refreshUnreadCount])

  // "Заработано через Kaspi" (sum of PAID invoices, last 30 days) and the
  // tariff row's "used this month" count (all invoices, any status, since
  // the 1st of the current calendar month -- same window create/page.tsx's
  // own monthCount uses, so the two "N/limit" numbers agree everywhere).
  async function loadWalletExtras(uid: string) {
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [{ data: paidInvoices }, { count }] = await Promise.all([
      supabase.from('invoices').select('amount').eq('user_id', uid).eq('status', 'paid').gte('created_at', since30),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', monthStart.toISOString()),
    ])
    setKaspiEarned30d((paidInvoices || []).reduce((sum, inv: any) => sum + Number(inv.amount), 0))
    setMonthInvoiceCount(count || 0)
  }

  // Generated client-side (same 'qrcode' package already used on /kaspi-api's
  // own wallet top-up) so a payment can be scanned right in this popup --
  // previously the only way to pay was the "Открыть оплату" link, which sent
  // the founder to a new tab just to see a QR.
  useEffect(() => {
    if (!topupPending?.payment_link) { setTopupQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(topupPending.payment_link, { width: 160, margin: 1 })
      .then(url => { if (!cancelled) setTopupQrDataUrl(url) })
      .catch(() => {}) // No QR image -- the plain link below still works.
    return () => { cancelled = true }
  }, [topupPending?.payment_link])

  async function selectWallet(key: WalletKey) {
    setActiveWallet(key)
    setTopupAmount(null)
    setTopupCustom('')
    setTopupError('')
    setTopupPending(null)
    setTopupPhoneSent(false)
    setTopupPhoneDeclined(false)
    setTopupPhoneOpen(false)
    setShowTopup(false)
    setHistoryLoading(true)
    const wallet = WALLETS.find(w => w.key === key)!
    const headers = await authHeader()
    const res = await fetch(wallet.historyUrl, { headers })
    if (res.ok) {
      const data = await res.json()
      setHistory(data.entries || [])
      setBreakdown(data.breakdown || null)
    } else {
      setHistory([])
      setBreakdown(null)
    }
    setHistoryLoading(false)
  }

  function openPanel(p: Exclude<Panel, null>) {
    setPanel(p)
    if (p === 'wallet') {
      selectWallet(activeWallet)
      if (userId) loadWalletExtras(userId)
    }
    if (p === 'notifications') loadNotifications()
  }

  async function loadNotifications() {
    setNotificationsLoading(true)
    const headers = await authHeader()
    const res = await fetch('/api/notifications', { headers })
    if (res.ok) {
      const data = await res.json()
      setNotifications(data.items || [])
      setUnreadCount(data.unreadCount || 0)
    }
    setNotificationsLoading(false)
  }

  async function markAllRead() {
    const headers = await authHeader()
    await fetch('/api/notifications/read-all', { method: 'POST', headers })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  function formatKzPhone(value: string) {
    const digits = value.replace(/\D/g, '').replace(/^8/, '7')
    if (!digits) return ''
    let out = '+7'
    if (digits.length > 1) out += ' ' + digits.slice(1, 4)
    if (digits.length > 4) out += ' ' + digits.slice(4, 7)
    if (digits.length > 7) out += ' ' + digits.slice(7, 9)
    if (digits.length > 9) out += ' ' + digits.slice(9, 11)
    return out
  }

  async function sendTopupToPhone(wallet: WalletConfig, amount: number) {
    if (amount < wallet.minAmount) {
      setTopupError(`Минимум ${wallet.minAmount.toLocaleString('ru-KZ')} ₸`)
      return
    }
    setTopupPhoneSending(true)
    setTopupError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi/wallet/topup-phone', {
        method: 'POST', headers, body: JSON.stringify({ amount, phone: topupPhone }),
      })
      const data = await res.json()
      if (res.ok) {
        // Reuses the same pending shape so the existing status poll settles
        // it; expires_at 0 keeps the countdown and reissue paths out of it.
        setTopupPending({ topup_id: data.topup_id, payment_link: '', amount, expires_at: 0 })
        setTopupPhoneSent(true)
        setTopupPhoneDeclined(false)
        setTopupPhoneOpen(false)
      } else {
        setTopupError(data.error === 'invalid_phone'
          ? 'Проверьте номер телефона'
          : data.error === 'invalid_amount'
            ? `Минимум ${(data.min ?? wallet.minAmount).toLocaleString('ru-KZ')} ₸`
            : 'Не удалось отправить запрос, попробуйте ещё раз')
      }
    } catch {
      setTopupError('Не удалось отправить запрос, попробуйте ещё раз')
    }
    setTopupPhoneSending(false)
  }

  // A pushed phone request has no Kaspi-side expiry of its own (unlike a QR's
  // ~5 minutes), so without an explicit way out the customer was stuck
  // waiting on the poll to notice a decline -- or, if they never touch the
  // Kaspi app at all, stuck until the daily cron finally sweeps it a day
  // later. force=true asks Kaspi for the real status first and only then
  // closes the row, so a request that is paid in this exact instant is still
  // credited rather than discarded.
  async function cancelPhoneTopup(wallet: WalletConfig) {
    const topupId = topupPending?.topup_id
    setTopupPending(null)
    setTopupPhoneSent(false)
    setTopupError('')
    if (!topupId) return
    try {
      const headers = await authHeader()
      const res = await fetch(`${wallet.topupStatusUrl}?topup_id=${topupId}&force=true`, { headers })
      const data = await res.json()
      if (data.status === 'paid') { await refreshBalances([wallet], headers); selectWallet(activeWallet) }
    } catch (e: any) {
      console.error('Cancel phone topup: force-settle failed:', e.message)
    }
  }

  async function startTopup(wallet: WalletConfig, amount: number) {
    if (amount < wallet.minAmount) {
      setTopupError(`Минимум ${wallet.minAmount.toLocaleString('ru-KZ')} ₸`)
      return
    }
    setToppingUp(true)
    setTopupError('')
    const headers = await authHeader()
    const res = await fetch(wallet.topupUrl, { method: 'POST', headers, body: JSON.stringify({ [wallet.amountField]: amount }) })
    const data = await res.json()
    if (res.ok) {
      setTopupPending({
        topup_id: data.topup_id,
        payment_link: data.payment_link,
        amount,
        expires_at: data.expires_at ? new Date(data.expires_at).getTime() : 0,
      })
      setTopupScanning(false)
      topupScanningRef.current = false
      topupCreatedAtRef.current = Date.now()
      setTopupPhoneDeclined(false)
    } else {
      setTopupError(data.error === 'invalid_amount' ? `Минимум ${(data.min ?? wallet.minAmount).toLocaleString('ru-KZ')} ₸` : 'Не удалось создать оплату, попробуйте ещё раз')
    }
    setToppingUp(false)
  }

  useEffect(() => {
    if (!topupPending) return
    const wallet = WALLETS.find(w => w.key === activeWallet)!
    const interval = setInterval(async () => {
      const headers = await authHeader()
      // Folded into the same 3s tick rather than a separate one-shot 60s
      // timer: a standalone timeout that fires once and gets refused (the
      // per-something rate limit, a slow network) never retries, since
      // nothing re-arms it. Piggybacking on the poll means the idle flag is
      // simply re-evaluated -- and re-sent -- every 3 seconds until it
      // succeeds, costs no extra requests (the poll was already running),
      // and can't drift out of sync with the code actually on screen.
      // Phone pushes are excluded: /kaspi-api never idle-forces one either,
      // since there's no code to swap and forcing it dead would just orphan
      // a request the customer may still act on in their own time.
      const idleOverdue = !topupPhoneSent && !topupScanningRef.current
        && topupCreatedAtRef.current > 0
        && Date.now() - topupCreatedAtRef.current >= IDLE_QR_MS
      const url = `${wallet.topupStatusUrl}?topup_id=${topupPending.topup_id}${idleOverdue ? '&force=true' : ''}`
      const res = await fetch(url, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.status === 'scanning') {
        setTopupScanning(true)
        topupScanningRef.current = true
        return
      }
      setTopupScanning(false)
      topupScanningRef.current = false
      if (data.status === 'paid') {
        setTopupPending(null)
        await refreshBalances([wallet], headers)
        selectWallet(activeWallet)
      } else if (data.status === 'expired' || data.status === 'failed') {
        // Both statuses leave a QR that Kaspi's scanner answers with a raw
        // "QR-код не распознан": 'expired' is the ~5-minute window closing or
        // Kaspi discarding the token, 'failed' is the customer scanning and
        // then cancelling. /kaspi-api already handles the pair this way.
        //
        // A pushed phone request has no QR to reissue -- the customer either
        // declined it or let it lapse in their Kaspi app, so say so and let
        // them choose again rather than silently pushing another one.
        if (topupPhoneSent) {
          setTopupPending(null)
          setTopupPhoneSent(false)
          setTopupPhoneDeclined(true)
          return
        }
        // Reissue in place rather than sending the customer back to the
        // amount picker: they already chose the amount and are standing in
        // front of the phone with Kaspi open.
        //
        // Stops THIS interval outright instead of guarding re-entrancy with
        // the `topupRefreshing` state flag -- that exact pattern on /upgrade
        // got permanently stuck: a successful reissue changes `topupPending`,
        // this effect's own dependency, whose cleanup then races the
        // `finally` block's reset. Clearing here first removes the
        // possibility of a second tick ever overlapping with this one, so no
        // flag is needed at all; a fresh interval starts on its own once
        // `startTopup` sets a new `topupPending` below.
        clearInterval(interval)
        setTopupRefreshing(true)
        const amount = topupPending.amount
        setTopupPending(null)
        try {
          await startTopup(wallet, amount)
        } finally {
          setTopupRefreshing(false)
        }
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupPending, activeWallet])

  // Local countdown so the deadline is visible before it passes. Shows the
  // nearer of Kaspi's own expiry and the 60s idle deadline the poll above
  // enforces -- matching /kaspi-api and /upgrade, so the number on screen
  // never reads "4:41" a moment before the code the poll is about to retire.
  // Purely informational: the poll's real Kaspi status decides everything,
  // never this reaching zero.
  useEffect(() => {
    if (!topupPending?.expires_at || topupPhoneSent) { setTopupSecondsLeft(0); return }
    const tick = () => {
      const kaspiLeft = Math.round((topupPending.expires_at - Date.now()) / 1000)
      const idleLeft = Math.round((topupCreatedAtRef.current + IDLE_QR_MS - Date.now()) / 1000)
      const left = topupScanningRef.current ? kaspiLeft : Math.min(kaspiLeft, idleLeft)
      setTopupSecondsLeft(Math.max(0, left))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [topupPending, topupPhoneSent])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // App chrome has no business on public/marketing pages: the landing, auth,
  // legal pages, and client-facing public document views (where the viewer
  // may be a logged-in platform user who is NOT the document's owner).
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/cashier-api' ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/') ||
    pathname.startsWith('/shop/') ||
    pathname.startsWith('/tools/')
  if (isPublicPage) return null

  if (!loggedIn) return null

  const visibleWallets = WALLETS.filter(w => !w.adminOnly || isAdmin)
  const wallet = visibleWallets.find(w => w.key === activeWallet) ?? visibleWallets[0]
  const initials = companyName ? companyName.slice(0, 2).toUpperCase() : '··'

  const activePlan = getActivePlan(profile)
  const totalSpend30d = breakdown ? breakdown.commission + breakdown.kaspi_shop_check + breakdown.ai_agent_reply : 0
  const currentBalance = balances[activeWallet]
  const daysLeft = totalSpend30d > 0 && currentBalance !== undefined
    ? Math.max(0, Math.floor(currentBalance / (totalSpend30d / 30)))
    : null
  const topupOpen = showTopup || !!topupPending
  const isWalletPanel = panel === 'wallet'

  return (
    <>
      {/* top-1.5 on mobile centres the 44px pill inside SiteNav's sticky h-14 (56px)
          top bar: 6 + 44 + 6 = 56. lg:top-[21px] (not top-2.5): DesktopShell's card went back to a lg:top-3 gap
          (floating/"парение" effect on all 4 sides), which shifts SiteNav's sticky bar
          — and everything in it — 12px lower on the 5 DesktopShell pages. The bar now
          spans roughly y=12..~77 there, and centering the ~46px pill in that range
          works out to top-[21px]. The 9 standalone kaspi-shop/ai-agent pages don't use
          DesktopShell, so their bar still starts at y=0 -- this pill sits ~11px low on
          those. Left as-is: those pages are admin-locked for regular users right now,
          so it's not worth a page-aware split for a gap only admins see. lg:right-6
          (not right-3): DesktopShell's card has a 28px corner radius at the same
          right-3 edge -- right-3 crowded the pill right into that curve, reading as
          jammed into the corner rather than sitting in the bar. right-6 clears it. */}
      <div data-tour="wallet" className="fixed top-1.5 lg:top-[21px] right-3 lg:right-6 z-50 flex items-center gap-1.5 nav-glass rounded-full px-1.5 py-0 lg:py-1.5"
        style={{ boxShadow: `0 12px 30px -14px rgba(10,10,15,0.35), var(--nav-card-glow)` }}>
        <button onClick={() => openPanel('wallet')} title="Кошелёк"
          className="flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1.5 hover:bg-gray-50 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="var(--nav-accent)" strokeWidth="1.6" />
            <path d="M3 10h18" stroke="var(--nav-accent)" strokeWidth="1.6" />
            <circle cx="17" cy="14" r="1.3" fill="var(--nav-accent)" />
          </svg>
          <span className="text-xs font-medium text-[var(--nav-accent)] tabular-nums">
            {balances.unified !== undefined ? `${balances.unified.toLocaleString('ru-KZ')} ₸` : '···'}
          </span>
        </button>

        <button onClick={() => openPanel('notifications')} title="Уведомления"
          className="relative w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 19a2 2 0 0 0 4 0" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-[#FF5A5F] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button onClick={() => openPanel('help')} title="Помощь"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--nav-accent)" strokeWidth="1.6" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.4v.3" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="17" r="0.9" fill="var(--nav-accent)" />
          </svg>
        </button>

        <button onClick={() => openPanel('account')} title="Аккаунт"
          className="w-11 h-11 rounded-full bg-[var(--nav-accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </button>
      </div>

      {panel && (
        <div
          className={
            isWalletPanel
              // Approved-form redesign: the wallet modal is centered on lg+
              // (max-w-md, true dialog) instead of dropping from the pill --
              // notifications/help/account are untouched top-right drops.
              ? 'fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:justify-center p-3 bg-black/30'
              : 'fixed inset-0 z-50 flex items-end lg:items-start justify-end p-3 lg:pr-6 bg-black/30'
          }
          onClick={() => setPanel(null)}>

          {panel === 'wallet' && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative nav-glass rounded-[24px] w-full max-w-lg mb-0 lg:mb-0 max-h-[84vh] overflow-y-auto overflow-x-hidden"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Approved form's signature 4px accent->teal top bar. */}
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />

              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>Баланс</div>
                  <button onClick={() => setPanel(null)} className="text-[var(--nav-text-secondary)] text-lg leading-none">✕</button>
                </div>

                <div className="text-4xl font-bold tabular-nums mt-2" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.03em' }}>
                  {currentBalance !== undefined ? `${currentBalance.toLocaleString('ru-KZ')} ₸` : '···'}
                </div>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
                  Один баланс на все сервисы — пополняете один раз, тратится там, где используете.
                </p>

                {bonusClaimMessage && (
                  <div className="text-xs font-semibold mt-3 rounded-xl px-3 py-2" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                    {bonusClaimMessage}
                  </div>
                )}

                {breakdown && totalSpend30d > 0 && (
                  <div className="mt-5">
                    <div className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>Расходы за 30 дней</div>
                    <div className="flex h-2 rounded-full overflow-hidden w-full" style={{ background: 'var(--nav-bg)' }}>
                      {BREAKDOWN_SEGMENTS.filter(s => breakdown[s.key] > 0).map(s => (
                        <div key={s.key} style={{ flexGrow: breakdown[s.key], background: s.color }} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                      {BREAKDOWN_SEGMENTS.filter(s => breakdown[s.key] > 0).map(s => (
                        <div key={s.key} className="flex items-center gap-1.5 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span style={{ color: 'var(--nav-text-secondary)' }}>{s.label}</span>
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{breakdown[s.key].toLocaleString('ru-KZ')} ₸</span>
                        </div>
                      ))}
                    </div>
                    {breakdown.topup > 0 && (
                      <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                        Пополнено за 30 дней: {breakdown.topup.toLocaleString('ru-KZ')} ₸
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 mt-5">
                  <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                    {daysLeft !== null ? (
                      <>Хватит на <b style={{ color: 'var(--nav-text-primary)' }}>{daysLeft} {pluralDays(daysLeft)}</b> при текущем темпе</>
                    ) : <>&nbsp;</>}
                  </div>
                  <button
                    onClick={() => setShowTopup(v => !v)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                  >
                    Пополнить
                  </button>
                </div>

                {topupOpen && (
                  <div className="mt-3 pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                    {!topupPending && topupPhoneDeclined ? (
                      <div className="text-center py-3">
                        <div className="text-2xl mb-2">🚫</div>
                        <p className="text-xs mb-3" style={{ color: 'var(--nav-text-primary)' }}>
                          Запрос отклонён в приложении Kaspi
                        </p>
                        <button onClick={() => { setTopupPhoneDeclined(false); setTopupPhoneOpen(true) }}
                          className="w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                          Повторить
                        </button>
                      </div>
                    ) : topupPending && topupPhoneSent ? (
                      <div className="text-center py-3">
                        <div className="text-2xl mb-2">📲</div>
                        <p className="text-xs mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                          Запрос отправлен на {formatKzPhone(topupPhone)}
                        </p>
                        <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                          Подтвердите оплату в приложении Kaspi — баланс пополнится автоматически.
                        </p>
                        <button onClick={() => cancelPhoneTopup(wallet)}
                          className="w-full text-center text-[11px] underline"
                          style={{ color: 'var(--nav-text-muted)' }}>
                          Отменить запрос
                        </button>
                      </div>
                    ) : topupPending ? (
                      <div>
                        <p className="text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>Отсканируйте QR-код Kaspi — баланс пополнится автоматически.</p>
                        {topupQrDataUrl && (
                          <div className="flex justify-center mb-2">
                            <img src={topupQrDataUrl} alt="Kaspi QR" className="w-40 h-40 rounded-lg" style={{ background: '#fff', padding: 8 }} />
                          </div>
                        )}
                        <div className="text-[11px] text-center mb-2 h-4" aria-live="polite">
                          {topupScanning ? (
                            <span style={{ color: 'var(--nav-success)' }}>Подтвердите оплату в приложении Kaspi…</span>
                          ) : topupRefreshing ? (
                            <span style={{ color: 'var(--nav-text-muted)' }}>Обновляем код…</span>
                          ) : topupSecondsLeft > 0 ? (
                            <span style={{ color: 'var(--nav-text-muted)' }}>
                              QR действителен ещё {Math.floor(topupSecondsLeft / 60)}:{String(topupSecondsLeft % 60).padStart(2, '0')}
                            </span>
                          ) : null}
                        </div>
                        <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                          className="block text-center rounded-lg px-3 py-2 text-xs font-medium"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                          Открыть оплату
                        </a>

                        {/* The phone alternative sits on the amount-picker
                            screen, which this QR view replaces -- without a
                            way back to it, choosing "Пополнить" hid the
                            alternative for good until the QR itself expired.
                            Same divider-plus-button treatment as the picker
                            screen below, not a plain text link, so the two
                            screens read as one continuous choice rather than
                            two different UI languages. */}
                        <div className="flex items-center gap-2 my-2">
                          <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>или</span>
                          <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                        </div>
                        <button onClick={() => { setTopupPending(null); setTopupPhoneOpen(true) }}
                          className="w-full rounded-lg px-3 py-2 text-xs font-medium border transition-colors"
                          style={{ borderColor: 'var(--nav-border-soft)', color: 'var(--nav-accent)', background: 'transparent' }}>
                          Отправить запрос на телефон
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-4 gap-1.5 mb-2">
                          {wallet.presets.map(amount => (
                            <button key={amount} onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                              style={topupAmount === amount
                                ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                                : { background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                              {amount.toLocaleString('ru-KZ')}
                            </button>
                          ))}
                        </div>
                        <input value={topupCustom} onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
                          placeholder="Своя сумма, ₸" type="text" inputMode="numeric" name="topupCustomAmount"
                          className="w-full border rounded-lg px-3 py-1.5 text-xs mb-2"
                          style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                        {topupError && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{topupError}</div>}
                        {(() => {
                          const topupDisabled = toppingUp || !((topupAmount ?? Number(topupCustom)) >= wallet.minAmount)
                          return (
                            <button onClick={() => startTopup(wallet, (topupAmount ?? Number(topupCustom)) || 0)}
                              disabled={topupDisabled}
                              className="w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                              style={topupDisabled
                                ? { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)', cursor: 'not-allowed' }
                                : { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                              {toppingUp ? 'Создаём оплату…' : 'Пополнить'}
                            </button>
                          )
                        })()}

                        {/* Same alternative the subscription modal offers:
                            useful when the page is open on the very phone
                            that has Kaspi installed, with nothing to scan
                            the QR with. */}
                        <div className="flex items-center gap-2 my-2">
                          <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>или</span>
                          <div className="flex-1 h-px" style={{ background: 'var(--nav-border-soft)' }} />
                        </div>

                        {topupPhoneOpen ? (
                          <>
                            <input
                              value={topupPhone}
                              onChange={e => setTopupPhone(formatKzPhone(e.target.value))}
                              placeholder="+7 777 123 45 67"
                              type="tel" inputMode="tel" name="topupPhone"
                              className="w-full border rounded-lg px-3 py-1.5 text-xs mb-2"
                              style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }}
                            />
                            {(() => {
                              const amount = (topupAmount ?? Number(topupCustom)) || 0
                              const disabled = topupPhoneSending
                                || amount < wallet.minAmount
                                || topupPhone.replace(/\D/g, '').length !== 11
                              return (
                                <button onClick={() => sendTopupToPhone(wallet, amount)} disabled={disabled}
                                  className="w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                                  style={disabled
                                    ? { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)', cursor: 'not-allowed' }
                                    : { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                                  {topupPhoneSending ? 'Отправляем…' : 'Отправить запрос'}
                                </button>
                              )
                            })()}
                          </>
                        ) : (
                          <button onClick={() => setTopupPhoneOpen(true)}
                            disabled={!((topupAmount ?? Number(topupCustom)) >= wallet.minAmount)}
                            className="w-full rounded-lg px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ borderColor: 'var(--nav-border-soft)', color: 'var(--nav-accent)', background: 'transparent' }}>
                            Отправить запрос на телефон
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                  <div className="text-[11px] font-extrabold uppercase mb-2.5" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.07em' }}>
                    Последние операции
                  </div>
                  {historyLoading && <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>Загрузка…</div>}
                  {!historyLoading && history.length === 0 && <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>Пока нет операций</div>}
                  {!historyLoading && history.length > 0 && (
                    <div className="space-y-0.5 max-h-40 overflow-y-auto pr-2 -mr-2">
                      {history.slice(0, 8).map((h, i) => (
                        <motion.div
                          key={i}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : 0.05 + i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                          className="flex items-center justify-between gap-3 py-1.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: walletDotColor(h) }} />
                            <span className="text-xs truncate" style={{ color: 'var(--nav-text-primary)' }}>{h.label}</span>
                            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>{timeAgo(h.createdAt)}</span>
                          </div>
                          <span className="text-xs font-semibold tabular-nums flex-shrink-0" style={{ color: h.amount >= 0 ? 'var(--nav-success)' : 'var(--nav-text-primary)' }}>
                            {h.amount >= 0 ? '+' : ''}{h.amount.toLocaleString('ru-KZ')}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="6" width="20" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="17" cy="14.5" r="1.2" fill="currentColor" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Заработано через Kaspi</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--nav-text-muted)' }}>
                        Оплаты приходят напрямую на ваш Kaspi ·{' '}
                        <Link href="/kaspi-api" onClick={() => setPanel(null)} className="font-medium" style={{ color: 'var(--nav-accent)' }}>Kaspi Pay →</Link>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>
                    {kaspiEarned30d !== null ? `${kaspiEarned30d.toLocaleString('ru-KZ')} ₸` : '···'}
                  </div>
                </div>

                <div className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                  {activePlan.invoiceLimit === null ? (
                    <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                      Тариф <b style={{ color: 'var(--nav-text-primary)' }}>{activePlan.label}</b> · безлимит
                    </div>
                  ) : (
                    <>
                      <div className="text-xs flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>
                        Тариф <b style={{ color: 'var(--nav-text-primary)' }}>{activePlan.label}</b>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nav-accent-track)' }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, ((monthInvoiceCount ?? 0) / activePlan.invoiceLimit) * 100)}%`,
                            background: 'var(--nav-accent)',
                          }} />
                      </div>
                      <div className="text-xs flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>
                        <b style={{ color: 'var(--nav-text-primary)' }}>{monthInvoiceCount ?? '···'}/{activePlan.invoiceLimit}</b> счетов
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {panel === 'notifications' && (
            <div className="nav-glass rounded-2xl w-full max-w-sm mb-0 lg:mb-0 lg:mt-[76px] max-h-[80vh] overflow-y-auto" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-[var(--nav-accent)]">Уведомления</h2>
                  <button onClick={() => setPanel(null)} className="text-[var(--nav-text-secondary)] text-lg leading-none">✕</button>
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-[var(--nav-text-secondary)] hover:text-[var(--nav-accent)] mb-3">Отметить всё прочитанным</button>
                )}
                {notificationsLoading && <div className="text-xs text-[var(--nav-text-secondary)] py-4 text-center">Загрузка…</div>}
                {!notificationsLoading && notifications.length === 0 && (
                  <div className="text-xs text-[var(--nav-text-secondary)] py-8 text-center">Пока нет уведомлений</div>
                )}
                <div className="space-y-1 mt-2">
                  {notifications.map(n => {
                    const content = (
                      <div className={`rounded-lg px-3 py-2.5 ${n.read ? '' : 'bg-[#F5F6FB]'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm ${n.read ? 'text-gray-600' : 'text-[var(--nav-accent)] font-medium'}`}>{n.title}</span>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--nav-accent)] mt-1.5 flex-shrink-0" />}
                        </div>
                        {n.body && <div className="text-xs text-[var(--nav-text-secondary)] mt-0.5">{n.body}</div>}
                        <div className="text-[10px] text-[var(--nav-text-muted)] mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                    )
                    return n.link ? (
                      <Link key={n.id} href={n.link} onClick={() => setPanel(null)} className="block hover:bg-gray-50 rounded-lg transition-colors">{content}</Link>
                    ) : (
                      <div key={n.id}>{content}</div>
                    )
                  })}
                </div>
                <Link href="/profile/notifications" onClick={() => setPanel(null)}
                  className="block text-center text-xs text-[var(--nav-text-secondary)] hover:text-[var(--nav-accent)] mt-4 pt-3 border-t border-[var(--nav-border-soft)]">
                  Настройки уведомлений
                </Link>
              </div>
            </div>
          )}

          {panel === 'help' && (
            <div className="nav-glass rounded-2xl w-full max-w-xs mb-0 lg:mb-0 lg:mt-[76px]" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1 px-1">
                  <h2 className="text-sm font-bold text-[var(--nav-accent)]">Помощь</h2>
                  <button onClick={() => setPanel(null)} className="text-[var(--nav-text-secondary)] text-lg leading-none">✕</button>
                </div>
                <Link href="/profile/support" onClick={() => setPanel(null)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <path d="M4 11a8 8 0 1 1 3.5 6.6L4 19l1.3-3.3A7.96 7.96 0 0 1 4 11Z" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  Поддержка
                </Link>
                <Link href="/profile/about" onClick={() => setPanel(null)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="9" stroke="var(--nav-accent)" strokeWidth="1.6" />
                    <path d="M12 11v5.5" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="12" cy="8" r="1" fill="var(--nav-accent)" />
                  </svg>
                  О сервисе
                </Link>
              </div>
            </div>
          )}

          {panel === 'account' && (
            <div className="nav-glass rounded-2xl w-full max-w-xs mb-0 lg:mb-0 lg:mt-[76px]" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
              <div className="p-3">
                <div className="flex items-center gap-3 px-2 py-2 mb-1">
                  <div className="w-10 h-10 rounded-full bg-[var(--nav-accent)] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--nav-accent)] truncate">{companyName || 'Без названия'}</div>
                    <div className="text-xs text-[var(--nav-text-secondary)] truncate">{email}</div>
                  </div>
                </div>
                <Link href="/profile" onClick={() => setPanel(null)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <circle cx="12" cy="8" r="4" stroke="var(--nav-accent)" strokeWidth="1.6" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Профиль и настройки
                </Link>
                <button onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-red-50 text-sm text-red-500 transition-colors text-left">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <path d="M15 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M10 8l-4 4 4 4M6 12h11" stroke="#FF5A5F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Выйти
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </>
  )
}
