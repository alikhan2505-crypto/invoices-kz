-- 03.11.2026, аудит 02.11 (раздел 4): /api/hooks/new-signup и /api/hooks/welcome-instant
-- на проде отвечали любому без секрета (защищали только неугадываемый uuid, окно
-- в час и разовый claim). Роуты уже умеют проверять заголовок x-internal-secret,
-- когда в окружении Vercel задан HOOKS_PG_NET_SECRET (src/lib/hooksGuard.ts), но
-- SQL-вызовы заголовка не слали. Эта миграция добавляет заголовок в оба вызова.
-- Значение секрета живёт только в Supabase Vault (hooks_pg_net_secret) и в
-- переменной Vercel; в репозитории его нет. Пока переменной в Vercel нет, заголовок
-- ничего не меняет (проверка выключена), поэтому порядок безопасен:
-- 1) эта миграция, 2) HOOKS_PG_NET_SECRET в Vercel + передеплой.
-- Откат: вернуть прежние тела функции и задания (см. комментарии «было»).

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hooks_pg_net_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'hooks_pg_net_secret',
      'x-internal-secret для /api/hooks/new-signup и /api/hooks/welcome-instant'
    );
  end if;
end $$;

-- Триггер регистрации. Было: headers := '{"Content-Type":"application/json"}'::jsonb
create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  -- best-effort: сбой http-очереди не должен ломать регистрацию
  begin
    perform net.http_post(
      url := 'https://invoices.kz/api/hooks/new-signup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'hooks_pg_net_secret' limit 1),
          ''
        )
      ),
      body := jsonb_build_object('user_id', new.id)
    );
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- Задание welcome-instant (раз в 5 минут). Было: headers := '{"Content-Type":"application/json"}'::jsonb
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'welcome-instant'),
  command := $cmd$ select net.http_post(
       url := 'https://invoices.kz/api/hooks/welcome-instant',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-internal-secret', coalesce(
           (select decrypted_secret from vault.decrypted_secrets where name = 'hooks_pg_net_secret' limit 1),
           ''
         )
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $cmd$
);
