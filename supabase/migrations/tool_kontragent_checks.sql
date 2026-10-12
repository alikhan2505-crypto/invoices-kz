-- 12.10.2026: публичная проверка контрагента на /tools/kontragent.
-- Счётчик бесплатных проверок: 3 в день на IP (решение основателя) + общий
-- дневной предохранитель в роуте. Сырой IP не храним — только sha256(ip|день).
-- Поза как у остальных: RLS включён, политик нет, доступ только service-role.
create table public.tool_kontragent_checks (
  key text primary key,
  day date not null,
  count int not null default 0,
  created_at timestamptz not null default now()
);
create index tool_kontragent_checks_day_idx on public.tool_kontragent_checks (day);
alter table public.tool_kontragent_checks enable row level security;
