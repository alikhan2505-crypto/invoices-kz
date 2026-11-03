-- 03.11.2026, по итогам аудита 02.11: всё ниже УЖЕ применено на проде через MCP
-- (миграции audit_2026_11_02_wallet_guard_indexes, audit_2026_11_02_invoice_number_unique,
-- audit_2026_11_02_invoice_knp_vat_type). Файл лежит в репозитории, чтобы пересозданная
-- база или ветка Supabase получила то же самое: без колонок knp/vat_type явный select
-- публичной страницы счёта (PUBLIC_INVOICE_COLUMNS) падает.

-- 1. Защищённое списание для трат (проверки цен, ответы ИИ): NULL, если не хватает денег.
-- debit_wallet_balance не меняется: пополнение идёт отрицательной суммой, а комиссия
-- списывается уже после того, как деньги клиента дошли, и вправе увести баланс в минус.
create or replace function public.debit_wallet_balance_guarded(p_user_id uuid, p_amount numeric)
returns numeric
language sql
set search_path to 'public'
as $$
  update profiles
     set kaspi_wallet_balance = kaspi_wallet_balance - p_amount
   where id = p_user_id
     and kaspi_wallet_balance - p_amount >= 0
  returning kaspi_wallet_balance;
$$;
revoke execute on function public.debit_wallet_balance_guarded(uuid, numeric) from public, anon, authenticated;
grant execute on function public.debit_wallet_balance_guarded(uuid, numeric) to service_role;

-- 2. Старая функция кошелька больше не доступна ролям API.
revoke execute on function public.debit_ai_agent_wallet_balance_legacy(uuid, numeric) from public, anon, authenticated;

-- 3. Индексы на счетах.
create index if not exists invoices_user_created_idx on public.invoices (user_id, created_at desc);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_bank_id_idx on public.invoices (bank_id);

-- 4. Номер счёта уникален у пользователя. На проде перед этим два черновика с
-- дублирующимся INV-0003 одного пользователя были переименованы вручную (INV-0003-2, INV-0003-3);
-- на чистой базе дублей нет.
create unique index if not exists invoices_user_number_uniq on public.invoices (user_id, number);

-- 5. КНП и режим НДС хранятся в счёте. NULL у старых счетов: для них КНП 849, НДС по профилю.
alter table public.invoices
  add column if not exists knp text,
  add column if not exists vat_type text;

alter table public.invoices
  drop constraint if exists invoices_knp_format_chk,
  drop constraint if exists invoices_vat_type_chk;
alter table public.invoices
  add constraint invoices_knp_format_chk check (knp is null or knp ~ '^[0-9]{3}$'),
  add constraint invoices_vat_type_chk check (vat_type is null or vat_type in ('no_vat', 'vat_0', 'vat_16'));
