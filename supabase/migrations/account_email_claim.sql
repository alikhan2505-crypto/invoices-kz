-- Почта для аккаунта, созданного входом через WhatsApp (15.11.2026).
-- Человек без почты вводит адрес на дашборде, получает 6-значный код, вводит его: адрес становится почтой
-- аккаунта. Если такая почта уже есть в invoices.kz, номер привязывается к тому аккаунту.

-- Коды только хешами (sha256). Строка живёт 15 минут, 5 неверных попыток гасят её.
create table if not exists public.email_claim_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists email_claim_codes_user_idx on public.email_claim_codes (user_id, created_at desc);

alter table public.email_claim_codes enable row level security;

-- Поиск пользователя Supabase Auth по почте (Admin API искать по адресу не умеет). Только для сервера.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
