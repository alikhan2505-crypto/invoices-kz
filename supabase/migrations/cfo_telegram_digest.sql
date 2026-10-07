-- CFO: opt-in morning digest to the owner's Telegram (applied 2026-10-07).
alter table public.cfo_companies add column telegram_digest boolean not null default false;
