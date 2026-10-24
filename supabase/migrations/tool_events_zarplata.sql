-- Бесплатный инструмент «Расчёт зарплаты» (/tools/zarplata): событие tool = 'zarplata'.
-- Без расширения CHECK события молча не пишутся (сервер отвечает 204 и логирует сбой).
-- Имя ограничения tool_events_tool_check предполагается (умолчание Postgres); проверка:
--   select conname from pg_constraint where conrelid = 'public.tool_events'::regclass and contype = 'c';
alter table public.tool_events drop constraint if exists tool_events_tool_check;
alter table public.tool_events add constraint tool_events_tool_check
  check (tool in ('kp', 'schet', 'avr', 'nakladnaya', 'kontragent', 'nalogi', 'margin', 'waybills', 'zarplata', 'none'));
