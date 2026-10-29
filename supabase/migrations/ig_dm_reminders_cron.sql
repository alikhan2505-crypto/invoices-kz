-- 29.10.2026: расписание напоминаний Instagram -- pg_cron каждые 10 минут дёргает
-- /api/hooks/ig-reminders через pg_net (тот же шаблон, что welcome_instant_email.sql;
-- Vercel Hobby даёт только суточные кроны). Сам эндпоинт ничего не отправит, пока у агента
-- нет строки @reminder (по умолчанию напоминания ВЫКЛЮЧЕНЫ), поэтому расписание можно
-- включать сразу после деплоя.
--
-- СЕКРЕТ. Эндпоинт закрыт: без переменной IG_REMINDER_CRON_SECRET в Vercel он всегда
-- отвечает 401, а с ней требует заголовок x-internal-secret с тем же значением. Значение
-- в миграции НЕ хранится: cron-команда читает его из Supabase Vault при каждом запуске.
-- ПОРЯДОК:
--   1. Придумать длинную случайную строку (например `openssl rand -hex 32`).
--   2. Vercel -> Settings -> Environment Variables: IG_REMINDER_CRON_SECRET = <строка>,
--      Production; передеплоить.
--   3. В SQL Editor выполнить ОДИН раз (подставив ту же строку; в репозиторий не коммитить):
--        select vault.create_secret('<строка>', 'ig_reminder_cron_secret');
--      (смена значения позже: select vault.update_secret(id, '<новая>') для найденного id
--       из select id from vault.secrets where name = 'ig_reminder_cron_secret';)
--   4. Выполнить этот файл.
-- Если секрет в Vault не создан, в заголовок уйдёт пустая строка и эндпоинт ответит 401:
-- вреда нет, просто нет и напоминаний.
--
-- Применять ПОСЛЕ деплоя кода (до него эндпоинт отвечает 404) и ПОСЛЕ ig_dm_reminders.sql.
-- Идемпотентно: повторный запуск пересоздаёт то же задание.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('ig-dm-reminders')
  where exists (select 1 from cron.job where jobname = 'ig-dm-reminders');

select cron.schedule(
  'ig-dm-reminders',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://invoices.kz/api/hooks/ig-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-internal-secret', coalesce(
           (select decrypted_secret from vault.decrypted_secrets where name = 'ig_reminder_cron_secret' limit 1),
           ''
         )
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);

-- Откат расписания (напоминания перестанут отправляться):
--   select cron.unschedule('ig-dm-reminders');


-- ОЧИСТКА ТОКЕНОВ ИЗ tool_events. utm_content нужен только пока идёт окно напоминания
-- (до 22 часов). Дольше хранить его нельзя: рядом с ним в строке лежат visitor и (если
-- событие пришло с сессией) user_id, и вечный токен давал бы связку «диалог Instagram ->
-- браузер -> аккаунт invoices.kz». Раз в сутки в 03:15 UTC токен обнуляется у событий
-- старше 3 суток (запас над окном; остальные поля события не трогаем). Идемпотентно.
select cron.unschedule('ig-dm-reminders-purge-utm')
  where exists (select 1 from cron.job where jobname = 'ig-dm-reminders-purge-utm');

select cron.schedule(
  'ig-dm-reminders-purge-utm',
  '15 3 * * *',
  $$ update public.tool_events
        set utm_content = null
      where utm_content is not null
        and created_at < now() - interval '3 days'; $$
);

-- Откат очистки (токены перестанут стираться):
--   select cron.unschedule('ig-dm-reminders-purge-utm');
-- Разовая ручная очистка (тот же запрос без расписания):
--   update public.tool_events set utm_content = null
--    where utm_content is not null and created_at < now() - interval '3 days';
