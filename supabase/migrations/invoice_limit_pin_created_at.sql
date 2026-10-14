-- Лимит счетов в месяц: created_at больше не подставляется из браузера (14.10.2026).
--
-- ПРИМЕНЕНА 14.10.2026 (основатель, SQL Editor). Исходная пометка: выполнить один раз (или через
-- apply_migration).
--
-- Дыра: enforce_invoice_limit() считает счета пользователя с
-- created_at >= начала месяца по Алматы, но сам created_at приходит от
-- клиента. Политики RLS на invoices разрешают своему пользователю и INSERT,
-- и UPDATE любых колонок, поэтому прямым запросом со своей сессией можно:
--   * вставить счёт с created_at = '2020-01-01' — он не попадёт в окно месяца,
--     и следующий тоже пройдёт, лимит не срабатывает никогда;
--   * перенести created_at уже созданных счетов в прошлое — и освободить место.
-- Через интерфейс так не сделать, это обход в обход браузера — ровно то, что
-- триггер и должен был закрыть.
--
-- Вторая дыра (найдена ревью): гонка. N параллельных INSERT при «2 из 3»
-- каждый видит 2 (чужие незакоммиченные строки не видны) и все проходят —
-- пачкой запросов можно было создать сколько угодно счетов сверх лимита.
-- Исправление: pg_advisory_xact_lock по user_id перед подсчётом.
--
-- Исправление: для обычной пользовательской сессии created_at на INSERT
-- всегда = now() (сервера), а на UPDATE не меняется. Служебная роль (кроны,
-- админские маршруты) и администраторы освобождены — так же, как в
-- самом enforce_invoice_limit() и в protect_profile_privileged_columns.
-- Браузерный код created_at при вставке либо не передаёт, либо передаёт
-- текущее время («Дублировать» в /invoice/[id]) — для него ничего не меняется.

-- 1. INSERT: та же функция, что живёт в базе сейчас, плюс одна строка
--    NEW.created_at := now() перед подсчётом. CREATE OR REPLACE сохраняет
--    ACL из revoke_definer_rpc.sql.
create or replace function public.enforce_invoice_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_used integer;
  v_month_start timestamptz;
begin
  -- Server-side flows keep working: the recurring-invoice cron and admin
  -- tools run as the service role, and the hole being closed here is the
  -- browser one. Same exemption the profiles trigger uses.
  if auth.role() = 'service_role' then return NEW; end if;
  if public.is_admin_user(auth.uid()) then return NEW; end if;

  -- The month window below is only meaningful if created_at is the server's
  -- own clock: a client-supplied past date would put the new row outside
  -- the window and skip the limit forever.
  NEW.created_at := now();

  v_limit := public.invoice_limit_for(NEW.user_id);
  if v_limit is null then return NEW; end if;

  -- Calendar month in Almaty, not UTC: the browser counts from the 1st in
  -- Almaty time too (src/lib/invoiceLimit.ts almatyMonthStart), and on the
  -- first hours of a new month a UTC window would disagree with what the
  -- person is looking at.
  v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty';

  -- Serialize inserts per user: without this, N parallel inserts at
  -- "2 of 3" each count 2 (none sees the others' uncommitted rows) and all
  -- pass. The lock is held until the inserting transaction ends, and under
  -- READ COMMITTED the count below takes a fresh snapshot after acquiring
  -- it, so it sees whatever the previous holder committed.
  perform pg_advisory_xact_lock(hashtextextended('invoice_limit:' || NEW.user_id::text, 0));

  -- Cancelled invoices count, matching the browser. Letting a cancellation
  -- free up a slot would turn the limit into a formality.
  select count(*) into v_used
    from public.invoices
   where user_id = NEW.user_id
     and created_at >= v_month_start;

  if v_used >= v_limit then
    raise exception 'invoice_limit_reached: % of % this month', v_used, v_limit
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$function$;

-- 2. UPDATE: created_at своего счёта задним числом не переносится. Тихо
--    возвращаем старое значение, а не бросаем ошибку — клиент, который
--    отправляет строку целиком, не должен из-за этого ломаться.
create or replace function public.protect_invoice_created_at()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.role() = 'service_role' then return NEW; end if;
  if public.is_admin_user(auth.uid()) then return NEW; end if;
  if NEW.created_at is distinct from OLD.created_at then
    NEW.created_at := OLD.created_at;
  end if;
  return NEW;
end;
$function$;

revoke execute on function public.protect_invoice_created_at() from public, anon, authenticated;

drop trigger if exists protect_invoice_created_at_trigger on public.invoices;
create trigger protect_invoice_created_at_trigger
  before update on public.invoices
  for each row execute function public.protect_invoice_created_at();
