-- Настройки уведомлений по событиям (16.10.2026). Код работает и ДО применения:
-- без колонки notification_prefs всё ведёт себя как раньше (старые notify_*),
-- тумблеры Telegram по отдельным событиям просто не сохраняются (409
-- migration_pending; вместо них — общий тумблер «Присылать уведомления в
-- Telegram» = старая колонка notify_telegram), «цена на минимуме» шлётся раз
-- за эпизод, а не раз в сутки, ограничение тестового сообщения — в памяти
-- процесса.
-- Порядок: можно до или после деплоя. Данные пользователей не меняются.

-- 1. Выбор по событиям: { "<событие>": { "telegram": bool, "email": bool, "chat": bool } }.
--    NULL / отсутствующий ключ = «не выбирал» → значение по умолчанию в коде
--    (src/lib/notificationPrefs.ts, defaultPref — повторяет старое поведение).
alter table public.profiles add column if not exists notification_prefs jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_notification_prefs_is_object'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_notification_prefs_is_object
      check (notification_prefs is null or jsonb_typeof(notification_prefs) = 'object');
  end if;
  -- Потолок размера: ~25 событий × 3 канала — это сотни байт; 8 КБ с запасом.
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_notification_prefs_size'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_notification_prefs_size
      check (notification_prefs is null or pg_column_size(notification_prefs) < 8192);
  end if;
end $$;

-- 2. Ограничение частоты кнопки «Отправить тестовое сообщение» (раз в 30 с).
alter table public.profiles add column if not exists telegram_test_sent_at timestamptz;

-- 3. «Цена упёрлась в минимум» — не чаще раза в сутки на товар.
alter table public.kaspi_shop_tracked_products add column if not exists floor_alert_sent_at timestamptz;

-- 4. Атомарная запись ОДНОГО тумблера: меняется ровно один ключ
--    notification_prefs -> event -> channel, остальное содержимое и другие
--    колонки профиля не трогаются; два быстрых переключения не затирают
--    друг друга. Вызывает только /api/notification-prefs (service role):
--    у anon/authenticated права нет (урок revoke_definer_rpc.sql).
create or replace function public.set_notification_pref(p_user uuid, p_event text, p_channel text, p_value boolean)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles p
     set notification_prefs =
           (case when jsonb_typeof(p.notification_prefs) = 'object' then p.notification_prefs else '{}'::jsonb end)
           || jsonb_build_object(
                p_event,
                (case when jsonb_typeof(p.notification_prefs -> p_event) = 'object' then p.notification_prefs -> p_event else '{}'::jsonb end)
                || jsonb_build_object(p_channel, p_value)
              )
   where p.id = p_user
  returning p.notification_prefs;
$$;

revoke all on function public.set_notification_pref(uuid, text, text, boolean) from public;
revoke all on function public.set_notification_pref(uuid, text, text, boolean) from anon, authenticated;
grant execute on function public.set_notification_pref(uuid, text, text, boolean) to service_role;

-- 5. Telegram-колонки и notification_prefs — только сервер. Раньше обычная сессия могла сама
--    записать себе telegram_chat_id (RLS это позволяет) и тем самым слать
--    уведомления/тестовые сообщения в чужой чат, а сброс
--    telegram_test_sent_at обходил бы ограничение частоты. Привязка идёт
--    только через вебхук бота, отвязка — через /api/telegram-connect/disconnect
--    (оба service role). notification_prefs пишет только
--    set_notification_pref через PATCH /api/notification-prefs (проверка
--    ключей и типов там) — прямая запись из браузера обходила бы её.
--    Функция ниже = текущая версия из базы (проверено 16.10.2026)
--    + четыре новые колонки в конце каждого блока.
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

  RETURN NEW;
END;
$function$;

-- Проверка после применения (только чтение):
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'profiles' and column_name in ('notification_prefs', 'telegram_test_sent_at'))
--        or (table_name = 'kaspi_shop_tracked_products' and column_name = 'floor_alert_sent_at'));
--   select has_function_privilege('authenticated', 'public.set_notification_pref(uuid,text,text,boolean)', 'execute'); -- false
