# AI-агент: устранение путаницы между агентами в навигации — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the AI-агент section from silently editing/connecting the wrong agent when a user has 2+ agents, and surface which agent is in view everywhere the section already has agent-scoped data.

**Architecture:** No new navigation model — targeted fixes only, per the approved design. (1) A new pure helper decides which agent id an ambiguous "configure this" link should point at, or bails to the agent list rather than guessing. (2) The settings API refuses to silently guess an agent when 2+ exist and none was specified, returning a loud 400 instead. (3) Диалоги (review queue) and Переписка (dialogs/inbox) gain the same `?agentId=`-filtered `Выбор агента ▾` dropdown that Заявки/Аналитика already have, with per-item agent-name labels — additive, their existing "show everything" default is unchanged.

**Tech Stack:** Next.js 16 (App Router, `'use client'` pages), Supabase (service-role client in API routes), TypeScript, vitest for pure-logic unit tests.

## Global Constraints

- Query-param convention stays `?agent=` on page URLs / `?agentId=` on API routes, matching the existing Заявки/Аналитика/Рассылки pattern exactly — no new URL shape (e.g. no `/ai-agent/[agentId]/...`).
- No persistent "active agent" concept spanning the section — rejected in brainstorming (`docs/superpowers/specs/2026-09-02-ai-agent-multi-agent-nav-fix-design.md`).
- Диалоги's (review queue) "aggregate across all agents by default" behavior is preserved — only additive labeling + an optional narrow-down filter.
- Admin-gating (`AI-агент is admin-only for now`) is unchanged by this work — every touched route already has its own `requireUser` + `isAdmin` gate; do not alter it.
- UI copy stays in Russian, matching the surrounding page's tone exactly (no new English strings).
- Follow existing per-page conventions already established in `leads/page.tsx` and `analytics/page.tsx`: `agentFilter` state name, `changeAgent` function name, `aria-label="Выбор агента"` on the `<select>`, the `<option value="all">Все агенты</option>` first option.
- Every new/changed API route keeps the existing `requireUser`/`isAdmin`/401/403 shape already in the file being edited — don't refactor it.

---

### Task 1: Shared helper — `buildAgentSettingsHref`

**Files:**
- Create: `src/lib/aiAgent/settingsLink.ts`
- Test: `src/lib/aiAgent/settingsLink.test.ts`

**Interfaces:**
- Produces: `buildAgentSettingsHref(selectedAgentId: string, agents: { id: string }[], tab?: string): string` — used by Task 2 (Analytics) and Task 3 (Broadcasts).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/aiAgent/settingsLink.test.ts
import { describe, it, expect } from 'vitest'
import { buildAgentSettingsHref } from './settingsLink'

describe('buildAgentSettingsHref', () => {
  const agentA = { id: 'agent-a' }
  const agentB = { id: 'agent-b' }

  it('uses the explicitly selected agent when one is given', () => {
    expect(buildAgentSettingsHref('agent-a', [agentA, agentB])).toBe('/ai-agent/settings?agent=agent-a')
  })

  it('falls back to the only agent when selection is "all" and exactly one agent exists', () => {
    expect(buildAgentSettingsHref('all', [agentA])).toBe('/ai-agent/settings?agent=agent-a')
  })

  it('refuses to guess and points at the agent list when "all" is selected with 2+ agents', () => {
    expect(buildAgentSettingsHref('all', [agentA, agentB])).toBe('/ai-agent')
  })

  it('points at the agent list when there are no agents at all', () => {
    expect(buildAgentSettingsHref('all', [])).toBe('/ai-agent')
  })

  it('appends a tab param when given', () => {
    expect(buildAgentSettingsHref('agent-a', [agentA], 'channels')).toBe('/ai-agent/settings?agent=agent-a&tab=channels')
  })

  it('treats an empty selection the same as "all"', () => {
    expect(buildAgentSettingsHref('', [agentA])).toBe('/ai-agent/settings?agent=agent-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/settingsLink.test.ts`
Expected: FAIL — `Cannot find module './settingsLink'` (the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/aiAgent/settingsLink.ts
// Shared by any page that has its own agent-scoped context (Аналитика,
// Рассылки) and links into a specific agent's Настройки. 2026-09-02
// usability audit: two such links pointed at bare /ai-agent/settings with
// no id, which silently opened whichever agent /api/ai-agent/settings
// falls back to when none is given (the most recently created one) -- see
// docs/superpowers/specs/2026-09-02-ai-agent-multi-agent-nav-fix-design.md.
// Rule: use the caller's already-selected agent when there is one; if the
// page is showing an aggregate ("Все агенты") view, only guess when
// there's truly nothing to guess wrong (exactly one agent) -- otherwise
// send the caller to the agent list to pick one explicitly.
export function buildAgentSettingsHref(
  selectedAgentId: string,
  agents: { id: string }[],
  tab?: string
): string {
  const targetId = selectedAgentId && selectedAgentId !== 'all'
    ? selectedAgentId
    : agents.length === 1 ? agents[0].id : null
  if (!targetId) return '/ai-agent'
  const params = new URLSearchParams({ agent: targetId })
  if (tab) params.set('tab', tab)
  return `/ai-agent/settings?${params.toString()}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/settingsLink.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiAgent/settingsLink.ts src/lib/aiAgent/settingsLink.test.ts
git commit -m "feat(ai-agent): add buildAgentSettingsHref to resolve agent-links safely"
```

---

### Task 2: Fix Аналитика's "Подключить канал" link

**Files:**
- Modify: `src/app/ai-agent/analytics/page.tsx:527` (the `<Link href="/ai-agent/settings">` in the empty-state block) and its import block (top of file).

**Interfaces:**
- Consumes: `buildAgentSettingsHref` from Task 1 (`@/lib/aiAgent/settingsLink`).

- [ ] **Step 1: Add the import**

In `src/app/ai-agent/analytics/page.tsx`, add alongside the existing imports near the top of the file:

```ts
import { buildAgentSettingsHref } from '@/lib/aiAgent/settingsLink'
```

- [ ] **Step 2: Replace the hardcoded href**

Find (around line 527):

```tsx
                <Link href="/ai-agent/settings"
                  className="inline-flex items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
                  Подключить канал
                </Link>
```

Replace with:

```tsx
                <Link href={buildAgentSettingsHref(agentFilter, agents)}
                  className="inline-flex items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
                  Подключить канал
                </Link>
```

(`agentFilter` and `agents` are the page's existing state variables — no new state needed.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `analytics/page.tsx`.

- [ ] **Step 4: Manual live verification**

This is a link-target change with no automated coverage in this codebase's convention for page wiring — verify live using the temp admin test account (see memory `temp-admin-test-account-invoices-kz`: `alikhan2505+aitest@gmail.com`, magic-link login, ask the founder to relay the current link) and the two agents already created for the 2026-09-02 audit: «Агент А — Салон красоты» (`1fe3d610-d886-4863-964c-311af5bb9e5c`) and «Агент Б — Автосервис» (`67a05fd7-fb11-4c42-9d88-4d245f5a05f6`).

1. Go to `https://www.invoices.kz/ai-agent/analytics`.
2. In the «Выбор агента» dropdown, pick «Агент Б — Автосервис».
3. Click «Подключить канал». Expected: lands on `https://www.invoices.kz/ai-agent/settings?agent=67a05fd7-fb11-4c42-9d88-4d245f5a05f6` (Agent Б's own settings, NOT whichever agent was most recently created/edited).
4. Go back to Analytics, switch the dropdown to «Все агенты», click «Подключить канал» again. Expected: since 2 agents exist, lands on `https://www.invoices.kz/ai-agent` (the agent list) — not a guess.

- [ ] **Step 5: Commit**

```bash
git add src/app/ai-agent/analytics/page.tsx
git commit -m "fix(ai-agent): Analytics' connect-channel link no longer guesses the wrong agent"
```

---

### Task 3: Fix Рассылки's "подключите Telegram-бота или WhatsApp" link

**Files:**
- Modify: `src/app/ai-agent/broadcasts/page.tsx:298` and its import block.

**Interfaces:**
- Consumes: `buildAgentSettingsHref` from Task 1.

- [ ] **Step 1: Add the import**

In `src/app/ai-agent/broadcasts/page.tsx`, alongside existing imports:

```ts
import { buildAgentSettingsHref } from '@/lib/aiAgent/settingsLink'
```

- [ ] **Step 2: Replace the hardcoded href**

Find (around line 298):

```tsx
              <Link href="/ai-agent/settings?tab=channels" className="font-semibold underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>
                подключите Telegram-бота или WhatsApp
              </Link>
```

Replace with:

```tsx
              <Link href={buildAgentSettingsHref('all', agents, 'channels')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>
                подключите Telegram-бота или WhatsApp
              </Link>
```

This empty state (`broadcasts.length === 0`) shows before any agent is picked in the compose modal, so there's no page-level "currently selected" agent to read here — always resolve via `'all'` (same "1 agent → use it, 2+ → go to the list" rule as Task 2).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `broadcasts/page.tsx`.

- [ ] **Step 4: Manual live verification**

Using the same temp admin account and two test agents as Task 2 (neither has a broadcast yet, so the empty state is showing):

1. Go to `https://www.invoices.kz/ai-agent/broadcasts`.
2. Click «подключите Telegram-бота или WhatsApp». Expected: since 2 agents exist on the account, lands on `https://www.invoices.kz/ai-agent` (the agent list), not a specific agent's settings.
3. (Optional, if time allows) Temporarily delete one test agent via its card's trash icon on `/ai-agent`, reload `/ai-agent/broadcasts`, click the link again. Expected: now lands directly on that one remaining agent's `?agent=<id>&tab=channels`. Re-create the deleted agent afterward if further tasks need 2 agents again.

- [ ] **Step 5: Commit**

```bash
git add src/app/ai-agent/broadcasts/page.tsx
git commit -m "fix(ai-agent): Broadcasts' connect-channel link no longer guesses the wrong agent"
```

---

### Task 4: Settings API refuses to silently guess when 2+ agents exist

**Files:**
- Modify: `src/app/api/ai-agent/settings/route.ts:46-64`

**Interfaces:**
- Produces: `GET /api/ai-agent/settings` (no `agentId`, caller has 2+ agents) now returns `{ error: 'ambiguous_agent' }` with HTTP 400, consumed by Task 5.

- [ ] **Step 1: Replace the fallback block**

Find (lines 46-64):

```ts
  // Multi-agent (2026-08-20): ?agentId= loads a specific agent (404 if not
  // owned); without it, fall back to the most recently created agent, which
  // preserves the exact pre-multi-agent behavior for a single-agent user.
  const agentId = req.nextUrl.searchParams.get('agentId')
  let agent: any = null
  if (agentId) {
    const { data } = await supabase.from('ai_agents').select('*').eq('id', agentId).eq('user_id', user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agent = data
  } else {
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    agent = data
  }
```

Replace with:

```ts
  // Multi-agent (2026-08-20): ?agentId= loads a specific agent (404 if not
  // owned). Without it: exactly one agent is unambiguous, so keep loading
  // it directly (preserves the exact pre-multi-agent behavior for a
  // single-agent user). Two or more agents used to silently fall back to
  // the most recently created one -- a real bug found in the 2026-09-02
  // usability audit: any link elsewhere that forgot ?agentId= would
  // silently open/edit the wrong agent with no on-screen sign anything was
  // wrong. Now it's a loud 400 instead, so a missed call site fails
  // immediately in testing rather than quietly misconfiguring an agent.
  const agentId = req.nextUrl.searchParams.get('agentId')
  let agent: any = null
  if (agentId) {
    const { data } = await supabase.from('ai_agents').select('*').eq('id', agentId).eq('user_id', user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agent = data
  } else {
    const { data: ownedAgents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
    if (ownedAgents && ownedAgents.length > 1) {
      return NextResponse.json({ error: 'ambiguous_agent' }, { status: 400 })
    }
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    agent = data
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `settings/route.ts`.

- [ ] **Step 3: Manual live verification (API-level, via the browser's own authenticated session)**

Using the temp admin test account (already logged in, or re-login via the magic-link flow in memory `temp-admin-test-account-invoices-kz`) with the same two test agents (2 agents exist on this account, so the ambiguous case is real):

Open the browser's DevTools console on any `invoices.kz` page (or use a chrome-devtools MCP `evaluate_script` call) and run:

```js
async () => {
  const raw = localStorage.getItem('sb-terjitbqgrjlqezyydql-auth-token')
  const token = JSON.parse(raw).access_token
  const noId = await fetch('/api/ai-agent/settings', { headers: { Authorization: `Bearer ${token}` } })
  const withId = await fetch('/api/ai-agent/settings?agentId=1fe3d610-d886-4863-964c-311af5bb9e5c', { headers: { Authorization: `Bearer ${token}` } })
  return { noIdStatus: noId.status, noIdBody: await noId.json(), withIdStatus: withId.status }
}
```

Expected: `noIdStatus: 400`, `noIdBody: { error: 'ambiguous_agent' }`, `withIdStatus: 200`.

Regression check for the single-agent case: delete one test agent (via its card's trash icon on `/ai-agent`) so only one remains, re-run the same script with the no-id fetch only. Expected: `200`, agent body returned directly (old behavior preserved). Re-create the deleted agent afterward for the remaining tasks.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-agent/settings/route.ts
git commit -m "fix(ai-agent): settings API returns 400 ambiguous_agent instead of guessing"
```

---

### Task 5: Settings page shows which agent is open + handles the new 400

**Files:**
- Modify: `src/app/ai-agent/settings/page.tsx:510-515` (fetch + status handling) and `:994-995` (header JSX).

**Interfaces:**
- Consumes: the `ambiguous_agent` 400 from Task 4.

- [ ] **Step 1: Handle the new 400 the same way as the existing 404**

Find (around line 510-515):

```ts
      const res = await fetch(agentParam ? `/api/ai-agent/settings?agentId=${encodeURIComponent(agentParam)}` : '/api/ai-agent/settings', { headers })
      if (res.status === 404) {
        // ?agent= pointing at a deleted/foreign agent -- back to the list.
        router.push('/ai-agent')
        return
      }
```

Replace with:

```ts
      const res = await fetch(agentParam ? `/api/ai-agent/settings?agentId=${encodeURIComponent(agentParam)}` : '/api/ai-agent/settings', { headers })
      if (res.status === 404 || res.status === 400) {
        // 404: ?agent= pointing at a deleted/foreign agent. 400
        // ambiguous_agent (2026-09-02): no ?agent= at all with 2+ agents on
        // the account -- the API refuses to guess which one, so there's
        // nothing to show here either. Both cases: back to the list.
        router.push('/ai-agent')
        return
      }
```

- [ ] **Step 2: Add the "Агент: {name}" label**

Find (around line 994-995):

```tsx
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>AI-агент</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>Настройте ассистента, который отвечает вашим клиентам в Instagram и Telegram</p>
```

Replace with:

```tsx
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>AI-агент</h1>
            {agentId && (
              <div className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold mb-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                Агент: {name}
              </div>
            )}
            <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>Настройте ассистента, который отвечает вашим клиентам в Instagram и Telegram</p>
```

(`agentId` and `name` are this page's existing state variables — `agentId` is unset on the `?new=1` blank-creation form, so the label correctly stays hidden there.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `settings/page.tsx`.

- [ ] **Step 4: Manual live verification**

Using the temp admin test account and the two test agents (re-create the second one first if it was deleted during Task 4's regression check — click «Создать агента» on `/ai-agent`, fill in any name/description, save):

1. Go to `https://www.invoices.kz/ai-agent`, click into «Агент А — Салон красоты». Expected: page shows a pill reading «Агент: Агент А — Салон красоты» under the "AI-агент" heading.
2. Go back to `/ai-agent`, click into «Агент Б — Автосервис». Expected: pill now reads «Агент: Агент Б — Автосервис».
3. From `/ai-agent`, click «Создать агента» (goes to `/ai-agent/settings?new=1`). Expected: no "Агент: …" pill shown (no agent to name yet).
4. Navigate directly to `https://www.invoices.kz/ai-agent/settings` (no query string at all). Expected: since 2 agents exist, redirected to `/ai-agent` (confirms the 400 handling from Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/app/ai-agent/settings/page.tsx
git commit -m "feat(ai-agent): Settings page shows which agent is open, handles ambiguous_agent"
```

---

### Task 6: Review API — agent names + optional `?agentId=` filter

**Files:**
- Modify: `src/app/api/ai-agent/review/route.ts:45-108`

**Interfaces:**
- Produces: `GET /api/ai-agent/review` items now include `agentId: string` and `agentName: string`; accepts optional `?agentId=` to narrow to one owned agent (404 if not owned) — same shape as `leads/route.ts` and `dialogs/route.ts`. Consumed by Task 7.

- [ ] **Step 1: Replace the agents/conversations lookup**

Find (lines 45-62 in `src/app/api/ai-agent/review/route.ts`):

```ts
  // Multi-agent (2026-08-20): the review queue deliberately aggregates
  // across ALL of the user's agents rather than taking an ?agentId= filter.
  // Chosen as the least-invasive correct option: the old .maybeSingle()
  // would error (data: null) as soon as a second agent existed, silently
  // emptying the queue. One combined queue also matches how the user
  // actually works it -- approve/skip everything pending, whichever agent
  // it came from. POST needs no change: it resolves message -> conversation
  // -> agent and ownership-checks that agent by user_id per item.
  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  if (!agents || agents.length === 0) return NextResponse.json({ items: [], pendingCount: 0 })

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id, customer_handle, channel')
    .in('agent_id', agents.map(a => a.id))
  const conversationIds = (conversations || []).map(c => c.id)
  const conversationMeta: Record<string, { handle: string; channel: string }> = {}
  for (const c of conversations || []) conversationMeta[c.id] = { handle: c.customer_handle || 'клиент', channel: c.channel || 'instagram' }
```

Replace with:

```ts
  // Multi-agent (2026-08-20): the review queue defaults to aggregating
  // across ALL of the user's agents -- chosen as the least-invasive correct
  // option since a second agent could otherwise make the old .maybeSingle()
  // error (data: null), silently emptying the queue. That default is
  // UNCHANGED (matches how the user actually works it -- approve/skip
  // everything pending, whichever agent it came from). An optional
  // ?agentId= (2026-09-02) narrows to one owned agent instead, same
  // 404-if-not-owned shape as leads/route.ts and dialogs/route.ts, for when
  // the caller wants to focus on a single agent's drafts. POST needs no
  // change: it resolves message -> conversation -> agent and
  // ownership-checks that agent by user_id per item.
  const agentIdParam = req.nextUrl.searchParams.get('agentId')
  let agents: { id: string; name: string }[]
  if (agentIdParam) {
    const { data: agent } = await supabase.from('ai_agents').select('id, name').eq('id', agentIdParam).eq('user_id', user.id).maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agents = [agent]
  } else {
    const { data } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
    agents = data || []
  }
  if (agents.length === 0) return NextResponse.json({ items: [], pendingCount: 0 })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, customer_handle, channel')
    .in('agent_id', agents.map(a => a.id))
  const conversationIds = (conversations || []).map(c => c.id)
  const conversationMeta: Record<string, { handle: string; channel: string; agentId: string; agentName: string }> = {}
  for (const c of conversations || []) conversationMeta[c.id] = {
    handle: c.customer_handle || 'клиент',
    channel: c.channel || 'instagram',
    agentId: c.agent_id,
    agentName: agentNameById[c.agent_id] || '',
  }
```

- [ ] **Step 2: Add agent fields to each returned item**

Find (further down, the `items` map — around line 99-108):

```ts
  const items = (messages || []).map(m => ({
    id: m.id,
    customerHandle: conversationMeta[m.conversation_id]?.handle || 'клиент',
    channel: conversationMeta[m.conversation_id]?.channel || 'instagram',
    question: questionFor(m),
    text: m.text,
    urgent: m.urgent,
    regenCount: m.regen_count ?? 0,
    createdAt: m.created_at,
  }))
```

Replace with:

```ts
  const items = (messages || []).map(m => ({
    id: m.id,
    agentId: conversationMeta[m.conversation_id]?.agentId || '',
    agentName: conversationMeta[m.conversation_id]?.agentName || '',
    customerHandle: conversationMeta[m.conversation_id]?.handle || 'клиент',
    channel: conversationMeta[m.conversation_id]?.channel || 'instagram',
    question: questionFor(m),
    text: m.text,
    urgent: m.urgent,
    regenCount: m.regen_count ?? 0,
    createdAt: m.created_at,
  }))
```

The `draftCount` query further below (`.in('agent_id', agents.map(a => a.id))`) needs no change — `agents` is still an array of objects with an `id` field.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `review/route.ts`.

- [ ] **Step 4: Manual live verification**

Using the temp admin test account and the two test agents, via the browser console / chrome-devtools `evaluate_script`:

```js
async () => {
  const raw = localStorage.getItem('sb-terjitbqgrjlqezyydql-auth-token')
  const token = JSON.parse(raw).access_token
  const all = await fetch('/api/ai-agent/review', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  const oneAgent = await fetch('/api/ai-agent/review?agentId=1fe3d610-d886-4863-964c-311af5bb9e5c', { headers: { Authorization: `Bearer ${token}` } })
  return { allItemsHaveAgentName: (all.items || []).every(i => typeof i.agentName === 'string'), oneAgentStatus: oneAgent.status }
}
```

Expected: `allItemsHaveAgentName: true` (vacuously true if there are zero pending drafts, which is fine — no drafts exist yet for these fresh test agents), `oneAgentStatus: 200`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai-agent/review/route.ts
git commit -m "feat(ai-agent): review queue returns agent name, accepts optional agentId filter"
```

---

### Task 7: Review UI — agent dropdown, per-card chip, copy fix

**Files:**
- Modify: `src/app/ai-agent/review/page.tsx`

**Interfaces:**
- Consumes: `agentId`/`agentName` fields on review items and the `?agentId=` filter from Task 6.

- [ ] **Step 1: Add agent fields to the `ReviewItem` type**

Find (lines 12-21):

```ts
interface ReviewItem {
  id: string
  customerHandle: string
  channel: string
  question: string
  text: string
  urgent: boolean
  regenCount: number
  createdAt: string
}
```

Replace with:

```ts
interface ReviewItem {
  id: string
  agentId: string
  agentName: string
  customerHandle: string
  channel: string
  question: string
  text: string
  urgent: boolean
  regenCount: number
  createdAt: string
}
```

- [ ] **Step 2: Add agent list + filter state, wire into `load()`**

Find (lines 97-116, the component's state declarations):

```ts
export default function AiAgentReview() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([])
```

Add right after `const [loading, setLoading] = useState(true)`:

```ts
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
```

Find the `load` function (lines 124-149):

```ts
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
    const [res, draftsRes] = await Promise.all([
      fetch('/api/ai-agent/review', { headers }),
      fetch('/api/ai-agent/invoice-drafts', { headers }),
    ])
    if (res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
    if (draftsRes.ok) {
      const data = await draftsRes.json()
      setDrafts(data.drafts || [])
    }
    setLoading(false)
  }
```

Replace with (adds the agent list fetch and threads `agentFilter` into the review call — `invoice-drafts` is deliberately left unfiltered, see "Out of scope" note in the plan header):

```ts
  async function loadItems(agent: string) {
    const headers = await authHeader()
    const params = new URLSearchParams()
    if (agent !== 'all') params.set('agentId', agent)
    const qs = params.toString()
    const res = await fetch(`/api/ai-agent/review${qs ? `?${qs}` : ''}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
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
    const [agentsRes, draftsRes] = await Promise.all([
      fetch('/api/ai-agent/agents', { headers }),
      fetch('/api/ai-agent/invoice-drafts', { headers }),
    ])
    if (agentsRes.ok) {
      const data = await agentsRes.json()
      setAgents(Array.isArray(data.agents) ? data.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
    }
    if (draftsRes.ok) {
      const data = await draftsRes.json()
      setDrafts(data.drafts || [])
    }
    await loadItems('all')
    setLoading(false)
  }

  function changeAgent(id: string) {
    setAgentFilter(id)
    loadItems(id)
  }
```

- [ ] **Step 3: Add the dropdown to the header, fix the copy**

Find (lines 289-308):

```tsx
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Диалоги на проверке</h1>
            {items.length + drafts.length > 0 && (
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                На проверке: {items.length + drafts.length}
              </span>
            )}
          </div>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>Агент ещё обучается — черновики ответов ждут вашего одобрения</p>
        </motion.div>
```

Replace with:

```tsx
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Диалоги на проверке</h1>
              {items.length + drafts.length > 0 && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  На проверке: {items.length + drafts.length}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Черновики ответов ждут вашего одобрения</p>
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
```

- [ ] **Step 4: Add the per-card agent chip**

Find (lines 399-404, inside the `items.map` block):

```tsx
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 nav-glass rounded-full px-2 py-1 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                  <ChannelIcon /> {channel.label}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.customerHandle}</span>
              </div>
```

Replace with (adds the same conditional agent-name line the Заявки board already uses):

```tsx
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 nav-glass rounded-full px-2 py-1 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                  <ChannelIcon /> {channel.label}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.customerHandle}</span>
              </div>
              {agentFilter === 'all' && agents.length > 1 && (
                <div className="text-[11px] font-medium mb-2 truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.agentName}</div>
              )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `review/page.tsx`.

- [ ] **Step 6: Manual live verification**

Using the temp admin test account and the two test agents:

1. Go to `https://www.invoices.kz/ai-agent/review`. Expected: subheading now reads "Черновики ответов ждут вашего одобрения" (no "Агент ещё обучается" prefix); a «Выбор агента ▾» dropdown appears top-right listing both test agents plus «Все агенты».
2. (If a pending draft can be produced — e.g. via `/ai-agent/test-chat` for one of the agents, or skip this sub-step if no draft exists yet) Confirm each card shows the correct agent's name when «Все агенты» is selected, and that switching the dropdown to one specific agent narrows the list and hides the per-card agent label (matches Заявки's existing behavior).

- [ ] **Step 7: Commit**

```bash
git add src/app/ai-agent/review/page.tsx
git commit -m "feat(ai-agent): review queue shows agent names, adds agent filter dropdown"
```

---

### Task 8: Dialogs (Переписка) API — optional `?agentId=` filter

**Files:**
- Modify: `src/app/api/ai-agent/dialogs/route.ts:36-46`

**Interfaces:**
- Produces: `GET /api/ai-agent/dialogs` accepts optional `?agentId=` to narrow to one owned agent (404 if not owned). `agentId`/`agentName` were already present on every item — unchanged. Consumed by Task 9.

- [ ] **Step 1: Replace the agents lookup**

Find (lines 36-46):

```ts
  const { data: agents } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
  if (!agents || agents.length === 0) return NextResponse.json({ items: [] })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name
```

Replace with:

```ts
  // ?agentId= (2026-09-02) narrows to one owned agent, same
  // 404-if-not-owned shape as leads/route.ts and review/route.ts; omitted,
  // every one of the caller's agents is included (unchanged default).
  const agentIdParam = req.nextUrl.searchParams.get('agentId')
  let agents: { id: string; name: string }[]
  if (agentIdParam) {
    const { data: agent } = await supabase.from('ai_agents').select('id, name').eq('id', agentIdParam).eq('user_id', user.id).maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agents = [agent]
  } else {
    const { data } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
    agents = data || []
  }
  if (agents.length === 0) return NextResponse.json({ items: [] })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `dialogs/route.ts`.

- [ ] **Step 3: Manual live verification**

Using the temp admin test account and the two test agents, via the browser console / chrome-devtools `evaluate_script`:

```js
async () => {
  const raw = localStorage.getItem('sb-terjitbqgrjlqezyydql-auth-token')
  const token = JSON.parse(raw).access_token
  const oneAgent = await fetch('/api/ai-agent/dialogs?agentId=1fe3d610-d886-4863-964c-311af5bb9e5c', { headers: { Authorization: `Bearer ${token}` } })
  const foreign = await fetch('/api/ai-agent/dialogs?agentId=00000000-0000-0000-0000-000000000000', { headers: { Authorization: `Bearer ${token}` } })
  return { oneAgentStatus: oneAgent.status, foreignStatus: foreign.status }
}
```

Expected: `oneAgentStatus: 200`, `foreignStatus: 404`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-agent/dialogs/route.ts
git commit -m "feat(ai-agent): dialogs inbox accepts optional agentId filter"
```

---

### Task 9: Dialogs (Переписка) UI — agent dropdown + per-row/thread label

**Files:**
- Modify: `src/app/ai-agent/dialogs/page.tsx`

**Interfaces:**
- Consumes: the `?agentId=` filter from Task 8; `agentName` was already present on `DialogItem` (unused until now).

- [ ] **Step 1: Add agent list + filter state**

Find (lines 65-74, the component's state declarations inside `AiAgentDialogsInner`):

```ts
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [items, setItems] = useState<DialogItem[]>([])
  const [fetching, setFetching] = useState(false)
```

Add right after `const [items, setItems] = useState<DialogItem[]>([])`:

```ts
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
```

- [ ] **Step 2: Thread `agentFilter` through `loadItems`, load the agent list**

Find (lines 81-93):

```ts
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

Replace with:

```ts
  const loadItems = useCallback(async (agent: string = agentFilter): Promise<DialogItem[]> => {
    setFetching(true)
    const headers = await authHeader()
    const params = new URLSearchParams()
    if (agent !== 'all') params.set('agentId', agent)
    const qs = params.toString()
    const res = await fetch(`/api/ai-agent/dialogs${qs ? `?${qs}` : ''}`, { headers })
    let fetched: DialogItem[] = []
    if (res.ok) {
      const data = await res.json()
      fetched = Array.isArray(data.items) ? data.items : []
      setItems(fetched)
    }
    setFetching(false)
    return fetched
  }, [agentFilter])
```

Find the `load()` effect (lines 95-112) and add the agents fetch. Original:

```ts
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const fetched = await loadItems()
      // Deep link from a «Заявки» lead card -- only auto-open when the id
      // genuinely belongs to one of the caller's own conversations (a
      // stale/foreign id is silently ignored).
      const conversationParam = searchParams.get('conversation')
      if (conversationParam && fetched.some(i => i.id === conversationParam)) {
        openConversation(conversationParam)
      }
      setLoading(false)
    }
    load()
  }, [router, loadItems, searchParams])
```

Replace with:

```ts
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const headers = await authHeader()
      const agentsRes = await fetch('/api/ai-agent/agents', { headers })
      if (agentsRes.ok) {
        const data = await agentsRes.json()
        setAgents(Array.isArray(data.agents) ? data.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
      }
      const fetched = await loadItems('all')
      // Deep link from a «Заявки» lead card -- only auto-open when the id
      // genuinely belongs to one of the caller's own conversations (a
      // stale/foreign id is silently ignored).
      const conversationParam = searchParams.get('conversation')
      if (conversationParam && fetched.some(i => i.id === conversationParam)) {
        openConversation(conversationParam)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams])
```

(`loadItems` is deliberately dropped from the dependency array here — same pattern this file already avoids elsewhere for the mount-once load — since `loadItems` itself now depends on `agentFilter` and would otherwise cause this whole effect, including the deep-link auto-open, to refire on every filter change; the button below calls `loadItems` directly instead.)

Add a `changeAgent` function near the other handlers (e.g. right after `openConversation`):

```ts
  function changeAgent(id: string) {
    setAgentFilter(id)
    loadItems(id)
  }
```

- [ ] **Step 3: Add the dropdown next to "Обновить"**

Find (lines 198-211):

```tsx
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Переписка</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Живая переписка с клиентами по всем каналам — перехватите диалог, просто ответив</p>
          </div>
          <button onClick={loadItems} disabled={fetching} className="nav-glass rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
            {fetching ? 'Обновляем…' : 'Обновить'}
          </button>
        </motion.div>
```

Replace with:

```tsx
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Переписка</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Живая переписка с клиентами по всем каналам — перехватите диалог, просто ответив</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => changeAgent(e.target.value)}
                aria-label="Выбор агента"
                className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
              >
                <option value="all">Все агенты</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button onClick={() => loadItems()} disabled={fetching} className="nav-glass rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
              {fetching ? 'Обновляем…' : 'Обновить'}
            </button>
          </div>
        </motion.div>
```

(`onClick={loadItems}` became `onClick={() => loadItems()}` — `loadItems` now takes an optional argument and a bare button click event must not be passed as that argument.)

- [ ] **Step 4: Show the agent name per row and in the open thread's header**

Find (lines 240-242, inside the `items.map` block):

```tsx
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{item.customerHandle}</div>
                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{item.lastMessagePreview}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatRelative(item.lastActivityAt)}</div>
```

Replace with:

```tsx
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{item.customerHandle}</div>
                  {agentFilter === 'all' && agents.length > 1 && (
                    <div className="text-[11px] font-medium truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.agentName}</div>
                  )}
                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{item.lastMessagePreview}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatRelative(item.lastActivityAt)}</div>
```

Find (lines 253-261, the open thread's header):

```tsx
                <div className="flex items-center justify-between gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.customerHandle}</div>
                  {selected.pausedForHuman && (
```

Replace with:

```tsx
                <div className="flex items-center justify-between gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.customerHandle}</div>
                    {agents.length > 1 && (
                      <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{selected.agentName}</div>
                    )}
                  </div>
                  {selected.pausedForHuman && (
```

(The thread header always shows the agent name once 2+ agents exist, regardless of the list filter — unlike the list row, there's no "all" ambiguity once one specific conversation is open.) Note the closing `</div>` for this header row already exists further down (the `releaseConversation` button's sibling) — no structural change needed there since we only wrapped the customer-handle text, not the whole flex row.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `dialogs/page.tsx`.

- [ ] **Step 6: Manual live verification**

Using the temp admin test account and the two test agents:

1. Go to `https://www.invoices.kz/ai-agent/dialogs`. Expected: a «Выбор агента ▾» dropdown appears next to «Обновить», listing both test agents plus «Все агенты».
2. (If a conversation can be produced for at least one agent — e.g. via that agent's Тестовый чат, though test-chat is stateless/no real conversation row is created per project memory, so this may require a real inbound message via a connected channel; skip if no conversation exists yet) Confirm the agent name shows under the customer handle in the list and in the open thread's header, and that switching the dropdown narrows the list correctly.
3. Confirm clicking «Обновить» still works (no console error from the `onClick` signature change).

- [ ] **Step 7: Commit**

```bash
git add src/app/ai-agent/dialogs/page.tsx
git commit -m "feat(ai-agent): dialogs inbox shows agent names, adds agent filter dropdown"
```

---

## Out of scope for this plan (explicitly, not silently dropped)

- `/api/ai-agent/invoice-drafts` and the «Черновики счетов» cards on `/ai-agent/review` are **not** touched — they have their own `agent_id` already in the query but no name lookup or filter. Left as a known follow-up candidate rather than expanding this plan's approved scope (see spec) without a fresh brainstorming pass: after this plan ships, the review page's own AI-reply cards will be filterable while its invoice-draft cards still show everyone mixed together, which is a real but smaller inconsistency worth a short separate pass.
- `Тестовый чат`'s own agent-selection handling — not touched, wasn't found to have this class of bug.
- Any admin-gating changes (`instagram/connect` missing `isAdmin`, the 4 unguarded `wallet/*` routes) — separate, already-documented 2026-09-01 audit finding.

## Final full-branch check (after all 9 tasks)

- [ ] Run the full type-check once more: `npx tsc --noEmit` — expect zero errors.
- [ ] Run the full test suite: `npx vitest run` — expect all green, including the new `settingsLink.test.ts`.
- [ ] Live click-through on the temp admin account, both test agents still present: `/ai-agent` → into Агент А → Настройки shows "Агент: Агент А…" → «Заявки» via nav → dropdown defaults to «Все агенты» (unchanged) → select Агент Б → «Аналитика» → «Подключить канал» opens Агент Б's own settings, not Агент А's.
