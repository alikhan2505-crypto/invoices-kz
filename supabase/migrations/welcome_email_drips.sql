-- 12.10.2026: welcome-цепочка писем (3 письма: день 1/3/7, cron welcome-drip).
-- profiles.email_optout — отписка по подписанной ссылке (/api/email/unsubscribe);
-- email_drips — какие шаги кому отправлены (PK user_id+step = идемпотентность).
-- Пишем только аккаунтам, созданным ПОСЛЕ 12.10.2026 — старых не трогаем.
alter table public.profiles add column if not exists email_optout boolean not null default false;

create table public.email_drips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step int not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.email_drips enable row level security;
