-- 16.10.2026: счётчик заходов и источник регистраций для ежедневного отчёта
-- «Машина/QR» основателю в Telegram (крон /api/cron/car-report, 20:00 Алматы).
--
-- site_visits — одна строка на загрузку публичной страницы (главная,
-- /lp/*, /invoices-landing, /cashier-api). Пишет только POST /api/track/visit
-- (service-role). Ни IP, ни User-Agent, ни email: load_id — случайный id
-- ОДНОЙ загрузки страницы, нужен только чтобы отсеять повтор бикона.
-- signup_sources — источник первого захода новой регистрации (метка из
-- фиксированного списка, 'unknown' если неизвестен). Пишет только
-- POST /api/track/signup-source (service-role), один раз на аккаунт.
-- daily_reports — «захват» дня, чтобы отчёт уходил один раз в сутки.
--
-- Поза как у tool_events: RLS включён, политик нет, доступ только service-role.
-- Можно запускать повторно (if not exists).

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  load_id text not null,
  path text not null,
  host text not null,
  source_class text not null check (source_class in ('car_exact', 'car_likely', 'search', 'social', 'direct_other', 'referral')),
  is_mobile boolean not null default false,
  is_new boolean not null default false,
  signed_in boolean not null default false,
  utm_source text,
  utm_campaign text
);
create unique index if not exists site_visits_load_id_key on public.site_visits (load_id);
create index if not exists site_visits_created_at_idx on public.site_visits (created_at);
create index if not exists site_visits_source_class_created_at_idx on public.site_visits (source_class, created_at);
alter table public.site_visits enable row level security;
revoke all on table public.site_visits from anon, authenticated;

create table if not exists public.signup_sources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  source_class text not null check (source_class in ('car_exact', 'car_likely', 'search', 'social', 'direct_other', 'referral', 'unknown')),
  created_at timestamptz not null default now()
);
create index if not exists signup_sources_created_at_idx on public.signup_sources (created_at);
create index if not exists signup_sources_source_class_created_at_idx on public.signup_sources (source_class, created_at);
alter table public.signup_sources enable row level security;
revoke all on table public.signup_sources from anon, authenticated;

create table if not exists public.daily_reports (
  day date not null,
  kind text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (day, kind)
);
alter table public.daily_reports enable row level security;
revoke all on table public.daily_reports from anon, authenticated;
