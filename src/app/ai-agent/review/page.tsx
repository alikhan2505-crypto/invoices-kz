'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
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
    const headers = await authHeader()
    await fetch('/api/ai-agent/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId: id, action, editedText: edits[id] }),
    })
    setItems(prev => prev.filter(i => i.id !== id))
    setActing(null)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Загрузка…</div>

  return (
    <div className="max-w-xl mx-auto p-6 pb-24">
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
  )
}
