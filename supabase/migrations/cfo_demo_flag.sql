-- CFO: строки «Посмотреть на примере» (applied 2026-10-08). Пример пишется в
-- собственный кабинет владельца и целиком удаляется по этому флагу.
alter table public.cfo_accounts add column is_demo boolean not null default false;
alter table public.cfo_operations add column is_demo boolean not null default false;
alter table public.cfo_recurrences add column is_demo boolean not null default false;
alter table public.cfo_plan_items add column is_demo boolean not null default false;
