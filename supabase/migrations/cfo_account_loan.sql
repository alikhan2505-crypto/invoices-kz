-- CFO: пятый вид счёта — кредит / ипотека (loan). QA 17.10.2026, P1-7.
-- Остаток такого счёта — это долг (отрицательное число): он не входит в «Деньги
-- сейчас», запас денег и поиск кассового разрыва, а показывается отдельной
-- строкой «Долги». Перевод с карты на кредитный счёт — платёж по кредиту.
--
-- Код уже умеет этот вид, но пункт «Кредит / ипотека» в формах спрятан за
-- LOAN_KIND_ENABLED = false (src/lib/cfo/labels.ts): пока ограничение в базе не
-- расширено, вставка упала бы. После применения миграции переключить флаг на true.
alter table public.cfo_accounts drop constraint cfo_accounts_kind_check;
alter table public.cfo_accounts add constraint cfo_accounts_kind_check check (kind in ('bank','cash','card','deposit','loan'));
