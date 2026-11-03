-- 03.11.2026, пункт 5 аудита 02.11: реферальные бонусы нельзя фармить.
-- Решение основателя («да», 03.11): бонус новичку только в первые 2 суток жизни
-- аккаунта, реферер получает не больше чем за 10 засчитанных приглашённых.
-- До этого файла исходники двух функций жили только в базе (миграции
-- stack_bonus_days_atomically и promo_redemptions_and_capped_referral_bonus
-- не лежали в репозитории), поэтому здесь полные тексты.

-- 1. Бонус новичку: только аккаунту не старше 2 суток. Вызывается из
-- /api/referral под service_role. NULL = строка не обновлена (уже приглашён
-- или аккаунт старый). Возраст считаем по UTC явно: created_at без пояса.
create or replace function public.claim_referral_bonus(p_user uuid, p_code text, p_days integer)
 returns timestamp with time zone
 language sql
 set search_path to 'public'
as $function$
  update profiles
  set referred_by = p_code,
      bonus_expires_at = least(
        greatest(coalesce(bonus_expires_at, now()), now()) + make_interval(days => p_days),
        now() + make_interval(days => 90)
      )
  where id = p_user and referred_by is null
    and p_days between 1 and 90
    and created_at > (now() at time zone 'utc') - interval '2 days'
  returning bonus_expires_at;
$function$;

-- 2. Реферер: не больше 10 засчитанных приглашённых. NULL = лимит исчерпан
-- (или строки нет). Проверка и инкремент в одном UPDATE, гонки нет.
create or replace function public.credit_referrer_bonus(p_referrer uuid, p_days integer)
 returns timestamp with time zone
 language sql
 set search_path to 'public'
as $function$
  update profiles
  set referral_count = coalesce(referral_count, 0) + 1,
      bonus_expires_at = least(
        greatest(coalesce(bonus_expires_at, now()), now()) + make_interval(days => p_days),
        now() + make_interval(days => 90)
      )
  where id = p_referrer
    and p_days between 1 and 90
    and coalesce(referral_count, 0) < 10
  returning bonus_expires_at;
$function$;

-- 3. Правила из пунктов 1-2 опираются на created_at, referral_count и
-- referral_code, а эти колонки пользователь мог менять сам (RLS-политика
-- «Users can update own profile» без WITH CHECK, триггер их не защищал):
-- поставить себе created_at = сейчас, обнулить referral_count, подменить
-- чужой referral_code. Защищаем их так же, как остальные денежные поля.
-- Тело — прежнее, добавлены только строки про три колонки.
create or replace function public.protect_profile_privileged_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan := 'free';
    NEW.plan_expires_at := NULL;
    NEW.is_admin := false;
    NEW.kaspi_wallet_balance := 0;
    NEW.bonus_expires_at := NULL;
    NEW.trial_expires_at := NULL;
    NEW.welcome_bonus_claimed_at := NULL;
    NEW.referred_by := NULL;
    NEW.promo_granted_at := NULL;
    NEW.telegram_chat_id := NULL;
    NEW.telegram_connect_token := NULL;
    NEW.telegram_test_sent_at := NULL;
    NEW.notification_prefs := NULL;
    NEW.referral_count := 0;
    NEW.referral_code := substring(gen_random_uuid()::text, 1, 8);
    NEW.created_at := now() at time zone 'utc';
    RETURN NEW;
  END IF;

  NEW.plan := OLD.plan;
  NEW.plan_expires_at := OLD.plan_expires_at;
  NEW.is_admin := OLD.is_admin;
  NEW.kaspi_wallet_balance := OLD.kaspi_wallet_balance;
  NEW.bonus_expires_at := OLD.bonus_expires_at;
  NEW.trial_expires_at := OLD.trial_expires_at;
  NEW.welcome_bonus_claimed_at := OLD.welcome_bonus_claimed_at;
  NEW.referred_by := OLD.referred_by;
  NEW.promo_granted_at := OLD.promo_granted_at;
  NEW.telegram_chat_id := OLD.telegram_chat_id;
  NEW.telegram_connect_token := OLD.telegram_connect_token;
  NEW.telegram_test_sent_at := OLD.telegram_test_sent_at;
  NEW.notification_prefs := OLD.notification_prefs;
  NEW.referral_count := OLD.referral_count;
  NEW.referral_code := OLD.referral_code;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$function$;

-- 4. Права: только service_role (как на проде). CREATE OR REPLACE сохраняет
-- существующие права; строки нужны, чтобы пересозданная база или ветка
-- получила их тоже, а не права Supabase по умолчанию.
revoke all on function public.claim_referral_bonus(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.credit_referrer_bonus(uuid, integer) from public, anon, authenticated;
revoke all on function public.protect_profile_privileged_columns() from public, anon, authenticated;
grant execute on function public.claim_referral_bonus(uuid, text, integer) to service_role;
grant execute on function public.credit_referrer_bonus(uuid, integer) to service_role;
grant execute on function public.protect_profile_privileged_columns() to service_role;

-- Ручные правки: триггер из пункта 3 откатывает защищённые колонки в любой
-- сессии без роли service_role, в том числе из SQL Editor и MCP (там auth.role()
-- пустой). UPDATE created_at / referral_count / referral_code оттуда «успешно»
-- ничего не изменит, так же как уже с bonus_expires_at и балансом. Править такие
-- поля нужно ключом service_role через API приложения или под админом; JWT-claims
-- подделывать нельзя.
