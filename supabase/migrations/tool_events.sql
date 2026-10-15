-- 15.10.2026: своя аналитика бесплатных инструментов (/tools/*). Vercel Web
-- Analytics у проекта не включён, track() ничего не пишет. Одна строка на
-- событие: просмотр, документ, клик в CTA, лимит, лид, регистрация.
-- Пишет только POST /api/tools/event (service-role), читает только
-- GET /api/admin/tool-funnel (service-role, админ). Ни сырого IP, ни email,
-- ни содержимого документов: visitor — случайный id из localStorage браузера.
-- Поза как у остальных: RLS включён, политик нет, доступ только service-role.
create table public.tool_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('view', 'doc', 'cta', 'limit', 'lead', 'signup')),
  tool text not null check (tool in ('kp', 'schet', 'avr', 'nakladnaya', 'kontragent', 'nalogi', 'margin', 'waybills', 'none')),
  lang text,
  visitor text,
  user_id uuid,
  internal boolean not null default false,
  medium text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_host text,
  device text
);
create index tool_events_created_at_idx on public.tool_events (created_at);
create index tool_events_tool_event_created_at_idx on public.tool_events (tool, event, created_at);
alter table public.tool_events enable row level security;
