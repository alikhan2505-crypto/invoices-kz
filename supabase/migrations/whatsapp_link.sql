-- Привязка WhatsApp к существующему аккаунту из профиля (15.11.2026).
-- Человек в кабинете нажимает «Привязать WhatsApp», отправляет «Привязать <код>» на номер входа, в ответ
-- получает 6-значный код и вводит его в кабинете: номер привязывается к этому аккаунту.
-- Те же коды живут в whatsapp_login_codes, отличает их purpose.
alter table public.whatsapp_login_codes
  add column if not exists purpose text not null default 'login' check (purpose in ('login', 'link')),
  add column if not exists link_user_id uuid references auth.users (id) on delete cascade,
  add column if not exists confirm_hash text,
  add column if not exists confirm_attempts int not null default 0;
