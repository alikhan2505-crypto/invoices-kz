-- 13.10.2026: мгновенный Telegram-пинг основателю о каждой регистрации.
-- pg_net (включён этой миграцией) шлёт user_id на /api/hooks/new-signup сразу
-- после вставки строки profiles; роут идемпотентен (profiles.signup_notified_at,
-- атомарный claim) и не требует секрета: uuid неугадываем, окно 1 час,
-- один пинг на профиль. Сбой http-очереди проглатывается — регистрацию
-- уведомление ломать не должно.
create extension if not exists pg_net with schema extensions;

alter table public.profiles add column if not exists signup_notified_at timestamptz;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url := 'https://invoices.kz/api/hooks/new-signup',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('user_id', new.id)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke execute on function public.notify_new_signup() from public, anon, authenticated;

drop trigger if exists notify_new_signup_trigger on public.profiles;
create trigger notify_new_signup_trigger
  after insert on public.profiles
  for each row execute function public.notify_new_signup();
