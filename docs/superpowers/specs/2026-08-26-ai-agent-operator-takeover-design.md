# AI-агент: оператор-takeover + стоп-фразы — Design

## Context

From the 2026-08-22 competitor research and the follow-up "что ещё усилить" review: без ручного перехвата диалога человеком AI-агент не продать всерьёз реальному бизнесу — это гигиенический минимум рынка (Kelesu/Corta/MoonAI все имеют это). Founder picked this up right after shipping счёт из чата (Phase 3).

Two ways a conversation hands off to a human, one shared pause state:
- **Стоп-фраза**: customer types a phrase from the agent's configurable list — AI stops replying in that conversation, owner is notified.
- **Ручной перехват**: owner opens the new inbox and starts typing — sending a message itself takes the conversation over, no separate button.

Founder-approved decision (2026-08-26 brainstorm): the owner replies **inside invoices.kz** (a real inbox), not on their own phone — bigger build than a bare pause+notify, but a single coherent interface across all three channels.

## What already exists (reused, not rebuilt)

- Whole-agent kill switch `ai_agents.is_enabled` — already checked first in all three tenant handlers (`telegramWebhookHandler.ts`, `whatsappWebhookHandler.ts`, `webhookHandler.ts`). Untouched; the new per-conversation pause sits immediately after it, never replaces it.
- `webhookHandler.ts` is the established home for shared pure matchers imported by all three channels: `findTemplateMatch`, `mergeCollectedData`. `findStopPhraseMatch` joins them here, same precedent.
- `TriggerChipsEditor` (`src/components/aiAgent/TriggerChipsEditor.tsx`) — already reused by Шаблоны and Сценарии tabs for exactly this kind of chip-list editing; reused a third time for stop phrases, zero new component.
- `sendIntoConversation` in `src/lib/aiAgent/invoiceSend.ts` — sends plain text into a conversation on whichever channel it's on (Telegram/WhatsApp/Instagram sender dispatch) and logs the outbound `ai_agent_messages` row. Extracted to a shared home (see below) since a second feature now needs it.
- `createNotification` + the owner's Telegram-nudge pattern (profiles.telegram_chat_id/notify_telegram) — same shape already used for pending review drafts and invoice drafts.
- Admin-only gating (`requireUser` + `isAdmin`) — identical shape across every `/api/ai-agent/*` route; the new routes follow it verbatim.

## Data model — two new columns, no new table

```sql
alter table ai_agents
  add column stop_phrases text[] not null default array['оператор','человек','менеджер','позовите','поговорить с человеком'];

alter table ai_agent_conversations
  add column paused_for_human boolean not null default false;
```

No `paused_reason`/`paused_at` column — v1 doesn't need to distinguish stop-phrase from manual takeover in the UI beyond the one badge, and sort order (see below) doesn't need a timestamp beyond the existing message history.

## Priority chain — one new gate, first after the existing kill switch

Current chain (per channel handler, after `is_enabled`): mid-flow+button → flow engine; mid-flow+free-text → exit flow silently; template match; flow trigger-keyword match; AI reply.

New chain: **`is_enabled` → `paused_for_human` check → (everything above unchanged)**.

- If `conversation.paused_for_human === true`: log the inbound message (existing dedup-insert path, unchanged) and return. No template, no flow, no AI, no acknowledgement text — the customer already got the one-time ack (if it was a stop-phrase) or the owner is already mid-conversation (if manual), so repeating anything would be noise.
- If not yet paused: run `findStopPhraseMatch(text, agent.stop_phrases)` **before** template/flow matching (a customer asking for a human must never accidentally match a template or flow trigger word first). On match: set `paused_for_human = true`, send the fixed acknowledgement text via the same channel's existing send call (not `sendIntoConversation` — this one IS the AI-pipeline's own reply slot, logged as `is_ai_generated: false` since it's a fixed system message, not a model output), fire the owner notification, and return — skip template/flow/AI entirely for this message.
- No match: everything continues exactly as today.

The acknowledgement send reuses each handler's OWN existing per-channel send call (`sendTelegramBotMessage`/`sendWhatsAppMessage`/`sendDirectMessage`, already imported in every handler for template replies) plus the SAME outbound-message-insert shape the handler's template-match branch already uses (`direction:'outbound', is_ai_generated:false, status:'sent'`) — not the new `channelSend.ts` helper, since that helper looks up the channel connection fresh from the DB while the handler already has it in scope from the connection loaded at the top of the request. This mirrors exactly how the existing template-match branch sends+logs today; the stop-phrase branch is a sibling of it, not a new pattern.

`findStopPhraseMatch(text: string, phrases: string[]): boolean` — same case-insensitive substring rule as `findTemplateMatch`/`findFlowTriggerMatch` (`text.toLowerCase().includes(phrase.toLowerCase())`), lives in `webhookHandler.ts`, imported by all three handlers.

Fixed acknowledgement text (not configurable in v1, per the design's explicit out-of-scope call): `«Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.»`

## Shared sender: extract `channelSend.ts`

`sendIntoConversation` moves from `invoiceSend.ts` to a new `src/lib/aiAgent/channelSend.ts` (pure re-export point, same signature: `(supabase, conversation: {id, channel, external_thread_id, agent_id}, text) => Promise<string | null>`). `invoiceSend.ts` imports it from the new location; the new dialogs-reply route imports it too. No behavior change — this is a straight extraction, not a rewrite, so `invoiceSend.test.ts`-equivalent behavior (there is none — network function, untested per convention) has nothing to break.

## New page: `/ai-agent/dialogs`

New nav entry, admin-gated like every other AI-агент page. Two-pane layout (list left, thread right — collapses to list-then-thread on mobile, same responsive pattern `/ai-agent/review`'s card grid already uses at the breakpoint level, adapted to a master-detail split here since a thread view doesn't fit a card grid).

**List** (left): every conversation across the user's agents, newest-activity first. Each row: channel icon (existing inline SVGs, copied per this codebase's established per-file icon convention), agent name (only shown when the user has >1 agent — matches Лиды's `agentName` field), customer handle/name, last message preview (truncated), relative timestamp, a small red dot + "ждёt вас" chip when `paused_for_human`. Manual refresh button (no polling — matches every other AI-агент page today).

**Thread** (right, opens on row click): full `ai_agent_messages` history for that conversation, oldest→newest, right-aligned bubbles for `direction:'outbound'` (with a small "ИИ"/owner distinction via `is_ai_generated`), left-aligned for `direction:'inbound'`. Non-text messages render their existing placeholder text (e.g. `[Фото]`) — no new media rendering, per the explicit out-of-scope call. Below the thread: a text input + Send button, always visible regardless of `paused_for_human` state (sending is what takes over — no separate "Взять диалог" button, per the brainstorm decision). When `paused_for_human` is true, a "Вернуть боту" button appears next to Send to flip it back to `false` (no message sent to the customer on release — same "no automatic customer-facing text" rule as manual takeover).

## New API routes

- `GET /api/ai-agent/dialogs` — list conversations across the caller's agents. Same ownership-scoping shape as `leads/route.ts`: load the caller's agent ids first, then conversations `.in('agent_id', agentIds)`. Last-message preview: one batched `ai_agent_messages` query ordered `created_at desc` across all the returned conversation ids (bounded, e.g. one row per conversation via in-memory grouping — same "no server-side GROUP BY via Supabase's REST client" convention as `/api/kaspi/dashboard`), not N+1 queries.
- `GET /api/ai-agent/dialogs/messages?conversationId=` — full message history for one conversation; 404 if the conversation's `agent_id` isn't in the caller's agent ids.
- `POST /api/ai-agent/dialogs/reply` — `{ conversationId, text }`: ownership-check, set `paused_for_human = true` (idempotent — already-true is a no-op), call `sendIntoConversation` from `channelSend.ts` (this already inserts the outbound `ai_agent_messages` row with `is_ai_generated: false`), return the updated message.
- `POST /api/ai-agent/dialogs/release` — `{ conversationId }`: ownership-check, set `paused_for_human = false`.

## Settings: stop phrases

New field on the existing Промптинг tab (`/ai-agent/settings`) — a `TriggerChipsEditor` block right below the existing custom-instructions textarea, labeled «Стоп-фразы (передают диалог вам)», backed by `ai_agents.stop_phrases`, saved through the existing agent-settings POST route (one more field alongside `customInstructions`/`collectFields` etc — no new route).

## Out of scope (deliberate, v1)

- Real-time push updates in the inbox (matches every other AI-агент page today — manual refresh only).
- Media (photo/voice) rendered as real previews in the thread — placeholder text only, same as everywhere else in this codebase.
- Configurable acknowledgement text — fixed string for v1.
- A `paused_reason`/`paused_at` column or any "why is this paused" distinction beyond the one badge.
- Auto-resume after idle time — release is manual only, mirrors `is_enabled`'s explicit-toggle precedent.

## Testing

Vitest for pure logic per project convention: `findStopPhraseMatch` (case-insensitivity, empty phrase list, substring vs whole-word edge cases — same test shape as the existing `findFlowTriggerMatch` tests). Webhook wiring, the new API routes, and `channelSend.ts`'s network calls stay untested (established convention — `sendIntoConversation`/`generateAiReply`/`sendTelegramNotification` are all untested for the same reason).
