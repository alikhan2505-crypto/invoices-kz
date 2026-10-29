-- 29.10.2026: «Следить за этим БИН». Список контрагентов на слежении; раз в сутки
-- крон /api/cron/bin-watch перепроверяет БИН и, если результат ухудшился, шлёт
-- одно письмо владельцу списка. Идемпотентно (можно запускать повторно).
-- Пока таблицы нет, всё спит: API отвечает «не готово», крон - reason table_missing.
--
-- Порядок применения: этот файл целиком, одним запуском в SQL Editor. Никакие
-- существующие таблицы и данные не меняются.

-- 1. Список слежения. Одна строка = пользователь + БИН.
create table if not exists public.bin_watch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bin text not null check (bin ~ '^[0-9]{12}$'),
  -- Название по последней успешной проверке (публичный реестр), для списка.
  name text,
  -- Последнее ИЗВЕСТНОЕ значение каждого признака (true/false/null). С ним сравнивается
  -- новая проверка: сбой реестра (null) базу не затирает. null = первый снимок ещё не сделан.
  baseline jsonb,
  -- {signals, details} последней успешной проверки: то, что видит страница списка.
  last_result jsonb,
  last_checked_at timestamptz,
  -- Последняя ПОПЫТКА (успешная или нет): по ней порядок обработки (самые давние первыми)
  -- и правило «БИН не чаще раза в сутки».
  last_attempt_at timestamptz,
  last_status text check (last_status is null or last_status in ('ok', 'not_found', 'unavailable')),
  -- Новые негативные признаки, о которых владельца ещё не предупредили письмом. Ключи:
  -- unreliable, bankrupt, liquidating, registryClosed, taxDebt, enforcement,
  -- rehabilitation, vatLost. Очищается после отправки (или если проблема прошла).
  pending_changes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, bin)
);

create index if not exists bin_watch_user_idx on public.bin_watch (user_id);
create index if not exists bin_watch_attempt_idx on public.bin_watch (last_attempt_at asc nulls first);

alter table public.bin_watch enable row level security;

-- Видеть и удалять можно только свои строки. Вставки и правки с клиента НЕТ вообще
-- (нет политик insert/update): единственный путь добавления - /api/bin-watch
-- (service-role), где проверяется лимит тарифа (Free 5, Про 50) и админ-гейт.
-- Прямой вызов Supabase из браузера лимит обойти не может.
drop policy if exists "bin_watch_select_own" on public.bin_watch;
create policy "bin_watch_select_own" on public.bin_watch
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "bin_watch_delete_own" on public.bin_watch;
create policy "bin_watch_delete_own" on public.bin_watch
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.bin_watch from anon;
revoke insert, update, truncate, references, trigger on public.bin_watch from authenticated;

comment on table public.bin_watch is
  'Слежение за БИН контрагента (крон /api/cron/bin-watch). Вставка только через /api/bin-watch (service-role); клиент видит и удаляет только свои строки.';

-- 2. Журнал писем: не больше одного письма на пользователя в сутки. Строка (user, день
-- по Алматы) занимается ДО отправки; неудавшаяся отправка её освобождает.
create table if not exists public.bin_watch_mail_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.bin_watch_mail_log enable row level security;
revoke all on public.bin_watch_mail_log from anon, authenticated;

comment on table public.bin_watch_mail_log is
  'Журнал писем слежения за БИН: одна строка на пользователя и день. Доступ только service-role (политик нет).';
