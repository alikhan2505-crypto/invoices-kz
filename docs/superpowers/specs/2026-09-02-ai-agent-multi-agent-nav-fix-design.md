# AI-агент: устранение путаницы между агентами в навигации — Design

## Context

Live usability audit (2026-09-02, temp admin test account `alikhan2505+aitest@gmail.com`, two real test agents created — «Агент А — Салон красоты», «Агент Б — Автосервис») confirmed a code-level suspicion: the AI-агент section's second-row nav (Агенты / Диалоги / Переписка / Тестовый чат / Рассылки / Заявки / Аналитика / Как настроить) carries no shared "which agent am I looking at" context between pages. `/ai-agent/settings` is the only page truly scoped to one agent (`?agent=<id>`, reached only by clicking an agent card), and it has no visible label showing which agent is open — only inferable from the "Название компании" field's value.

Live-reproduced concrete bug: `Аналитика`'s "Подключить канал" and `Рассылки`'s "подключите Telegram-бота или WhatsApp" both link to bare `/ai-agent/settings` (or `?tab=channels`) with no agent id. Confirmed via network inspection that `GET /api/ai-agent/settings` with no `agentId` returns the **most recently created** agent — by explicit design (`src/app/api/ai-agent/settings/route.ts:46-48`, comment: "preserves the exact pre-multi-agent behavior for a single-agent user"). With 2+ agents, clicking either link can silently open/connect-a-channel-for the wrong agent with zero on-screen indication.

Two founder decisions from brainstorming (2026-09-02), both final:
1. **Targeted fix, not a persistent global "active agent" switcher.** `Заявки`/`Аналитика` keep «Все агенты» as their default (useful aggregate dashboards) — we fix what's actually broken (missing agent id on links, the silent wrong-agent fallback) rather than restructure the navigation model.
2. **Диалоги and Переписка get the same «Выбор агента ▾» pattern Заявки/Аналитика already have** — additive, not a behavior change to their existing "show everything, regardless of agent" default.

## Fix 1 — kill the silent wrong-agent bug

**Client-side link discipline.** Every outbound "configure this agent / connect a channel" link on a page that already has its own agent context must carry that agent's id explicitly:
- `Аналитика` (`src/app/ai-agent/analytics/page.tsx`): the "Подключить канал" empty-state link (→ `/ai-agent/settings`) becomes `/ai-agent/settings?agent=${agentFilter}` when `agentFilter !== 'all'`. When `agentFilter === 'all'`: if the caller has exactly one agent, use its id (unambiguous); if 2+, point the link at `/ai-agent` (the Агенты list) instead of Settings — force an explicit card click rather than guessing.
- `Рассылки` (`src/app/ai-agent/broadcasts/page.tsx`): the "подключите Telegram-бота или WhatsApp" empty-state link (→ `/ai-agent/settings?tab=channels`) appears whenever no agent has a working Telegram/WhatsApp connection yet (`broadcastableAgents.length === 0`), independent of the compose modal's `selectedAgentId`. Same rule as Analytics: exactly one agent → use its id; 2+ agents → point at `/ai-agent` instead of guessing which one to send to Каналы for.

**Server-side safety valve.** `GET /api/ai-agent/settings` (`src/app/api/ai-agent/settings/route.ts`): when `agentId` is omitted, count the caller's agents first.
- Exactly 1 agent → keep today's behavior (load it, no change — this is the genuinely unambiguous single-agent case the original fallback was written for).
- 2+ agents and no `agentId` → return `{ error: 'ambiguous_agent' }` with 400, instead of silently picking the most-recently-created one. Any remaining unfixed call site (present or future) fails loudly in testing instead of quietly editing the wrong agent. The settings page itself (`src/app/ai-agent/settings/page.tsx`) shows a small inline message ("Не указан агент — выберите его в списке «Агенты»") and a link back to `/ai-agent` on this specific error code, rather than a generic error state.

## Fix 2 — Settings always shows which agent is open

`src/app/ai-agent/settings/page.tsx`: add a small label above the tab row (Настройки/Промптинг/Контроль/Шаблоны/Сценарии/Каналы) reading **"Агент: {agent.name}"**, populated from the same `GET /api/ai-agent/settings` response already loaded (no new fetch). Shown once the agent has loaded; absent during the "new agent" creation flow (`?new=1`, no agent to name yet).

## Fix 3 — Диалоги and Переписка gain the Заявки/Аналитика agent pattern

**Диалоги (review queue, `/ai-agent/review`).** `src/app/api/ai-agent/review/route.ts`'s deliberate "aggregate across all agents" default (documented in its own comment, lines 45-52) is **not changed** — this stays the loading behavior. Additive only:
- API: each returned item gains `agentName` (the query already joins through `agent_id`; add the name lookup the same way `dialogs/route.ts` already does with `agentNameById`). Accept an optional `?agentId=` to narrow the same query with `.eq('agent_id', agentId)` instead of `.in('agent_id', agents.map(...))`.
- UI (`src/app/ai-agent/review/page.tsx`): render the agent's name as a small chip on each draft card, next to the existing channel chip. Add the same `Выбор агента ▾` dropdown used on `/ai-agent/leads` and `/ai-agent/analytics` (「Все агенты」 stays the default). Reword the singular "Агент ещё обучается" subheading to something agent-count-agnostic (e.g. "Черновики ответов ждут вашего одобрения").

**Переписка (dialogs/inbox, `/ai-agent/dialogs`).** The `DialogItem` type and the API (`src/app/api/ai-agent/dialogs/route.ts`) already compute `agentName`/`agentId` per conversation (line 62-63) — it's fetched but never rendered or filterable. Additive only:
- API: accept an optional `?agentId=` query param, applied the same way leads/analytics do (`.eq('agent_id', agentId)` instead of `.in('agent_id', agents.map(...))`).
- UI (`src/app/ai-agent/dialogs/page.tsx`): render `item.agentName` as a small label under the customer handle in each list row (and in the open thread's header). Add the same `Выбор агента ▾` dropdown pattern, local state mirroring `leads`/`analytics`'s `agentFilter`/`changeAgent`, refetching the list on change. `?conversation=` deep-linking (used by the Заявки Kanban cards) is unaffected — it still opens a specific conversation by id regardless of the filter's current value.

## Out of scope (deliberate)

- No persistent "active agent" concept spanning the whole section (rejected in brainstorming — see Context).
- No URL restructuring (e.g. `/ai-agent/[agentId]/settings`) — stays on today's `?agent=`/`?agentId=` query-param convention throughout, for consistency with the existing Заявки/Аналитика pattern this fix extends.
- No change to `Диалоги`'s "aggregate by default" behavior — only additive labeling + an optional narrow-down filter.
- Admin-gating gaps found in the 2026-09-01 code audit (`instagram/connect` missing `isAdmin`, the 4 unguarded `wallet/*` routes) — separate, already-documented finding, not part of this fix.
- No change to `Тестовый чат`'s own agent-selection handling — out of scope, wasn't found to have this class of bug.

## Testing

No new pure/extractable logic — every change here is either a link's `href` construction, a query-param passthrough on an existing Supabase query, or presentational (a label, a dropdown reusing an already-proven pattern). Consistent with this codebase's convention, route handlers and page wiring stay covered by manual live verification rather than unit tests:
- Confirm (already reproduced live pre-fix) that clicking `Аналитика`/`Рассылки`'s empty-state CTA while Агент Б's data is in view now opens/targets Агент Б, not Агент А, with 2 real test agents.
- Confirm `GET /api/ai-agent/settings` with no `agentId` and 2 agents present returns 400 `ambiguous_agent`; with exactly 1 agent, still returns it directly (regression check against the single-agent case).
- Confirm the Settings page's new "Агент: {name}" label matches the agent actually being edited, for both test agents.
- Confirm Диалоги and Переписка each show correct per-item agent names and that their new filter dropdowns narrow the list correctly, using the two live test agents (create one pending draft / one conversation per agent to verify).
