'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Admin() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ users: 0, invoices: 0, paid: 0 })
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) { router.push('/dashboard'); return }

      const [{ data: allUsers }, { data: allInvoices }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('invoices').select('status, amount'),
      ])

      setUsers(allUsers || [])
      setStats({
        users: (allUsers || []).length,
        invoices: (allInvoices || []).length,
        paid: (allInvoices || []).filter(i => i.status === 'paid').length,
      })
      setLoading(false)
    }
    load()
  }, [])

  async function updatePlan(userId: string, plan: string) {
    const { error } = await supabase.from('profiles').update({ plan }).eq('id', userId)
    if (error) { alert('Ошибка: ' + error.message); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u))
  }

  const filtered = users.filter(u =>
    (u.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.bin_iin || '').includes(search)
  )

  if (loading) return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Пользователей', value: stats.users, color: 'text-blue-400' },
            { label: 'Всего счетов', value: stats.invoices, color: 'text-green-400' },
            { label: 'Оплачено', value: stats.paid, color: 'text-yellow-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="bg-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-2 border border-gray-700 mb-4">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none bg-transparent text-white placeholder-gray-500"
            placeholder="Поиск по email, компании, БИН..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Users table */}
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
      </div>
    </main>
  )
}