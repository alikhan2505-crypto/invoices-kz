'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatDateTime, formatDate } from '@/lib/date'

export default function Admin() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [promos, setPromos] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ users: 0, invoices: 0, paid: 0 })
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'users' | 'promos' | 'stats' | 'payments'>('payments')
  const [newPromo, setNewPromo] = useState({ code: '', plan: 'basic', days: 30, max_uses: 100 })
  const [savingPromo, setSavingPromo] = useState(false)
  const [regChart, setRegChart] = useState<{ day: string; count: number }[]>([])
  const [planStats, setPlanStats] = useState({ free: 0, basic: 0, pro: 0 })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()

    if (!profile?.is_admin) { router.push('/dashboard'); return }

    const [{ data: allUsers }, { data: allInvoices }, { data: allPromos }, { data: allPayments }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('status, amount'),
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('payment_requests').select('*').order('created_at', { ascending: false }),
    ])

    setUsers(allUsers || [])
    setPromos(allPromos || [])
    setPayments(allPayments || [])
    setStats({
      users: (allUsers || []).length,
      invoices: (allInvoices || []).length,
      paid: (allInvoices || []).filter(i => i.status === 'paid').length,
    })

    const days: { day: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dayStr = d.toISOString().split('T')[0]
      const count = (allUsers || []).filter(u =>
        u.created_at && u.created_at.startsWith(dayStr)
      ).length
      days.push({
        day: d.toLocaleDateString('ru-KZ', { day: 'numeric', month: 'short' }),
        count
      })
    }
    setRegChart(days)

    const free = (allUsers || []).filter(u => !u.plan || u.plan === 'free').length
    const basic = (allUsers || []).filter(u => u.plan === 'basic').length
    const pro = (allUsers || []).filter(u => u.plan === 'pro').length
    setPlanStats({ free, basic, pro })
    setLoading(false)
  }

  async function updatePlan(userId: string, plan: string) {
    const { error } = await supabase.from('profiles').update({ plan }).eq('id', userId)
    if (error) { alert('Ошибка: ' + error.message); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u))
  }

  async function activatePayment(payment: any) {
    const { error } = await supabase.from('profiles').update({
      plan: payment.plan,
      plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', payment.user_id)

    if (error) { alert('Ошибка: ' + error.message); return }

    await supabase.from('payment_requests').update({
      status: 'activated',
      activated_at: new Date().toISOString(),
    }).eq('id', payment.id)

    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🎉 <b>Тариф активирован!</b>\n📱 ${payment.email}\n📦 ${payment.plan === 'pro' ? 'Про' : 'Базовый'} тариф активирован`
        })
      })
    } catch {}

    alert(`✅ Тариф ${payment.plan} активирован для ${payment.email}`)
    load()
  }

  async function rejectPayment(id: string) {
    if (!confirm('Отклонить заявку?')) return
    await supabase.from('payment_requests').update({ status: 'rejected' }).eq('id', id)
    load()
  }

  async function createPromo() {
    if (!newPromo.code) { alert('Введите код'); return }
    setSavingPromo(true)
    const { error } = await supabase.from('promo_codes').insert({
      code: newPromo.code.toUpperCase(),
      plan: newPromo.plan,
      days: newPromo.days,
      max_uses: newPromo.max_uses,
    })
    if (error) { alert('Ошибка: ' + error.message); setSavingPromo(false); return }
    setNewPromo({ code: '', plan: 'basic', days: 30, max_uses: 100 })
    setSavingPromo(false)
    load()
  }

  async function togglePromo(id: string, is_active: boolean) {
    await supabase.from('promo_codes').update({ is_active: !is_active }).eq('id', id)
    load()
  }

  async function deletePromo(id: string) {
    if (!confirm('Удалить промокод?')) return
    await supabase.from('promo_codes').delete().eq('id', id)
    setPromos(prev => prev.filter(p => p.id !== id))
  }

  const filtered = users.filter(u =>
    (u.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.bin_iin || '').includes(search)
  )

  const pendingPayments = payments.filter(p => p.status === 'pending' || p.status === 'confirmed').length

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { label: '⏳ Ожидает', color: 'bg-yellow-500/20 text-yellow-400' }
      case 'confirmed': return { label: '💰 Оплата подтверждена', color: 'bg-blue-500/20 text-blue-400' }
      case 'activated': return { label: '✅ Активирован', color: 'bg-green-500/20 text-green-400' }
      case 'rejected': return { label: '❌ Отклонён', color: 'bg-gray-600 text-gray-400' }
      default: return { label: status, color: 'bg-gray-600 text-gray-400' }
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">INVOICES.KZ Admin</div>
          <div className="text-xs text-gray-400">Панель управления</div>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="text-xs bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">
          ← На сайт
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Пользователей', value: stats.users, color: 'text-blue-400' },
            { label: 'Всего счетов', value: stats.invoices, color: 'text-green-400' },
            { label: 'Оплачено', value: stats.paid, color: 'text-yellow-400' },
            { label: 'Новых заявок', value: pendingPayments, color: pendingPayments > 0 ? 'text-red-400' : 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button onClick={() => setTab('payments')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap relative ${tab === 'payments' ? 'bg-[#1C2056] text-white' : 'bg-gray-800 text-gray-400'}`}>
            💳 Заявки на оплату
            {pendingPayments > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingPayments}
              </span>
            )}
          </button>
          <button onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === 'users' ? 'bg-[#1C2056] text-white' : 'bg-gray-800 text-gray-400'}`}>
            👥 Пользователи
          </button>
          <button onClick={() => setTab('promos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === 'promos' ? 'bg-[#1C2056] text-white' : 'bg-gray-800 text-gray-400'}`}>
            🎟️ Промокоды
          </button>
          <button onClick={() => setTab('stats')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === 'stats' ? 'bg-[#1C2056] text-white' : 'bg-gray-800 text-gray-400'}`}>
            📊 Статистика
          </button>
        </div>

        {tab === 'payments' && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">💳</div>
                <div>Заявок пока нет</div>
              </div>
            ) : payments.map(payment => {
              const badge = statusBadge(payment.status)
              return (
                <div key={payment.id}
                  className={`bg-gray-800 rounded-xl border p-4 ${
                    payment.status === 'confirmed' ? 'border-blue-500/50' :
                    payment.status === 'pending' ? 'border-yellow-500/50' :
                    payment.status === 'activated' ? 'border-green-500/30' :
                    'border-gray-700'
                  }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${payment.plan === 'pro' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {payment.plan === 'pro' ? 'Pro' : 'Basic'}
                        </span>
                      </div>
                      <div className="text-sm font-medium mt-1">📱 {payment.email}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Сумма: <b>{payment.amount?.toLocaleString('ru-KZ')} ₸</b>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Подана: {formatDateTime(payment.created_at)}
                      </div>
                      {payment.activated_at && (
                        <div className="text-xs text-green-400 mt-0.5">
                          Активирован: {formatDateTime(payment.activated_at)}
                        </div>
                      )}
                    </div>
                    {(payment.status === 'pending' || payment.status === 'confirmed') && (
                      <div className="flex flex-col gap-2">
                        <button onClick={() => activatePayment(payment)}
                          className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs px-3 py-1.5 rounded-lg hover:bg-green-500/30 whitespace-nowrap">
                          ✅ Активировать
                        </button>
                        <button onClick={() => rejectPayment(payment.id)}
                          className="bg-red-500/10 text-red-400 text-xs px-3 py-1.5 rounded-lg hover:bg-red-500/20">
                          ✕ Отклонить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'users' && (
          <>
            <div className="bg-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-2 border border-gray-700 mb-4">
              <span className="text-gray-400">🔍</span>
              <input
                className="flex-1 text-sm outline-none bg-transparent text-white placeholder-gray-500"
                placeholder="Поиск по email, компании, БИН..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-gray-700 text-xs text-gray-400 uppercase">
                <div className="col-span-2">Пользователь</div>
                <div>БИН</div>
                <div>Тариф</div>
                <div>Действие</div>
              </div>
              {filtered.map((user, i) => (
                <div key={user.id}
                  className={`grid grid-cols-5 gap-4 px-4 py-3 items-center ${i < filtered.length - 1 ? 'border-b border-gray-700' : ''}`}>
                  <div className="col-span-2">
                    <div className="text-sm font-medium">{user.company_name || '—'}</div>
                    <div className="text-xs text-gray-400">{user.email || '—'}</div>
                    <div className="text-xs text-gray-600">
                      {user.created_at ? formatDate(user.created_at) : '—'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">{user.bin_iin || '—'}</div>
                  <div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      user.plan === 'pro' ? 'bg-yellow-500/20 text-yellow-400' :
                      user.plan === 'basic' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-600 text-gray-400'
                    }`}>
                      {user.plan || 'free'}
                    </span>
                  </div>
                  <div>
                    <select
                      value={user.plan || 'free'}
                      onChange={e => updatePlan(user.id, e.target.value)}
                      className="text-xs bg-gray-700 text-white rounded-lg px-2 py-1 border border-gray-600 outline-none">
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'promos' && (
          <>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4">
              <div className="font-medium text-sm mb-3">Создать промокод</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Код</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-600 uppercase"
                    placeholder="FREE30"
                    value={newPromo.code}
                    onChange={e => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тариф</label>
                  <select
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-600"
                    value={newPromo.plan}
                    onChange={e => setNewPromo({ ...newPromo, plan: e.target.value })}>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Дней бонуса</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-600"
                    type="number"
                    value={newPromo.days}
                    onChange={e => setNewPromo({ ...newPromo, days: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Макс. использований</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-600"
                    type="number"
                    value={newPromo.max_uses}
                    onChange={e => setNewPromo({ ...newPromo, max_uses: Number(e.target.value) })}
                  />
                </div>
              </div>
              <button onClick={createPromo} disabled={savingPromo}
                className="w-full bg-[#2DC48D] text-white rounded-lg py-2.5 text-sm font-medium">
                {savingPromo ? 'Создаём...' : '+ Создать промокод'}
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-gray-700 text-xs text-gray-400 uppercase">
                <div>Код</div>
                <div>Тариф</div>
                <div>Дней</div>
                <div>Использован</div>
                <div>Действие</div>
              </div>
              {promos.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Промокодов нет</div>
              ) : promos.map((promo, i) => (
                <div key={promo.id}
                  className={`grid grid-cols-5 gap-4 px-4 py-3 items-center ${i < promos.length - 1 ? 'border-b border-gray-700' : ''}`}>
                  <div className="font-mono font-bold text-yellow-400">{promo.code}</div>
                  <div>
                    <span className={`text-xs px-2 py-1 rounded-full ${promo.plan === 'pro' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {promo.plan}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300">{promo.days} дн.</div>
                  <div className="text-sm text-gray-300">{promo.used_count}/{promo.max_uses}</div>
                  <div className="flex gap-2">
                    <button onClick={() => togglePromo(promo.id, promo.is_active)}
                      className={`text-xs px-2 py-1 rounded-lg ${promo.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'}`}>
                      {promo.is_active ? 'Актив' : 'Откл'}
                    </button>
                    <button onClick={() => deletePromo(promo.id)}
                      className="text-xs text-red-400 hover:text-red-300">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
              <div className="font-medium text-sm mb-4">Распределение по тарифам</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-700 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-300">{planStats.free}</div>
                  <div className="text-xs text-gray-400 mt-1">Free</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stats.users > 0 ? Math.round(planStats.free / stats.users * 100) : 0}%</div>
                </div>
                <div className="bg-blue-500/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{planStats.basic}</div>
                  <div className="text-xs text-gray-400 mt-1">Basic</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stats.users > 0 ? Math.round(planStats.basic / stats.users * 100) : 0}%</div>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{planStats.pro}</div>
                  <div className="text-xs text-gray-400 mt-1">Pro</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stats.users > 0 ? Math.round(planStats.pro / stats.users * 100) : 0}%</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
              <div className="font-medium text-sm mb-1">Регистрации за 14 дней</div>
              <div className="text-xs text-gray-400 mb-4">
                Всего за период: {regChart.reduce((s, d) => s + d.count, 0)} пользователей
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={regChart}>
                    <defs>
                      <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2DC48D" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2DC48D" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <Tooltip
                      formatter={(value: any) => [value, 'Регистраций']}
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '11px' }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#2DC48D" strokeWidth={2} fill="url(#regGrad)" dot={{ fill: '#2DC48D', r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
              <div className="font-medium text-sm mb-3">Доход от подписок</div>
              <div className="text-xs text-gray-400 mb-3">Только реальные платящие пользователи</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Basic ({planStats.basic} польз.)</span>
                  <span className="text-blue-400 font-medium">0 ₸/мес</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Pro ({planStats.pro} польз.)</span>
                  <span className="text-yellow-400 font-medium">0 ₸/мес</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-sm font-bold">
                  <span className="text-gray-300">Итого</span>
                  <span className="text-[#2DC48D]">0 ₸/мес</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  * После подключения Kaspi Pay доход будет считаться автоматически.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}