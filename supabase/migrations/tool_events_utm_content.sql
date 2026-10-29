-- 29.10.2026: колонка utm_content в tool_events -- ключ атрибуции «этот человек открыл
-- ссылку из директа Instagram». Ссылка в ответе на КОНТРАГЕНТ получает utm_content=<токен>
-- (случайные 16 символов, один на диалог; личных данных нет), страница инструмента пишет
-- токен в событие, а крон напоминаний (src/app/api/hooks/ig-reminders) ищет события с токеном.
-- Подробно: src/lib/aiAgent/dmReminder.ts.
--
-- НЕ деструктивная: только добавляет nullable-колонку и частичный индекс. Безопасно применять
-- до и после деплоя кода: код пишет utm_content только когда он пришёл в ссылке, а при отсутствии
-- колонки (42703) пишет событие без неё. Применять ДО включения напоминаний (иначе крон
-- видит, что колонки нет, и ничего не шлёт).
alter table public.tool_events add column if not exists utm_content text;

create index if not exists tool_events_utm_content_idx
  on public.tool_events (utm_content)
  where utm_content is not null;

-- Откат (деструктивно, теряет токены):
--   drop index if exists public.tool_events_utm_content_idx;
--   alter table public.tool_events drop column if exists utm_content;
