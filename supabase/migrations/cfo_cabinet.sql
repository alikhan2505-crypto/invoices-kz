-- supabase/migrations/cfo_cabinet.sql
-- CFO-кабинет, этап 1. Дизайн: docs/superpowers/specs/2026-10-07-cfo-cabinet-phase1-design.md

create table public.cfo_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Моя компания' check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  -- Этап 1: одна компания на пользователя. Этап 2 (несколько компаний) снимает это ограничение.
  constraint cfo_companies_one_per_user unique (user_id),
  constraint cfo_companies_id_user unique (id, user_id)
);

create table public.cfo_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('bank','cash','card')),
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null,
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint cfo_accounts_id_user unique (id, user_id),
  foreign key (company_id, user_id) references public.cfo_companies(id, user_id) on delete cascade
);
create index cfo_accounts_company_idx on public.cfo_accounts (company_id);

create table public.cfo_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('income','expense')),
  activity text not null check (activity in ('operating','investing','financing')),
  pnl_group text check (pnl_group in ('revenue','cogs','opex','finance','tax')),
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint cfo_articles_id_user unique (id, user_id),
  constraint cfo_articles_pnl_kind check (
    pnl_group is null or pnl_group = 'finance'
    or (pnl_group = 'revenue' and kind = 'income')
    or (pnl_group in ('cogs','opex','tax') and kind = 'expense')
  ),
  foreign key (company_id, user_id) references public.cfo_companies(id, user_id) on delete cascade
);
create index cfo_articles_company_idx on public.cfo_articles (company_id);

create table public.cfo_recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  direction text not null check (direction in ('in','out','transfer')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  account_id uuid not null,
  to_account_id uuid,
  article_id uuid,
  counterparty text,
  comment text,
  day_of_month int not null check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  created_at timestamptz not null default now(),
  constraint cfo_recurrences_id_user unique (id, user_id),
  constraint cfo_recurrences_shape check (
    (direction = 'transfer' and to_account_id is not null and article_id is null and to_account_id <> account_id)
    or (direction in ('in','out') and to_account_id is null and article_id is not null)
  ),
  foreign key (company_id, user_id) references public.cfo_companies(id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.cfo_accounts(id, user_id),
  foreign key (to_account_id, user_id) references public.cfo_accounts(id, user_id),
  foreign key (article_id, user_id) references public.cfo_articles(id, user_id)
);
create index cfo_recurrences_company_idx on public.cfo_recurrences (company_id);

create table public.cfo_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  direction text not null check (direction in ('in','out','transfer')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  account_id uuid not null,
  to_account_id uuid,
  article_id uuid,
  counterparty text,
  comment text,
  paid_on date not null,
  accrued_on date not null,
  status text not null check (status in ('actual','planned')),
  recurrence_id uuid,
  recurrence_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfo_operations_shape check (
    (direction = 'transfer' and to_account_id is not null and article_id is null and to_account_id <> account_id)
    or (direction in ('in','out') and to_account_id is null and article_id is not null)
  ),
  -- Только в одну сторону: удаление правила обнуляет recurrence_id (см. FK ниже),
  -- а recurrence_date остаётся как история того, за какой месяц был платёж.
  constraint cfo_operations_recurrence_pair check (recurrence_id is null or recurrence_date is not null),
  constraint cfo_operations_recurrence_once unique (recurrence_id, recurrence_date),
  foreign key (company_id, user_id) references public.cfo_companies(id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.cfo_accounts(id, user_id),
  foreign key (to_account_id, user_id) references public.cfo_accounts(id, user_id),
  foreign key (article_id, user_id) references public.cfo_articles(id, user_id),
  -- Удаление правила не трогает уже оплаченные операции: обнуляется только ссылка
  -- (список колонок в SET NULL — Postgres 15+, иначе обнулился бы и user_id).
  foreign key (recurrence_id, user_id) references public.cfo_recurrences(id, user_id) on delete set null (recurrence_id)
);
create index cfo_operations_company_paid_idx on public.cfo_operations (company_id, paid_on);

create table public.cfo_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  article_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount numeric(14,2) not null check (amount >= 0 and amount <= 999999999999.99),
  constraint cfo_plan_items_cell unique (company_id, article_id, month),
  foreign key (company_id, user_id) references public.cfo_companies(id, user_id) on delete cascade,
  foreign key (article_id, user_id) references public.cfo_articles(id, user_id)
);

alter table public.cfo_companies enable row level security;
alter table public.cfo_accounts enable row level security;
alter table public.cfo_articles enable row level security;
alter table public.cfo_recurrences enable row level security;
alter table public.cfo_operations enable row level security;
alter table public.cfo_plan_items enable row level security;

create policy cfo_companies_owner on public.cfo_companies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cfo_accounts_owner on public.cfo_accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cfo_articles_owner on public.cfo_articles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cfo_recurrences_owner on public.cfo_recurrences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cfo_operations_owner on public.cfo_operations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cfo_plan_items_owner on public.cfo_plan_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Компания + стартовые статьи одной транзакцией. security invoker: вставки идут
-- от имени вызывающего и проходят те же RLS-политики. Повторный и параллельный
-- вызов ничего не дублирует (on conflict по cfo_companies_one_per_user).
create or replace function public.cfo_bootstrap()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select id into cid from cfo_companies where user_id = uid;
  if cid is not null then
    return cid;
  end if;

  insert into cfo_companies (user_id) values (uid)
    on conflict (user_id) do nothing
    returning id into cid;

  if cid is null then
    -- Параллельный вызов успел первым — он же и залил статьи.
    select id into cid from cfo_companies where user_id = uid;
    return cid;
  end if;

  insert into cfo_articles (user_id, company_id, name, kind, activity, pnl_group, sort) values
    (uid, cid, 'Выручка от продажи товаров', 'income', 'operating', 'revenue', 10),
    (uid, cid, 'Выручка от услуг', 'income', 'operating', 'revenue', 20),
    (uid, cid, 'Прочие доходы', 'income', 'operating', 'finance', 30),
    (uid, cid, 'Закупка товаров и материалов', 'expense', 'operating', 'cogs', 40),
    (uid, cid, 'Зарплата', 'expense', 'operating', 'opex', 50),
    (uid, cid, 'Налоги и взносы с зарплаты (ОПВ, СО, ВОСМС, СН, ИПН)', 'expense', 'operating', 'opex', 60),
    (uid, cid, 'Аренда', 'expense', 'operating', 'opex', 70),
    (uid, cid, 'Коммунальные услуги', 'expense', 'operating', 'opex', 80),
    (uid, cid, 'Реклама и маркетинг', 'expense', 'operating', 'opex', 90),
    (uid, cid, 'Связь и интернет', 'expense', 'operating', 'opex', 100),
    (uid, cid, 'Банковские комиссии и эквайринг', 'expense', 'operating', 'opex', 110),
    (uid, cid, 'Транспорт и логистика', 'expense', 'operating', 'opex', 120),
    (uid, cid, 'Программы и подписки', 'expense', 'operating', 'opex', 130),
    (uid, cid, 'Бухгалтерия и юристы', 'expense', 'operating', 'opex', 140),
    (uid, cid, 'Хозяйственные расходы', 'expense', 'operating', 'opex', 150),
    (uid, cid, 'Прочие расходы', 'expense', 'operating', 'opex', 160),
    (uid, cid, 'Налог на доход (ИПН ИП / КПН)', 'expense', 'operating', 'tax', 170),
    (uid, cid, 'НДС к уплате', 'expense', 'operating', 'tax', 180),
    (uid, cid, 'Проценты по кредитам', 'expense', 'financing', 'finance', 190),
    (uid, cid, 'Получение кредита / займа', 'income', 'financing', null, 200),
    (uid, cid, 'Погашение тела кредита', 'expense', 'financing', null, 210),
    (uid, cid, 'Вложения собственника', 'income', 'financing', null, 220),
    (uid, cid, 'Вывод средств собственником', 'expense', 'financing', null, 230),
    (uid, cid, 'Покупка оборудования и ОС', 'expense', 'investing', null, 240),
    (uid, cid, 'Продажа оборудования и ОС', 'income', 'investing', null, 250);

  return cid;
end;
$$;

revoke execute on function public.cfo_bootstrap() from public, anon;
grant execute on function public.cfo_bootstrap() to authenticated;
