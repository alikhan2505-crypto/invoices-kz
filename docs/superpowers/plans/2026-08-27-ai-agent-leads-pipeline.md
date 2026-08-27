# AI-агент: воронка в «Заявках» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every AI-agent conversation becomes a lead from its first message, shown as a 3-column Kanban board (Новый / В работе / Закрыт) in «Заявки», with a click-through into «Переписка» for the underlying thread.

**Architecture:** One new `lead_status` column with a DB default does all the "every message is a deal" work (zero webhook changes). The existing «Заявки» GET route drops its `collected_data`-only filter and adds `leadStatus` to its response; a new POST route moves a conversation between the three statuses. The page becomes a 3-column board instead of a flat card grid. «Переписка» gains a `?conversation=` deep link so a lead card can jump straight into its thread.

**Tech Stack:** Next.js App Router, Supabase service-role, existing `nav-glass`/`--nav-*` visual system.

**Spec:** `docs/superpowers/specs/2026-08-27-ai-agent-leads-pipeline-design.md`

## Global Constraints

- `lead_status` values are exactly `'new' | 'in_progress' | 'closed'`, default `'new'`. No other value is ever written.
- **No changes to `telegramWebhookHandler.ts`, `whatsappWebhookHandler.ts`, or `webhookHandler.ts`** — the column default is the entire mechanism, per the spec. If any task in this plan is about to touch those files, stop — that's a sign of drift from the design.
- Status transitions are UI-driven only: New→In-progress, In-progress→Closed, Closed→New (reopen). No dropdown, no drag-and-drop, no other transition. The API route itself does NOT enforce a transition graph (accepts any of the three values for any current status) — the UI is what keeps it linear, per the spec.
- No new pure functions, no new tests — this plan introduces zero extractable logic (route validation is a 3-value inline allowlist check; status-button-to-show is a UI rendering concern). This matches the spec's own testing section; do not invent tests that aren't there.
- Migration name: `ai_agent_leads_pipeline`.

---

### Task 1: Migration

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `ai_agent_leads_pipeline`):

```sql
alter table ai_agent_conversations
  add column lead_status text not null default 'new'
  check (lead_status in ('new', 'in_progress', 'closed'));
```

- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'ai_agent_conversations' and column_name = 'lead_status';
select lead_status, count(*) from ai_agent_conversations group by lead_status;
```

Expected: `lead_status` is `text`, default `'new'::text`; the count query shows ALL existing conversations grouped under `'new'` (confirms the backfill happened).

No commit (no repo files changed).

---

### Task 2: Leads API — drop the filter, add status

**Files:**
- Modify: `src/app/api/ai-agent/leads/route.ts`
- Create: `src/app/api/ai-agent/leads/status/route.ts`

**Interfaces:**
- Produces (consumed by Task 3): `GET /api/ai-agent/leads[?agentId=]` → `{ items: { id, agentId, agentName, channel, customerHandle, collectedData, leadStatus, lastActivityAt, createdAt }[] }` (now includes EVERY conversation, not just ones with non-empty `collectedData`).
- Produces: `POST /api/ai-agent/leads/status` `{ conversationId: string, status: 'new' | 'in_progress' | 'closed' }` → `{ ok: true }` or `{ error }`.

- [ ] **Step 1: Rewrite `src/app/api/ai-agent/leads/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// AI-агент is admin-only for now (founder decision, not yet a public plan
// perk) -- same requireAdmin shape as src/app/api/ai-agent/settings/route.ts.
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Заявки: EVERY conversation is a lead from its first message (2026-08-27
// pipeline redesign) -- the old collected_data-non-empty filter is gone.
// A lead with no extracted data just shows an empty chip row on its card
// (Task 3). ?agentId= narrows to one owned agent (404 if not owned, same
// shape as the analytics/settings routes' ?agentId= lookup); omitted,
// every one of the caller's agents is included.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentIdParam = req.nextUrl.searchParams.get('agentId')

  let agents: { id: string; name: string }[]
  if (agentIdParam) {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('id, name')
      .eq('id', agentIdParam)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agents = [agent]
  } else {
    const { data, error } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    agents = data || []
  }
  if (agents.length === 0) return NextResponse.json({ items: [] })

  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations, error: convError } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, customer_handle, collected_data, lead_status, created_at')
    .in('agent_id', agents.map(a => a.id))
  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversations || conversations.length === 0) return NextResponse.json({ items: [] })

  // "Last-updated": ai_agent_conversations has no updated_at column, so the
  // latest message in each conversation stands in for it -- same
  // batched-fetch-then-walk shape as the review route's
  // inboundByConversation.
  const conversationIds = conversations.map(c => c.id)
  const { data: messageRows } = await supabase
    .from('ai_agent_messages')
    .select('conversation_id, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
  const lastActivityByConversation: Record<string, string> = {}
  for (const row of messageRows || []) {
    if (!lastActivityByConversation[row.conversation_id]) lastActivityByConversation[row.conversation_id] = row.created_at
  }

  const items = conversations
    .map(c => ({
      id: c.id,
      agentId: c.agent_id,
      agentName: agentNameById[c.agent_id] || '',
      channel: c.channel || 'instagram',
      customerHandle: c.customer_handle || 'клиент',
      collectedData: (c.collected_data && typeof c.collected_data === 'object' && !Array.isArray(c.collected_data)
        ? c.collected_data : {}) as Record<string, string>,
      leadStatus: (c.lead_status || 'new') as 'new' | 'in_progress' | 'closed',
      lastActivityAt: lastActivityByConversation[c.id] || c.created_at,
      createdAt: c.created_at,
    }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

  return NextResponse.json({ items })
}
```

- [ ] **Step 2: Create `src/app/api/ai-agent/leads/status/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

const VALID_STATUSES = ['new', 'in_progress', 'closed']

// Moves one lead between pipeline stages. No transition-graph enforcement
// here -- the UI only ever offers forward-one-step or the single reopen
// action (see leads/page.tsx), so accepting any of the three values keeps
// this route simple, per the design doc.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  const status = typeof body?.status === 'string' ? body.status : null
  if (!conversationId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'conversationId и корректный status обязательны' }, { status: 400 })
  }

  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  const agentIds = (agents || []).map(a => a.id)
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  const { error } = await supabase.from('ai_agent_conversations').update({ lead_status: status }).eq('id', conversationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean (no output).
Run: `npx vitest run` → expect all existing tests still pass, no new tests (per Global Constraints).

- [ ] **Step 4: Commit**

Stage exactly these two files (check `git status --short` first — do not sweep up any concurrently-edited files from another session):

```bash
git add src/app/api/ai-agent/leads/route.ts src/app/api/ai-agent/leads/status/route.ts
git status --short
git commit -m "feat(ai-agent): Заявки API -- every conversation is a lead, add status endpoint"
```

---

### Task 3: «Заявки» becomes a 3-column Kanban board

**Files:**
- Modify: `src/app/ai-agent/leads/page.tsx`

**Interfaces:**
- Consumes: Task 2's `GET /api/ai-agent/leads` (now includes `leadStatus`) and `POST /api/ai-agent/leads/status`.

- [ ] **Step 1: Full file replacement** of `src/app/ai-agent/leads/page.tsx`:

```tsx
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
type LeadStatus = 'new' | 'in_progress' | 'closed'
type LeadItem = {
  id: string
  agentId: string
  agentName: string
  channel: string
  customerHandle: string
  collectedData: Record<string, string>
  leadStatus: LeadStatus
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

// One entry per Kanban column, in left-to-right order. `next` is the
// forward-one-step target the card's button offers; 'closed' instead
// offers the single reopen action back to 'new' (handled separately below
// since it's the only backward transition in the whole UI).
const COLUMNS: { status: LeadStatus; label: string; buttonLabel: string; next: LeadStatus }[] = [
  { status: 'new', label: 'Новый', buttonLabel: 'В работу →', next: 'in_progress' },
  { status: 'in_progress', label: 'В работе', buttonLabel: 'Закрыть →', next: 'closed' },
  { status: 'closed', label: 'Закрыт', buttonLabel: 'Открыть заново ↺', next: 'new' },
]

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
  const [movingId, setMovingId] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const loadLeads = useCallback(async (agent: string) => {
    setFetching(true)
    const headers = await authHeader()
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

  async function moveStatus(id: string, status: LeadStatus) {
    setMovingId(id)
    // Optimistic -- the board should feel instant; a failure just leaves
    // the card where it was (no local mutation happened yet at that point).
    const previous = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, leadStatus: status } : i))
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/leads/status', {
        method: 'POST', headers, body: JSON.stringify({ conversationId: id, status }),
      })
      if (!res.ok) setItems(previous)
    } catch {
      setItems(previous)
    } finally {
      setMovingId(null)
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
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Каждый диалог становится заявкой с первого сообщения — двигайте её по воронке</p>
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

        {items.length === 0 && !fetching ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>
            Пока нет ни одного диалога — как только клиент напишет агенту, здесь появится заявка
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ opacity: fetching ? 0.6 : 1 }}>
            {COLUMNS.map(col => {
              const columnItems = items.filter(i => i.leadStatus === col.status)
              return (
                <div key={col.status}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>{col.label}</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--nav-text-muted)' }}>{columnItems.length}</span>
                  </div>

                  {columnItems.length === 0 ? (
                    <div className="nav-glass rounded-2xl p-4 text-center text-xs" style={{ color: 'var(--nav-text-muted)' }}>Пока пусто</div>
                  ) : (
                    <div className="space-y-2">
                      {columnItems.map((item, i) => {
                        const channel = CHANNEL_META[item.channel] || CHANNEL_META.instagram
                        const ChannelIcon = channel.icon
                        const fieldEntries = Object.entries(item.collectedData)
                        return (
                          <motion.div
                            key={item.id}
                            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                            onClick={() => router.push(`/ai-agent/dialogs?conversation=${item.id}`)}
                            className="nav-glass nav-card-accent rounded-2xl p-3 flex flex-col cursor-pointer transition-transform hover:-translate-y-0.5"
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

                            {fieldEntries.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
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
                            )}

                            <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                              Обновлено: {formatDate(item.lastActivityAt)}
                            </div>

                            <button
                              onClick={e => { e.stopPropagation(); moveStatus(item.id, col.next) }}
                              disabled={movingId === item.id}
                              className="mt-auto text-xs font-semibold nav-glass rounded-lg px-3 py-1.5 disabled:opacity-50"
                              style={{ color: 'var(--nav-accent)' }}
                            >
                              {col.buttonLabel}
                            </button>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/ai-agent/leads/page.tsx
git status --short
git commit -m "feat(ai-agent): Заявки -- 3-column Kanban board (Новый/В работе/Закрыт)"
```

---

### Task 4: «Переписка» deep link from a lead card

**Files:**
- Modify: `src/app/ai-agent/dialogs/page.tsx`

**Interfaces:**
- Consumes: Task 3's card links to `/ai-agent/dialogs?conversation={id}`.

- [ ] **Step 1: Add the `useSearchParams`/Suspense wrapper.** `useSearchParams()` in a client component requires a `<Suspense>` boundary in this Next.js version — mirror the exact pattern already used in `src/app/kaspi-shop/orders/page.tsx` (an `Inner` component doing the real work, wrapped by the default export). Change the import line:

```tsx
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import LoadingSpinner from '@/components/LoadingSpinner'
```

- [ ] **Step 2: Rename the component and read the query param.** Change:

```tsx
export default function AiAgentDialogs() {
  const router = useRouter()
```

to:

```tsx
function AiAgentDialogsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
```

- [ ] **Step 3: Make `loadItems` return the fetched array** (needed so the load effect can check membership without waiting on a stale `items` closure). Change:

```tsx
  const loadItems = useCallback(async () => {
    setFetching(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/dialogs', { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
    }
    setFetching(false)
  }, [])
```

to:

```tsx
  const loadItems = useCallback(async (): Promise<DialogItem[]> => {
    setFetching(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/dialogs', { headers })
    let fetched: DialogItem[] = []
    if (res.ok) {
      const data = await res.json()
      fetched = Array.isArray(data.items) ? data.items : []
      setItems(fetched)
    }
    setFetching(false)
    return fetched
  }, [])
```

- [ ] **Step 4: Auto-open the linked conversation.** Change:

```tsx
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      await loadItems()
      setLoading(false)
    }
    load()
  }, [router, loadItems])
```

to:

```tsx
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const fetched = await loadItems()
      // Deep link from a «Заявки» lead card -- only auto-open when the id
      // genuinely belongs to one of the caller's own conversations (a
      // stale/foreign id is silently ignored, per the design doc).
      const conversationParam = searchParams.get('conversation')
      if (conversationParam && fetched.some(i => i.id === conversationParam)) {
        openConversation(conversationParam)
      }
      setLoading(false)
    }
    load()
  }, [router, loadItems, searchParams])
```

- [ ] **Step 5: Add the Suspense-wrapped default export** at the very end of the file (after the closing `}` of `AiAgentDialogsInner`):

```tsx
export default function AiAgentDialogs() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AiAgentDialogsInner />
    </Suspense>
  )
}
```

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.
Run: `npm run build` → expect clean (respect any concurrent `.next/lock` from a parallel session — wait it out rather than deleting it, same convention as prior features this session).

- [ ] **Step 7: Commit**

```bash
git add src/app/ai-agent/dialogs/page.tsx
git status --short
git commit -m "feat(ai-agent): Переписка -- deep-link into a conversation via ?conversation="
```

---

### Task 5: Ship + live verification

**Files:** none (verification only).

- [ ] **Step 1:** Full gate one more time: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment`/endpoint-poll check, not a broad list).
- [ ] **Step 4: Founder live-test script** (hand to user):
  1. Open `/ai-agent/leads` — confirm existing conversations now appear under «Новый» (not empty, per the migration backfill).
  2. Click «В работу →» on a card → confirm it moves to the «В работе» column.
  3. Click «Закрыть →» → confirm it moves to «Закрыт».
  4. Click «Открыть заново ↺» → confirm it moves back to «Новый».
  5. Click anywhere else on a card (not the button) → confirm it navigates to `/ai-agent/dialogs` with that exact conversation already open on the right.
  6. Write a brand-new message to a test bot from a NEW customer handle → confirm a fresh «Новый» card appears in «Заявки» even though the agent hasn't extracted any collected data yet.

## Self-Review (done at write time)

- **Spec coverage:** migration + zero webhook changes (T1), GET filter removal + leadStatus + POST status route with ownership scoping (T2), 3-column board with forward/reopen buttons + per-column empty state + whole-page empty state (T3), `?conversation=` deep link with membership check (T4), live-test script covering every transition plus the "brand-new conversation becomes a lead automatically" claim (T5). Out-of-scope items (drag-and-drop, arbitrary transitions, auto-advance from other events, webhook changes) have no tasks — correct.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `LeadStatus` (`'new'|'in_progress'|'closed'`) used identically in T2's route and T3's page; `VALID_STATUSES` in T2 matches exactly. `DialogItem`/`loadItems` return type change in T4 doesn't affect any other consumer of `dialogs/page.tsx` (it's the only file touched, and no other file imports from it — pages aren't imported elsewhere in this codebase).
