'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import { useCrossHref } from '@/lib/useCrossHref'
import { ORDER_STATUS_TABS, PACKING_STATUS, TRANSFER_STATUS } from '@/lib/kaspiShop/orderStatuses'

// "Обзор" of Kaspi Bot (founder's mock, 21.09.2026): three numbers, the orders in
// work, and the hand-offs to the neighbouring products. Everything here reads
// endpoints the other Kaspi Bot pages already use; nothing new on the server.

const WORKING_STATUSES = ['NEW', PACKING_STATUS, TRANSFER_STATUS]

type OrderRow = {
  code: string
  status: string
  totalPrice: number
  creationTime: string
  items: { name: string; quantity: number }[]
  // The cabinet tab the order was read from (its label is the status shown to the seller).
  tab: string
}
type ProductRow = { own_current_price: number; last_competitor_price: number | null; floor_price: number }

const money = (n: number) => `${Math.round(n).toLocaleString('ru-KZ')} ₸`
const statusLabel = (v: string) => ORDER_STATUS_TABS.find((t) => t.value === v)?.label ?? v

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
}

export default function KaspiShopOverview() {
  const router = useRouter()
  const crossHref = useCrossHref()
  const [ready, setReady] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [profit, setProfit] = useState<{ net: number; revenue: number; missingCogs: number } | null | undefined>(undefined)
  const [orders, setOrders] = useState<OrderRow[] | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }

      const headers = await authHeader()
      const walletRes = await fetch('/api/kaspi-shop/wallet', { headers })
      const wallet = await walletRes.json().catch(() => null)
      // Not connected yet: the repricer page owns the connect flow.
      if (!wallet?.connected) { router.push('/kaspi-shop'); return }
      if (!alive) return
      const expired = wallet.sessionStatus === 'session_expired'
      setSessionExpired(expired)
      setReady(true)

      // Products come from our own database: instant.
      fetch('/api/kaspi-shop/products', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setProducts(d?.products ?? []) })
        .catch(() => { if (alive) setProducts([]) })

      if (expired) { setCounts({}); setProfit(null); setOrders([]); return }

      // The rest is read live from the Kaspi cabinet (a few seconds).
      fetch('/api/kaspi-shop/orders/counters', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then(async (d) => {
          if (!alive) return
          if (d?.sessionExpired) setSessionExpired(true)
          const c: Record<string, number> = d?.counts ?? {}
          setCounts(c)
          const active = WORKING_STATUSES.filter((s) => (c[s] ?? 0) > 0)
          const pages = await Promise.all(active.map((s) =>
            fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(s)}&page=0`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          ))
          const merged: OrderRow[] = pages.flatMap((p, i) => ((p?.orders ?? []) as OrderRow[]).map((o) => ({ ...o, tab: active[i] })))
          merged.sort((a, b) => new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime())
          if (alive) setOrders(merged.slice(0, 5))
        })
        .catch(() => { if (alive) { setCounts({}); setOrders([]) } })

      fetch('/api/kaspi-shop/profit?days=7', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return
          if (!d || d.sessionExpired) { setProfit(null); return }
          setProfit({ net: Number(d.netProfit) || 0, revenue: Number(d.totalRevenue) || 0, missingCogs: Number(d.productsWithoutCogsCount) || 0 })
        })
        .catch(() => { if (alive) setProfit(null) })
    }
    void load()
    return () => { alive = false }
  }, [router])

  if (!ready) return <LoadingSpinner />

  const inWork = counts ? WORKING_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0) : null
  const winning = products ? products.filter((p) => p.last_competitor_price !== null && p.own_current_price <= p.last_competitor_price).length : null
  const atFloor = products ? products.filter((p) => p.own_current_price <= p.floor_price + 0.01).length : null

  const back = '/kaspi-shop/overview'
  const links = [
    { title: 'Принимать оплату на витрине через Kaspi Pay', where: 'Kaspi Cashier API · api.invoices.kz', href: crossHref('kaspiApi', '/kaspi-api', 'kaspiShop', back) },
    { title: 'Выставить счёт по заказу', where: 'Счета · invoices.kz', href: crossHref('invoices', '/create', 'kaspiShop', back) },
    { title: 'Подключить AI-агента для ответов покупателям', where: 'AI-агент · agent.invoices.kz', href: crossHref('aiAgent', '/ai-agent', 'kaspiShop', back) },
  ]

  const kpi = (label: string, value: string | null, sub: string) => (
    <div className="flex-1 min-w-[200px] p-5" style={{ borderRight: '1px solid var(--nav-border)' }}>
      <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>{label}</div>
      <div className="mt-1 text-3xl font-black tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{value ?? '···'}</div>
      <div className="mt-1 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{sub}</div>
    </div>
  )

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="flex-1 min-w-0 p-4 lg:p-6 pb-6 space-y-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>Обзор</h1>
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Kaspi Bot</span>
          </div>

          {sessionExpired && (
            <div className="nav-glass rounded-2xl p-4 flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <span>Сессия Kaspi истекла, заказы и прибыль недоступны, пока вы не переподключите магазин.</span>
              <a href="/kaspi-shop?addStore=1" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Переподключить →</a>
            </div>
          )}

          <div className="nav-glass rounded-2xl flex flex-wrap overflow-hidden">
            {kpi('Заказов в работе', inWork === null ? null : String(inWork), counts ? `${counts[PACKING_STATUS] ?? 0} ждут упаковки` : 'загружаем из Kaspi')}
            {kpi('Дешевле конкурентов', winning === null || products === null ? null : `${winning} из ${products.length}`, atFloor === null ? '' : `упёрлись в минимум: ${atFloor}`)}
            {kpi('Прибыль за 7 дней', profit === undefined ? null : profit === null ? '—' : money(profit.net), profit ? (profit.missingCogs > 0 ? 'у части товаров не указана себестоимость' : `выручка ${money(profit.revenue)}`) : 'после комиссии и расходов')}
          </div>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Заказы в работе</h2>
              <a href="/kaspi-shop/orders" className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>Все заказы →</a>
            </div>
            <div className="nav-glass rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--nav-text-muted)' }}>
                    {['Заказ', 'Товар', 'Сумма', 'Статус'].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase ${i === 2 ? 'text-right' : 'text-left'}`} style={{ letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders === null && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказы из Kaspi…</td></tr>
                  )}
                  {orders !== null && orders.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--nav-text-muted)' }}>Сейчас нет заказов в работе</td></tr>
                  )}
                  {orders?.map((o) => (
                    <tr key={o.code} style={{ borderTop: '1px solid var(--nav-border)' }}>
                      <td className="px-4 py-3 font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{o.code}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--nav-text-primary)' }}>
                        {o.items?.[0]?.name ?? '—'}{(o.items?.length ?? 0) > 1 ? ` и ещё ${o.items.length - 1}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{money(o.totalPrice)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--nav-text-secondary)' }}>{statusLabel(o.tab)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Связано с другими продуктами</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {links.map((l) => (
                <a key={l.title} href={l.href} className="nav-glass rounded-2xl p-4 flex flex-col gap-1.5 transition-transform hover:-translate-y-0.5">
                  <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{l.title}</span>
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{l.where}</span>
                  <span className="text-xs font-semibold mt-auto pt-2" style={{ color: 'var(--nav-accent)' }}>Открыть →</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>
    </DesktopShell>
  )
}
