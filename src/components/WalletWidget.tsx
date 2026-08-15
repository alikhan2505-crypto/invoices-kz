'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type WalletKey = 'invoices' | 'kaspiShop' | 'aiAgent'

interface HistoryEntry {
  label: string
  amount: number
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
  // Счета is denominated directly in tenge; Kaspi Shop/AI-agent use a
  // credit system (1 credit = 5 ₸) -- each wallet keeps its own existing
  // display convention (already used elsewhere in the app) rather than
  // forcing a single unit across all three.
  amountField: 'amount' | 'amountTenge'
  minAmount: number
  presets: number[]
  formatBalance: (n: number) => string
}

const WALLETS: WalletConfig[] = [
  {
    key: 'invoices', label: 'Счета', adminOnly: false,
    balanceUrl: '/api/kaspi/wallet', historyUrl: '/api/kaspi/wallet/history',
    topupUrl: '/api/kaspi/wallet/topup', topupStatusUrl: '/api/kaspi/wallet/topup-status',
    amountField: 'amount', minAmount: 1000, presets: [1000, 2000, 5000, 10000],
    formatBalance: n => `${n.toLocaleString('ru-KZ')} ₸`,
  },
  {
    key: 'kaspiShop', label: 'Магазин', adminOnly: true,
    balanceUrl: '/api/kaspi-shop/wallet', historyUrl: '/api/kaspi-shop/wallet/history',
    topupUrl: '/api/kaspi-shop/wallet/topup', topupStatusUrl: '/api/kaspi-shop/wallet/topup-status',
    amountField: 'amountTenge', minAmount: 500, presets: [500, 1000, 2500, 5000],
    formatBalance: n => `${n.toLocaleString('ru-KZ')} кредитов`,
  },
  {
    key: 'aiAgent', label: 'ИИ бот', adminOnly: true,
    balanceUrl: '/api/ai-agent/wallet', historyUrl: '/api/ai-agent/wallet/history',
    topupUrl: '/api/ai-agent/wallet/topup', topupStatusUrl: '/api/ai-agent/wallet/topup-status',
    amountField: 'amountTenge', minAmount: 500, presets: [500, 1000, 2500, 5000],
    formatBalance: n => `${n.toLocaleString('ru-KZ')} кредитов`,
  },
]

export default function WalletWidget() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [open, setOpen] = useState(false)
  const [balances, setBalances] = useState<Partial<Record<WalletKey, number>>>({})
  const [selected, setSelected] = useState<WalletKey | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [topupAmount, setTopupAmount] = useState<number | null>(null)
  const [topupCustom, setTopupCustom] = useState('')
  const [toppingUp, setToppingUp] = useState(false)
  const [topupError, setTopupError] = useState('')
  const [topupPending, setTopupPending] = useState<{ topup_id: string; payment_link: string } | null>(null)

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

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setLoggedIn(true)
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      const admin = !!profile?.is_admin
      setIsAdmin(admin)
      const headers = await authHeader()
      const visible = WALLETS.filter(w => !w.adminOnly || admin)
      refreshBalances(visible, headers)
    }
    init()
  }, [refreshBalances])

  async function openWallet(key: WalletKey) {
    setSelected(key)
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
    } else {
      setHistory([])
    }
    setHistoryLoading(false)
  }

  async function startTopup(wallet: WalletConfig, amount: number) {
    if (amount < wallet.minAmount) {
      setTopupError(`Минимум ${wallet.minAmount.toLocaleString('ru-KZ')} ₸`)
      return
    }
    setToppingUp(true)
    setTopupError('')
    const headers = await authHeader()
    const res = await fetch(wallet.topupUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ [wallet.amountField]: amount }),
    })
    const data = await res.json()
    if (res.ok) {
      setTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
    } else {
      setTopupError(data.error === 'invalid_amount' ? `Минимум ${(data.min ?? wallet.minAmount).toLocaleString('ru-KZ')} ₸` : 'Не удалось создать оплату, попробуйте ещё раз')
    }
    setToppingUp(false)
  }

  // Polls the pending top-up's status every 3s, same pattern already used
  // for Kaspi Shop/AI-agent/Acquiring top-ups elsewhere in this app.
  useEffect(() => {
    if (!topupPending || !selected) return
    const wallet = WALLETS.find(w => w.key === selected)!
    const interval = setInterval(async () => {
      const headers = await authHeader()
      const res = await fetch(`${wallet.topupStatusUrl}?topup_id=${topupPending.topup_id}`, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.status === 'paid') {
        setTopupPending(null)
        setTopupAmount(null)
        setTopupCustom('')
        await refreshBalances([wallet], headers)
        openWallet(selected)
      } else if (data.status === 'expired') {
        setTopupPending(null)
        setTopupError('Время оплаты истекло, попробуйте снова')
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupPending, selected])

  if (!loggedIn) return null

  const visibleWallets = WALLETS.filter(w => !w.adminOnly || isAdmin)
  const selectedWallet = selected ? WALLETS.find(w => w.key === selected)! : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 flex items-center gap-1.5 bg-white rounded-full shadow-lg ring-1 ring-black/5 pl-2.5 pr-3 py-2 hover:shadow-xl transition-shadow"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="#1C2056" strokeWidth="1.6" />
          <path d="M3 10h18" stroke="#1C2056" strokeWidth="1.6" />
          <circle cx="17" cy="14" r="1.3" fill="#1C2056" />
        </svg>
        <span className="text-xs font-medium text-[#1C2056] tabular-nums">
          {balances.invoices !== undefined ? `${balances.invoices.toLocaleString('ru-KZ')} ₸` : '···'}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-3 bg-black/30" onClick={() => { setOpen(false); setSelected(null) }}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mt-14 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {!selectedWallet ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-[#1C2056]">Кошельки</h2>
                  <button onClick={() => setOpen(false)} className="text-gray-400 text-lg leading-none">✕</button>
                </div>
                <div className="space-y-2">
                  {visibleWallets.map(w => (
                    <button
                      key={w.key}
                      onClick={() => openWallet(w.key)}
                      className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 text-left transition-colors"
                    >
                      <span className="text-sm font-medium text-[#1C2056]">{w.label}</span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {balances[w.key] !== undefined ? w.formatBalance(balances[w.key]!) : '···'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">←</button>
                  <h2 className="text-sm font-bold text-[#1C2056] flex-1">{selectedWallet.label}</h2>
                  <button onClick={() => setOpen(false)} className="text-gray-400 text-lg leading-none">✕</button>
                </div>

                <div className="bg-[#1C2056] rounded-xl px-4 py-3 mb-4">
                  <div className="text-white text-lg font-bold tabular-nums">
                    {balances[selectedWallet.key] !== undefined ? selectedWallet.formatBalance(balances[selectedWallet.key]!) : '···'}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">История списаний</div>
                  {historyLoading && <div className="text-xs text-gray-400">Загрузка…</div>}
                  {!historyLoading && history.length === 0 && <div className="text-xs text-gray-400">Пока нет операций</div>}
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

                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs text-gray-500 mb-2">Пополнить</div>
                  {topupPending ? (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Оплатите QR-код Kaspi — баланс пополнится автоматически.</p>
                      <a href={topupPending.payment_link} target="_blank" rel="noopener noreferrer"
                        className="block text-center bg-[#1C2056] text-white rounded-lg px-3 py-2 text-xs font-medium">
                        Открыть оплату
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {selectedWallet.presets.map(amount => (
                          <button key={amount}
                            onClick={() => { setTopupAmount(amount); setTopupCustom('') }}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium ${topupAmount === amount ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
                            {amount.toLocaleString('ru-KZ')}
                          </button>
                        ))}
                      </div>
                      <input
                        value={topupCustom}
                        onChange={e => { setTopupCustom(e.target.value.replace(/\D/g, '')); setTopupAmount(null) }}
                        placeholder="Своя сумма, ₸" type="text" inputMode="numeric"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs mb-2"
                      />
                      {topupError && <div className="text-xs text-red-500 mb-2">{topupError}</div>}
                      <button
                        onClick={() => startTopup(selectedWallet, (topupAmount ?? Number(topupCustom)) || 0)}
                        disabled={toppingUp || !((topupAmount ?? Number(topupCustom)) >= selectedWallet.minAmount)}
                        className="w-full bg-[#1C2056] text-white rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40">
                        {toppingUp ? 'Создаём оплату…' : 'Пополнить'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
