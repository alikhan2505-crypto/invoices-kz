-- 29.10.2026: три события формы бесплатных документов (/tools/schet, avr, kp,
-- nakladnaya) для замера конверсии view -> doc после правок формы:
--   tool_form_autofill_bin   - название подставилось по БИН без кнопки «Найти»
--   tool_form_more_open      - человек сам раскрыл блок «Дополнительно»
--   tool_form_saved_applied  - подставились запомненные реквизиты поставщика
-- Без расширения CHECK такие строки молча не пишутся (сервер отвечает 204 и
-- логирует сбой), страницы при этом работают. Имя ограничения tool_events_event_check
-- предполагается (умолчание Postgres); проверка:
--   select conname from pg_constraint where conrelid = 'public.tool_events'::regclass and contype = 'c';
alter table public.tool_events drop constraint if exists tool_events_event_check;
alter table public.tool_events add constraint tool_events_event_check
  check (event in ('view', 'doc', 'cta', 'limit', 'lead', 'signup',
                   'tool_form_autofill_bin', 'tool_form_more_open', 'tool_form_saved_applied'));
