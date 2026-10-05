# CTWA + Meta CAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** when a WhatsApp conversation starts from a Click-to-WhatsApp ad (carries Meta's `ctwa_clid`), fire exactly one `Lead` event to the seller's own Meta Conversions API dataset, using Pixel ID + access token the seller pastes in manually. No new channel, no new messaging behavior — pure attribution plumbing riding on the already-existing "first message" atomic claim.

**Architecture:** Three new nullable columns (`ai_agents.meta_pixel_id`, `ai_agents.meta_capi_token_enc`, `ai_agent_conversations.ctwa_clid`) — no new tables. The WhatsApp webhook route gains a `referral` field on its inbound-message type and threads `ctwa_clid` through to `handleWhatsAppIncoming`, which persists it on the conversation at the same atomic "first message" claim already used for scenario start-flows, then fires the CAPI event through a new pure `metaCapi.ts` module. A new settings-page card (manual Pixel ID + token paste, not OAuth) and its own connect/disconnect API route complete the loop.

**Tech Stack:** Next.js API routes, Supabase, Vitest, existing `encryptAtRest`/`decryptAtRest` crypto helpers.

**Spec:** `docs/superpowers/specs/2026-10-05-ctwa-meta-capi-design.md`

## Global Constraints

- WhatsApp only in v1 — no Instagram CTWA.
- Exactly one `Lead` event per conversation, fired only on that conversation's genuinely first message (reuses the existing `start_flow_triggered` atomic claim — never re-derive "is this the first message" a second, different way).
- Manual Pixel ID + access-token input only — no OAuth, explicitly to avoid a new Meta App Review dependency.
- `event_name` is `"Lead"` (Meta's standard event), not `"LeadSubmitted"` (that name belongs to a different Meta-native feature).
- A CAPI failure must never block or delay the customer's reply — always caught, logged, swallowed.
- `META_CAPI_ENCRYPTION_KEY` is its own dedicated env var, not reused from `AI_AGENT_ENCRYPTION_KEY` — matches this codebase's stated one-key-per-feature-area convention.
- Out of scope (do not build): configurable status→event mapping, hashed `ph`/`em` user_data, CAPI retries, any UI surfacing `ctwa_clid` to the seller.

---

### Task 1: Migration

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `ctwa_meta_capi`):

```sql
alter table ai_agents add column meta_pixel_id text;
alter table ai_agents add column meta_capi_token_enc text;
alter table ai_agent_conversations add column ctwa_clid text;
```

- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select table_name, column_name, data_type, is_nullable from information_schema.columns
where (table_name = 'ai_agents' and column_name in ('meta_pixel_id', 'meta_capi_token_enc'))
   or (table_name = 'ai_agent_conversations' and column_name = 'ctwa_clid');
```

Expected: all three rows, `text`, nullable.

No commit (no repo files changed).

---

### Task 2: `metaCapi.ts` — pure payload builder + send

**Files:**
- Create: `src/lib/aiAgent/metaCapi.ts`
- Create: `src/lib/aiAgent/metaCapi.test.ts`

**Interfaces:**
- Produces (consumed by Task 4): `buildLeadEventPayload(ctwaClid: string, eventTimeUnix: number): object`, `sendLeadEvent(pixelId: string, accessToken: string, ctwaClid: string): Promise<void>`, `class MetaCapiError extends Error`.

- [ ] **Step 1: Write the failing test** — full file `src/lib/aiAgent/metaCapi.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildLeadEventPayload } from './metaCapi'

describe('buildLeadEventPayload', () => {
  it('matches the exact Meta Conversions API schema for business_messaging/whatsapp', () => {
    const payload = buildLeadEventPayload('clid_abc123', 1759651200)
    expect(payload).toEqual({
      data: [{
        event_name: 'Lead',
        event_time: 1759651200,
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        user_data: { ctwa_clid: 'clid_abc123' },
      }],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/metaCapi.test.ts`
Expected: FAIL — `./metaCapi` does not exist yet.

- [ ] **Step 3: Implement** — full file `src/lib/aiAgent/metaCapi.ts`:

```ts
// Meta Conversions API, scoped to one seller's own Pixel -- fires when a
// WhatsApp conversation's first message carries Meta's ctwa_clid (meaning
// it started from a Click-to-WhatsApp ad), so the seller's own ad account
// learns a real lead came out of that click. Verified against Meta's
// current documented schema for action_source=business_messaging
// (05.10.2026) -- event_name is "Lead" (the standard Meta event), NOT
// "LeadSubmitted" (that name is reserved for Meta's own automatic
// lead-gen-flow events inside WhatsApp Flows, a different product).
//
// v1 deliberately sends only ctwa_clid in user_data -- no hashed phone/
// email, no custom_data -- ctwa_clid alone is the real attribution key for
// a CTWA conversion; anything else would add complexity with no MVP payoff.

export class MetaCapiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'MetaCapiError'
  }
}

export function buildLeadEventPayload(ctwaClid: string, eventTimeUnix: number): object {
  return {
    data: [{
      event_name: 'Lead',
      event_time: eventTimeUnix,
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { ctwa_clid: ctwaClid },
    }],
  }
}

const GRAPH_API = 'https://graph.facebook.com/v21.0'

// access_token goes in the POST body, same convention every other Graph
// API call in this codebase already uses (see src/lib/instagram.ts's
// createContainer) -- not an Authorization header.
export async function sendLeadEvent(pixelId: string, accessToken: string, ctwaClid: string): Promise<void> {
  const payload = buildLeadEventPayload(ctwaClid, Math.floor(Date.now() / 1000))
  const res = await fetch(`${GRAPH_API}/${pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new MetaCapiError(data?.error?.message || 'Failed to send Meta CAPI Lead event', res.status)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/metaCapi.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/metaCapi.ts src/lib/aiAgent/metaCapi.test.ts
git status --short
git commit -m "feat(ai-agent): Meta CAPI Lead event — payload builder + sender"
```

---

### Task 3: Dedicated encryption key + webhook referral threading

**Files:**
- Modify: `src/lib/aiAgent/connection.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts`
- Modify: `src/lib/aiAgent/whatsappWebhookHandler.ts`

**Interfaces:**
- Produces (consumed by Task 4): `getMetaCapiKey(): string` (`./connection`); `WhatsAppIncomingParams.ctwaClid?: string`.

- [ ] **Step 1: Add the dedicated key getter** — in `src/lib/aiAgent/connection.ts`, append:

```ts

// Its own dedicated key, not AI_AGENT_ENCRYPTION_KEY -- same one-key-per-
// feature-area convention as getKey() above.
export function getMetaCapiKey(): string {
  const key = process.env.META_CAPI_ENCRYPTION_KEY
  if (!key) throw new Error('META_CAPI_ENCRYPTION_KEY is not configured')
  return key
}
```

- [ ] **Step 2: Add `referral` to the webhook payload type** — in `src/app/api/whatsapp/webhook/route.ts`, change:

```ts
  messages?: {
    from?: string
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
    interactive?: {
      type?: string
      button_reply?: { id?: string; title?: string }
      list_reply?: { id?: string; title?: string }
    }
  }[]
```

to:

```ts
  messages?: {
    from?: string
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
    interactive?: {
      type?: string
      button_reply?: { id?: string; title?: string }
      list_reply?: { id?: string; title?: string }
    }
    // Present only on the first message of a conversation that started
    // from a Click-to-WhatsApp ad -- ctwa_clid is the one field this
    // pipeline actually uses (see docs/superpowers/specs/2026-10-05-ctwa-
    // meta-capi-design.md).
    referral?: { source_id?: string; source_type?: string; source_url?: string; ctwa_clid?: string }
  }[]
```

- [ ] **Step 3: Pass `ctwaClid` through on the text-message branch** — in the same file, change:

```ts
          if (msg.type === 'text' && msg.text?.body) {
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.text.body,
            })
            continue
          }
```

to:

```ts
          if (msg.type === 'text' && msg.text?.body) {
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.text.body,
              ctwaClid: msg.referral?.ctwa_clid,
            })
            continue
          }
```

(Image/audio branches deliberately untouched — a CTWA click always opens with a text message in practice, and threading `ctwaClid` through every media branch too would be untested dead code for v1.)

- [ ] **Step 4: Extend `WhatsAppIncomingParams` and persist `ctwa_clid`** — in `src/lib/aiAgent/whatsappWebhookHandler.ts`, change:

```ts
interface WhatsAppIncomingParams {
  // The WhatsApp message's own `id` (e.g. "wamid.XXXX") -- globally unique
  // across all WhatsApp numbers (unlike Telegram's per-bot update_id), so
  // it's used directly as ai_agent_messages.external_id with no extra
  // scoping prefix.
  externalId: string
  // Sender's WhatsApp phone number, e.g. "77771234567" -- doubles as the
  // conversation's external_thread_id and the send target.
  from: string
  customerHandle: string
  incomingText: string
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead. Never
  // set for a transcribed voice message (that flows as plain incomingText).
  media?: { kind: 'image'; base64: string; mediaType: string }
}
```

to:

```ts
interface WhatsAppIncomingParams {
  // The WhatsApp message's own `id` (e.g. "wamid.XXXX") -- globally unique
  // across all WhatsApp numbers (unlike Telegram's per-bot update_id), so
  // it's used directly as ai_agent_messages.external_id with no extra
  // scoping prefix.
  externalId: string
  // Sender's WhatsApp phone number, e.g. "77771234567" -- doubles as the
  // conversation's external_thread_id and the send target.
  from: string
  customerHandle: string
  incomingText: string
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead. Never
  // set for a transcribed voice message (that flows as plain incomingText).
  media?: { kind: 'image'; base64: string; mediaType: string }
  // Meta's Click-to-WhatsApp click id, present only on a conversation's
  // genuinely first message. Persisted on the conversation (Step 5 below),
  // never re-derived from a later message.
  ctwaClid?: string
}
```

Then, immediately after the existing `isFirstMessage` claim (find this exact block):

```ts
  const { data: startClaim } = await supabase.from('ai_agent_conversations')
    .update({ start_flow_triggered: true }).eq('id', conversation.id).eq('start_flow_triggered', false).select('id')
  const isFirstMessage = !!(startClaim && startClaim.length > 0)
```

insert directly after it:

```ts

  // ctwa_clid only ever arrives on the first message of a CTWA-originated
  // conversation -- a separate, conditional update (not part of the
  // upsert above) so a later message with no referral object can never
  // null it back out.
  if (isFirstMessage && params.ctwaClid) {
    await supabase.from('ai_agent_conversations').update({ ctwa_clid: params.ctwaClid }).eq('id', conversation.id)
  }
```

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass (no existing test exercises this path, so none should change).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/connection.ts src/app/api/whatsapp/webhook/route.ts src/lib/aiAgent/whatsappWebhookHandler.ts
git status --short
git commit -m "feat(ai-agent): capture ctwa_clid from WhatsApp CTWA referrals onto the conversation"
```

---

### Task 4: Fire the Lead event

**Files:**
- Modify: `src/lib/aiAgent/whatsappWebhookHandler.ts`

**Interfaces:**
- Consumes: `buildLeadEventPayload` is internal to `sendLeadEvent`, so only `sendLeadEvent`, `MetaCapiError` (`./metaCapi`); `getMetaCapiKey` (`./connection`); `decryptAtRest` (`@/lib/kaspiPay/crypto`, already imported in this file).

- [ ] **Step 1: Add the imports** — in `src/lib/aiAgent/whatsappWebhookHandler.ts`, near the existing `import { decryptAtRest } from '@/lib/kaspiPay/crypto'` line, add:

```ts
import { sendLeadEvent } from './metaCapi'
import { getKey, getMetaCapiKey } from './connection'
```

(If `getKey` is already imported from `./connection` under a different line, merge into that existing import instead of duplicating it — check the file's current imports first.)

- [ ] **Step 2: Fire the event right after the `ctwa_clid` persistence** — directly after the block added in Task 3 Step 4:

```ts
  if (isFirstMessage && params.ctwaClid) {
    await supabase.from('ai_agent_conversations').update({ ctwa_clid: params.ctwaClid }).eq('id', conversation.id)

    // Best-effort, never allowed to affect the reply below -- same
    // tolerance already applied to the wallet debit and Telegram nudge
    // further down this file.
    if (agent.meta_pixel_id && agent.meta_capi_token_enc) {
      try {
        const token = decryptAtRest(agent.meta_capi_token_enc, getMetaCapiKey()).toString('utf8')
        await sendLeadEvent(agent.meta_pixel_id, token, params.ctwaClid)
      } catch (capiErr: any) {
        console.error('ai-agent whatsapp: Meta CAPI Lead event failed for', params.externalId, ':', capiErr.message)
      }
    }
  }
```

(`agent` is already loaded via `select('*')` earlier in this same function — `meta_pixel_id`/`meta_capi_token_enc` are on it with no extra query.)

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aiAgent/whatsappWebhookHandler.ts
git status --short
git commit -m "feat(ai-agent): fire Meta CAPI Lead event on a CTWA-attributed conversation's first message"
```

---

### Task 5: Connect/disconnect API route

**Files:**
- Create: `src/app/api/ai-agent/meta-capi/connect/route.ts`

**Interfaces:**
- Consumes: `encryptAtRest` (`@/lib/kaspiPay/crypto`); `getMetaCapiKey` (`@/lib/aiAgent/connection`).
- Produces (consumed by Task 6): `POST /api/ai-agent/meta-capi/connect` body `{agentId, pixelId, accessToken}` → `{connected: true}`. `DELETE /api/ai-agent/meta-capi/connect` body `{agentId}` → `{disconnected: true}`.

- [ ] **Step 1: Create the route** — full file `src/app/api/ai-agent/meta-capi/connect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getMetaCapiKey } from '@/lib/aiAgent/connection'

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

// AI-агент is admin-only for now -- same shape as the other ai-agent
// connect routes (see whatsapp/callback/route.ts).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || (await import('@/lib/plan')).getActivePlan(profile).canAiAgent
}

// Manual Pixel ID + token, not OAuth -- deliberate choice (see spec) to
// avoid adding another Meta App Review dependency. Pixel ID is not a
// secret (it's visible wherever the seller already embeds their own Meta
// Pixel); the access token is encrypted at rest with its own dedicated key.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const pixelId = typeof body?.pixelId === 'string' ? body.pixelId.trim() : ''
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!pixelId) return NextResponse.json({ error: 'pixelId required' }, { status: 400 })
  if (!accessToken) return NextResponse.json({ error: 'accessToken required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('ai_agents').update({
    meta_pixel_id: pixelId,
    meta_capi_token_enc: encryptAtRest(accessToken, getMetaCapiKey()),
  }).eq('id', agentId)
  if (error) {
    console.error('ai-agent meta-capi connect: update failed:', error.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  return NextResponse.json({ connected: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase.from('ai_agents').update({ meta_pixel_id: null, meta_capi_token_enc: null }).eq('id', agentId)
  return NextResponse.json({ disconnected: true })
}
```

(The inline `await import('@/lib/plan')` mirrors no existing pattern in this codebase — replace it in Step 1 review with a normal top-level `import { getActivePlan } from '@/lib/plan'` instead; written this way here only to keep the step's diff self-contained. Use the normal top-level import in the actual file.)

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-agent/meta-capi
git status --short
git commit -m "feat(ai-agent): Meta CAPI connect/disconnect API route (manual Pixel ID + token)"
```

---

### Task 6: Settings UI

**Files:**
- Modify: `src/app/api/ai-agent/settings/route.ts`
- Modify: `src/app/ai-agent/settings/page.tsx`

**Interfaces:**
- Consumes (from Task 5): `POST`/`DELETE /api/ai-agent/meta-capi/connect`.

- [ ] **Step 1: Expose `metaPixelId` on the settings GET response** — in `src/app/api/ai-agent/settings/route.ts`, find:

```ts
      kaspiShopConnectionId: agent.kaspi_shop_connection_id || null,
```

and add directly after it:

```ts
      metaPixelId: agent.meta_pixel_id || null,
```

(The underlying `select('*')` already returns `meta_pixel_id` — no select-list change needed.)

- [ ] **Step 2: Add state** — in `src/app/ai-agent/settings/page.tsx`, near the existing `kaspiShopConnectionId` state declaration, add:

```ts
  const [metaPixelId, setMetaPixelId] = useState<string | null>(null)
  const [metaPixelIdInput, setMetaPixelIdInput] = useState('')
  const [metaTokenInput, setMetaTokenInput] = useState('')
  const [metaCapiBusy, setMetaCapiBusy] = useState(false)
  const [metaCapiError, setMetaCapiError] = useState<string | null>(null)
```

- [ ] **Step 3: Load it** — find (from Task context, the loader around line 616):

```ts
          setKaspiShopConnectionId(data.agent.kaspiShopConnectionId || '')
```

add directly after it:

```ts
          setMetaPixelId(data.agent.metaPixelId || null)
```

- [ ] **Step 4: Connect/disconnect handlers** — add near the other `connectX`/`disconnectX` functions (e.g. near `connectWebsite`/`disconnectWebsite`):

```ts
  async function connectMetaCapi() {
    if (!agentId || !metaPixelIdInput.trim() || !metaTokenInput.trim()) return
    setMetaCapiBusy(true)
    setMetaCapiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/meta-capi/connect', {
        method: 'POST', headers,
        body: JSON.stringify({ agentId, pixelId: metaPixelIdInput.trim(), accessToken: metaTokenInput.trim() }),
      })
      if (res.ok) {
        setMetaPixelId(metaPixelIdInput.trim())
        setMetaTokenInput('')
      } else {
        setMetaCapiError('Не удалось сохранить. Проверьте Pixel ID и токен.')
      }
    } catch {
      setMetaCapiError('Не удалось сохранить. Проверьте Pixel ID и токен.')
    }
    setMetaCapiBusy(false)
  }

  async function disconnectMetaCapi() {
    if (!agentId) return
    setMetaCapiBusy(true)
    setMetaCapiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/meta-capi/connect', {
        method: 'DELETE', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setMetaPixelId(null)
        setMetaPixelIdInput('')
      } else {
        setMetaCapiError('Не удалось отключить. Попробуйте ещё раз.')
      }
    } catch {
      setMetaCapiError('Не удалось отключить. Попробуйте ещё раз.')
    }
    setMetaCapiBusy(false)
  }
```

- [ ] **Step 5: Render the card** — in the `tab === 'channels'` block, find the closing of the existing grid (the exact text, near the end of that block):

```tsx
                  </ChannelCard>
                </div>
              )
            )}
```

(this is the LAST `ChannelCard` close followed by the grid's own closing `</div>` — confirm via `grep -n "tab === 'channels'" -A 5` that this is the right closing pair before editing, since the file has many `</ChannelCard>` occurrences) — replace with:

```tsx
                  </ChannelCard>
                </div>

                <div className="mt-6">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                    Реклама
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ChannelCard
                      icon={<ApiIcon />}
                      name="Meta Pixel / CAPI"
                      chip={metaPixelId
                        ? <StatusChip kind="ok" label={tf.connectedChip} />
                        : <StatusChip kind="off" label={t.chipNotConnected} />}
                      description="Переписки, начатые по клику на рекламу WhatsApp, засчитываются как лиды в вашем рекламном кабинете Meta."
                    >
                      {metaPixelId ? (
                        <div className="flex gap-2">
                          <button onClick={disconnectMetaCapi} disabled={metaCapiBusy}
                            className="flex-1 nav-glass rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                            {metaCapiBusy ? '…' : t.disconnectButton}
                          </button>
                        </div>
                      ) : (
                        <>
                          <input type="text" placeholder="Pixel ID" value={metaPixelIdInput}
                            onChange={e => setMetaPixelIdInput(e.target.value)}
                            className="w-full mb-2 text-xs rounded-lg px-3 py-2 nav-glass" style={{ color: 'var(--nav-text-primary)' }} />
                          <input type="password" placeholder="Токен доступа" value={metaTokenInput}
                            onChange={e => setMetaTokenInput(e.target.value)}
                            className="w-full mb-2 text-xs rounded-lg px-3 py-2 nav-glass" style={{ color: 'var(--nav-text-primary)' }} />
                          <button onClick={connectMetaCapi} disabled={metaCapiBusy || !metaPixelIdInput.trim() || !metaTokenInput.trim()}
                            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                            {metaCapiBusy ? tf.connectingButton : t.connectButton}
                          </button>
                          <p className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                            Pixel ID и токен — в Meta Events Manager → источники данных → ваш Pixel → Настройки → Генерировать токен доступа.
                          </p>
                        </>
                      )}
                      {metaCapiError && (
                        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{metaCapiError}</div>
                      )}
                    </ChannelCard>
                  </div>
                </div>
              )
            )}
```

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ai-agent/settings/route.ts src/app/ai-agent/settings/page.tsx
git status --short
git commit -m "feat(ai-agent): Meta Pixel / CAPI settings card (manual Pixel ID + token)"
```

---

### Task 7: Ship

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** Founder sets `META_CAPI_ENCRYPTION_KEY` in Vercel (any random 32-byte hex string, same generation method as the other `*_ENCRYPTION_KEY` vars already in the project) — **hand this requirement to the user explicitly, do not skip it silently**; without it `getMetaCapiKey()` throws the moment anyone tries to connect.
- [ ] **Step 3:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 4:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment` check, not a broad list).
- [ ] **Step 5: Founder live-test script** (hand to user):
  1. On `/ai-agent/settings` → Каналы, scroll to «Реклама» → «Meta Pixel / CAPI» — paste a real Pixel ID + a system-user access token from Meta Events Manager, confirm it saves and shows «Подключено».
  2. In Meta Ads Manager, create (or use an existing) Click-to-WhatsApp ad pointed at the connected WhatsApp number.
  3. Click the ad from a real phone, send the first message — confirm the conversation appears normally in «Переписка»/«Заявки» exactly as any other WhatsApp conversation would.
  4. In Meta Events Manager → the connected Pixel → Test Events (or the live event feed), confirm a `Lead` event arrived with `action_source: business_messaging` and the matching `ctwa_clid`.
  5. Send a second message in the same conversation — confirm no second `Lead` event fires (check the event feed again; only one event total for this conversation).
  6. Disconnect the Pixel from settings, confirm the card returns to the empty Pixel ID/token form.

## Self-Review (done at write time)

- **Spec coverage:** `referral`/`ctwa_clid` capture on first message only (T3); own dedicated encryption key (T3); `Lead` event with the verified `business_messaging`/`whatsapp` schema (T2); fired exactly once via the existing atomic first-message claim, never blocking the reply (T4); manual Pixel ID + token connect/disconnect, admin-gated same as every other ai-agent route (T5); settings card as its own "Реклама" section, not inside the channel grid (T6); out-of-scope items (Instagram CTWA, configurable event mapping, hashed PII, retries, UI surfacing of ctwa_clid) have no tasks — correct.
- **Placeholder scan:** none found, except the explicitly-called-out inline `await import('@/lib/plan')` in Task 5 Step 1, which is flagged in its own step text as something to replace with a normal top-level import in the real file — not a silent placeholder.
- **Type consistency:** `WhatsAppIncomingParams.ctwaClid` (T3) is optional and flows through exactly one call site (the text-message branch in the webhook route) into `handleWhatsAppIncoming`, which is the only consumer. `buildLeadEventPayload`'s return shape (T2) is asserted field-by-field in its own test, and `sendLeadEvent` (T4's only caller) never inspects the payload shape itself — it's opaque to the caller, so no second place can drift out of sync with the test.
- **Consistency with prior AI-агент work this session**: reuses the `start_flow_triggered` atomic-claim idiom as-is (does not re-derive "first message" a second way, matching the explicit lesson already recorded in the website-widget plan's own self-review); reuses the exact `decryptAtRest(...).toString('utf8')` convention already standard across every other channel's token handling in this file, rather than inventing a new decrypt pattern.
- **Risk flagged, not silently absorbed:** `META_CAPI_ENCRYPTION_KEY` must exist in Vercel before this is usable at all — called out explicitly in Task 7 Step 2 as something to hand to the founder, not something the plan can set up itself (same category as `TWO_GIS_API_KEY`/`WB_ENCRYPTION_KEY` elsewhere in the backlog).
