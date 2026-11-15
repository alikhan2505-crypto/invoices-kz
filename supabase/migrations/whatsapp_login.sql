-- Вход и регистрация через WhatsApp (15.11.2026).
-- Человек нажимает «Войти через WhatsApp», открывается чат с нашим номером и готовым текстом
-- «Вход <код>». Вебхук находит код здесь, отвечает ссылкой на вход. Ссылка одноразовая.
--
-- Применять вручную в панели Supabase (SQL Editor). Пока WHATSAPP_LOGIN_PHONE_NUMBER_ID не задан в Vercel,
-- вся цепочка выключена: старт отвечает 503, вебхук такие сообщения не трогает.

-- Коды в базе только хешами (sha256): утечка таблицы не даёт войти.
create table if not exists public.whatsapp_login_codes (
  id uuid primary key default gen_random_uuid(),
  -- sha256 кода из текста сообщения («Вход ABCD2345»); сам код живёт только в браузере человека и в его чате
  code_hash text not null unique,
  -- pending: код выдан, сообщения ещё не было; sent: сообщение пришло, ссылка отправлена; consumed: ссылка использована
  status text not null default 'pending' check (status in ('pending', 'sent', 'consumed')),
  -- то, что страница входа везёт и в письме: referral_code, first_source, pending_bin_watch, post_login_next
  meta jsonb not null default '{}'::jsonb,
  -- номер отправителя (цифры, без плюса), заполняется, когда пришло сообщение
  wa_id text,
  -- sha256 одноразового токена из ссылки
  token_hash text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  token_expires_at timestamptz,
  consumed_at timestamptz
);

create index if not exists whatsapp_login_codes_expires_idx on public.whatsapp_login_codes (expires_at);

-- Какой аккаунт принадлежит какому номеру WhatsApp. Отдельная таблица, а не profiles.phone:
-- туда человек пишет телефон компании сам, и по нему нельзя вести вход.
create table if not exists public.whatsapp_identities (
  wa_id text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS включён, политик нет: читает и пишет только сервер (service role), как у остальных служебных таблиц.
alter table public.whatsapp_login_codes enable row level security;
alter table public.whatsapp_identities enable row level security;
