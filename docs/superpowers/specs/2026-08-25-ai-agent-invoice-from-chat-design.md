# AI-агент: счёт из чата (Phase 3) — Design

## Context

The Phase 3 addendum in `docs/superpowers/specs/2026-08-15-ai-agent-design.md` (§«Счета из диалога») reserved this exact feature: the agent recognizes buying intent in a live customer dialog and issues a REAL invoices.kz счёт with Kaspi payment — the one capability neither MoonAI nor Kelesu has (they can at best paste a static Kaspi link). It is the #1 pick from the 2026-08-24 «что ещё усилить» review of remaining competitor gaps.

Founder decisions (2026-08-25 brainstorm):
- **Autonomy: hybrid, training-style.** First `INVOICE_AUTONOMY_THRESHOLD = 5` drafts require owner approval; after 5 approved, the agent sends invoices autonomously. Founder explicitly said he does not yet fully picture the UX and will live-test then give замечания — expect a post-v1 correction pass, keep v1 mechanisms simple and adjustable.
- **Trigger: both** an AI function in free dialog AND a deterministic flow-builder step — implemented as two thin wrappers over ONE shared draft-creation core.
- **Kaspi Shop prices in agent context: yes, same batch** — the addendum's «cheap part» ships together so replies and draft sums use real catalog prices.
- **Tool integration: native Anthropic tool-use** (approach A) — first tool-use in this codebase; chosen over an `INVOICE_DRAFT:` text-block convention because items arrays need reliable structure and this is the foundation for a future MoonAI-style «Функции» platform.

## What already exists (reused, not rebuilt)

- **Payment chain end-to-end**: creating an `invoices` row + sharing `/view/[token]` is ALL that's needed — that page already auto-mints the Kaspi payment link for Pro owners with a connected Кассир (`getOrCreateKaspiPaymentForInvoice`, Pro-gate inside), polls live and flips to «Оплачено» with no click. Lapsed Pro / no Кассир → the page simply renders without the Kaspi button; the invoice link still works. **Zero new payment code.**
- Atomic numbering: `claim_invoice_number(user_id)` RPC — safe from webhook context.
- Reply pipeline: `handleTenantIncoming` → template match → flow engine → `generateAiReply` (Anthropic, text-only today); per-channel senders (`telegram.ts`, `whatsapp.ts`, `instagram.ts` sendDirectMessage) all exist.
- Review queue `/ai-agent/review` with pending-count badge; training-mode convention (`ai_agents.status`).
- Collected customer data: `ai_agent_conversations.collected_name/collected_phone/collected_data`.
- Flow builder (`ai_agent_flows`, Telegram-only v1) with typed steps.

## New table: `ai_agent_invoice_drafts`

```sql
create table ai_agent_invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  conversation_id uuid not null references ai_agent_conversations(id) on delete cascade,
  customer_name text not null default '',
  customer_phone text not null default '',
  items jsonb not null,               -- [{ name: string, qty: number, unitPrice: number }]
  total numeric not null,
  source text not null,               -- 'ai_tool' | 'flow_step'
  status text not null default 'pending_approval',
    -- 'pending_approval' | 'approved_sent' | 'auto_sent' | 'rejected' | 'error'
  invoice_id uuid,                    -- set once the real invoice is created
  error_message text,                 -- populated on status='error'
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_agent_invoice_drafts_agent_status_idx on ai_agent_invoice_drafts (agent_id, status);
alter table ai_agent_invoice_drafts enable row level security;
-- RLS no policies: service-role only, same as the other ai_agent_* tables;
-- owner access goes through authed API routes.
```

`total` is computed server-side from items (Σ qty × unitPrice), never trusted from the model.

## Core service: `src/lib/aiAgent/invoiceDrafts.ts`

One module, two responsibilities, pure logic separated for tests:

1. `validateDraftInput(items, …)` (pure): non-empty items, each `name` non-empty, `qty ≥ 1` integer, `unitPrice > 0`, ≤ 20 items, total ≤ 10 000 000 ₸ (sanity cap). Returns typed ok/error.
2. `sendInvoiceForDraft(draft)` (service-role): creates the real invoice for the agent OWNER's user
   — `claim_invoice_number(owner user_id)` → insert `invoices` row (client = draft.customer_name/phone, items mapped to the invoice's existing items shape, status `sent`) → build `https://www.invoices.kz/view/{token}` → send one message into the draft's conversation via the channel-appropriate sender («Ваш счёт №… на N ₸: <link>») → update draft (`status`, `invoice_id`, `decided_at`).
   Any failure: draft → `status='error'` + `error_message`, NOTHING is sent to the customer, the review card shows the error with a retry button. The invoice-insert and the send are sequential; if the send fails after the invoice exists, the draft records the invoice_id and the error — retry only re-sends, never re-creates (idempotency guard: a draft with `invoice_id` set skips creation).

**Autonomy rule** (pure function, tested): auto-send allowed iff `agent.status = 'active'` (out of training) AND count of this agent's drafts with `status='approved_sent'` ≥ 5. While in training or below threshold → draft lands as `pending_approval`. `auto_sent` drafts do NOT increment the approval counter — only human-approved ones do.

## AI function (tool-use in `generateAiReply`)

- `generateAiReply` gains an optional `tools` capability: one tool `create_invoice_draft` with schema `{ items: [{name, qty, unit_price}], customer_name?, customer_phone? }`. Enabled only for tenant-agent calls (never for the legacy single-tenant Instagram bot).
- Loop: max ONE tool round. Model calls tool → executor runs `validateDraftInput` + merges `collected_name/phone` fallback → if fields still missing (no name or no phone), the tool_result says exactly which — the model's follow-up text asks the customer for it (no draft row created). If complete → draft created (pending or auto per the rule) → tool_result tells the model what happened → model's final text to the customer either promises the invoice («Готовлю счёт — пришлю ссылку после подтверждения») or, in auto mode, the link message has already been sent by the core and the model just wraps up.
- The system prompt gets a short instruction block: when to call the tool (clear buying intent + известны позиции), never invent prices — use the catalog block (below) or the customer's own words.
- Billing unchanged: the reply (with or without tool round) costs the same 1 credit. The extra tool-round Anthropic call is our COGS, accepted for v1.

## Catalog prices in context («cheap part»)

- New context source in `promptContext.ts`: if the agent owner has an ACTIVE Kaspi Shop connection (`is_active=true` — standing rule), load up to 50 products (`kaspi_shop_tracked_products` by `connection_id`, enabled first, name + current price) into a «Каталог и цены» prompt block. Cached per reply-generation call, no schema change. No connection → block omitted, behavior identical to today.
- Both the free-text answers («сколько стоит X?») and tool-call items get real prices from this block.

## Review queue: draft cards

`/ai-agent/review` gains a second card type «Черновик счёта» (query drafts `pending_approval` + `error` across the user's agents, same aggregation as reply cards):
- Shows: customer name/phone, items table, computed total, source chip (ИИ / Сценарий), conversation channel.
- **Отправить** → `sendInvoiceForDraft` (approves + counts toward autonomy). **Отклонить** → `status='rejected'` (nothing sent, no counter). **«Открыть в /create»** → link to `/create?agentDraft={id}` where the create page prefills client + items from the draft (same query-param prefill family as the existing `?template=` handling — and the same `window.history.replaceState` trap applies) for manual correction. The manual path is fire-and-forget in v1: issuing the invoice from /create does NOT auto-update the draft — the owner rejects the draft card themselves (documented on the card's tooltip).
- The existing pending-count badge includes invoice drafts.
- Error-state cards show `error_message` + «Повторить» (re-runs `sendInvoiceForDraft` with the idempotency guard).

## Flow step «Выставить счёт»

New step type `invoice` in the flow builder (Telegram-only, like all flows v1): step config holds a fixed item (`name`, `unitPrice`, optional qty=1). When the engine reaches it: build draft from step config + conversation's collected name/phone, run the SAME core (autonomy rule included), then advance to the step's `next`. Missing name/phone → the step sends a fixed «напишите имя и телефон» message and stays (re-entry on next customer text passes through the existing flow-exit-on-free-text rule — documented limitation v1: the flow exits on free text, the collected reply reaches the AI path instead; the honest step copy tells the customer what to send).

## Success criteria / live-test plan

Founder explicitly wants to «протестировать всё в процессе»: v1 ships behind the existing admin-gated AI-агент area, he tests the full loop on his own Telegram test bot (dialog → draft → approve → link → real Kaspi payment page), then files замечания. Expect and plan for a follow-up correction batch rather than gold-plating v1.

## Out of scope (deliberate)

- Накладная по факту оплаты (addendum keeps it a separate later step).
- Inline draft EDITING in the review card (v1: approve / reject / open-in-create).
- Autonomy threshold configuration UI (constant 5).
- More AI functions beyond `create_invoice_draft` (the tool plumbing is built to add them later).
- WhatsApp/Instagram flow steps (flows themselves are Telegram-only v1).
- Any change to the legacy single-tenant Instagram bot.

## Testing

Vitest on pure logic per project convention: `validateDraftInput` (bad qty/price/empty/oversize), autonomy rule (training/threshold/auto matrix, auto_sent not counting), catalog prompt block builder (with/without connection, 50-cap), tool-schema input mapping (snake→camel, collected-data fallback). Webhook routes / senders / Anthropic calls stay untested (established convention).
