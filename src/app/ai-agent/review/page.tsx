'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'

interface ReviewItem {
  id: string
  customerHandle: string
  text: string
  urgent: boolean
  createdAt: string
}

export default function AiAgentReview() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [forbidden, setForbidden] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    // AI-агент is admin-only for now -- same client-side is_admin check this
    // codebase already uses on /admin and every kaspi-shop/* page. The real
    // enforcement is server-side (the API routes below now 403 admin_only
    // for non-admins); this just swaps their redirect-to-/dashboard for an
    // inline message, since a redirect can misfire on a legitimate admin
    // session that hasn't finished loading yet.
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/review', { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function act(id: string, action: 'send' | 'skip') {
    setActing(id)
    setErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/review', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messageId: id, action, editedText: edits[id] }),
      })
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [id]: 'Не удалось выполнить действие. Попробуйте ещё раз.' }))
        return
      }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {
      setErrors(prev => ({ ...prev, [id]: 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.' }))
    } finally {
      setActing(null)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50">
      <SiteNav />
      <div className="p-8 text-center text-gray-400">Загрузка…</div>
    </main>
  )

  if (forbidden) return (
    <main className="min-h-screen bg-gray-50">
      <SiteNav />
      <div className="p-8 text-center text-gray-400 text-sm">Эта функция пока доступна только администраторам.</div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50">
    <SiteNav />
    <div className="max-w-xl mx-auto p-6 pb-24">
      <Link href="/ai-agent/settings" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">← Настройки агента</Link>
      <h1 className="text-xl font-bold text-[#1C2056] mb-1">Диалоги на проверке</h1>
      <p className="text-sm text-gray-500 mb-6">Агент ещё обучается — черновики ответов ждут вашего одобрения</p>

      {items.length === 0 && <div className="text-sm text-gray-400 text-center py-8">Пока нечего проверять</div>}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm p-4">
            {item.urgent && <div className="text-xs text-red-500 font-medium mb-2">🔴 Похоже на срочное/негатив</div>}
            <div className="text-xs text-gray-400 mb-2">Клиент: {item.customerHandle}</div>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 min-h-[80px]"
              value={edits[item.id] ?? item.text}
              onChange={e => setEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
            />
            {errors[item.id] && <div className="text-xs text-red-500 mb-2">{errors[item.id]}</div>}
            <div className="flex gap-2">
              <button onClick={() => act(item.id, 'send')} disabled={acting === item.id}
                className="flex-1 bg-[#1C2056] text-white rounded-lg px-3 py-2 text-sm font-medium">
                Отправить
              </button>
              <button onClick={() => act(item.id, 'skip')} disabled={acting === item.id}
                className="flex-1 bg-white border border-gray-200 text-gray-500 rounded-lg px-3 py-2 text-sm font-medium">
                Пропустить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </main>
  )
}
