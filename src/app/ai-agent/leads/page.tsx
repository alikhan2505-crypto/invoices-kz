'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { COLLECT_FIELD_LABELS } from '@/lib/aiAgent/promptContext'

const EASE = [0.16, 1, 0.3, 1] as const

type AgentListItem = { id: string; name: string }
type LeadItem = {
  id: string
  agentId: string
  agentName: string
  channel: string
  customerHandle: string
  collectedData: Record<string, string>
  lastActivityAt: string
  createdAt: string
}

// Same three inline-SVG channel icons as review/page.tsx and
// settings/page.tsx -- copied inline again rather than imported cross-file,
// this codebase's established convention for these icons.
function InstagramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-KZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AiAgentLeads() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [items, setItems] = useState<LeadItem[]>([])
  const [fetching, setFetching] = useState(false)

  const loadLeads = useCallback(async (agent: string) => {
    setFetching(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers = { 'Authorization': `Bearer ${session?.access_token}` }
    const params = new URLSearchParams()
    if (agent !== 'all') params.set('agentId', agent)
    const qs = params.toString()
    const res = await fetch(`/api/ai-agent/leads${qs ? `?${qs}` : ''}`, { headers })
    if (res.ok) {
      const payload = await res.json()
      setItems(Array.isArray(payload.items) ? payload.items : [])
    }
    setFetching(false)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only client-side check as ../analytics/page.tsx -- the
      // real enforcement is the API's 403 admin_only; this swaps a redirect
      // for an inline message.
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/ai-agent/agents', { headers })
      if (res.ok) {
        const payload = await res.json()
        setAgents(Array.isArray(payload.agents) ? payload.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
      }
      await loadLeads('all')
      setLoading(false)
    }
    load()
  }, [router, loadLeads])

  function changeAgent(id: string) {
    setAgentFilter(id)
    loadLeads(id)
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
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Заявки</h1>
              {items.length > 0 && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {items.length}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Данные, которые агент собрал у клиентов в переписке</p>
          </div>
          {agents.length > 0 && (
            <select
              value={agentFilter}
              onChange={e => changeAgent(e.target.value)}
              aria-label="Выбор агента"
              className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer flex-shrink-0"
              style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
            >
              <option value="all">Все агенты</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </motion.div>

        {items.length === 0 && !fetching && (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>
            Пока никто из клиентов не оставил данные — как только агент соберёт что-то в переписке (например, номер телефона), заявка появится здесь
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ opacity: fetching ? 0.6 : 1 }}>
          {items.map((item, i) => {
            const channel = CHANNEL_META[item.channel] || CHANNEL_META.instagram
            const ChannelIcon = channel.icon
            const fieldEntries = Object.entries(item.collectedData)
            return (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                className="nav-glass nav-card-accent rounded-2xl p-4 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 nav-glass rounded-full px-2 py-1 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                    <ChannelIcon /> {channel.label}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.customerHandle}</span>
                </div>

                {agentFilter === 'all' && agents.length > 1 && (
                  <div className="text-[11px] font-medium mb-2 truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.agentName}</div>
                )}

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {fieldEntries.map(([key, value]) => {
                    const label = COLLECT_FIELD_LABELS[key] || key
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                        style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}
                      >
                        <span style={{ fontWeight: 700, color: 'var(--nav-text-primary)', textTransform: 'capitalize' }}>{label}:</span> {value}
                      </span>
                    )
                  })}
                </div>

                <div className="text-[11px] mt-auto pt-1" style={{ color: 'var(--nav-text-muted)' }}>
                  Обновлено: {formatDate(item.lastActivityAt)}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
