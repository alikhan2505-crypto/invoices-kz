-- CFO: a fourth account kind — deposit (applied 2026-10-07).
alter table public.cfo_accounts drop constraint cfo_accounts_kind_check;
alter table public.cfo_accounts add constraint cfo_accounts_kind_check check (kind in ('bank','cash','card','deposit'));
