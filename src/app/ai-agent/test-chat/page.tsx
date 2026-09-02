'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import TestChatPanel from '@/components/aiAgent/TestChatPanel'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

type AgentListItem = { id: string; name: string; status: string }

function BotIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V5M12 5a1.5 1.5 0 1 0-.001-3.001A1.5 1.5 0 0 0 12 5Z" />
      <path d="M9 14h.01M15 14h.01" />
      <path d="M9.5 17.2c.7.5 1.6.8 2.5.8s1.8-.3 2.5-.8" />
    </svg>
  )
}

export default function AiAgentTestChat() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [agentId, setAgentId] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    // ?agent=<id> preselects that agent in the picker. Read via
    // window.location like settings/page.tsx does -- NOT useSearchParams,
    // which would force a Suspense boundary around this whole client page.
    const agentParam = new URLSearchParams(window.location.search).get('agent')

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only client-side check as ../page.tsx -- the real
      // enforcement is the API's 403 admin_only; this swaps a redirect for
      // an inline message.
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { setForbidden(true); setLoading(false); return }
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/agents', { headers })
      if (res.ok) {
        const data = await res.json()
        const list: AgentListItem[] = Array.isArray(data.agents) ? data.agents : []
        setAgents(list)
        const preselected = agentParam && list.some(a => a.id === agentParam) ? agentParam : list[0]?.id || null
        setAgentId(preselected)
      }
      setLoading(false)
    }
    load()
  }, [router])

  function switchAgent(id: string) {
    if (id === agentId) return
    setAgentId(id)
    // TestChatPanel resets its own transcript when the agentId prop it
    // receives changes -- a different agent means a different persona, and
    // the old transcript would be misleading context.
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
      <div className="max-w-3xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Тестовый чат</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Пообщайтесь со своим агентом так, как это сделает клиент</p>
          </div>
          {agents.length > 0 && (
            <select
              value={agentId || ''}
              onChange={e => switchAgent(e.target.value)}
              aria-label="Выбор агента"
              className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer flex-shrink-0"
              style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
            >
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </motion.div>

        {agents.length === 0 ? (
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-8 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
          >
            <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
              <BotIcon />
            </div>
            <div className="text-base font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Пока нет ни одного агента</div>
            <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>
              Создайте AI-сотрудника — и сможете проверить его ответы здесь, ещё до подключения Instagram.
            </p>
            <Link href="/ai-agent/settings?new=1"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
              Создать агента
            </Link>
          </motion.div>
        ) : agentId ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
          >
            <TestChatPanel agentId={agentId} />
          </motion.div>
        ) : null}
      </div>
    </main>
    </DesktopShell>
  )
}
