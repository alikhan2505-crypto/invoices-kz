'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type WalletKey = 'unified'
type Panel = 'wallet' | 'notifications' | 'help' | 'account' | null

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
  { key: 'kaspi_shop_check', label: 'Kaspi Магазин', color: 'var(--nav-teal)' },
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

export default function TopUtilityBar() {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [panel, setPanel] = useState<Panel>(null)

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
  const [topupPending, setTopupPending] = useState<{ topup_id: string; payment_link: string } | null>(null)

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setLoggedIn(true)
      setEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('is_admin, company_name').eq('id', user.id).maybeSingle()
      const admin = !!profile?.is_admin
      setIsAdmin(admin)
      setCompanyName(profile?.company_name || '')
      const headers = await authHeader()
      const visible = WALLETS.filter(w => !w.adminOnly || admin)
      refreshBalances(visible, headers)
      refreshUnreadCount(headers)
    }
    init()
  }, [refreshBalances, refreshUnreadCount])

  async function selectWallet(key: WalletKey) {
    setActiveWallet(key)
    setTopupAmount(null)
    setTopupCustom('')
    setTopupError('')
    setTopupPending(null)
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
    if (p === 'wallet') selectWallet(activeWallet)
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
      setTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
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
      const res = await fetch(`${wallet.topupStatusUrl}?topup_id=${topupPending.topup_id}`, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.status === 'paid') {
        setTopupPending(null)
        await refreshBalances([wallet], headers)
        selectWallet(activeWallet)
      } else if (data.status === 'expired') {
        setTopupPending(null)
        setTopupError('Время оплаты истекло, попробуйте снова')
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupPending, activeWallet])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!loggedIn) return null

  const visibleWallets = WALLETS.filter(w => !w.adminOnly || isAdmin)
  const wallet = visibleWallets.find(w => w.key === activeWallet) ?? visibleWallets[0]
  const initials = companyName ? companyName.slice(0, 2).toUpperCase() : '··'

  return (
    <>
      {/* bottom-20 on mobile clears SiteNav's fixed bottom bar (mobile has no top bar);
          lg:top-3 on desktop keeps this pill at-or-below DesktopShell's own lg:top-3 (12px)
          card edge on the 5 DesktopShell pages, so it never pokes above the card's rounded
          top corner; on the other 9 pages (bar starts at y=0) this is a hair off perfect
          centering vs. the original top-2.5/10px calculation, an accepted tradeoff. */}
      <div className="fixed bottom-20 lg:bottom-auto lg:top-3 right-3 z-50 flex items-center gap-1.5 nav-glass rounded-full px-1.5 py-1.5"
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
          className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 19a2 2 0 0 0 4 0" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 bg-[#FF5A5F] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button onClick={() => openPanel('help')} title="Помощь"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--nav-accent)" strokeWidth="1.6" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.4v.3" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="17" r="0.9" fill="var(--nav-accent)" />
          </svg>
        </button>

        <button onClick={() => openPanel('account')} title="Аккаунт"
          className="w-8 h-8 rounded-full bg-[var(--nav-accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </button>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-start justify-end p-3 bg-black/30" onClick={() => setPanel(null)}>

          {panel === 'wallet' && (
            <div className="nav-glass rounded-2xl w-full max-w-2xl mb-32 lg:mb-0 lg:mt-14 max-h-[80vh] overflow-y-auto" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-[var(--nav-accent)]">{wallet.label}</h2>
                  <button onClick={() => setPanel(null)} className="text-[var(--nav-text-secondary)] text-lg leading-none">✕</button>
                </div>
                <div className="bg-[var(--nav-accent)] rounded-xl px-4 py-3 mb-4">
                  <div className="text-white text-lg font-bold tabular-nums">
                    {balances[activeWallet] !== undefined ? wallet.formatBalance(balances[activeWallet]!) : '···'}
                  </div>
                </div>
                {breakdown && (breakdown.commission + breakdown.kaspi_shop_check + breakdown.ai_agent_reply > 0) && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-2">Расходы за 30 дней</div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-2">
                      {BREAKDOWN_SEGMENTS.filter(s => breakdown[s.key] > 0).map(s => (
                        <div key={s.key} style={{ flexGrow: breakdown[s.key], backgroundColor: s.color }} />
                      ))}
                    </div>
                    <div className="space-y-1">
                      {BREAKDOWN_SEGMENTS.filter(s => breakdown[s.key] > 0).map(s => (
                        <div key={s.key} className="flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-gray-600">{s.label}</span>
                          <span className="ml-auto tabular-nums text-gray-500">{breakdown[s.key].toLocaleString('ru-KZ')} ₸</span>
                        </div>
                      ))}
                    </div>
                    {breakdown.topup > 0 && (
                      <div className="text-[11px] text-[var(--nav-text-muted)] mt-1.5">
                        Пополнено за 30 дней: {breakdown.topup.toLocaleString('ru-KZ')} ₸
                      </div>
                    )}
                  </div>
                )}
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">История списаний</div>
                  {historyLoading && <div className="text-xs text-[var(--nav-text-secondary)]">Загрузка…</div>}
                  {!historyLoading && history.length === 0 && <div className="text-xs text-[var(--nav-text-secondary)]">Пока нет операций</div>}
                  {!historyLoading && history.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 truncate mr-2">{h.label}</span>
                          <span className={`tabular-nums font-medium whitespace-nowrap ${h.amount >= 0 ? 'text-[#00A468]' : 'text-gray-500'}`}>
                            {h.amount >= 0 ? '+' : ''}{h.amount.toLocaleString('ru-KZ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-[var(--nav-border-soft)] pt-4">
                  <div className="text-xs text-gray-500 mb-2">Пополнить</div>
                  {topupPending ? (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
                      <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                        className="block text-center bg-[var(--nav-accent)] text-white rounded-lg px-3 py-2 text-xs font-medium">
                        Открыть оплату
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {wallet.presets.map(amount => (
                          <button key={amount} onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium ${topupAmount === amount ? 'bg-[var(--nav-accent)] text-white' : 'bg-gray-100 text-[var(--nav-accent)]'}`}>
                            {amount.toLocaleString('ru-KZ')}
                          </button>
                        ))}
                      </div>
                      <input value={topupCustom} onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
                        placeholder="Своя сумма, ₸" type="text" inputMode="numeric" name="topupCustomAmount"
                        className="w-full border border-[var(--nav-border-soft)] rounded-lg px-3 py-1.5 text-xs mb-2" />
                      {topupError && <div className="text-xs text-red-500 mb-2">{topupError}</div>}
                      {(() => {
                        const topupDisabled = toppingUp || !((topupAmount ?? Number(topupCustom)) >= wallet.minAmount)
                        return (
                          <button onClick={() => startTopup(wallet, (topupAmount ?? Number(topupCustom)) || 0)}
                            disabled={topupDisabled}
                            className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors ${topupDisabled ? 'bg-gray-100 text-[var(--nav-text-secondary)] cursor-not-allowed' : 'bg-[var(--nav-accent)] text-white hover:brightness-90'}`}>
                            {toppingUp ? 'Создаём оплату…' : 'Пополнить'}
                          </button>
                        )
                      })()}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {panel === 'notifications' && (
            <div className="nav-glass rounded-2xl w-full max-w-sm mb-32 lg:mb-0 lg:mt-14 max-h-[80vh] overflow-y-auto" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
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
            <div className="nav-glass rounded-2xl w-full max-w-xs mb-32 lg:mb-0 lg:mt-14" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
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
            <div className="nav-glass rounded-2xl w-full max-w-xs mb-32 lg:mb-0 lg:mt-14" style={{ boxShadow: 'var(--nav-card-glow)' }} onClick={e => e.stopPropagation()}>
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
