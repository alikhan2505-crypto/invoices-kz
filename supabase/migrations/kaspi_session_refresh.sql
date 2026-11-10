-- 10.11.2026: тихое продление сессии кабинета Kaspi без SMS.
-- Сессия кабинета (mc-session/mc-sid) живёт ~12-14 часов, после чего бот молчит до нового
-- SMS. Код пробует получить новую сессию по сохранённому единому входу idmc (см.
-- refreshSessionSilently в cabinetAuth.ts). Здесь две колонки для расписания попыток и
-- журнал результатов: по нему видно, сколько на деле живёт вход idmc и работает ли продление.
--
-- Применять ДО деплоя кода или вместе с ним: код читает и пишет эти колонки. Идемпотентно.
alter table public.kaspi_shop_connections
  add column if not exists session_refreshed_at timestamptz,
  add column if not exists session_refresh_attempt_at timestamptz;

comment on column public.kaspi_shop_connections.session_refreshed_at is
  'Когда сохранённая сессия кабинета получена: новый вход по SMS или тихое продление. null у старых строк.';
comment on column public.kaspi_shop_connections.session_refresh_attempt_at is
  'Последняя попытка тихого продления (успешная или нет): не чаще раза в 30 минут на подключение.';

create table if not exists public.kaspi_shop_session_refresh_log (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.kaspi_shop_connections(id) on delete cascade,
  created_at timestamptz not null default now(),
  trigger text not null,           -- cron | push | user
  outcome text not null,           -- refreshed | sso_expired | unreachable | error | no_session | skipped_newer
  detail text,                     -- причина или код сети
  cookie_lifetimes text,           -- сроки cookie из Set-Cookie, без значений
  session_age_hours numeric        -- возраст прежней сессии на момент попытки (null, если неизвестен)
);

create index if not exists kaspi_shop_session_refresh_log_conn_idx
  on public.kaspi_shop_session_refresh_log (connection_id, created_at desc);

-- Журнал только для сервера (service role): ни одной политики, RLS включён.
alter table public.kaspi_shop_session_refresh_log enable row level security;
