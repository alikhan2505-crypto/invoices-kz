-- CFO «Спроси CFO»: дневной счётчик вопросов к ИИ на компанию (applied 2026-10-07).
-- Пишется только сервером (service role) перед вызовом модели.
alter table public.cfo_companies add column ask_day date, add column ask_count integer not null default 0;
-- Счётчик меняет только сервер: из браузера владелец может править лишь эти поля.
revoke update on public.cfo_companies from authenticated, anon;
grant update (name, telegram_digest, count_invoices) on public.cfo_companies to authenticated;
