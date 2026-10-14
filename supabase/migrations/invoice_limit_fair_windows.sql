-- Честные окна подсчёта лимита счетов (14.10.2026).
--
-- ПРИМЕНЕНА 14.10.2026 (основатель, SQL Editor). Выполнялась один раз (или через
-- apply_migration) ДО деплоя кода с invoiceLimitWindow() — см. README.
--
-- Было: все тарифы считали счета с 1-го числа месяца по Алматы. Две ошибки:
--   1. Пробные «10 счетов за 7 дней» считались по календарному месяцу:
--      неделя на стыке месяцев давала до 20 счетов.
--   2. Счета, созданные на пробном/бонусном/платном тарифе, съедали
--      бесплатные «3 в месяц» после его окончания: сделал 5 счетов на пробном —
--      до конца месяца ни одного бесплатного.
--
-- Стало (то же самое — invoiceLimitWindow() в src/lib/invoiceLimit.ts;
-- менять только вместе):
--   * Про — без лимита; админы и служебная роль — пропускаются триггером.
--   * Базовый и бонусные дни — 30 с начала календарного месяца по Алматы
--     (без изменений).
--   * Пробный — 10 с начала пробного периода. Начало нигде не хранится:
--     /api/onboarding/grant ставит trial_expires_at = выдача + 7 суток,
--     поэтому начало = trial_expires_at − 168 часов. Если за это время уже
--     закончился платный/бонусный период — с его окончания.
--   * Бесплатный — 3 с max(начала месяца по Алматы, окончания последнего
--     пробного/бонусного/платного периода).
--
-- Колонки времени: plan_expires_at, bonus_expires_at и invoices.created_at —
-- timestamp WITHOUT time zone, хранят UTC; trial_expires_at — timestamptz.
-- Ниже всё переводится явно через AT TIME ZONE 'UTC', а не через неявное
-- приведение по TimeZone сессии (сейчас UTC, но полагаться на это незачем).
--
-- invoice_limit_for() остаётся (переписана поверх новой функции), чтобы был
-- один источник правды и ничего, что могло её звать, не сломалось.

-- 1. Лимит + начало окна + вид тарифа для пользователя.
create or replace function public.invoice_limit_window(p_user_id uuid, p_now timestamptz default now())
 returns table (limit_value integer, window_start timestamptz, kind text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  p record;
  v_plan_end timestamptz;
  v_bonus_end timestamptz;
  v_trial_end timestamptz;
  v_month_start timestamptz;
  v_last_ended timestamptz;
begin
  select pr.plan, pr.plan_expires_at, pr.bonus_expires_at, pr.trial_expires_at
    into p from public.profiles pr where pr.id = p_user_id;
  -- No profile: not our place to block. The account bootstrap creates the
  -- row, and a race there must not cost someone their invoice.
  if not found then
    return query select null::integer, null::timestamptz, 'unlimited'::text;
    return;
  end if;

  v_plan_end  := p.plan_expires_at  at time zone 'UTC';
  v_bonus_end := p.bonus_expires_at at time zone 'UTC';
  v_trial_end := p.trial_expires_at;

  -- Calendar month in Almaty, same as almatyMonthStart() in the browser.
  v_month_start := date_trunc('month', p_now at time zone 'Asia/Almaty') at time zone 'Asia/Almaty';

  -- The latest bigger-plan period that has already ended (active means
  -- "> now", so ending exactly now counts as ended). greatest() skips NULLs.
  v_last_ended := greatest(
    case when v_plan_end  <= p_now then v_plan_end  end,
    case when v_bonus_end <= p_now then v_bonus_end end,
    case when v_trial_end <= p_now then v_trial_end end
  );

  -- 1. Paid plan. NULL limit means unlimited (Pro).
  if p.plan is not null and p.plan <> 'free'
     and (v_plan_end is null or v_plan_end > p_now) then
    if p.plan = 'pro' then
      return query select null::integer, null::timestamptz, 'unlimited'::text;
      return;
    end if;
    return query select 30, v_month_start, 'basic'::text;
    return;
  end if;

  -- 2. Bonus days count as Basic.
  if v_bonus_end is not null and v_bonus_end > p_now then
    return query select 30, v_month_start, 'basic'::text;
    return;
  end if;

  -- 3. Trial: 10 over the trial itself. 168 hours, not '7 days', so the
  --    result does not depend on the session TimeZone (DST).
  if v_trial_end is not null and v_trial_end > p_now then
    return query select 10, greatest(v_trial_end - interval '168 hours', v_last_ended), 'trial'::text;
    return;
  end if;

  -- 4. Free: 3 per Almaty month, but never counting what was made on a bigger plan.
  return query select 3, greatest(v_month_start, v_last_ended), 'free'::text;
end;
$function$;

revoke execute on function public.invoice_limit_window(uuid, timestamptz) from public, anon, authenticated;

-- 2. invoice_limit_for() — тот же ответ, что и раньше, но из одного места.
create or replace function public.invoice_limit_for(p_user_id uuid)
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select w.limit_value from public.invoice_limit_window(p_user_id) w;
$function$;

revoke execute on function public.invoice_limit_for(uuid) from public, anon, authenticated;

-- 3. Триггер: то же, что живёт в базе сейчас (invoice_limit_pin_created_at.sql),
--    но окно подсчёта берётся из invoice_limit_window(). CREATE OR REPLACE
--    сохраняет ACL из revoke_definer_rpc.sql. Текст ошибки не менять:
--    src/lib/invoiceLimit.ts разбирает «invoice_limit_reached: N of M».
create or replace function public.enforce_invoice_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_used integer;
  v_window_start timestamptz;
begin
  -- Server-side flows keep working: the recurring-invoice cron and admin
  -- tools run as the service role, and the hole being closed here is the
  -- browser one. Same exemption the profiles trigger uses.
  if auth.role() = 'service_role' then return NEW; end if;
  if public.is_admin_user(auth.uid()) then return NEW; end if;

  -- The window below is only meaningful if created_at is the server's own
  -- clock: a client-supplied past date would put the new row outside the
  -- window and skip the limit forever.
  NEW.created_at := now();

  -- Serialize inserts per user: without this, N parallel inserts at
  -- "2 of 3" each count 2 (none sees the others' uncommitted rows) and all
  -- pass. The lock is held until the inserting transaction ends, and under
  -- READ COMMITTED the count below takes a fresh snapshot after acquiring
  -- it, so it sees whatever the previous holder committed.
  perform pg_advisory_xact_lock(hashtextextended('invoice_limit:' || NEW.user_id::text, 0));

  select w.limit_value, w.window_start into v_limit, v_window_start
    from public.invoice_limit_window(NEW.user_id) w;
  if v_limit is null then return NEW; end if;

  -- Cancelled invoices count, matching the browser. Letting a cancellation
  -- free up a slot would turn the limit into a formality.
  -- invoices.created_at is timestamp without time zone holding UTC.
  select count(*) into v_used
    from public.invoices
   where user_id = NEW.user_id
     and created_at >= (v_window_start at time zone 'UTC');

  if v_used >= v_limit then
    raise exception 'invoice_limit_reached: % of % this month', v_used, v_limit
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$function$;

-- Проверка после применения (только чтение):
--   select * from public.invoice_limit_window('<user uuid>');
--   select public.invoice_limit_for('<user uuid>');
