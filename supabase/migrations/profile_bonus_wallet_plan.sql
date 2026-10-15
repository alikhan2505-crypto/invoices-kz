-- 15.10.2026. Бонус за заполненный профиль + оплата тарифа с кошелька.
-- Применять целиком в SQL Editor. Повторный запуск безопасен.
-- Код (src/lib/profileBonusServer.ts, src/lib/plans/walletPlanPayment.ts,
-- src/lib/kaspiPay/settlePlanPayment.ts) работает и до применения: бонусы не
-- начисляются, кошелёк на /upgrade не предлагается.

-- 1. Право на бонус. Строка права, пополнение кошелька и запись в журнале
--    делаются одной транзакцией (claim_profile_bonus ниже); уникальные
--    ограничения не дают начислить дважды (в том числе при гонке запросов).
--    user_id — on delete SET NULL, а не cascade (отступление от первичной
--    формулировки): при удалении аккаунта строки с БИН остаются, и тот же БИН
--    не получит бонус заново, удалив аккаунт и зарегистрировавшись снова.
--    unique (user_id, block) при этом работает: NULL-ы не конфликтуют.
create table if not exists public.profile_bonus_grants (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  block text not null check (block in ('requisites', 'bank', 'signature')),
  bin text,
  amount int not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, block)
);
-- Реквизиты и банк платятся один раз на БИН на все аккаунты сразу.
create unique index if not exists profile_bonus_grants_block_bin_uidx
  on public.profile_bonus_grants (block, bin) where bin is not null;
-- Если таблица уже была создана прошлой версией этого файла (not null +
-- cascade) — привести к set null.
alter table public.profile_bonus_grants alter column user_id drop not null;
alter table public.profile_bonus_grants drop constraint if exists profile_bonus_grants_user_id_fkey;
alter table public.profile_bonus_grants add constraint profile_bonus_grants_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
alter table public.profile_bonus_grants enable row level security;
-- Политик нет намеренно: читает и пишет только service role.
revoke all on public.profile_bonus_grants from anon, authenticated;

-- 2. Новые типы записей журнала кошелька.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check check (type in (
  'topup', 'commission', 'adjustment', 'kaspi_shop_check', 'ai_agent_reply',
  'profile_bonus', 'plan_payment', 'plan_payment_refund'
));

-- 2б. Начисление бонуса — одной транзакцией: строка права, пополнение
--     кошелька, запись 'profile_bonus' в журнале. Сбой сети после COMMIT не
--     даёт двойного начисления: повторный вызов упрётся в строку права.
--     Ответ: {status:'credited', balance} | {status:'already_claimed'} |
--     {status:'bin_already_rewarded'} | {status:'not_eligible', reason}.
create or replace function public.claim_profile_bonus(
  p_user_id uuid,
  p_block text,
  p_bin text,
  p_amount int,
  p_note text
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_block not in ('requisites', 'bank', 'signature') then raise exception 'invalid_block'; end if;

  -- Блокировка профиля заодно ставит в очередь параллельные запросы одного
  -- пользователя.
  select * into v_profile from profiles where id = p_user_id for update;
  if not found or v_profile.deleted_at is not null then
    return jsonb_build_object('status', 'not_eligible', 'reason', 'deleted');
  end if;
  if coalesce(v_profile.is_admin, false) then
    return jsonb_build_object('status', 'not_eligible', 'reason', 'admin');
  end if;
  if exists (select 1 from profile_bonus_grants where user_id = p_user_id and block = p_block) then
    return jsonb_build_object('status', 'already_claimed');
  end if;

  begin
    insert into profile_bonus_grants (user_id, block, bin, amount)
    values (p_user_id, p_block, nullif(p_bin, ''), p_amount);
  exception when unique_violation then
    if exists (select 1 from profile_bonus_grants where user_id = p_user_id and block = p_block) then
      return jsonb_build_object('status', 'already_claimed');
    end if;
    return jsonb_build_object('status', 'bin_already_rewarded');
  end;

  update profiles set kaspi_wallet_balance = coalesce(kaspi_wallet_balance, 0) + p_amount
  where id = p_user_id
  returning kaspi_wallet_balance into v_balance;

  insert into wallet_ledger (user_id, type, amount, balance_after, note)
  values (p_user_id, 'profile_bonus', p_amount, v_balance, p_note);

  return jsonb_build_object('status', 'credited', 'balance', v_balance);
end $$;

-- 3. Часть цены тарифа, оплаченная кошельком. amount остаётся полной ценой
--    тарифа; на Kaspi уходит amount - wallet_amount.
--    wallet_status: held — удержано под ещё не оплаченный Kaspi-платёж;
--    applied — потрачено; refunded — возвращено (платёж не состоялся).
alter table public.payment_requests add column if not exists wallet_amount int not null default 0;
alter table public.payment_requests add column if not exists wallet_status text;
alter table public.payment_requests drop constraint if exists payment_requests_wallet_amount_check;
alter table public.payment_requests add constraint payment_requests_wallet_amount_check
  check (wallet_amount >= 0 and wallet_amount <= amount);
alter table public.payment_requests drop constraint if exists payment_requests_wallet_status_check;
alter table public.payment_requests add constraint payment_requests_wallet_status_check
  check (wallet_status is null or wallet_status in ('held', 'applied', 'refunded'));

-- Админ правит payment_requests из браузера (RLS «Admin can update»); колонки
-- кошелька меняет только сервер, иначе правкой wallet_amount + 'rejected'
-- можно было бы «вернуть» на кошелёк деньги, которых не удерживали.
create or replace function public.protect_payment_request_wallet_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.wallet_amount := old.wallet_amount;
  new.wallet_status := old.wallet_status;
  return new;
end $$;
drop trigger if exists protect_payment_request_wallet_columns on public.payment_requests;
create trigger protect_payment_request_wallet_columns
  before update on public.payment_requests
  for each row execute function public.protect_payment_request_wallet_columns();

-- 4. Оплата тарифа целиком с кошелька — одной транзакцией: проверка баланса,
--    списание, продление тарифа (дату считает приложение той же функцией, что
--    и для Kaspi), строка 'paid' в payment_requests, запись в журнале.
--    p_expected_*: если профиль изменился с момента чтения — 'profile_changed',
--    приложение пересчитает дату и повторит.
create or replace function public.pay_plan_from_wallet(
  p_user_id uuid,
  p_email text,
  p_plan text,
  p_period text,
  p_amount int,
  p_expected_plan text,
  p_expected_plan_expires_at timestamp,
  p_expected_bonus_expires_at timestamp,
  p_new_plan_expires_at timestamp,
  p_clear_bonus boolean,
  p_note text
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_balance numeric;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_plan not in ('basic', 'pro') or p_period not in ('monthly', 'annual') then raise exception 'invalid_plan'; end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found or v_profile.deleted_at is not null then raise exception 'account_deleted'; end if;
  if coalesce(v_profile.kaspi_wallet_balance, 0) < p_amount then raise exception 'insufficient_funds'; end if;
  if v_profile.plan is distinct from p_expected_plan
     or v_profile.plan_expires_at is distinct from p_expected_plan_expires_at
     or v_profile.bonus_expires_at is distinct from p_expected_bonus_expires_at then
    raise exception 'profile_changed';
  end if;

  update profiles set
    kaspi_wallet_balance = kaspi_wallet_balance - p_amount,
    plan = p_plan,
    plan_expires_at = p_new_plan_expires_at,
    bonus_expires_at = case when p_clear_bonus then null else bonus_expires_at end
  where id = p_user_id
  returning kaspi_wallet_balance into v_balance;

  insert into payment_requests (user_id, email, plan, amount, billing_period, status, activated_at, order_id, wallet_amount, wallet_status)
  values (p_user_id, coalesce(p_email, ''), p_plan, p_amount, p_period, 'paid', now(), 'wallet:' || gen_random_uuid(), p_amount, 'applied')
  returning id into v_id;

  insert into wallet_ledger (user_id, type, amount, balance_after, note)
  values (p_user_id, 'plan_payment', -p_amount, v_balance, p_note);

  return jsonb_build_object('payment_id', v_id, 'balance', v_balance);
end $$;

-- 5. Частичная оплата: удержать часть с кошелька и создать строку платежа на
--    остаток (Kaspi-операция уже выпущена приложением) — одной транзакцией.
--    Удержания у собственных несостоявшихся строк пользователя (истёк QR,
--    окно обновило код) сначала забираются обратно той же транзакцией: при
--    обновлении QR раз в минуту удержание «переезжает» на новую строку, а в
--    журнал попадает одна запись на разницу (обычно ни одной), а не пара
--    «−N / +N» каждую минуту.
--    Порядок блокировок — сначала строки payment_requests, потом профиль, как
--    в refund_plan_wallet_hold, чтобы транзакции не ждали друг друга по кругу.
create or replace function public.start_plan_payment_with_wallet(
  p_user_id uuid,
  p_email text,
  p_plan text,
  p_period text,
  p_total int,
  p_wallet int,
  p_order_id text,
  p_note text
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_balance numeric;
  v_id uuid;
  v_reclaim int := 0;
  v_net int;
  r record;
begin
  if p_total is null or p_wallet is null or p_wallet <= 0 or p_wallet >= p_total then raise exception 'invalid_amount'; end if;
  if p_plan not in ('basic', 'pro') or p_period not in ('monthly', 'annual') then raise exception 'invalid_plan'; end if;
  if p_order_id is null or p_order_id = '' then raise exception 'invalid_amount'; end if;

  for r in
    select id, wallet_amount from payment_requests
    where user_id = p_user_id
      and wallet_status = 'held'
      and wallet_amount > 0
      and status in ('expired', 'failed', 'rejected')
    for update
  loop
    update payment_requests set wallet_status = 'refunded' where id = r.id;
    v_reclaim := v_reclaim + r.wallet_amount;
  end loop;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found or v_profile.deleted_at is not null then raise exception 'account_deleted'; end if;
  if coalesce(v_profile.kaspi_wallet_balance, 0) + v_reclaim < p_wallet then raise exception 'insufficient_funds'; end if;

  v_net := p_wallet - v_reclaim;
  update profiles set kaspi_wallet_balance = coalesce(kaspi_wallet_balance, 0) - v_net
  where id = p_user_id
  returning kaspi_wallet_balance into v_balance;

  insert into payment_requests (user_id, email, plan, amount, billing_period, status, order_id, qr_operation_id, wallet_amount, wallet_status)
  values (p_user_id, coalesce(p_email, ''), p_plan, p_total, p_period, 'pending', p_order_id, p_order_id, p_wallet, 'held')
  returning id into v_id;

  if v_net > 0 then
    insert into wallet_ledger (user_id, type, amount, balance_after, note)
    values (p_user_id, 'plan_payment', -v_net, v_balance, p_note);
  elsif v_net < 0 then
    insert into wallet_ledger (user_id, type, amount, balance_after, note)
    values (p_user_id, 'plan_payment_refund', -v_net, v_balance, 'Возврат: оплата тарифа через Kaspi не завершилась');
  end if;

  return jsonb_build_object('payment_id', v_id, 'balance', v_balance);
end $$;

-- 6. Возврат удержания, если Kaspi-платёж не состоялся. Ровно один раз:
--    held→refunded и пополнение — одна транзакция, и только для строки в
--    expired/failed/rejected (оплаченную вернуть нельзя).
create or replace function public.refund_plan_wallet_hold(p_payment_request_id uuid)
returns numeric language plpgsql set search_path = public as $$
declare
  v_user uuid;
  v_amount int;
  v_balance numeric;
begin
  update payment_requests set wallet_status = 'refunded'
  where id = p_payment_request_id
    and wallet_status = 'held'
    and wallet_amount > 0
    and status in ('expired', 'failed', 'rejected')
  returning user_id, wallet_amount into v_user, v_amount;
  if v_user is null then return null; end if;

  update profiles set kaspi_wallet_balance = kaspi_wallet_balance + v_amount
  where id = v_user
  returning kaspi_wallet_balance into v_balance;

  insert into wallet_ledger (user_id, type, amount, balance_after, note)
  values (v_user, 'plan_payment_refund', v_amount, v_balance, 'Возврат: оплата тарифа через Kaspi не завершилась');

  return v_balance;
end $$;

-- Страховка для ежедневного крона: вернуть всё, что осталось удержанным у
-- несостоявшихся платежей (вызов возврата не дошёл, админ отклонил платёж).
create or replace function public.refund_orphan_plan_wallet_holds()
returns int language plpgsql set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from payment_requests
    where wallet_status = 'held' and status in ('expired', 'failed', 'rejected')
  loop
    if public.refund_plan_wallet_hold(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Все функции — только для сервера (service role), не для REST RPC браузера.
revoke execute on function public.claim_profile_bonus(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.claim_profile_bonus(uuid, text, text, int, text) to service_role;
revoke execute on function public.pay_plan_from_wallet(uuid, text, text, text, int, text, timestamp, timestamp, timestamp, boolean, text) from public, anon, authenticated;
revoke execute on function public.start_plan_payment_with_wallet(uuid, text, text, text, int, int, text, text) from public, anon, authenticated;
revoke execute on function public.refund_plan_wallet_hold(uuid) from public, anon, authenticated;
revoke execute on function public.refund_orphan_plan_wallet_holds() from public, anon, authenticated;
revoke execute on function public.protect_payment_request_wallet_columns() from public, anon, authenticated;
grant execute on function public.pay_plan_from_wallet(uuid, text, text, text, int, text, timestamp, timestamp, timestamp, boolean, text) to service_role;
grant execute on function public.start_plan_payment_with_wallet(uuid, text, text, text, int, int, text, text) to service_role;
grant execute on function public.refund_plan_wallet_hold(uuid) to service_role;
grant execute on function public.refund_orphan_plan_wallet_holds() to service_role;

-- PostgREST должен увидеть новые функции и колонки сразу.
notify pgrst, 'reload schema';
