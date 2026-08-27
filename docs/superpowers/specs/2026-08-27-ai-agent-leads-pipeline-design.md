# AI-агент: воронка в «Заявках» — Design

## Context

From the 2026-08-22 competitor research (corta.kz): «Каждое сообщение автоматически создаёт сделку и карточку клиента» + «руководитель видит диалоги и загрузку команды в реальном времени». The second half (real-time visibility into every conversation) is already covered by «Переписка» (`/ai-agent/dialogs`, shipped 2026-08-26). What's still missing is the first half: today's «Заявки» (`/ai-agent/leads`) only lists conversations where the AI managed to extract structured `collected_data` (name/phone/etc) — a conversation with no extraction never becomes a "lead" at all, and there's no sense of pipeline progress (new → being worked → closed) anywhere in the product.

Founder-approved (2026-08-27 brainstorm): every conversation is a lead from its first message, shown as a 3-column Kanban board (Новый / В работе / Закрыт), status changes are forward-only plus one reopen action — no free-form status picker, no drag-and-drop in v1.

## Data model — one new column, zero webhook changes

```sql
alter table ai_agent_conversations
  add column lead_status text not null default 'new'
  check (lead_status in ('new', 'in_progress', 'closed'));
```

The three tenant webhook handlers (`telegramWebhookHandler.ts`, `whatsappWebhookHandler.ts`, `webhookHandler.ts`) already `upsert` a conversation row on first contact — **no code change needed there**. The column default means every conversation, past and future, is a lead: existing rows backfill to `'new'` on migration, every new conversation starts `'new'` automatically. This is the whole mechanism — the corta-style "every message is a deal" behavior falls out of a single column default, not new wiring.

## API changes

`GET /api/ai-agent/leads` (`src/app/api/ai-agent/leads/route.ts`): remove the existing `collected_data`-non-empty filter entirely — return every conversation across the caller's agents, with `leadStatus` added to each item's shape (alongside the existing `collectedData`, now legitimately `{}` for many rows). Same ownership-scoping (`agentIds` from `user_id`), same batched last-activity-from-messages join already in place — no change to that part.

New `POST /api/ai-agent/leads/status` — `{ conversationId, status: 'new' | 'in_progress' | 'closed' }`: ownership-checked exactly like the dialogs routes (load caller's `agentIds`, `.eq('id', conversationId).in('agent_id', agentIds)`), validates `status` against the three allowed values, updates `lead_status`. No transition-graph enforcement server-side (the UI only ever offers forward-one-step or the single reopen action, per the design below) — the route accepts any of the three values for any conversation, keeping the server simple; the UI is what keeps the flow linear.

## UI: Kanban board on `/ai-agent/leads`

Three columns, `Новый` / `В работе` / `Закрыт`, each independently scrollable, populated by filtering the same fetched list client-side by `leadStatus`. Existing agent-filter dropdown (`agentFilter`, «Все агенты» / per-agent) stays, applies across all three columns identically to today.

Each card keeps its current content (channel icon, agent name when the user has >1 agent, collected-field chips — now often empty, last-activity timestamp) and gains:
- **New column card**: button «В работу →» → `POST .../status {status:'in_progress'}`, optimistic move to the middle column.
- **In-progress column card**: button «Закрыть →» → `{status:'closed'}`, optimistic move to the right column.
- **Closed column card**: button «Открыть заново ↺» → `{status:'new'}`, the one reopen path (mistakes happen; no other backward or skip-ahead transition exists in the UI).

Clicking anywhere else on a card (not the status button) navigates to `/ai-agent/dialogs?conversation={id}` — see below.

Empty-column state: small centered muted text per column («Пока пусто»), not the whole-page empty state (that's still reserved for "user has zero agents" or a genuine zero-conversations account).

## Connecting to «Переписка»

`/ai-agent/dialogs` (`src/app/ai-agent/dialogs/page.tsx`) gains support for a `?conversation={id}` query param: on load, after the conversation list fetches, if the id is present in the list, auto-call the existing `openConversation(id)` exactly as a manual click would. If the id isn't found in the caller's own conversations (stale link, wrong owner), the param is silently ignored — the page just shows its normal "выберите диалог слева" state, no error. This lets a lead card link straight into the real thread instead of the owner having to hunt for it in the Переписка list.

## Out of scope (deliberate)

- Drag-and-drop between columns — click-to-advance buttons only.
- Arbitrary/backward status transitions beyond the single "Открыть заново" reopen — no dropdown picker.
- Auto-advancing status from other events (e.g., an invoice draft being sent/paid auto-closing the lead) — manual only in v1, matches this codebase's existing preference for explicit owner-driven toggles (`is_enabled`, `paused_for_human`) over inferred state changes.
- Per-column counts/analytics beyond the plain card count already implicit in each column's length.
- Any change to the three tenant webhook handlers — the column default does all the work.

## Testing

No new pure logic is introduced — the status transition rule is enforced entirely by which buttons the UI renders (a UI/wiring concern, not an extractable pure function), and the API route's validation is a simple three-value allowlist check inline in the route, consistent with this codebase's convention that route handlers themselves stay untested. Manual live verification: confirm existing conversations appear under «Новый» after the migration, click through Новый → В работе → Закрыт → Открыть заново on a real conversation, confirm the lead card's non-status click opens the right thread in «Переписка».
