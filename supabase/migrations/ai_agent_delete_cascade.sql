-- Удаление AI-агента (15.10.2026). Четыре ссылки на агента и его диалоги
-- были без ON DELETE, поэтому удаление агента падало на полпути. Код
-- маршрута DELETE /api/ai-agent/agents/[id] уже сам убирает/отвязывает эти
-- строки и работает и до, и после этой миграции; миграция делает модель
-- данных честной, чтобы любое будущее удаление (в том числе руками в SQL
-- Editor) не упиралось в те же ссылки.
--
--   ai_agent_booking_drafts.agent_id        -> CASCADE  (черновик записи — часть агента)
--   ai_agent_booking_drafts.conversation_id -> CASCADE  (черновик живёт внутри диалога)
--   ai_agent_broadcasts.agent_id            -> CASCADE  (история рассылок агента)
--   salon_bookings.conversation_id          -> SET NULL (сама запись клиента принадлежит
--                                                        салону и должна остаться в планировщике)
--
-- Данные не меняются: только определения внешних ключей.
--
-- Важно (16.10.2026): каскад по ai_agent_booking_drafts удалил бы и
-- НЕРАЗОБРАННЫЕ заявки планировщика салона (pending_approval / confirming /
-- error). Маршрут DELETE поэтому сначала проверяет их и отказывает с 409,
-- пока они есть; удалять агента руками в SQL Editor в обход маршрута, не
-- проверив эти заявки, нельзя.

begin;

alter table public.ai_agent_booking_drafts
  drop constraint if exists ai_agent_booking_drafts_agent_id_fkey,
  add constraint ai_agent_booking_drafts_agent_id_fkey
    foreign key (agent_id) references public.ai_agents(id) on delete cascade;

alter table public.ai_agent_booking_drafts
  drop constraint if exists ai_agent_booking_drafts_conversation_id_fkey,
  add constraint ai_agent_booking_drafts_conversation_id_fkey
    foreign key (conversation_id) references public.ai_agent_conversations(id) on delete cascade;

alter table public.ai_agent_broadcasts
  drop constraint if exists ai_agent_broadcasts_agent_id_fkey,
  add constraint ai_agent_broadcasts_agent_id_fkey
    foreign key (agent_id) references public.ai_agents(id) on delete cascade;

alter table public.salon_bookings
  drop constraint if exists salon_bookings_conversation_id_fkey,
  add constraint salon_bookings_conversation_id_fkey
    foreign key (conversation_id) references public.ai_agent_conversations(id) on delete set null;

commit;

-- Проверка после применения (все четыре строки: c / c / c / n):
-- select conname, confdeltype from pg_constraint
--  where conname in ('ai_agent_booking_drafts_agent_id_fkey','ai_agent_booking_drafts_conversation_id_fkey',
--                    'ai_agent_broadcasts_agent_id_fkey','salon_bookings_conversation_id_fkey');
