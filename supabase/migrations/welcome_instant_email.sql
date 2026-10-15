-- 15.10.2026: первое письмо welcome-цепочки (приветствие + бонусы за профиль)
-- уходит через 10–15 минут после регистрации, а не на 2-е сутки. pg_cron раз в
-- 5 минут дёргает /api/hooks/welcome-instant через pg_net (он уже включён
-- миграцией signup_instant_ping.sql); сам эндпоинт отбирает аккаунты от
-- 10 минут до 24 часов и шлёт каждому письмо один раз (claim в email_drips).
-- Дневные письма (через сутки, 3-й и 7-й день) — по-прежнему Vercel-крон
-- /api/cron/welcome-drip, здесь ничего для них не нужно.
-- Применять ПОСЛЕ деплоя кода: до деплоя эндпоинт отвечает 404 — вреда нет, но и письма нет.
create extension if not exists pg_cron with schema pg_catalog;

-- Идемпотентно: повторный запуск не плодит дубли задания.
select cron.unschedule('welcome-instant')
  where exists (select 1 from cron.job where jobname = 'welcome-instant');

select cron.schedule(
  'welcome-instant',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://invoices.kz/api/hooks/welcome-instant',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);
