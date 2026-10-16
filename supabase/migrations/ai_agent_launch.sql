-- Мастер «сначала канал» для AI-агента (16.10.2026).
--
-- ai_agents.launched_at -- когда владелец нажал «Запустить». Пусто =
-- агент-черновик мастера /ai-agent/setup: создан выключенным
-- (is_enabled = false) и клиентам не отвечает, пока его не запустят. В
-- списке агентов у такого -- «Черновик · Продолжить настройку».
--
-- Существующие агенты: у кого есть хотя бы одно подключение канала, считаются
-- запущенными с момента создания (launched_at = created_at) -- работают как
-- раньше. У кого канала нет, остаются черновиками (на 16.10 это 4 агента,
-- все админские) -- данные их не меняются, только появляется значок.
--
-- Бэкфилл трогает только агентов, созданных ДО мастера (created_at раньше
-- 16.10.2026 по Алматы) -- или уже включённых: если миграцию применят
-- позже деплоя, черновик мастера, которому уже подключили канал, не должен
-- молча стать «запущенным» (он выключен, пока не нажмут «Запустить»).
-- Повторный запуск ничего не меняет (where launched_at is null).
--
-- Индекс ai_agent_messages (conversation_id, created_at desc): по
-- conversation_id индекса не было совсем, а им фильтруют и переписку, и
-- историю для ответа, и новый счётчик бесплатных ответов WhatsApp
-- (GET /api/ai-agent/whatsapp/usage).
--
-- Код работает и ДО применения: без колонки черновиков не бывает, запуск
-- пишет только is_enabled и status.

begin;

alter table public.ai_agents
  add column if not exists launched_at timestamptz;

update public.ai_agents a
   set launched_at = a.created_at
 where a.launched_at is null
   and (a.created_at < timestamptz '2026-10-16 00:00:00+05' or a.is_enabled is not false)
   and exists (
     select 1 from public.ai_agent_channel_connections c
      where c.agent_id = a.id
   );

-- Без CONCURRENTLY: SQL Editor выполняет скрипт одним пакетом (неявная
-- транзакция), где CONCURRENTLY запрещён; таблица небольшая, блокировка на
-- запись -- доли секунды.
create index if not exists ai_agent_messages_conversation_created_idx
  on public.ai_agent_messages (conversation_id, created_at desc);

commit;
