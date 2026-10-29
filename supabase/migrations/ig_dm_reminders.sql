-- 29.10.2026: напоминание в директе Instagram через ~2 часа после ответа на КОНТРАГЕНТ.
-- Одна строка на ДИАЛОГ (unique conversation_id) = не больше одного напоминания за всё
-- время. Логика, статусы и гарантии: src/lib/aiAgent/dmReminder.ts.
--
-- Статусы:
--   prepared  токен выдан, ответ со ссылкой ещё не подтверждён как отправленный
--   pending   ответ ушёл, ждём 2 часа; сюда смотрит крон
--   sending   крон забрал строку (атомарный claim: update ... where status = 'pending');
--             обратно в pending НЕ возвращается, поэтому дубля напоминания не бывает
--   sent      напоминание отправлено
--   failed    отправка не удалась (повтора нет; reason = http-статус и коды Meta)
--   skipped   напоминать не нужно (reason: visited, replied, expired, paused, agent_off,
--             no_connection, no_conversation, unconfirmed)
--
-- Хранит только случайный токен, uuid диалога и времена. Имён, id Instagram и текстов
-- сообщений здесь нет. RLS включён, политик нет: доступ только service-role (как у tool_events).
-- НЕ деструктивная (новая таблица). Применять ПОСЛЕ tool_events_utm_content.sql.
create table if not exists public.ig_dm_reminders (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  conversation_id uuid not null unique references public.ai_agent_conversations(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{8,64}$'),
  status text not null default 'prepared'
    check (status in ('prepared', 'pending', 'sending', 'sent', 'failed', 'skipped')),
  reason text,
  link_sent_at timestamptz not null default now(),
  last_inbound_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Выборка крона: pending по времени отправки ссылки.
create index if not exists ig_dm_reminders_pending_idx
  on public.ig_dm_reminders (link_sent_at) where status = 'pending';
-- Суточный предохранитель: сколько напоминаний агент забрал за 24 часа.
create index if not exists ig_dm_reminders_claimed_idx
  on public.ig_dm_reminders (agent_id, claimed_at) where claimed_at is not null;

alter table public.ig_dm_reminders enable row level security;

-- Откат (деструктивно, теряет журнал напоминаний):
--   drop table if exists public.ig_dm_reminders;
