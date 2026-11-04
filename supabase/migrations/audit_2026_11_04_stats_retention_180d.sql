-- Аудит 02.11.2026, раздел 5, решение основателя 04.11.2026 («3 да», 180 дней). Применено на проде 04.11.
-- tool_events и site_visits храним 180 дней: в 2 раза дольше самого длинного окна отчётов (90 дней
-- в админской воронке), заодно не держим лишнего о посетителях. Удаление раз в сутки в 03:40 и 03:45 UTC.
-- kaspi_shop_product_city_prices сюда НЕ входит: это текущие цены по городам, а не история.
-- Отменить: select cron.unschedule('retention-tool-events'); select cron.unschedule('retention-site-visits');

select cron.schedule('retention-tool-events', '40 3 * * *',
  $$delete from public.tool_events where created_at < now() - interval '180 days'$$);
select cron.schedule('retention-site-visits', '45 3 * * *',
  $$delete from public.site_visits where created_at < now() - interval '180 days'$$);
