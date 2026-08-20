'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

interface ReviewItem {
  id: string
  customerHandle: string
  text: string
  urgent: boolean
  createdAt: string
}

function AlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

export default function AiAgentReview() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
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
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Диалоги на проверке</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>Агент ещё обучается — черновики ответов ждут вашего одобрения</p>
        </motion.div>

        {items.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: 'var(--nav-text-muted)' }}>Пока нечего проверять</div>
        )}

        <div className="space-y-4">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.05, 0.3) }}
              className="nav-glass rounded-2xl p-4"
            >
              {item.urgent && (
                <div className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                  <AlertIcon /> Похоже на срочное/негатив
                </div>
              )}
              <div className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>Клиент: {item.customerHandle}</div>
              <textarea
                className="w-full rounded-lg px-3 py-2 text-sm mb-3 min-h-[80px] outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                value={edits[item.id] ?? item.text}
                onChange={e => setEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
              />
              {errors[item.id] && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{errors[item.id]}</div>}
              <div className="flex gap-2">
                <button onClick={() => act(item.id, 'send')} disabled={acting === item.id}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  Отправить
                </button>
                <button onClick={() => act(item.id, 'skip')} disabled={acting === item.id}
                  className="flex-1 nav-glass rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                  Пропустить
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
