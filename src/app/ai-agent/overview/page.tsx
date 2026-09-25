'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import { useCrossHref } from '@/lib/useCrossHref'

// "Обзор" of the AI agent (founder's mock, 21.09.2026): three numbers, the
// freshest conversations, and the hand-offs to the neighbouring products.
// Everything here reads endpoints the other AI-agent pages already use.

const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  website: 'Сайт',
  api: 'API',
}

type DialogRow = {
  id: string
  channel: string
  customerHandle: string
  lastMessagePreview: string
  lastActivityAt: string
  pausedForHuman: boolean
}

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
}

export default function AiAgentOverview() {
  const router = useRouter()
  const crossHref = useCrossHref()
  const [ready, setReady] = useState(false)
  const [totals, setTotals] = useState<{ conversations: number; replies: number } | null | undefined>(undefined)
  const [newLeads, setNewLeads] = useState<number | null>(null)
  const [dialogs, setDialogs] = useState<DialogRow[] | null>(null)
  const [hasAgents, setHasAgents] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      // Not silently back to /dashboard -- that left a Pro-only wall with zero
      // explanation. /upgrade is where every other Pro paywall in the app
      // already sends a blocked user (SiteNav's proOnly sections,
      // /profile/acquiring's cards).
      if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { router.push('/upgrade'); return }
      if (!alive) return
      setReady(true)

      const headers = await authHeader()

      fetch('/api/ai-agent/analytics?days=7', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setTotals(d ? { conversations: d.totals.conversations, replies: d.totals.replies } : null) })
        .catch(() => { if (alive) setTotals(null) })

      fetch('/api/ai-agent/leads', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setNewLeads((d?.items ?? []).filter((i: { leadStatus: string }) => i.leadStatus === 'new').length) })
        .catch(() => { if (alive) setNewLeads(null) })

      fetch('/api/ai-agent/dialogs', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setDialogs(((d?.items ?? []) as DialogRow[]).slice(0, 5)) })
        .catch(() => { if (alive) setDialogs([]) })

      fetch('/api/ai-agent/agents', { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setHasAgents(Array.isArray(d?.agents) ? d.agents.length > 0 : null) })
        .catch(() => { if (alive) setHasAgents(null) })
    }
    void load()
    return () => { alive = false }
  }, [router])

  if (!ready) return <LoadingSpinner />

  const pausedCount = dialogs === null ? null : dialogs.filter((d) => d.pausedForHuman).length
  // The table only ever holds the 5 freshest -- the KPI needs the real count
  // across everything, so it's derived from the same fetch's full list, kept
  // separately from the trimmed table rows.
  const back = '/ai-agent/overview'
  const links = [
    { title: 'Выставить счёт клиенту из диалога', where: 'Счета · invoices.kz', href: crossHref('invoices', '/create', 'aiAgent', back) },
    { title: 'Подключить Kaspi Bot для заказов', where: 'Kaspi Bot · kaspi.invoices.kz', href: crossHref('kaspiShop', '/kaspi-shop/overview', 'aiAgent', back) },
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
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>AI-агент</span>
          </div>

          {hasAgents === false && (
            <div className="nav-glass rounded-2xl p-4 flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <span>Пока не подключён ни один агент.</span>
              <a href="/ai-agent/settings?new=1" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Подключить агента →</a>
            </div>
          )}

          <div className="nav-glass rounded-2xl flex flex-wrap overflow-hidden">
            {kpi('Диалогов за неделю', totals === undefined ? null : totals === null ? '—' : String(totals.conversations), totals ? `${totals.replies} ответил агент сам` : '')}
            {kpi('Новых заявок', newLeads === null ? null : String(newLeads), 'из всех каналов')}
            {kpi('Ждут человека', pausedCount === null ? null : String(pausedCount), 'агент передал диалог')}
          </div>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Свежие диалоги</h2>
              <a href="/ai-agent/dialogs" className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>Вся переписка →</a>
            </div>
            <div className="nav-glass rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--nav-text-muted)' }}>
                    {['Клиент', 'Канал', 'Последнее сообщение', 'Статус'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dialogs === null && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--nav-text-muted)' }}>Загружаем диалоги…</td></tr>
                  )}
                  {dialogs !== null && dialogs.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--nav-text-muted)' }}>Пока нет ни одного диалога</td></tr>
                  )}
                  {dialogs?.map((d) => (
                    <tr key={d.id} style={{ borderTop: '1px solid var(--nav-border)' }}>
                      <td className="px-4 py-3" style={{ color: 'var(--nav-text-primary)' }}>{d.customerHandle}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--nav-text-secondary)' }}>{CHANNEL_LABEL[d.channel] ?? d.channel}</td>
                      <td className="px-4 py-3 max-w-[360px] truncate" style={{ color: 'var(--nav-text-secondary)' }}>{d.lastMessagePreview || '—'}</td>
                      <td className="px-4 py-3" style={{ color: d.pausedForHuman ? 'var(--nav-critical)' : 'var(--nav-text-muted)' }}>
                        {d.pausedForHuman ? 'Передан человеку' : 'Отвечает агент'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Связано с другими продуктами</h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
