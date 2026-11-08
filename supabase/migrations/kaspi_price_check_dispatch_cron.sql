-- 08.11.2026: запуск проверки цен Kaspi Bot по расписанию базы. Расписание GitHub Actions
-- (`*/10 * * * *` в .github/workflows/kaspi-shop-price-check.yml) на деле срабатывало раз в
-- 3-7 часов, и «проверка раз в час» не выполнялась. pg_cron каждые 10 минут дёргает
-- /api/hooks/kaspi-check-dispatch через pg_net (тот же шаблон, что ig_dm_reminders_cron.sql);
-- маршрут сам смотрит, есть ли что проверять, и только тогда запускает workflow
-- (workflow_dispatch, токен KASPI_SHOP_GITHUB_PAT). Расписание GitHub остаётся запасным.
--
-- СЕКРЕТ необязателен и пока не используется: заголовка x-internal-secret задание не шлёт.
-- Если в Vercel задать KASPI_CHECK_DISPATCH_SECRET, маршрут начнёт требовать этот заголовок;
-- тогда добавить его в задание, читая значение из Vault, как в ig_dm_reminders_cron.sql.
-- Без переменной вызов открыт, но безвреден: запуск только когда есть что проверять и не
-- чаще раза в 5 минут (слот в базе).
--
-- Применять ПОСЛЕ деплоя кода (до него маршрут отвечает 404). Идемпотентно.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('kaspi-check-dispatch')
  where exists (select 1 from cron.job where jobname = 'kaspi-check-dispatch');

select cron.schedule(
  'kaspi-check-dispatch',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://invoices.kz/api/hooks/kaspi-check-dispatch',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);

-- Откат (проверка вернётся к расписанию GitHub, раз в несколько часов):
--   select cron.unschedule('kaspi-check-dispatch');
