# CFO-кабинет, этап 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бесплатное ядро кабинета финдиректора на `cfo.invoices.kz`: счета, статьи, журнал операций с повторами, сетка плана и четыре отчёта (БДР, БДДС, платёжный календарь, дашборд), видимое только админу до ревью founder'а.

**Architecture:** Шесть таблиц `cfo_*` с RLS «только свой `user_id`» и составными внешними ключами `(id, user_id)`, первичная настройка — транзакционная функция БД `cfo_bootstrap()`. Браузер читает весь журнал компании (постранично, лимит PostgREST 1000) и считает отчёты чистыми функциями `src/lib/cfo/*` в тиынах. Раздел `/cfo/*` живёт в общей `ProductShell`, продукт `cfo` в реестре помечен `adminOnly`, поддомен — одна строка в `hostRouting.ts` на лендинг `/lp/cfo`.

**Tech Stack:** Next.js 16 (App Router, client pages), React 19, Supabase (Postgres 17 + RLS, `@supabase/supabase-js`), vitest, recharts, Tailwind + токены `--nav-*`.

**Spec:** `docs/superpowers/specs/2026-10-07-cfo-cabinet-phase1-design.md`

## Global Constraints

- Работа прямо в `main`, без веток и PR (конвенция репозитория). Коммитить только названные в задаче файлы — никогда `git add -A`.
- Это **НЕ тот Next.js, который ты знаешь** (см. `AGENTS.md`): перед незнакомым API читать `node_modules/next/dist/docs/`. Экспорт `dynamic`/`metadata` из файла `'use client'` молча не работает — серверная обёртка нужна там, где они важны.
- Все суммы в доменном коде — **целые тиыны** (`number`), в БД — `numeric(14,2)` в тенге. Конвертация только в `src/lib/cfo/money.ts` и `src/lib/cfo/data.ts`. Максимум суммы: `999 999 999 999,99 ₸` (`MAX_AMOUNT_TIYN = 99_999_999_999_999`).
- Даты — строки `YYYY-MM-DD`, месяцы — `YYYY-MM`. Никаких `Date` в доменной логике, кроме `src/lib/cfo/dates.ts`.
- У каждой строки `cfo_*` есть `user_id`; RLS-политика на таблицу одна, для всех команд: `using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))`. **Никаких `EXISTS`-подзапросов в политиках.**
- Ссылки на компанию, счета, статьи, правила — составные внешние ключи `(x_id, user_id) → (id, user_id)`.
- Чтения из Supabase в браузере идут страницами по 1000 строк (PostgREST обрезает ответ на 1000).
- Кабинет `/cfo/*` — только русский язык. Лендинг `/lp/cfo` — ru/kk/en, как остальные лендинги.
- Дизайн: токены `--nav-*` (светлая и тёмная тема), классы `nav-glass`, кнопки и интерактив не меньше 44px по высоте (`min-h-[44px]`).
- Продукт видит только админ: `adminOnly: true` в `products.ts` и в секции `SiteNav`, лендинг `access: 'invite'`, `src/app/cfo/CfoWorkspace.tsx` отправляет не-админов на `/products`. В `sitemap.ts` поддомен **не** добавлять.
- Проверки: `npx tsc --noEmit` и `npx vitest run` зелёные после каждой задачи; `npm run build` — в финальной задаче.
- Отклонения от спеки (спека уже исправлена): остатки — по всем счетам, включая архивные; первичная настройка — функция БД `cfo_bootstrap()`; фактическая операция не может быть в будущем; дату начала учёта счёта нельзя сдвинуть позже его фактических операций; БДР/БДДС — переключатель «Факт / План / Отклонение».

## File Structure

```
supabase/migrations/cfo_cabinet.sql        — таблицы, RLS, составные FK, cfo_bootstrap()
supabase/migrations/README.md              — запись о миграции
src/lib/cfo/types.ts                       — доменные типы
src/lib/cfo/dates.ts (+ .test.ts)          — арифметика дат/месяцев строками
src/lib/cfo/money.ts (+ .test.ts)          — тиыны, ввод, формат
src/lib/cfo/validate.ts (+ .test.ts)       — проверка операций, правил, статей, даты начала учёта
src/lib/cfo/recurrence.ts (+ .test.ts)     — развёртка повторов на лету
src/lib/cfo/balances.ts (+ .test.ts)       — остатки счетов на дату
src/lib/cfo/calendar.ts (+ .test.ts)       — платёжный календарь, просрочка, кассовый разрыв
src/lib/cfo/pnl.ts (+ .test.ts)            — БДР
src/lib/cfo/cashflow.ts (+ .test.ts)       — БДДС
src/lib/cfo/dashboard.ts (+ .test.ts)      — показатели
src/lib/cfo/labels.ts                      — подписи для UI
src/lib/cfo/data.ts                        — чтение/запись Supabase (браузер)
src/lib/products.ts (+ .test.ts)           — продукт `cfo`
src/lib/hostRouting.ts (+ .test.ts)        — поддомен `cfo.`
src/lib/crossProduct.ts                    — origin `cfo.invoices.kz`
src/lib/landings.ts                        — лендинг `cfo`, inviteNote на лендинг
src/lib/postLoginRedirect.ts               — `/cfo/overview` в белом списке
src/components/SiteNav.tsx                 — секция `cfo`, скрытие adminOnly-секций
src/components/products/ProductLanding.tsx — свой inviteNote лендинга
src/components/products/ProductArt.tsx     — иллюстрация `cfo`
src/app/cfo/layout.tsx                     — ProductShell + CfoWorkspace
src/app/cfo/page.tsx                       — редирект на /cfo/overview
src/app/cfo/CfoWorkspace.tsx               — вход, админ-ворота, bootstrap, загрузка, контекст
src/app/cfo/ui.tsx                         — общие UI-примитивы раздела
src/app/cfo/AccountForm.tsx                — форма счёта (мастер + настройки)
src/app/cfo/FirstAccountWizard.tsx         — первый счёт
src/app/cfo/OperationForm.tsx              — форма операции / повтора
src/app/cfo/ReportTable.tsx                — таблица отчёта (БДР и БДДС)
src/app/cfo/settings/page.tsx              — компания, счета, статьи
src/app/cfo/operations/page.tsx            — журнал и повторы
src/app/cfo/calendar/page.tsx              — платёжный календарь
src/app/cfo/plan/page.tsx                  — сетка плана
src/app/cfo/pnl/page.tsx                   — БДР
src/app/cfo/cashflow/page.tsx              — БДДС
src/app/cfo/overview/page.tsx              — дашборд
```

---

### Task 1: Схема БД, RLS и `cfo_bootstrap()`

**Files:**
- Create: `supabase/migrations/cfo_cabinet.sql`
- Modify: `supabase/migrations/README.md` (добавить раздел в конец)

**Interfaces:**
- Produces: таблицы `cfo_companies`, `cfo_accounts`, `cfo_articles`, `cfo_recurrences`, `cfo_operations`, `cfo_plan_items`; RPC `public.cfo_bootstrap() returns uuid` (id компании текущего пользователя; создаёт компанию и 25 стартовых статей при первом вызове).

- [ ] **Step 1: Написать миграцию**

```sql
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
```

- [ ] **Step 2: Дописать README миграций**

Добавить в конец `supabase/migrations/README.md`:

```markdown
## CFO-кабинет — `cfo_cabinet.sql`

Кабинет финдиректора (`/cfo/*`, `cfo.invoices.kz`). Шесть таблиц `cfo_*`, в
каждой строке `user_id`; RLS — одна политика «только свои строки» на таблицу,
без `EXISTS`-подзапросов (урок аудита 04.09.2026). Ссылки — составные внешние
ключи `(x_id, user_id)`, так что база сама не даёт прицепить свою операцию к
чужому счёту или статье. `cfo_bootstrap()` (security invoker) одной транзакцией
создаёт компанию и 25 стартовых статей. Этап 1 — одна компания на пользователя
(`cfo_companies_one_per_user`), этап 2 снимает ограничение. Дизайн:
`docs/superpowers/specs/2026-10-07-cfo-cabinet-phase1-design.md`.
```

- [ ] **Step 3: Применить миграцию**

Через Supabase MCP `apply_migration` (проект `terjitbqgrjlqezyydql`, имя `cfo_cabinet`, содержимое файла целиком). Ожидается успех без ошибок.

- [ ] **Step 4: Живая проверка RLS, составных FK и идемпотентности**

Взять два реальных `id` пользователей: `select id from auth.users order by created_at limit 2;` — дальше `<A>` и `<B>`. Каждый блок ниже — отдельный вызов `execute_sql`, всё внутри `begin … rollback`, ничего не остаётся в базе.

Блок 1 — bootstrap, идемпотентность, изоляция:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
set local role authenticated;
select public.cfo_bootstrap() is not null as created;
select public.cfo_bootstrap() = (select id from cfo_companies) as idempotent;
select count(*) as a_articles from cfo_articles;
select set_config('request.jwt.claims', '{"sub":"<B>","role":"authenticated"}', true);
select count(*) as b_sees_companies from cfo_companies;
select count(*) as b_sees_articles from cfo_articles;
rollback;
```

Ожидание: `created = true`, `idempotent = true`, `a_articles = 25`, `b_sees_companies = 0`, `b_sees_articles = 0`. (MCP вернёт результат последнего select — при необходимости гонять по одному select на вызов, повторяя преамбулу.)

Блок 2 — чужой счёт в своей операции отклоняется базой:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
set local role authenticated;
select public.cfo_bootstrap();
insert into cfo_accounts (user_id, company_id, name, kind, opening_balance, opening_date)
  select '<A>', id, 'Тест A', 'bank', 1000, current_date from cfo_companies;
select set_config('cfo.test_acc', (select id::text from cfo_accounts limit 1), true);
select set_config('request.jwt.claims', '{"sub":"<B>","role":"authenticated"}', true);
select public.cfo_bootstrap();
insert into cfo_operations (user_id, company_id, direction, amount, account_id, article_id, paid_on, accrued_on, status)
  select '<B>', c.id, 'out', 100, current_setting('cfo.test_acc')::uuid, a.id, current_date, current_date, 'actual'
  from cfo_companies c join cfo_articles a on a.company_id = c.id and a.kind = 'expense' limit 1;
rollback;
```

Ожидание: ошибка `insert or update on table "cfo_operations" violates foreign key constraint` — это и есть успех проверки.

Блок 3 — аноним не видит ничего:

```sql
begin;
set local role anon;
select count(*) from cfo_companies;
rollback;
```

Ожидание: `0` (или ошибка доступа — тоже успех; данных он не получает).

Если любое ожидание не совпало — стоп, задача не завершена.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/cfo_cabinet.sql supabase/migrations/README.md
git commit -m "feat(cfo): schema, owner-only RLS, composite FKs and cfo_bootstrap()"
```

---

### Task 2: Типы, даты, деньги

**Files:**
- Create: `src/lib/cfo/types.ts`, `src/lib/cfo/dates.ts`, `src/lib/cfo/dates.test.ts`, `src/lib/cfo/money.ts`, `src/lib/cfo/money.test.ts`

**Interfaces:**
- Produces: типы `Direction`, `OpStatus`, `ArticleKind`, `Activity`, `PnlGroup`, `AccountKind`, `CfoAccount`, `CfoArticle`, `CfoOperation`, `CfoRecurrence`, `CfoPlanItem`; функции `todayIso(now?)`, `monthKey`, `addDays`, `addMonths`, `daysInMonth`, `firstDay`, `lastDay`, `monthRange`, `yearMonths`, `isIsoDate`; `MAX_AMOUNT_TIYN`, `toTiyn`, `parseAmountInput(raw, opts?)`, `tiynToNumber`, `toDbAmount`, `formatTenge`.

- [ ] **Step 1: Типы**

```ts
// src/lib/cfo/types.ts
// Доменные типы CFO-кабинета. Все суммы — целые тиыны, даты — 'YYYY-MM-DD',
// месяцы — 'YYYY-MM'.

export type Direction = 'in' | 'out' | 'transfer'
export type OpStatus = 'actual' | 'planned'
export type ArticleKind = 'income' | 'expense'
export type Activity = 'operating' | 'investing' | 'financing'
export type PnlGroup = 'revenue' | 'cogs' | 'opex' | 'finance' | 'tax'
export type AccountKind = 'bank' | 'cash' | 'card'

export type CfoAccount = {
  id: string
  name: string
  kind: AccountKind
  openingBalance: number
  openingDate: string
  archived: boolean
  sort: number
}

export type CfoArticle = {
  id: string
  name: string
  kind: ArticleKind
  activity: Activity
  pnlGroup: PnlGroup | null
  archived: boolean
  sort: number
}

export type CfoOperation = {
  id: string
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  counterparty: string | null
  comment: string | null
  paidOn: string
  accruedOn: string
  status: OpStatus
  recurrenceId: string | null
  recurrenceDate: string | null
}

export type CfoRecurrence = {
  id: string
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  counterparty: string | null
  comment: string | null
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
}

export type CfoPlanItem = {
  articleId: string
  month: string
  amount: number
}
```

- [ ] **Step 2: Падающие тесты дат**

```ts
// src/lib/cfo/dates.test.ts
import { describe, it, expect } from 'vitest'
import { addDays, addMonths, daysInMonth, firstDay, lastDay, isIsoDate, monthKey, monthRange, todayIso, yearMonths } from './dates'

describe('dates', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addMonths wraps years both ways', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('daysInMonth handles leap years', () => {
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2026-04')).toBe(30)
  })

  it('first/last day and month key', () => {
    expect(firstDay('2026-02')).toBe('2026-02-01')
    expect(lastDay('2026-02')).toBe('2026-02-28')
    expect(monthKey('2026-02-17')).toBe('2026-02')
  })

  it('monthRange is inclusive and yearMonths has twelve', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(yearMonths(2026)).toHaveLength(12)
    expect(yearMonths(2026)[0]).toBe('2026-01')
  })

  it('isIsoDate rejects impossible dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('26-02-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07')
  })
})
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/dates.test.ts`
Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 4: Реализация дат**

```ts
// src/lib/cfo/dates.ts
// Календарная арифметика на строках 'YYYY-MM-DD' / 'YYYY-MM'. Date используется
// только в UTC внутри функций, поэтому часовой пояс браузера не сдвигает даты.

const pad = (n: number) => String(n).padStart(2, '0')

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function firstDay(month: string): string {
  return `${month}-01`
}

export function lastDay(month: string): string {
  return `${month}-${pad(daysInMonth(month))}`
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

export function yearMonths(year: number): string[] {
  return monthRange(`${year}-01`, `${year}-12`)
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}
```

- [ ] **Step 5: Падающие тесты денег**

```ts
// src/lib/cfo/money.test.ts
import { describe, it, expect } from 'vitest'
import { formatTenge, parseAmountInput, toDbAmount, toTiyn } from './money'

describe('money', () => {
  it('toTiyn converts db numerics without float drift', () => {
    expect(toTiyn('1234.50')).toBe(123450)
    expect(toTiyn(0.29)).toBe(29)
    expect(toTiyn('-150000.00')).toBe(-15000000)
  })

  it('parseAmountInput accepts spaces and a comma', () => {
    expect(parseAmountInput('1 250,5')).toBe(125050)
    expect(parseAmountInput('1 000')).toBe(100000)
    expect(parseAmountInput('99.99')).toBe(9999)
  })

  it('parseAmountInput rejects junk, extra decimals and negatives unless allowed', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('12,345')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-500')).toBeNull()
    expect(parseAmountInput('-500', { allowNegative: true })).toBe(-50000)
  })

  it('formatTenge groups thousands with a comma decimal', () => {
    expect(formatTenge(123456789).replace(/\s/g, ' ')).toBe('1 234 567,89 ₸')
    expect(formatTenge(500000).replace(/\s/g, ' ')).toBe('5 000 ₸')
  })

  it('toDbAmount keeps two decimals', () => {
    expect(toDbAmount(125050)).toBe('1250.50')
    expect(toDbAmount(-15000000)).toBe('-150000.00')
  })
})
```

- [ ] **Step 6: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 7: Реализация денег**

```ts
// src/lib/cfo/money.ts
// Все расчёты кабинета — в целых тиынах, чтобы копейки не накапливали ошибку.
// В БД суммы хранятся numeric(14,2) в тенге; переход только здесь.

export const MAX_AMOUNT_TIYN = 99_999_999_999_999

export function toTiyn(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Math.round(n * 100)
}

// Ввод человека: пробелы (в т.ч. неразрывные) как разделители тысяч,
// запятая или точка как десятичный знак, не больше двух знаков после него.
export function parseAmountInput(raw: string, opts: { allowNegative?: boolean } = {}): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  const re = opts.allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/
  if (!re.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

export function tiynToNumber(t: number): number {
  return t / 100
}

export function toDbAmount(t: number): string {
  return (t / 100).toFixed(2)
}

export function formatTenge(t: number): string {
  const v = (t / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${v} ₸`
}
```

- [ ] **Step 8: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/`
Expected: PASS (оба файла).

- [ ] **Step 9: Commit**

```bash
git add src/lib/cfo/types.ts src/lib/cfo/dates.ts src/lib/cfo/dates.test.ts src/lib/cfo/money.ts src/lib/cfo/money.test.ts
git commit -m "feat(cfo): domain types, string date math and tiyn money helpers"
```

---

### Task 3: Проверка ввода

**Files:**
- Create: `src/lib/cfo/validate.ts`, `src/lib/cfo/validate.test.ts`

**Interfaces:**
- Consumes: типы из `types.ts`, `isIsoDate` из `dates.ts`, `MAX_AMOUNT_TIYN` из `money.ts`.
- Produces:
  - `type OperationDraft = { direction: Direction; amount: number; accountId: string; toAccountId: string | null; articleId: string | null; paidOn: string; accruedOn: string; status: OpStatus }`
  - `type RecurrenceDraft = { direction: Direction; amount: number; accountId: string; toAccountId: string | null; articleId: string | null; dayOfMonth: number; startsOn: string; endsOn: string | null }`
  - `type ValidationContext = { accounts: CfoAccount[]; articles: CfoArticle[]; today: string }`
  - `validateOperation(d: OperationDraft, ctx: ValidationContext): string | null`
  - `validateRecurrence(r: RecurrenceDraft, ctx: ValidationContext): string | null`
  - `validateArticle(a: { name: string; kind: ArticleKind; pnlGroup: PnlGroup | null }): string | null`
  - `openingDateConflict(accountId: string, openingDate: string, operations: CfoOperation[]): string | null`

- [ ] **Step 1: Падающие тесты**

```ts
// src/lib/cfo/validate.test.ts
import { describe, it, expect } from 'vitest'
import { openingDateConflict, validateArticle, validateOperation, validateRecurrence, type OperationDraft, type ValidationContext } from './validate'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 1 }
const card: CfoAccount = { id: 'card', name: 'Карта', kind: 'card', openingBalance: 0, openingDate: '2026-03-01', archived: false, sort: 2 }
const revenue: CfoArticle = { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 }
const rent: CfoArticle = { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 2 }
const ctx: ValidationContext = { accounts: [kaspi, card], articles: [revenue, rent], today: '2026-06-15' }

const base: OperationDraft = { direction: 'out', amount: 1000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', paidOn: '2026-06-01', accruedOn: '2026-06-01', status: 'actual' }

describe('validateOperation', () => {
  it('accepts a normal expense', () => {
    expect(validateOperation(base, ctx)).toBeNull()
  })

  it('requires a positive amount', () => {
    expect(validateOperation({ ...base, amount: 0 }, ctx)).toBe('Укажите сумму больше нуля')
  })

  it('matches the article kind to the direction', () => {
    expect(validateOperation({ ...base, direction: 'in' }, ctx)).toBe('Для прихода нужна статья дохода')
    expect(validateOperation({ ...base, articleId: 'rev' }, ctx)).toBe('Для расхода нужна статья расхода')
  })

  it('requires an article for income and expense', () => {
    expect(validateOperation({ ...base, articleId: null }, ctx)).toBe('Выберите статью')
  })

  it('transfer has two different accounts and no article', () => {
    const transfer: OperationDraft = { ...base, direction: 'transfer', articleId: null, toAccountId: 'card', paidOn: '2026-04-01', accruedOn: '2026-04-01' }
    expect(validateOperation(transfer, ctx)).toBeNull()
    expect(validateOperation({ ...transfer, articleId: 'rent' }, ctx)).toBe('У перевода между счетами нет статьи')
    expect(validateOperation({ ...transfer, toAccountId: null }, ctx)).toBe('Выберите счёт, на который переводите')
    expect(validateOperation({ ...transfer, toAccountId: 'kaspi' }, ctx)).toBe('Счета перевода должны быть разными')
  })

  it('actual operations cannot predate the account', () => {
    expect(validateOperation({ ...base, paidOn: '2025-12-31', accruedOn: '2025-12-31' }, ctx)).toContain('начала учёта')
    const transfer: OperationDraft = { ...base, direction: 'transfer', articleId: null, toAccountId: 'card', paidOn: '2026-02-01', accruedOn: '2026-02-01' }
    expect(validateOperation(transfer, ctx)).toContain('«Карта»')
  })

  it('planned operations may predate the account', () => {
    expect(validateOperation({ ...base, status: 'planned', paidOn: '2025-12-31', accruedOn: '2025-12-31' }, ctx)).toBeNull()
  })

  it('actual operations cannot be in the future', () => {
    expect(validateOperation({ ...base, paidOn: '2026-06-16', accruedOn: '2026-06-16' }, ctx)).toBe('Будущая дата — отметьте операцию как плановую')
    expect(validateOperation({ ...base, status: 'planned', paidOn: '2026-06-16', accruedOn: '2026-06-16' }, ctx)).toBeNull()
  })
})

describe('validateRecurrence', () => {
  const rule = { direction: 'out' as const, amount: 1000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', dayOfMonth: 5, startsOn: '2026-07-05', endsOn: null }

  it('accepts a monthly rule', () => {
    expect(validateRecurrence(rule, ctx)).toBeNull()
  })

  it('rejects a bad day and an end before the start', () => {
    expect(validateRecurrence({ ...rule, dayOfMonth: 0 }, ctx)).toBe('День месяца — от 1 до 31')
    expect(validateRecurrence({ ...rule, endsOn: '2026-07-01' }, ctx)).toBe('Дата окончания должна быть не раньше даты начала')
  })
})

describe('validateArticle', () => {
  it('ties groups to kinds', () => {
    expect(validateArticle({ name: 'Выручка', kind: 'expense', pnlGroup: 'revenue' })).toBe('Выручка бывает только у статьи дохода')
    expect(validateArticle({ name: 'Аренда', kind: 'income', pnlGroup: 'opex' })).toBe('Себестоимость, операционные расходы и налоги — только у статьи расхода')
    expect(validateArticle({ name: 'Проценты', kind: 'expense', pnlGroup: 'finance' })).toBeNull()
    expect(validateArticle({ name: 'Кредит', kind: 'income', pnlGroup: null })).toBeNull()
    expect(validateArticle({ name: '  ', kind: 'income', pnlGroup: null })).toBe('Укажите название статьи')
  })
})

describe('openingDateConflict', () => {
  const ops: CfoOperation[] = [
    { id: 'o1', direction: 'out', amount: 1, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-02-10', accruedOn: '2026-02-10', status: 'actual', recurrenceId: null, recurrenceDate: null },
    { id: 'o2', direction: 'out', amount: 1, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-01-05', accruedOn: '2026-01-05', status: 'planned', recurrenceId: null, recurrenceDate: null },
  ]

  it('flags actual operations earlier than the new date', () => {
    expect(openingDateConflict('kaspi', '2026-03-01', ops)).toBe('По счёту есть операции раньше этой даты (2026-02-10)')
    expect(openingDateConflict('kaspi', '2026-02-01', ops)).toBeNull()
    expect(openingDateConflict('card', '2026-03-01', ops)).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/validate.test.ts`
Expected: FAIL — `Failed to resolve import "./validate"`.

- [ ] **Step 3: Реализация**

```ts
// src/lib/cfo/validate.ts
import type { ArticleKind, CfoAccount, CfoArticle, CfoOperation, Direction, OpStatus, PnlGroup } from './types'
import { isIsoDate } from './dates'
import { MAX_AMOUNT_TIYN } from './money'

export type OperationDraft = {
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  paidOn: string
  accruedOn: string
  status: OpStatus
}

export type RecurrenceDraft = {
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
}

export type ValidationContext = { accounts: CfoAccount[]; articles: CfoArticle[]; today: string }

const beforeStart = (a: CfoAccount) => `Дата раньше начала учёта по счёту «${a.name}» (${a.openingDate})`

export function validateOperation(d: OperationDraft, ctx: ValidationContext): string | null {
  if (!Number.isInteger(d.amount) || d.amount <= 0) return 'Укажите сумму больше нуля'
  if (d.amount > MAX_AMOUNT_TIYN) return 'Слишком большая сумма'
  if (!isIsoDate(d.paidOn)) return 'Укажите дату оплаты'
  if (!isIsoDate(d.accruedOn)) return 'Укажите дату начисления'
  if (d.status === 'actual' && d.paidOn > ctx.today) return 'Будущая дата — отметьте операцию как плановую'

  const account = ctx.accounts.find((a) => a.id === d.accountId)
  if (!account) return 'Выберите счёт'

  if (d.direction === 'transfer') {
    if (d.articleId) return 'У перевода между счетами нет статьи'
    const to = ctx.accounts.find((a) => a.id === d.toAccountId)
    if (!to) return 'Выберите счёт, на который переводите'
    if (to.id === account.id) return 'Счета перевода должны быть разными'
    if (d.status === 'actual' && d.paidOn < account.openingDate) return beforeStart(account)
    if (d.status === 'actual' && d.paidOn < to.openingDate) return beforeStart(to)
    return null
  }

  if (d.toAccountId) return 'Счёт получателя бывает только у перевода'
  const article = ctx.articles.find((a) => a.id === d.articleId)
  if (!article) return 'Выберите статью'
  if (d.direction === 'in' && article.kind !== 'income') return 'Для прихода нужна статья дохода'
  if (d.direction === 'out' && article.kind !== 'expense') return 'Для расхода нужна статья расхода'
  if (d.status === 'actual' && d.paidOn < account.openingDate) return beforeStart(account)
  return null
}

export function validateRecurrence(r: RecurrenceDraft, ctx: ValidationContext): string | null {
  if (!Number.isInteger(r.dayOfMonth) || r.dayOfMonth < 1 || r.dayOfMonth > 31) return 'День месяца — от 1 до 31'
  if (r.endsOn !== null && (!isIsoDate(r.endsOn) || r.endsOn < r.startsOn)) return 'Дата окончания должна быть не раньше даты начала'
  return validateOperation({ ...r, paidOn: r.startsOn, accruedOn: r.startsOn, status: 'planned' }, ctx)
}

export function validateArticle(a: { name: string; kind: ArticleKind; pnlGroup: PnlGroup | null }): string | null {
  if (!a.name.trim()) return 'Укажите название статьи'
  if (a.pnlGroup === 'revenue' && a.kind !== 'income') return 'Выручка бывает только у статьи дохода'
  if ((a.pnlGroup === 'cogs' || a.pnlGroup === 'opex' || a.pnlGroup === 'tax') && a.kind !== 'expense') {
    return 'Себестоимость, операционные расходы и налоги — только у статьи расхода'
  }
  return null
}

// Сдвинуть начало учёта позже уже проведённых операций нельзя: они молча
// выпали бы из остатков.
export function openingDateConflict(accountId: string, openingDate: string, operations: CfoOperation[]): string | null {
  const earlier = operations
    .filter((o) => o.status === 'actual' && o.paidOn < openingDate && (o.accountId === accountId || o.toAccountId === accountId))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn))[0]
  return earlier ? `По счёту есть операции раньше этой даты (${earlier.paidOn})` : null
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cfo/validate.ts src/lib/cfo/validate.test.ts
git commit -m "feat(cfo): operation, recurrence, article and opening-date validation"
```

---

### Task 4: Повторы и остатки

**Files:**
- Create: `src/lib/cfo/recurrence.ts`, `src/lib/cfo/recurrence.test.ts`, `src/lib/cfo/balances.ts`, `src/lib/cfo/balances.test.ts`

**Interfaces:**
- Produces:
  - `occurrenceDate(month: string, dayOfMonth: number): string`
  - `expandRecurrences(recurrences: CfoRecurrence[], operations: CfoOperation[], from: string, to: string): CfoOperation[]` — виртуальные плановые операции с `id = 'rec:<ruleId>:<date>'`
  - `isVirtual(op: CfoOperation): boolean`
  - `accountDelta(op, accountId): number`, `totalDelta(op): number`, `accountBalanceAt(account, operations, date): number`, `totalBalanceAt(accounts, operations, date): number`

- [ ] **Step 1: Падающие тесты повторов**

```ts
// src/lib/cfo/recurrence.test.ts
import { describe, it, expect } from 'vitest'
import { expandRecurrences, isVirtual, occurrenceDate } from './recurrence'
import type { CfoOperation, CfoRecurrence } from './types'

const rent: CfoRecurrence = { id: 'r1', direction: 'out', amount: 30_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: 'ТОО Арендодатель', comment: null, dayOfMonth: 31, startsOn: '2026-01-15', endsOn: '2026-05-31' }

const paid = (date: string): CfoOperation => ({ id: `p-${date}`, direction: 'out', amount: 30_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: date, accruedOn: date, status: 'actual', recurrenceId: 'r1', recurrenceDate: date })

describe('occurrenceDate', () => {
  it('clamps to the last day of short months', () => {
    expect(occurrenceDate('2026-02', 31)).toBe('2026-02-28')
    expect(occurrenceDate('2028-02', 31)).toBe('2028-02-29')
    expect(occurrenceDate('2026-04', 15)).toBe('2026-04-15')
  })
})

describe('expandRecurrences', () => {
  it('produces one occurrence per month between start and end', () => {
    const dates = expandRecurrences([rent], [], '2026-01-01', '2026-12-31').map((o) => o.paidOn)
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('respects the requested window', () => {
    const dates = expandRecurrences([rent], [], '2026-02-01', '2026-03-31').map((o) => o.paidOn)
    expect(dates).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('skips an occurrence that was already paid', () => {
    const dates = expandRecurrences([rent], [paid('2026-02-28')], '2026-01-01', '2026-12-31').map((o) => o.paidOn)
    expect(dates).not.toContain('2026-02-28')
    expect(dates).toHaveLength(4)
  })

  it('builds virtual planned operations', () => {
    const [op] = expandRecurrences([rent], [], '2026-03-01', '2026-03-31')
    expect(op.id).toBe('rec:r1:2026-03-31')
    expect(op.status).toBe('planned')
    expect(op.recurrenceId).toBe('r1')
    expect(op.recurrenceDate).toBe('2026-03-31')
    expect(op.counterparty).toBe('ТОО Арендодатель')
    expect(isVirtual(op)).toBe(true)
  })

  it('an open-ended rule runs to the end of the window', () => {
    const open: CfoRecurrence = { ...rent, id: 'r2', dayOfMonth: 1, startsOn: '2026-01-01', endsOn: null }
    expect(expandRecurrences([open], [], '2026-01-01', '2026-03-31')).toHaveLength(3)
  })

  it('a mid-month start skips that month if the day already passed', () => {
    const late: CfoRecurrence = { ...rent, id: 'r3', dayOfMonth: 10, startsOn: '2026-01-15', endsOn: null }
    expect(expandRecurrences([late], [], '2026-01-01', '2026-02-28').map((o) => o.paidOn)).toEqual(['2026-02-10'])
  })
})
```

- [ ] **Step 2: Падающие тесты остатков**

```ts
// src/lib/cfo/balances.test.ts
import { describe, it, expect } from 'vitest'
import { accountBalanceAt, totalBalanceAt, totalDelta } from './balances'
import type { CfoAccount, CfoOperation } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 100_000_000, openingDate: '2026-01-01', archived: false, sort: 1 }
const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 5_000_000, openingDate: '2026-01-01', archived: false, sort: 2 }
const card: CfoAccount = { id: 'card', name: 'Карта', kind: 'card', openingBalance: 0, openingDate: '2026-03-01', archived: false, sort: 3 }

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, paidOn: '2026-01-01', accruedOn: '2026-01-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const ops: CfoOperation[] = [
  op({ id: 'o1', direction: 'in', amount: 20_000_000, paidOn: '2026-01-10' }),
  op({ id: 'o2', direction: 'out', amount: 5_000_000, paidOn: '2026-01-20' }),
  op({ id: 'o3', direction: 'transfer', amount: 3_000_000, toAccountId: 'cash', articleId: null, paidOn: '2026-01-25' }),
  op({ id: 'o4', direction: 'out', amount: 1_000_000, paidOn: '2026-01-28', status: 'planned' }),
]

describe('balances', () => {
  it('applies income, expense and transfers to the right accounts', () => {
    expect(accountBalanceAt(kaspi, ops, '2026-01-31')).toBe(112_000_000)
    expect(accountBalanceAt(cash, ops, '2026-01-31')).toBe(8_000_000)
  })

  it('ignores planned operations and dates after the cut-off', () => {
    expect(accountBalanceAt(kaspi, ops, '2026-01-15')).toBe(120_000_000)
  })

  it('an account before its opening date holds nothing', () => {
    expect(accountBalanceAt(card, ops, '2026-02-01')).toBe(0)
  })

  it('a transfer does not change the total', () => {
    expect(totalBalanceAt([kaspi, cash, card], ops, '2026-01-31')).toBe(120_000_000)
    expect(totalBalanceAt([kaspi, cash, card], ops, '2026-01-15')).toBe(125_000_000)
    expect(totalDelta(ops[2])).toBe(0)
    expect(totalDelta(ops[0])).toBe(20_000_000)
    expect(totalDelta(ops[1])).toBe(-5_000_000)
  })

  it('archived accounts still count', () => {
    expect(totalBalanceAt([kaspi, { ...cash, archived: true }], ops, '2026-01-31')).toBe(120_000_000)
  })
})
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/recurrence.test.ts src/lib/cfo/balances.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 4: Реализация повторов**

```ts
// src/lib/cfo/recurrence.ts
// Правило повтора хранится одной строкой; вхождения разворачиваются на лету.
// Оплаченное вхождение — это реальная операция с recurrenceId + recurrenceDate,
// поэтому его больше не показываем как плановое.
import type { CfoOperation, CfoRecurrence } from './types'
import { daysInMonth, monthKey, monthRange } from './dates'

export function occurrenceDate(month: string, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

export function expandRecurrences(recurrences: CfoRecurrence[], operations: CfoOperation[], from: string, to: string): CfoOperation[] {
  if (from > to) return []
  const taken = new Set(
    operations.filter((o) => o.recurrenceId && o.recurrenceDate).map((o) => `${o.recurrenceId}|${o.recurrenceDate}`),
  )
  const out: CfoOperation[] = []
  for (const r of recurrences) {
    for (const month of monthRange(monthKey(from), monthKey(to))) {
      const date = occurrenceDate(month, r.dayOfMonth)
      if (date < from || date > to || date < r.startsOn) continue
      if (r.endsOn && date > r.endsOn) continue
      if (taken.has(`${r.id}|${date}`)) continue
      out.push({
        id: `rec:${r.id}:${date}`,
        direction: r.direction,
        amount: r.amount,
        accountId: r.accountId,
        toAccountId: r.toAccountId,
        articleId: r.articleId,
        counterparty: r.counterparty,
        comment: r.comment,
        paidOn: date,
        accruedOn: date,
        status: 'planned',
        recurrenceId: r.id,
        recurrenceDate: date,
      })
    }
  }
  return out.sort((a, b) => a.paidOn.localeCompare(b.paidOn))
}

export function isVirtual(op: CfoOperation): boolean {
  return op.id.startsWith('rec:')
}
```

- [ ] **Step 5: Реализация остатков**

```ts
// src/lib/cfo/balances.ts
import type { CfoAccount, CfoOperation } from './types'

export function accountDelta(op: CfoOperation, accountId: string): number {
  if (op.direction === 'in') return op.accountId === accountId ? op.amount : 0
  if (op.direction === 'out') return op.accountId === accountId ? -op.amount : 0
  let d = 0
  if (op.accountId === accountId) d -= op.amount
  if (op.toAccountId === accountId) d += op.amount
  return d
}

// Влияние на сумму всех своих счетов: перевод только перекладывает деньги.
export function totalDelta(op: CfoOperation): number {
  if (op.direction === 'in') return op.amount
  if (op.direction === 'out') return -op.amount
  return 0
}

// Остаток счёта на конец дня `date` по фактическим операциям.
export function accountBalanceAt(account: CfoAccount, operations: CfoOperation[], date: string): number {
  if (date < account.openingDate) return 0
  let sum = account.openingBalance
  for (const op of operations) {
    if (op.status !== 'actual' || op.paidOn > date || op.paidOn < account.openingDate) continue
    sum += accountDelta(op, account.id)
  }
  return sum
}

// По всем счетам, включая архивные: архив только прячет счёт из выбора, его деньги
// реальны, а без них не сходилось бы «остаток на начало + поток = остаток на конец».
export function totalBalanceAt(accounts: CfoAccount[], operations: CfoOperation[], date: string): number {
  return accounts.reduce((s, a) => s + accountBalanceAt(a, operations, date), 0)
}
```

- [ ] **Step 6: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cfo/recurrence.ts src/lib/cfo/recurrence.test.ts src/lib/cfo/balances.ts src/lib/cfo/balances.test.ts
git commit -m "feat(cfo): on-the-fly recurrence expansion and account balances"
```

---

### Task 5: Платёжный календарь

**Files:**
- Create: `src/lib/cfo/calendar.ts`, `src/lib/cfo/calendar.test.ts`

**Interfaces:**
- Consumes: `addDays`, `totalBalanceAt`, `totalDelta`, `expandRecurrences`.
- Produces:
  - `CALENDAR_HORIZON_DAYS = 90`
  - `type CalendarDay = { date: string; items: CfoOperation[]; inflow: number; outflow: number; balance: number; gap: boolean }`
  - `type Calendar = { days: CalendarDay[]; overdue: CfoOperation[]; firstGap: string | null }`
  - `buildCalendar(input: { accounts: CfoAccount[]; operations: CfoOperation[]; recurrences: CfoRecurrence[]; today: string; from: string; to: string }): Calendar`

- [ ] **Step 1: Падающие тесты**

```ts
// src/lib/cfo/calendar.test.ts
import { describe, it, expect } from 'vitest'
import { buildCalendar } from './calendar'
import type { CfoAccount, CfoOperation, CfoRecurrence } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 10_000_000, openingDate: '2026-01-01', archived: false, sort: 1 }
const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, paidOn: '2026-01-01', accruedOn: '2026-01-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations: CfoOperation[] = [
  op({ id: 'actual', amount: 2_000_000, paidOn: '2026-02-05' }),
  op({ id: 'overdue', amount: 5_000_000, paidOn: '2026-02-03', status: 'planned' }),
  op({ id: 'income', direction: 'in', amount: 3_000_000, paidOn: '2026-02-15', status: 'planned' }),
  op({ id: 'big', amount: 6_000_000, paidOn: '2026-02-20', status: 'planned' }),
]
const recurrences: CfoRecurrence[] = [
  { id: 'r1', direction: 'out', amount: 1_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, dayOfMonth: 25, startsOn: '2026-01-01', endsOn: null },
]

const cal = buildCalendar({ accounts: [kaspi], operations, recurrences, today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
const day = (d: string) => cal.days.find((x) => x.date === d)!

describe('buildCalendar', () => {
  it('lists overdue planned payments and missed recurrences', () => {
    expect(cal.overdue.map((o) => o.paidOn)).toEqual(['2026-01-25', '2026-02-03'])
  })

  it('past days show only what actually happened', () => {
    expect(day('2026-02-05').balance).toBe(8_000_000)
    expect(day('2026-02-03').items).toHaveLength(0)
  })

  it('today carries the overdue payments still expected', () => {
    expect(day('2026-02-10').balance).toBe(2_000_000)
  })

  it('projects planned income and expenses forward', () => {
    expect(day('2026-02-15').balance).toBe(5_000_000)
    expect(day('2026-02-15').inflow).toBe(3_000_000)
    expect(day('2026-02-20').balance).toBe(-1_000_000)
    expect(day('2026-02-25').balance).toBe(-2_000_000)
  })

  it('marks the first cash gap', () => {
    expect(day('2026-02-20').gap).toBe(true)
    expect(day('2026-02-15').gap).toBe(false)
    expect(cal.firstGap).toBe('2026-02-20')
  })

  it('no gap when there is enough money', () => {
    const rich = buildCalendar({ accounts: [{ ...kaspi, openingBalance: 100_000_000 }], operations, recurrences, today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
    expect(rich.firstGap).toBeNull()
  })

  it('covers every day of the window', () => {
    expect(cal.days).toHaveLength(28)
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/calendar.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// src/lib/cfo/calendar.ts
// Факт до сегодня + плановые операции и повторы вперёд, прогноз суммарного
// остатка на конец каждого дня. Просроченное (план в прошлом, не оплачено)
// всё ещё ожидается, поэтому ложится на сегодня.
import type { CfoAccount, CfoOperation, CfoRecurrence } from './types'
import { addDays } from './dates'
import { totalBalanceAt, totalDelta } from './balances'
import { expandRecurrences } from './recurrence'

export const CALENDAR_HORIZON_DAYS = 90
const OVERDUE_LOOKBACK_DAYS = 90

export type CalendarDay = { date: string; items: CfoOperation[]; inflow: number; outflow: number; balance: number; gap: boolean }
export type Calendar = { days: CalendarDay[]; overdue: CfoOperation[]; firstGap: string | null }

export function buildCalendar(input: {
  accounts: CfoAccount[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  today: string
  from: string
  to: string
}): Calendar {
  const { accounts, operations, recurrences, today, from, to } = input
  const actual = operations.filter((o) => o.status === 'actual')
  const planned = operations.filter((o) => o.status === 'planned')

  const overdue = [
    ...planned.filter((o) => o.paidOn < today),
    ...expandRecurrences(recurrences, operations, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, -1)),
  ].sort((a, b) => a.paidOn.localeCompare(b.paidOn))
  const overdueNet = overdue.reduce((s, o) => s + totalDelta(o), 0)

  const upcoming = [
    ...planned.filter((o) => o.paidOn >= today && o.paidOn <= to),
    ...expandRecurrences(recurrences, operations, today, to),
  ]

  const days: CalendarDay[] = []
  let firstGap: string | null = null
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = [
      ...actual.filter((o) => o.paidOn === d),
      ...(d >= today ? upcoming.filter((o) => o.paidOn === d) : []),
    ]
    let balance = totalBalanceAt(accounts, actual, d)
    if (d >= today) {
      balance += overdueNet + upcoming.filter((o) => o.paidOn <= d).reduce((s, o) => s + totalDelta(o), 0)
    }
    const inflow = items.filter((o) => o.direction === 'in').reduce((s, o) => s + o.amount, 0)
    const outflow = items.filter((o) => o.direction === 'out').reduce((s, o) => s + o.amount, 0)
    const gap = d >= today && balance < 0
    if (gap && !firstGap) firstGap = d
    days.push({ date: d, items, inflow, outflow, balance, gap })
  }
  return { days, overdue, firstGap }
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cfo/calendar.ts src/lib/cfo/calendar.test.ts
git commit -m "feat(cfo): payment calendar with overdue items and cash-gap detection"
```

---

### Task 6: БДР

**Files:**
- Create: `src/lib/cfo/pnl.ts`, `src/lib/cfo/pnl.test.ts`

**Interfaces:**
- Produces:
  - `type Cell = { plan: number; fact: number }`
  - `type PnlRow = { key: string; label: string; type: 'group' | 'article' | 'total'; group: PnlGroup | null; cells: Record<string, Cell>; total: Cell }`
  - `PNL_GROUP_ORDER: PnlGroup[]`
  - `buildPnl(input: { articles: CfoArticle[]; operations: CfoOperation[]; plan: CfoPlanItem[]; months: string[] }): PnlRow[]`
  - Ключи строк: группы `g:<group>`, статьи `a:<articleId>`, итоги `t:gross`, `t:operating`, `t:net`.
  - Знаки: группы revenue/cogs/opex/tax и их статьи — положительные величины; группа finance и её статьи — со знаком (доход +, расход −); итоги — со знаком.

- [ ] **Step 1: Падающие тесты**

```ts
// src/lib/cfo/pnl.test.ts
import { describe, it, expect } from 'vitest'
import { buildPnl } from './pnl'
import type { CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const art = (id: string, kind: CfoArticle['kind'], pnlGroup: CfoArticle['pnlGroup'], sort: number, archived = false): CfoArticle =>
  ({ id, name: id, kind, activity: 'operating', pnlGroup, archived, sort })

const articles = [
  art('rev', 'income', 'revenue', 1),
  art('cogs', 'expense', 'cogs', 2),
  art('rent', 'expense', 'opex', 3),
  art('oldOpex', 'expense', 'opex', 4, true),
  art('otherInc', 'income', 'finance', 5),
  art('interest', 'expense', 'finance', 6),
  art('tax', 'expense', 'tax', 7),
  art('loanIn', 'income', null, 8),
  art('loanBody', 'expense', null, 9),
]

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'k', toAccountId: null, articleId: null, counterparty: null, comment: null, paidOn: '2026-01-15', accruedOn: '2026-01-15', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations = [
  op({ direction: 'in', articleId: 'rev', amount: t(1_000_000), accruedOn: '2026-01-15', paidOn: '2026-02-05' }),
  op({ articleId: 'cogs', amount: t(400_000) }),
  op({ articleId: 'rent', amount: t(200_000) }),
  op({ articleId: 'interest', amount: t(50_000) }),
  op({ direction: 'in', articleId: 'otherInc', amount: t(10_000) }),
  op({ articleId: 'tax', amount: t(30_000) }),
  op({ direction: 'in', articleId: 'loanIn', amount: t(5_000_000) }),
  op({ articleId: 'loanBody', amount: t(1_000_000) }),
  op({ direction: 'transfer', articleId: null, toAccountId: 'c', amount: t(70_000) }),
  op({ articleId: 'rent', amount: t(200_000), accruedOn: '2026-02-15', paidOn: '2026-02-15', status: 'planned' }),
]
const plan: CfoPlanItem[] = [
  { articleId: 'rev', month: '2026-01', amount: t(1_200_000) },
  { articleId: 'rent', month: '2026-01', amount: t(200_000) },
]

const rows = buildPnl({ articles, operations, plan, months: ['2026-01', '2026-02'] })
const row = (key: string) => rows.find((r) => r.key === key)!

describe('buildPnl', () => {
  it('orders groups and totals', () => {
    expect(rows.filter((r) => r.type !== 'article').map((r) => r.key)).toEqual(
      ['g:revenue', 'g:cogs', 't:gross', 'g:opex', 't:operating', 'g:finance', 'g:tax', 't:net'],
    )
  })

  it('books revenue by accrual month, not payment month', () => {
    expect(row('a:rev').cells['2026-01'].fact).toBe(t(1_000_000))
    expect(row('a:rev').cells['2026-02'].fact).toBe(0)
  })

  it('computes the profit cascade', () => {
    expect(row('t:gross').cells['2026-01'].fact).toBe(t(600_000))
    expect(row('t:operating').cells['2026-01'].fact).toBe(t(400_000))
    expect(row('g:finance').cells['2026-01'].fact).toBe(t(-40_000))
    expect(row('t:net').cells['2026-01'].fact).toBe(t(330_000))
  })

  it('finance expenses carry a minus sign', () => {
    expect(row('a:interest').cells['2026-01'].fact).toBe(t(-50_000))
  })

  it('leaves loan body, owner money and transfers out of the P&L', () => {
    expect(rows.some((r) => r.key === 'a:loanIn' || r.key === 'a:loanBody')).toBe(false)
  })

  it('ignores planned operations as fact and hides empty archived articles', () => {
    expect(row('a:rent').cells['2026-02'].fact).toBe(0)
    expect(rows.some((r) => r.key === 'a:oldOpex')).toBe(false)
  })

  it('carries the plan grid alongside the fact', () => {
    expect(row('g:revenue').cells['2026-01'].plan).toBe(t(1_200_000))
    expect(row('t:net').cells['2026-01'].plan).toBe(t(1_000_000))
    expect(row('t:net').total.fact).toBe(t(330_000))
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/pnl.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// src/lib/cfo/pnl.ts
// БДР: фактические приходы/расходы по месяцу начисления, только статьи с pnlGroup,
// против сетки плана. Каскад: выручка − себестоимость = валовая − опер. расходы =
// операционная ± прочие − налоги = чистая прибыль.
import type { CfoArticle, CfoOperation, CfoPlanItem, PnlGroup } from './types'
import { monthKey } from './dates'

export type Cell = { plan: number; fact: number }
export type PnlRow = {
  key: string
  label: string
  type: 'group' | 'article' | 'total'
  group: PnlGroup | null
  cells: Record<string, Cell>
  total: Cell
}

export const PNL_GROUP_ORDER: PnlGroup[] = ['revenue', 'cogs', 'opex', 'finance', 'tax']

const GROUP_LABEL: Record<PnlGroup, string> = {
  revenue: 'Выручка',
  cogs: 'Себестоимость',
  opex: 'Операционные расходы',
  finance: 'Прочие доходы и расходы',
  tax: 'Налоги',
}

function emptyCells(months: string[]): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const m of months) out[m] = { plan: 0, fact: 0 }
  return out
}

function sumTotal(cells: Record<string, Cell>): Cell {
  return Object.values(cells).reduce((s, c) => ({ plan: s.plan + c.plan, fact: s.fact + c.fact }), { plan: 0, fact: 0 })
}

function combine(months: string[], parts: { cells: Record<string, Cell>; sign: 1 | -1 }[]): Record<string, Cell> {
  const out = emptyCells(months)
  for (const m of months) {
    for (const p of parts) {
      out[m].plan += p.sign * p.cells[m].plan
      out[m].fact += p.sign * p.cells[m].fact
    }
  }
  return out
}

// В группе «прочие» расход идёт с минусом, чтобы группа сальдировала доходы и
// расходы; остальные группы — величины, итоги вычитают их сами.
function signed(article: CfoArticle, amount: number): number {
  return article.pnlGroup === 'finance' && article.kind === 'expense' ? -amount : amount
}

const bySort = (a: CfoArticle, b: CfoArticle) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

export function buildPnl(input: { articles: CfoArticle[]; operations: CfoOperation[]; plan: CfoPlanItem[]; months: string[] }): PnlRow[] {
  const { articles, operations, plan, months } = input
  const monthSet = new Set(months)
  const pnlArticles = articles.filter((a) => a.pnlGroup !== null)
  const byId = new Map(pnlArticles.map((a) => [a.id, a]))
  const cells = new Map(pnlArticles.map((a) => [a.id, emptyCells(months)]))

  for (const op of operations) {
    if (op.status !== 'actual' || op.direction === 'transfer' || !op.articleId) continue
    const a = byId.get(op.articleId)
    const m = monthKey(op.accruedOn)
    if (!a || !monthSet.has(m)) continue
    cells.get(a.id)![m].fact += signed(a, op.amount)
  }
  for (const p of plan) {
    const a = byId.get(p.articleId)
    if (!a || !monthSet.has(p.month)) continue
    cells.get(a.id)![p.month].plan += signed(a, p.amount)
  }

  const hasData = (id: string) => Object.values(cells.get(id)!).some((c) => c.plan !== 0 || c.fact !== 0)
  const groupCells = {} as Record<PnlGroup, Record<string, Cell>>
  const rows: PnlRow[] = []
  const pushTotal = (key: string, label: string, c: Record<string, Cell>) =>
    rows.push({ key: `t:${key}`, label, type: 'total', group: null, cells: c, total: sumTotal(c) })

  for (const g of PNL_GROUP_ORDER) {
    const members = pnlArticles.filter((a) => a.pnlGroup === g && (!a.archived || hasData(a.id))).sort(bySort)
    groupCells[g] = combine(months, members.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    rows.push({ key: `g:${g}`, label: GROUP_LABEL[g], type: 'group', group: g, cells: groupCells[g], total: sumTotal(groupCells[g]) })
    for (const a of members) {
      rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', group: g, cells: cells.get(a.id)!, total: sumTotal(cells.get(a.id)!) })
    }
    if (g === 'cogs') {
      pushTotal('gross', 'Валовая прибыль', combine(months, [{ cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }]))
    }
    if (g === 'opex') {
      pushTotal('operating', 'Операционная прибыль', combine(months, [
        { cells: groupCells.revenue, sign: 1 }, { cells: groupCells.cogs, sign: -1 }, { cells: groupCells.opex, sign: -1 },
      ]))
    }
  }
  pushTotal('net', 'Чистая прибыль', combine(months, [
    { cells: groupCells.revenue, sign: 1 },
    { cells: groupCells.cogs, sign: -1 },
    { cells: groupCells.opex, sign: -1 },
    { cells: groupCells.finance, sign: 1 },
    { cells: groupCells.tax, sign: -1 },
  ]))
  return rows
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/pnl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cfo/pnl.ts src/lib/cfo/pnl.test.ts
git commit -m "feat(cfo): P&L budget (БДР) with accrual-based plan vs fact"
```

---

### Task 7: БДДС

**Files:**
- Create: `src/lib/cfo/cashflow.ts`, `src/lib/cfo/cashflow.test.ts`

**Interfaces:**
- Consumes: `addDays`, `firstDay`, `lastDay`, `monthKey`, `totalBalanceAt`.
- Produces:
  - `type FlowCell = { plan: number | null; fact: number }`
  - `type CashflowRow = { key: string; label: string; type: 'balance' | 'activity' | 'section' | 'article' | 'total'; activity: Activity | null; cells: Record<string, FlowCell>; total: FlowCell }`
  - `ACTIVITY_ORDER: Activity[]`
  - `buildCashflow(input: { accounts: CfoAccount[]; articles: CfoArticle[]; operations: CfoOperation[]; plan: CfoPlanItem[]; months: string[] }): CashflowRow[]`
  - Ключи: `b:opening`, `act:<activity>`, `s:<activity>:in`, `s:<activity>:out`, `a:<articleId>`, `t:netflow`, `b:closing`. У строк остатков `plan = null`. Статьи и секции — положительные величины; строки видов деятельности и `t:netflow` — со знаком.

- [ ] **Step 1: Падающие тесты**

```ts
// src/lib/cfo/cashflow.test.ts
import { describe, it, expect } from 'vitest'
import { buildCashflow } from './cashflow'
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: t(1_000_000), openingDate: '2025-12-01', archived: false, sort: 1 }
const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2025-12-01', archived: false, sort: 2 }

const art = (id: string, kind: CfoArticle['kind'], activity: CfoArticle['activity'], sort: number): CfoArticle =>
  ({ id, name: id, kind, activity, pnlGroup: null, archived: false, sort })
const articles = [
  art('rev', 'income', 'operating', 1),
  art('rent', 'expense', 'operating', 2),
  art('equipment', 'expense', 'investing', 3),
  art('loanIn', 'income', 'financing', 4),
  art('loanBody', 'expense', 'financing', 5),
]

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: null, counterparty: null, comment: null, paidOn: '2026-01-10', accruedOn: '2026-01-10', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations = [
  op({ direction: 'in', articleId: 'rev', amount: t(300_000), paidOn: '2026-01-10', accruedOn: '2025-12-20' }),
  op({ articleId: 'rent', amount: t(100_000), paidOn: '2026-01-12' }),
  op({ articleId: 'equipment', amount: t(500_000), paidOn: '2026-01-20' }),
  op({ direction: 'transfer', toAccountId: 'cash', amount: t(50_000), paidOn: '2026-01-22' }),
  op({ direction: 'in', articleId: 'loanIn', amount: t(1_000_000), paidOn: '2026-02-01' }),
  op({ articleId: 'loanBody', amount: t(200_000), paidOn: '2026-02-15' }),
]
const plan: CfoPlanItem[] = [{ articleId: 'rev', month: '2026-01', amount: t(400_000) }]

const rows = buildCashflow({ accounts: [kaspi, cash], articles, operations, plan, months: ['2026-01', '2026-02'] })
const row = (key: string) => rows.find((r) => r.key === key)!

describe('buildCashflow', () => {
  it('books cash by payment date', () => {
    expect(row('a:rev').cells['2026-01'].fact).toBe(t(300_000))
  })

  it('nets each activity', () => {
    expect(row('act:operating').cells['2026-01'].fact).toBe(t(200_000))
    expect(row('act:investing').cells['2026-01'].fact).toBe(t(-500_000))
    expect(row('act:financing').cells['2026-02'].fact).toBe(t(800_000))
    expect(row('t:netflow').cells['2026-01'].fact).toBe(t(-300_000))
  })

  it('opening plus flow equals closing', () => {
    expect(row('b:opening').cells['2026-01'].fact).toBe(t(1_000_000))
    expect(row('b:closing').cells['2026-01'].fact).toBe(t(700_000))
    expect(row('b:opening').cells['2026-02'].fact).toBe(t(700_000))
    expect(row('b:closing').cells['2026-02'].fact).toBe(t(1_500_000))
    for (const m of ['2026-01', '2026-02']) {
      expect(row('b:opening').cells[m].fact + row('t:netflow').cells[m].fact).toBe(row('b:closing').cells[m].fact)
    }
  })

  it('carries the plan, with no plan for balances', () => {
    expect(row('act:operating').cells['2026-01'].plan).toBe(t(400_000))
    expect(row('b:opening').cells['2026-01'].plan).toBeNull()
  })

  it('orders the report', () => {
    expect(rows[0].key).toBe('b:opening')
    expect(rows[rows.length - 1].key).toBe('b:closing')
    expect(rows.filter((r) => r.type === 'activity').map((r) => r.key)).toEqual(['act:operating', 'act:investing', 'act:financing'])
  })

  it('year totals: opening of the first month, closing of the last', () => {
    expect(row('b:opening').total.fact).toBe(t(1_000_000))
    expect(row('b:closing').total.fact).toBe(t(1_500_000))
    expect(row('t:netflow').total.fact).toBe(t(500_000))
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/cashflow.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// src/lib/cfo/cashflow.ts
// БДДС: фактические поступления и выплаты по месяцу оплаты, по видам
// деятельности, с остатками на начало и конец месяца (по всем счетам).
import type { Activity, CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'
import { addDays, firstDay, lastDay, monthKey } from './dates'
import { totalBalanceAt } from './balances'

export type FlowCell = { plan: number | null; fact: number }
export type CashflowRow = {
  key: string
  label: string
  type: 'balance' | 'activity' | 'section' | 'article' | 'total'
  activity: Activity | null
  cells: Record<string, FlowCell>
  total: FlowCell
}

export const ACTIVITY_ORDER: Activity[] = ['operating', 'investing', 'financing']

const ACTIVITY_LABEL: Record<Activity, string> = {
  operating: 'Операционная деятельность',
  investing: 'Инвестиционная деятельность',
  financing: 'Финансовая деятельность',
}

type Grid = Record<string, { plan: number; fact: number }>

function zero(months: string[]): Grid {
  const out: Grid = {}
  for (const m of months) out[m] = { plan: 0, fact: 0 }
  return out
}

function combine(months: string[], parts: { cells: Grid; sign: 1 | -1 }[]): Grid {
  const out = zero(months)
  for (const m of months) {
    for (const p of parts) {
      out[m].plan += p.sign * p.cells[m].plan
      out[m].fact += p.sign * p.cells[m].fact
    }
  }
  return out
}

function total(cells: Grid): FlowCell {
  return Object.values(cells).reduce<FlowCell>((s, c) => ({ plan: (s.plan ?? 0) + c.plan, fact: s.fact + c.fact }), { plan: 0, fact: 0 })
}

const bySort = (a: CfoArticle, b: CfoArticle) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

export function buildCashflow(input: {
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  plan: CfoPlanItem[]
  months: string[]
}): CashflowRow[] {
  const { accounts, articles, operations, plan, months } = input
  const actual = operations.filter((o) => o.status === 'actual')
  const monthSet = new Set(months)
  const cells = new Map(articles.map((a) => [a.id, zero(months)]))

  for (const op of actual) {
    if (op.direction === 'transfer' || !op.articleId) continue
    const m = monthKey(op.paidOn)
    const c = cells.get(op.articleId)
    if (!c || !monthSet.has(m)) continue
    c[m].fact += op.amount
  }
  for (const p of plan) {
    const c = cells.get(p.articleId)
    if (!c || !monthSet.has(p.month)) continue
    c[p.month].plan += p.amount
  }

  const hasData = (id: string) => months.some((m) => cells.get(id)![m].fact !== 0 || cells.get(id)![m].plan !== 0)
  const visible = articles.filter((a) => !a.archived || hasData(a.id)).sort(bySort)

  const opening: Record<string, FlowCell> = {}
  const closing: Record<string, FlowCell> = {}
  for (const m of months) {
    opening[m] = { plan: null, fact: totalBalanceAt(accounts, actual, addDays(firstDay(m), -1)) }
    closing[m] = { plan: null, fact: totalBalanceAt(accounts, actual, lastDay(m)) }
  }

  const rows: CashflowRow[] = [{
    key: 'b:opening', label: 'Остаток на начало', type: 'balance', activity: null, cells: opening,
    total: { plan: null, fact: opening[months[0]].fact },
  }]

  const nets: Grid[] = []
  for (const act of ACTIVITY_ORDER) {
    const ins = visible.filter((a) => a.activity === act && a.kind === 'income')
    const outs = visible.filter((a) => a.activity === act && a.kind === 'expense')
    if (ins.length === 0 && outs.length === 0) continue
    const inCells = combine(months, ins.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    const outCells = combine(months, outs.map((a) => ({ cells: cells.get(a.id)!, sign: 1 as const })))
    const net = combine(months, [{ cells: inCells, sign: 1 }, { cells: outCells, sign: -1 }])
    nets.push(net)
    rows.push({ key: `act:${act}`, label: ACTIVITY_LABEL[act], type: 'activity', activity: act, cells: net, total: total(net) })
    if (ins.length > 0) {
      rows.push({ key: `s:${act}:in`, label: 'Поступления', type: 'section', activity: act, cells: inCells, total: total(inCells) })
      for (const a of ins) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
    }
    if (outs.length > 0) {
      rows.push({ key: `s:${act}:out`, label: 'Выплаты', type: 'section', activity: act, cells: outCells, total: total(outCells) })
      for (const a of outs) rows.push({ key: `a:${a.id}`, label: a.name, type: 'article', activity: act, cells: cells.get(a.id)!, total: total(cells.get(a.id)!) })
    }
  }

  const netflow = combine(months, nets.map((n) => ({ cells: n, sign: 1 as const })))
  rows.push({ key: 't:netflow', label: 'Чистый денежный поток', type: 'total', activity: null, cells: netflow, total: total(netflow) })
  rows.push({
    key: 'b:closing', label: 'Остаток на конец', type: 'balance', activity: null, cells: closing,
    total: { plan: null, fact: closing[months[months.length - 1]].fact },
  })
  return rows
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/cashflow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cfo/cashflow.ts src/lib/cfo/cashflow.test.ts
git commit -m "feat(cfo): cash flow budget (БДДС) by activity with opening and closing balances"
```

---

### Task 8: Дашборд и подписи

**Files:**
- Create: `src/lib/cfo/dashboard.ts`, `src/lib/cfo/dashboard.test.ts`, `src/lib/cfo/labels.ts`

**Interfaces:**
- Consumes: `buildPnl`, `Cell`, `buildCalendar`, `CALENDAR_HORIZON_DAYS`, `totalBalanceAt`, даты.
- Produces:
  - `RUNWAY_WINDOW_DAYS = 90`, `UPCOMING_DAYS = 7`
  - `type Breakeven = { kind: 'ok'; value: number } | { kind: 'no-revenue' } | { kind: 'unreachable' }`
  - `type Dashboard = { month: string; revenue: Cell; grossMarginPct: number | null; netProfit: Cell; cashNow: number; runwayDays: number | null; breakeven: Breakeven; monthly: { month: string; income: number; expense: number }[]; expenseStructure: { articleId: string; name: string; amount: number }[]; upcoming: CfoOperation[]; firstGap: string | null }`
  - `buildDashboard(input: { accounts; articles; operations; recurrences; plan; month: string; today: string }): Dashboard`
  - `labels.ts`: `ACCOUNT_KIND_LABEL`, `ACTIVITY_LABEL`, `PNL_GROUP_LABEL`, `DIRECTION_LABEL`, `ARTICLE_KIND_LABEL`, `shortMonth(month)`, `monthTitle(month)`, `dayLabel(date)`, `opTitle(op, accounts, articles)`, `accountName(id, accounts)`.

- [ ] **Step 1: Падающие тесты**

```ts
// src/lib/cfo/dashboard.test.ts
import { describe, it, expect } from 'vitest'
import { buildDashboard } from './dashboard'
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: t(1_000_000), openingDate: '2026-01-01', archived: false, sort: 1 }
const articles: CfoArticle[] = [
  { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 },
  { id: 'cogs', name: 'Закупка', kind: 'expense', activity: 'operating', pnlGroup: 'cogs', archived: false, sort: 2 },
  { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 3 },
]
const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: Math.random().toString(36).slice(2), direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-03-01', accruedOn: '2026-03-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })
const at = (date: string, p: Partial<CfoOperation>) => op({ paidOn: date, accruedOn: date, ...p })

const operations: CfoOperation[] = [
  at('2026-01-20', { articleId: 'rent', amount: t(200_000) }),
  at('2026-02-20', { articleId: 'rent', amount: t(200_000) }),
  at('2026-03-05', { direction: 'in', articleId: 'rev', amount: t(1_000_000) }),
  at('2026-03-06', { articleId: 'cogs', amount: t(600_000) }),
  at('2026-03-07', { articleId: 'rent', amount: t(200_000) }),
  at('2026-03-20', { articleId: 'rent', amount: t(50_000), status: 'planned' }),
  at('2026-03-25', { articleId: 'rent', amount: t(60_000), status: 'planned' }),
]
const plan: CfoPlanItem[] = [{ articleId: 'rev', month: '2026-03', amount: t(1_200_000) }]
const input = { accounts: [kaspi], articles, operations, recurrences: [], plan, month: '2026-03', today: '2026-03-15' }

describe('buildDashboard', () => {
  const d = buildDashboard(input)

  it('revenue, margin and net profit for the month', () => {
    expect(d.revenue).toEqual({ plan: t(1_200_000), fact: t(1_000_000) })
    expect(d.grossMarginPct).toBe(40)
    expect(d.netProfit.fact).toBe(t(200_000))
  })

  it('cash now and runway without new income', () => {
    expect(d.cashNow).toBe(t(800_000))
    expect(d.runwayDays).toBe(60)
  })

  it('break-even revenue', () => {
    expect(d.breakeven).toEqual({ kind: 'ok', value: t(500_000) })
  })

  it('break-even edge cases', () => {
    expect(buildDashboard({ ...input, month: '2026-02' }).breakeven).toEqual({ kind: 'no-revenue' })
    const costly = [...operations, at('2026-03-08', { articleId: 'cogs', amount: t(500_000) })]
    expect(buildDashboard({ ...input, operations: costly }).breakeven).toEqual({ kind: 'unreachable' })
  })

  it('no runway figure without any outflows', () => {
    expect(buildDashboard({ ...input, operations: [at('2026-03-05', { direction: 'in', articleId: 'rev', amount: t(1) })] }).runwayDays).toBeNull()
  })

  it('twelve months of income and expense', () => {
    expect(d.monthly).toHaveLength(12)
    expect(d.monthly[11]).toEqual({ month: '2026-03', income: t(1_000_000), expense: t(800_000) })
  })

  it('expense structure, biggest first', () => {
    expect(d.expenseStructure.map((x) => x.articleId)).toEqual(['cogs', 'rent'])
  })

  it('upcoming payments are the next seven days only', () => {
    expect(d.upcoming.map((o) => o.paidOn)).toEqual(['2026-03-20'])
  })

  it('reports the first cash gap in the horizon', () => {
    const gap = [...operations, at('2026-04-10', { articleId: 'rent', amount: t(5_000_000), status: 'planned' })]
    expect(buildDashboard({ ...input, operations: gap }).firstGap).toBe('2026-04-10')
    expect(d.firstGap).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/cfo/dashboard.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация дашборда**

```ts
// src/lib/cfo/dashboard.ts
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem, CfoRecurrence } from './types'
import { addDays, addMonths, monthKey, monthRange } from './dates'
import { totalBalanceAt } from './balances'
import { buildPnl, type Cell } from './pnl'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from './calendar'

export const RUNWAY_WINDOW_DAYS = 90
export const UPCOMING_DAYS = 7

export type Breakeven = { kind: 'ok'; value: number } | { kind: 'no-revenue' } | { kind: 'unreachable' }

export type Dashboard = {
  month: string
  revenue: Cell
  grossMarginPct: number | null
  netProfit: Cell
  cashNow: number
  runwayDays: number | null
  breakeven: Breakeven
  monthly: { month: string; income: number; expense: number }[]
  expenseStructure: { articleId: string; name: string; amount: number }[]
  upcoming: CfoOperation[]
  firstGap: string | null
}

export function buildDashboard(input: {
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  plan: CfoPlanItem[]
  month: string
  today: string
}): Dashboard {
  const { accounts, articles, operations, recurrences, plan, month, today } = input

  const pnl = buildPnl({ articles, operations, plan, months: [month] })
  const rowTotal = (key: string): Cell => pnl.find((r) => r.key === key)?.total ?? { plan: 0, fact: 0 }
  const revenue = rowTotal('g:revenue')
  const cogs = rowTotal('g:cogs')
  const opex = rowTotal('g:opex')
  const netProfit = rowTotal('t:net')

  const grossMarginPct = revenue.fact > 0 ? ((revenue.fact - cogs.fact) / revenue.fact) * 100 : null
  // Упрощение v1: все операционные расходы считаются постоянными.
  let breakeven: Breakeven
  if (revenue.fact <= 0) {
    breakeven = { kind: 'no-revenue' }
  } else {
    const ratio = (revenue.fact - cogs.fact) / revenue.fact
    breakeven = ratio <= 0 ? { kind: 'unreachable' } : { kind: 'ok', value: Math.round(opex.fact / ratio) }
  }

  const actual = operations.filter((o) => o.status === 'actual')
  const cashNow = totalBalanceAt(accounts, actual, today)
  const windowStart = addDays(today, -(RUNWAY_WINDOW_DAYS - 1))
  const outflow = actual
    .filter((o) => o.direction === 'out' && o.paidOn >= windowStart && o.paidOn <= today)
    .reduce((s, o) => s + o.amount, 0)
  // Целочисленно, чтобы деление на «средний день» не давало 59,999…
  const runwayDays = outflow === 0 ? null : cashNow <= 0 ? 0 : Math.floor((cashNow * RUNWAY_WINDOW_DAYS) / outflow)

  const pnlArticles = new Map(articles.filter((a) => a.pnlGroup !== null).map((a) => [a.id, a]))
  const months = monthRange(addMonths(month, -11), month)
  const index = new Map(months.map((m, i) => [m, i]))
  const monthly = months.map((m) => ({ month: m, income: 0, expense: 0 }))
  const structure = new Map<string, number>()
  for (const op of actual) {
    if (op.direction === 'transfer' || !op.articleId || !pnlArticles.has(op.articleId)) continue
    const m = monthKey(op.accruedOn)
    const i = index.get(m)
    if (i !== undefined) {
      if (op.direction === 'in') monthly[i].income += op.amount
      else monthly[i].expense += op.amount
    }
    if (m === month && op.direction === 'out') structure.set(op.articleId, (structure.get(op.articleId) ?? 0) + op.amount)
  }
  const expenseStructure = [...structure]
    .map(([articleId, amount]) => ({ articleId, name: pnlArticles.get(articleId)!.name, amount }))
    .sort((a, b) => b.amount - a.amount)

  const calendar = buildCalendar({ accounts, operations, recurrences, today, from: today, to: addDays(today, CALENDAR_HORIZON_DAYS - 1) })
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1)
  const upcoming = calendar.days
    .filter((d) => d.date <= upcomingEnd)
    .flatMap((d) => d.items.filter((o) => o.status === 'planned'))

  return { month, revenue, grossMarginPct, netProfit, cashNow, runwayDays, breakeven, monthly, expenseStructure, upcoming, firstGap: calendar.firstGap }
}
```

- [ ] **Step 4: Подписи**

```ts
// src/lib/cfo/labels.ts
import type { AccountKind, Activity, ArticleKind, CfoAccount, CfoArticle, CfoOperation, Direction, PnlGroup } from './types'

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = { bank: 'Банковский счёт', card: 'Карта', cash: 'Наличные' }
export const ARTICLE_KIND_LABEL: Record<ArticleKind, string> = { income: 'Доход', expense: 'Расход' }
export const ACTIVITY_LABEL: Record<Activity, string> = { operating: 'Операционная', investing: 'Инвестиционная', financing: 'Финансовая' }
export const PNL_GROUP_LABEL: Record<PnlGroup, string> = {
  revenue: 'Выручка',
  cogs: 'Себестоимость',
  opex: 'Операционные расходы',
  finance: 'Прочие доходы и расходы',
  tax: 'Налоги',
}
export const DIRECTION_LABEL: Record<Direction, string> = { in: 'Приход', out: 'Расход', transfer: 'Перевод' }

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTH_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function shortMonth(month: string): string {
  return MONTH_SHORT[Number(month.slice(5, 7)) - 1]
}

export function monthTitle(month: string): string {
  return `${MONTH_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
}

export function accountName(id: string | null, accounts: CfoAccount[]): string {
  return accounts.find((a) => a.id === id)?.name ?? '—'
}

export function opTitle(op: Pick<CfoOperation, 'direction' | 'accountId' | 'toAccountId' | 'articleId'>, accounts: CfoAccount[], articles: CfoArticle[]): string {
  if (op.direction === 'transfer') return `Перевод: ${accountName(op.accountId, accounts)} → ${accountName(op.toAccountId, accounts)}`
  return articles.find((a) => a.id === op.articleId)?.name ?? 'Без статьи'
}
```

- [ ] **Step 5: Тесты зелёные**

Run: `npx vitest run src/lib/cfo/`
Expected: PASS (все файлы папки).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cfo/dashboard.ts src/lib/cfo/dashboard.test.ts src/lib/cfo/labels.ts
git commit -m "feat(cfo): dashboard KPIs (margin, runway, break-even, cash gap) and UI labels"
```

---

### Task 9: Слой данных Supabase

**Files:**
- Create: `src/lib/cfo/data.ts`

**Interfaces:**
- Consumes: `supabase` из `@/lib/supabase`; `toTiyn`, `toDbAmount`; `OperationDraft`, `RecurrenceDraft`.
- Produces:
  - `type Workspace = { userId: string; companyId: string; companyName: string; accounts: CfoAccount[]; articles: CfoArticle[]; operations: CfoOperation[]; recurrences: CfoRecurrence[]; plan: CfoPlanItem[] }`
  - `bootstrapWorkspace(): Promise<string>`, `loadWorkspace(companyId, userId): Promise<Workspace>`
  - `saveCompanyName(ws, name)`, `saveAccount(ws, a)`, `saveArticle(ws, a)`, `setArchived(table, id, archived)`, `reorder(table, orderedIds, current)`
  - `saveOperation(ws, op)`, `deleteOperation(id)`, `markPaid(ws, op, today)`
  - `saveRecurrence(ws, r)`, `deleteRecurrence(id)`
  - `setPlanCells(ws, cells)`
  - Все функции бросают `Error(message)` при ошибке Supabase.

Тонкая обёртка над Supabase — юнит-тестами не покрывается (проверяется в финальной живой проверке). Проверка задачи — typecheck.

- [ ] **Step 1: Реализация**

```ts
// src/lib/cfo/data.ts
// Чтение и запись CFO-кабинета из браузера. Доступ ограничен RLS «только свои
// строки»; суммы в БД — numeric(14,2) в тенге, здесь переводятся в тиыны.
import { supabase } from '@/lib/supabase'
import { toDbAmount, toTiyn } from './money'
import type { AccountKind, Activity, ArticleKind, CfoAccount, CfoArticle, CfoOperation, CfoPlanItem, CfoRecurrence, Direction, OpStatus, PnlGroup } from './types'
import type { OperationDraft, RecurrenceDraft } from './validate'

export type Workspace = {
  userId: string
  companyId: string
  companyName: string
  accounts: CfoAccount[]
  articles: CfoArticle[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  plan: CfoPlanItem[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const PAGE_SIZE = 1000

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// PostgREST отдаёт не больше 1000 строк за раз — длинный журнал читаем страницами.
async function selectAll(table: string, columns: string, companyId: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('company_id', companyId)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    check(error)
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru')

const mapAccount = (r: Row): CfoAccount => ({
  id: r.id, name: r.name, kind: r.kind as AccountKind, openingBalance: toTiyn(r.opening_balance),
  openingDate: r.opening_date, archived: r.archived, sort: r.sort,
})
const mapArticle = (r: Row): CfoArticle => ({
  id: r.id, name: r.name, kind: r.kind as ArticleKind, activity: r.activity as Activity,
  pnlGroup: (r.pnl_group ?? null) as PnlGroup | null, archived: r.archived, sort: r.sort,
})
const mapOperation = (r: Row): CfoOperation => ({
  id: r.id, direction: r.direction as Direction, amount: toTiyn(r.amount), accountId: r.account_id,
  toAccountId: r.to_account_id ?? null, articleId: r.article_id ?? null, counterparty: r.counterparty ?? null,
  comment: r.comment ?? null, paidOn: r.paid_on, accruedOn: r.accrued_on, status: r.status as OpStatus,
  recurrenceId: r.recurrence_id ?? null, recurrenceDate: r.recurrence_date ?? null,
})
const mapRecurrence = (r: Row): CfoRecurrence => ({
  id: r.id, direction: r.direction as Direction, amount: toTiyn(r.amount), accountId: r.account_id,
  toAccountId: r.to_account_id ?? null, articleId: r.article_id ?? null, counterparty: r.counterparty ?? null,
  comment: r.comment ?? null, dayOfMonth: r.day_of_month, startsOn: r.starts_on, endsOn: r.ends_on ?? null,
})
const mapPlan = (r: Row): CfoPlanItem => ({ articleId: r.article_id, month: String(r.month).slice(0, 7), amount: toTiyn(r.amount) })

export async function bootstrapWorkspace(): Promise<string> {
  const { data, error } = await supabase.rpc('cfo_bootstrap')
  check(error)
  return data as string
}

export async function loadWorkspace(companyId: string, userId: string): Promise<Workspace> {
  const [company, accounts, articles, operations, recurrences, plan] = await Promise.all([
    supabase.from('cfo_companies').select('name').eq('id', companyId).single(),
    selectAll('cfo_accounts', 'id, name, kind, opening_balance, opening_date, archived, sort', companyId),
    selectAll('cfo_articles', 'id, name, kind, activity, pnl_group, archived, sort', companyId),
    selectAll('cfo_operations', 'id, direction, amount, account_id, to_account_id, article_id, counterparty, comment, paid_on, accrued_on, status, recurrence_id, recurrence_date', companyId),
    selectAll('cfo_recurrences', 'id, direction, amount, account_id, to_account_id, article_id, counterparty, comment, day_of_month, starts_on, ends_on', companyId),
    selectAll('cfo_plan_items', 'id, article_id, month, amount', companyId),
  ])
  check(company.error)
  return {
    userId,
    companyId,
    companyName: (company.data as Row).name,
    accounts: accounts.map(mapAccount).sort(bySort),
    articles: articles.map(mapArticle).sort(bySort),
    operations: operations.map(mapOperation).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    recurrences: recurrences.map(mapRecurrence),
    plan: plan.map(mapPlan),
  }
}

const owned = (ws: Workspace) => ({ user_id: ws.userId, company_id: ws.companyId })

export async function saveCompanyName(ws: Workspace, name: string): Promise<void> {
  const { error } = await supabase.from('cfo_companies').update({ name }).eq('id', ws.companyId)
  check(error)
}

export async function saveAccount(ws: Workspace, a: { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }): Promise<void> {
  const row = { name: a.name, kind: a.kind, opening_balance: toDbAmount(a.openingBalance), opening_date: a.openingDate }
  if (a.id) {
    const { error } = await supabase.from('cfo_accounts').update(row).eq('id', a.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...ws.accounts.map((x) => x.sort)) + 10
  const { error } = await supabase.from('cfo_accounts').insert({ ...row, ...owned(ws), sort })
  check(error)
}

export async function saveArticle(ws: Workspace, a: { id?: string; name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null }): Promise<void> {
  const row = { name: a.name, kind: a.kind, activity: a.activity, pnl_group: a.pnlGroup }
  if (a.id) {
    const { error } = await supabase.from('cfo_articles').update(row).eq('id', a.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...ws.articles.map((x) => x.sort)) + 10
  const { error } = await supabase.from('cfo_articles').insert({ ...row, ...owned(ws), sort })
  check(error)
}

export async function setArchived(table: 'cfo_accounts' | 'cfo_articles', id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from(table).update({ archived }).eq('id', id)
  check(error)
}

// Переписывает sort только у тех, чья позиция изменилась (10, 20, 30…).
export async function reorder(table: 'cfo_accounts' | 'cfo_articles', orderedIds: string[], current: { id: string; sort: number }[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const want = (i + 1) * 10
    const cur = current.find((c) => c.id === orderedIds[i])
    if (!cur || cur.sort === want) continue
    const { error } = await supabase.from(table).update({ sort: want }).eq('id', orderedIds[i])
    check(error)
  }
}

export async function saveOperation(ws: Workspace, op: OperationDraft & { id?: string; counterparty: string | null; comment: string | null }): Promise<void> {
  const row = {
    direction: op.direction,
    amount: toDbAmount(op.amount),
    account_id: op.accountId,
    to_account_id: op.direction === 'transfer' ? op.toAccountId : null,
    article_id: op.direction === 'transfer' ? null : op.articleId,
    counterparty: op.counterparty,
    comment: op.comment,
    paid_on: op.paidOn,
    accrued_on: op.accruedOn,
    status: op.status,
  }
  if (op.id) {
    const { error } = await supabase.from('cfo_operations').update({ ...row, updated_at: new Date().toISOString() }).eq('id', op.id)
    check(error)
    return
  }
  const { error } = await supabase.from('cfo_operations').insert({ ...row, ...owned(ws) })
  check(error)
}

export async function deleteOperation(id: string): Promise<void> {
  const { error } = await supabase.from('cfo_operations').delete().eq('id', id)
  check(error)
}

// «Оплачено сегодня». Вхождение повтора становится отдельной фактической
// операцией со ссылкой на правило; разовая плановая — просто переходит в факт.
export async function markPaid(ws: Workspace, op: CfoOperation, today: string): Promise<void> {
  if (op.id.startsWith('rec:')) {
    const { error } = await supabase.from('cfo_operations').insert({
      ...owned(ws),
      direction: op.direction,
      amount: toDbAmount(op.amount),
      account_id: op.accountId,
      to_account_id: op.toAccountId,
      article_id: op.articleId,
      counterparty: op.counterparty,
      comment: op.comment,
      paid_on: today,
      accrued_on: op.accruedOn,
      status: 'actual',
      recurrence_id: op.recurrenceId,
      recurrence_date: op.recurrenceDate,
    })
    check(error)
    return
  }
  const { error } = await supabase
    .from('cfo_operations')
    .update({ status: 'actual', paid_on: today, updated_at: new Date().toISOString() })
    .eq('id', op.id)
  check(error)
}

export async function saveRecurrence(ws: Workspace, r: RecurrenceDraft & { counterparty: string | null; comment: string | null }): Promise<void> {
  const { error } = await supabase.from('cfo_recurrences').insert({
    ...owned(ws),
    direction: r.direction,
    amount: toDbAmount(r.amount),
    account_id: r.accountId,
    to_account_id: r.direction === 'transfer' ? r.toAccountId : null,
    article_id: r.direction === 'transfer' ? null : r.articleId,
    counterparty: r.counterparty,
    comment: r.comment,
    day_of_month: r.dayOfMonth,
    starts_on: r.startsOn,
    ends_on: r.endsOn,
  })
  check(error)
}

export async function deleteRecurrence(id: string): Promise<void> {
  const { error } = await supabase.from('cfo_recurrences').delete().eq('id', id)
  check(error)
}

// Ячейка с нулём удаляется, остальные — upsert по (company_id, article_id, month).
export async function setPlanCells(ws: Workspace, cells: { articleId: string; month: string; amount: number }[]): Promise<void> {
  const upserts = cells
    .filter((c) => c.amount > 0)
    .map((c) => ({ ...owned(ws), article_id: c.articleId, month: `${c.month}-01`, amount: toDbAmount(c.amount) }))
  if (upserts.length > 0) {
    const { error } = await supabase.from('cfo_plan_items').upsert(upserts, { onConflict: 'company_id,article_id,month' })
    check(error)
  }
  for (const c of cells.filter((x) => x.amount <= 0)) {
    const { error } = await supabase
      .from('cfo_plan_items')
      .delete()
      .eq('company_id', ws.companyId)
      .eq('article_id', c.articleId)
      .eq('month', `${c.month}-01`)
    check(error)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cfo/data.ts
git commit -m "feat(cfo): Supabase data layer with paged reads and tiyn conversion"
```

---

### Task 10: Продукт, поддомен, лендинг, меню

**Files:**
- Modify: `src/lib/products.ts`, `src/lib/products.test.ts`, `src/lib/hostRouting.ts`, `src/lib/hostRouting.test.ts`, `src/lib/crossProduct.ts`, `src/lib/landings.ts`, `src/lib/postLoginRedirect.ts`, `src/components/SiteNav.tsx`, `src/components/products/ProductLanding.tsx`, `src/components/products/ProductArt.tsx`

**Interfaces:**
- Produces: `ProductKey` включает `'cfo'`; `LandingKey` включает `'cfo'`; `SECTIONS` содержит секцию `cfo` (adminOnly); `/cfo/overview` в `ALLOWED_POST_LOGIN_REDIRECTS`.

- [ ] **Step 1: Падающие тесты реестра и роутинга**

В `src/lib/products.test.ts` внутрь существующего блока про `SELECTABLE_KEYS` (рядом со строкой `expect(SELECTABLE_KEYS).not.toContain('wildberries')`) добавить:

```ts
    expect(SELECTABLE_KEYS).not.toContain('cfo')
```

И в блок с `homeFor` (рядом с `expect(homeFor(['aiAgent'])).toBe('/ai-agent/overview')`):

```ts
    expect(homeFor(['cfo'])).toBe('/cfo/overview')
```

В конец `src/lib/hostRouting.test.ts`:

```ts
describe('cfo host', () => {
  it('root opens the CFO landing, cabinet paths pass through', () => {
    expect(productHostRewrite('cfo.invoices.kz', '/', 'invoices.kz')).toBe('/lp/cfo')
    expect(productHostRewrite('cfo.invoices.kz', '/cfo/overview', 'invoices.kz')).toBeNull()
    expect(isProductHost('cfo.invoices.kz', 'invoices.kz')).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run src/lib/products.test.ts src/lib/hostRouting.test.ts`
Expected: FAIL (типовая ошибка на `'cfo'` или неверный результат `homeFor` / rewrite).

- [ ] **Step 3: Реестр продуктов**

В `src/lib/products.ts`:

```ts
export type ProductKey = 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent' | 'wildberries' | 'salon' | 'cfo'
```

и в массив `PRODUCTS` перед строкой `wildberries` добавить:

```ts
  { key: 'cfo', name: 'CFO', blurb: 'БДР, БДДС и платёжный календарь', audience: 'Финдиректора и собственники бизнеса', href: '/cfo/overview', landing: 'https://cfo.invoices.kz', bg: '#0E4D45', ink: '#DFFAF1', adminOnly: true, inNav: true },
```

- [ ] **Step 4: Поддомен и origin**

В `src/lib/hostRouting.ts` в `PRODUCT_HOST_ROUTES` после строки `salon`:

```ts
  cfo: { '/': '/lp/cfo' },
```

и в комментарии над `isProductHost` заменить `(api., kaspi., agent., salon., docs.)` на `(api., kaspi., agent., salon., cfo., docs.)`.

В `src/lib/crossProduct.ts` в `ORIGINS` после `aiAgent`:

```ts
  cfo: 'https://cfo.invoices.kz',
```

В `src/lib/postLoginRedirect.ts` в `ALLOWED_POST_LOGIN_REDIRECTS` добавить `'/cfo/overview'` последним элементом.

- [ ] **Step 5: Лендинг**

В `src/lib/landings.ts`:

```ts
export type LandingKey = 'kaspi' | 'agent' | 'salon' | 'cfo'
```

В `LandingDef` заменить строку `cabinet` и добавить `inviteNote`:

```ts
  cabinet: '/kaspi-shop/overview' | '/ai-agent/overview' | '/admin/site-generator' | '/cfo/overview' // where a signed-in person goes
```

```ts
  // Note under the call to action for 'invite' landings; falls back to LANDING_UI.inviteNote.
  inviteNote?: L10n
```

В `LANDINGS` после `salon` добавить:

```ts
  cfo: {
    key: 'cfo',
    product: 'cfo',
    origin: 'https://cfo.invoices.kz',
    cabinet: '/cfo/overview',
    access: 'invite',
    soft: '#9BE3CF',
    audience: { ru: 'Финдиректора и собственники бизнеса', kk: 'Қаржы директорлары мен бизнес иелері', en: 'CFOs and business owners' },
    tagline: {
      ru: 'БДР, БДДС и платёжный календарь в одном кабинете',
      kk: 'Кірістер мен шығыстар бюджеті, ақша ағыны және төлем күнтізбесі бір кабинетте',
      en: 'P&L budget, cash flow and a payment calendar in one place',
    },
    lead: {
      ru: 'Заносите операции один раз — отчёт о прибылях, движение денег и прогноз остатка по дням строятся сами. Кассовый разрыв видно заранее.',
      kk: 'Операцияларды бір рет енгізіңіз — пайда туралы есеп, ақша қозғалысы және күн сайынғы қалдық болжамы өздігінен құрылады. Кассалық үзіліс алдын ала көрінеді.',
      en: 'Enter each transaction once — the P&L, cash flow and a day-by-day balance forecast build themselves. Cash gaps show up in advance.',
    },
    points: {
      ru: ['План и факт по статьям за каждый месяц', 'Платёжный календарь с прогнозом остатка', 'Выручка, маржа, точка безубыточности, запас денег'],
      kk: ['Әр ай бойынша баптар бойынша жоспар мен факт', 'Қалдық болжамы бар төлем күнтізбесі', 'Түсім, маржа, залалсыздық нүктесі, ақша қоры'],
      en: ['Plan vs actual by line item, every month', 'Payment calendar with a balance forecast', 'Revenue, margin, break-even and cash runway'],
    },
    inviteNote: {
      ru: 'Сейчас в закрытом тесте — открываем по заявке',
      kk: 'Қазір жабық сынақта — өтінім бойынша ашамыз',
      en: 'In closed beta — access by request',
    },
    metaTitle: 'CFO — БДР, БДДС и платёжный календарь | invoices.kz',
    metaDescription: 'Кабинет финансового директора: бюджет доходов и расходов, движение денежных средств, платёжный календарь с прогнозом кассовых разрывов и ключевые показатели.',
  },
```

В `src/components/products/ProductLanding.tsx` строку

```tsx
        {l.access === 'invite' && <p className="lp-note"><span>{ui.inviteNote}</span></p>}
```

заменить на

```tsx
        {l.access === 'invite' && <p className="lp-note"><span>{l.inviteNote?.[lang] ?? ui.inviteNote}</span></p>}
```

(`lang` уже есть в компоненте: `const { lang } = useLanguage()`).

- [ ] **Step 6: Иллюстрация**

В `src/components/products/ProductArt.tsx` в комментарий над `DISPLAY` дописать «, bars and a trend for CFO», а в `switch` перед `case 'wildberries':` добавить:

```tsx
    case 'cfo':
      return (
        <svg {...common}>
          <rect x="34" y="40" width="172" height="136" rx="20" fill="#DFFAF1" />
          <g fill="#0E4D45">
            <rect x="58" y="120" width="22" height="34" rx="5" />
            <rect x="90" y="96" width="22" height="58" rx="5" />
            <rect x="122" y="108" width="22" height="46" rx="5" />
            <rect x="154" y="72" width="22" height="82" rx="5" />
          </g>
          <path d="M58 92 98 70l32 14 46-34" fill="none" stroke="#2DC48D" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="rotate(-7 190 178)">
            <rect x="150" y="160" width="76" height="38" rx="19" fill="#0E4D45" />
            <text x="188" y="185" textAnchor="middle" fontSize="16" fill="#DFFAF1" style={DISPLAY}>+12 %</text>
          </g>
        </svg>
      )
```

- [ ] **Step 7: Секция меню и скрытие adminOnly**

В `src/components/SiteNav.tsx` после блока `wbLinks` добавить:

```ts
const cfoLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/cfo/overview', label: { ru: 'Обзор', kk: 'Шолу', en: 'Overview' } },
  { href: '/cfo/operations', label: { ru: 'Операции', kk: 'Операциялар', en: 'Transactions' } },
  { href: '/cfo/calendar', label: { ru: 'Календарь', kk: 'Күнтізбе', en: 'Calendar' } },
  { href: '/cfo/pnl', label: { ru: 'БДР', kk: 'КШБ', en: 'P&L' } },
  { href: '/cfo/cashflow', label: { ru: 'БДДС', kk: 'АҚБ', en: 'Cash flow' } },
  { href: '/cfo/plan', label: { ru: 'План', kk: 'Жоспар', en: 'Plan' } },
  { href: '/cfo/settings', label: { ru: 'Настройки', kk: 'Баптаулар', en: 'Settings' } },
]
```

В типе `Section` расширить ключ:

```ts
  key: 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent' | 'wildberries' | 'cfo'
```

В `SECTIONS` последним элементом:

```ts
  { key: 'cfo', links: cfoLinks, adminOnly: true },
```

Строку

```ts
  const visibleSections = SECTIONS.filter(s => onProductHost ? s.key === activeSection?.key : isSectionVisible(mine, s.key, activeSection?.key ?? null))
```

заменить на

```ts
  // A section still under the founder's review (adminOnly) is hidden, not shown
  // with a lock -- until the profile is known nobody sees it, so it can't flash
  // in front of a non-admin; an admin sees it appear a moment later.
  const visibleSections = SECTIONS
    .filter(s => !s.adminOnly || perms?.isAdmin === true)
    .filter(s => onProductHost ? s.key === activeSection?.key : isSectionVisible(mine, s.key, activeSection?.key ?? null))
```

- [ ] **Step 8: Тесты и typecheck**

Run: `npx vitest run src/lib/products.test.ts src/lib/hostRouting.test.ts src/lib/crossProduct.test.ts && npx tsc --noEmit`
Expected: PASS, tsc без ошибок.

- [ ] **Step 9: Commit**

```bash
git add src/lib/products.ts src/lib/products.test.ts src/lib/hostRouting.ts src/lib/hostRouting.test.ts src/lib/crossProduct.ts src/lib/landings.ts src/lib/postLoginRedirect.ts src/components/SiteNav.tsx src/components/products/ProductLanding.tsx src/components/products/ProductArt.tsx
git commit -m "feat(cfo): register the admin-only CFO product, cfo. subdomain and invite landing"
```

---

### Task 11: Оболочка раздела: layout, workspace, UI-примитивы, первый счёт

**Files:**
- Create: `src/app/cfo/layout.tsx`, `src/app/cfo/page.tsx`, `src/app/cfo/CfoWorkspace.tsx`, `src/app/cfo/ui.tsx`, `src/app/cfo/AccountForm.tsx`, `src/app/cfo/FirstAccountWizard.tsx`

**Interfaces:**
- Consumes: `ProductShell`, `DesktopShell`, `SiteNav`, `LoadingSpinner`, `useEffectivePath`, `setPostLoginRedirect`, `bootstrapWorkspace`, `loadWorkspace`, `saveAccount`.
- Produces:
  - `useCfo(): { ws: Workspace; reload: () => Promise<void> }`
  - `ui.tsx`: `CfoPage({ title, actions?, children })`, `Card`, `SectionTitle`, `Field`, `PrimaryButton`, `GhostButton`, `Segmented<T>`, `Money({ value, signed? })`, `Badge({ tone })`, `ErrorText`, `EmptyState({ title, hint, href?, cta? })`, `YearPicker({ value, onChange })`, `inputClass`, `inputStyle`
  - `AccountForm({ initial?, operations, submitLabel, onSave, onCancel? })` где `onSave: (a: AccountInput) => Promise<string | null>`; `type AccountInput = { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }`

- [ ] **Step 1: Layout и корень раздела**

```tsx
// src/app/cfo/layout.tsx
import ProductShell from '@/components/ProductShell'
import CfoWorkspace from './CfoWorkspace'

export default function CfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductShell product="cfo">
      <CfoWorkspace>{children}</CfoWorkspace>
    </ProductShell>
  )
}
```

```tsx
// src/app/cfo/page.tsx
import { redirect } from 'next/navigation'

export default function CfoIndex() {
  redirect('/cfo/overview')
}
```

- [ ] **Step 2: UI-примитивы**

```tsx
// src/app/cfo/ui.tsx
'use client'
import DesktopShell from '@/components/DesktopShell'
import SiteNav from '@/components/SiteNav'
import { formatTenge } from '@/lib/cfo/money'

export const inputClass = 'w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
export const inputStyle: React.CSSProperties = { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }

export function CfoPage({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="flex-1 min-w-0 p-4 lg:p-6 pb-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>{title}</h1>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </DesktopShell>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`nav-glass rounded-2xl p-4 lg:p-5 ${className}`}>{children}</div>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{children}</h2>
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{label}</span>
      {children}
      {hint && <span className="text-xs mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>{hint}</span>}
    </label>
  )
}

export function PrimaryButton({ className = '', style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 ${className}`}
      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', ...style }}
    />
  )
}

export function GhostButton({ className = '', style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-60 ${className}`}
      style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)', ...style }}
    />
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl p-1 gap-1" style={{ background: 'var(--nav-surface-glass)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="min-h-[36px] px-3 rounded-lg text-sm font-medium transition-colors"
          style={o.value === value
            ? { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
            : { color: 'var(--nav-text-secondary)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Money({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  const text = signed && value > 0 ? `+${formatTenge(value)}` : formatTenge(value)
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`} style={{ color: value < 0 ? 'var(--nav-critical)' : undefined }}>
      {text}
    </span>
  )
}

const BADGE: Record<'plan' | 'fact' | 'warn' | 'muted', React.CSSProperties> = {
  plan: { background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' },
  fact: { background: 'var(--nav-success-soft)', color: 'var(--nav-success)' },
  warn: { background: 'var(--nav-magenta-soft)', color: 'var(--nav-critical)' },
  muted: { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' },
}

export function Badge({ tone, children }: { tone: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full" style={BADGE[tone]}>{children}</span>
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <p role="alert" className="text-xs" style={{ color: 'var(--nav-critical)' }}>{children}</p>
}

export function EmptyState({ title, hint, href, cta }: { title: string; hint: string; href?: string; cta?: string }) {
  return (
    <Card className="text-center py-10">
      <div className="text-base font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{title}</div>
      <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>{hint}</p>
      {href && cta && (
        <a href={href} className="inline-flex items-center min-h-[44px] mt-4 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {cta}
        </a>
      )}
    </Card>
  )
}

export function YearPicker({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <GhostButton type="button" onClick={() => onChange(value - 1)} aria-label="Предыдущий год">‹</GhostButton>
      <span className="text-sm font-semibold tabular-nums px-2" style={{ color: 'var(--nav-text-primary)' }}>{value}</span>
      <GhostButton type="button" onClick={() => onChange(value + 1)} aria-label="Следующий год">›</GhostButton>
    </div>
  )
}
```

- [ ] **Step 3: Форма счёта**

```tsx
// src/app/cfo/AccountForm.tsx
'use client'
import { useState } from 'react'
import type { AccountKind, CfoAccount, CfoOperation } from '@/lib/cfo/types'
import { parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { isIsoDate, todayIso } from '@/lib/cfo/dates'
import { openingDateConflict } from '@/lib/cfo/validate'
import { ACCOUNT_KIND_LABEL } from '@/lib/cfo/labels'
import { ErrorText, Field, GhostButton, PrimaryButton, inputClass, inputStyle } from './ui'

export type AccountInput = { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }

export default function AccountForm({ initial, operations, submitLabel, onSave, onCancel }: {
  initial?: CfoAccount
  operations: CfoOperation[]
  submitLabel: string
  onSave: (a: AccountInput) => Promise<string | null>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'bank')
  const [balance, setBalance] = useState(initial ? String(tiynToNumber(initial.openingBalance)) : '0')
  const [date, setDate] = useState(initial?.openingDate ?? `${todayIso().slice(0, 7)}-01`)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseAmountInput(balance, { allowNegative: true })
    if (!name.trim()) { setError('Укажите название'); return }
    if (amount === null) { setError('Остаток — число, например 150000 или 1 250,50'); return }
    if (!isIsoDate(date)) { setError('Укажите дату начала учёта'); return }
    if (initial) {
      const conflict = openingDateConflict(initial.id, date, operations)
      if (conflict) { setError(conflict); return }
    }
    setSaving(true)
    setError(null)
    const err = await onSave({ id: initial?.id, name: name.trim(), kind, openingBalance: amount, openingDate: date })
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Название">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Kaspi Gold или Касса" />
      </Field>
      <Field label="Тип">
        <select className={inputClass} style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Остаток, ₸" hint="Может быть отрицательным (овердрафт)">
          <input className={inputClass} style={inputStyle} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        <Field label="На дату (начало учёта)">
          <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        {onCancel && <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>}
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : submitLabel}</PrimaryButton>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Workspace (вход, админ-ворота, bootstrap, загрузка)**

```tsx
// src/app/cfo/CfoWorkspace.tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { useEffectivePath } from '@/lib/useEffectivePath'
import { bootstrapWorkspace, loadWorkspace, type Workspace } from '@/lib/cfo/data'
import FirstAccountWizard from './FirstAccountWizard'
import { CfoPage, Card, PrimaryButton } from './ui'

type Ctx = { ws: Workspace; reload: () => Promise<void> }
const CfoContext = createContext<Ctx | null>(null)

export function useCfo(): Ctx {
  const v = useContext(CfoContext)
  if (!v) throw new Error('useCfo must be used inside CfoWorkspace')
  return v
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; ws: Workspace }

export default function CfoWorkspace({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const path = useEffectivePath()
  const [state, setState] = useState<State>({ status: 'loading' })
  const ids = useRef<{ companyId: string; userId: string } | null>(null)

  const init = useCallback(async () => {
    setState({ status: 'loading' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPostLoginRedirect('/cfo/overview')
      router.replace('/login')
      return
    }
    // Ворота на время ревью founder'а: продукт adminOnly. Открытие для всех —
    // убрать эту проверку (данные и так видны только владельцу через RLS).
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) {
      router.replace('/products')
      return
    }
    try {
      const companyId = await bootstrapWorkspace()
      ids.current = { companyId, userId: user.id }
      setState({ status: 'ready', ws: await loadWorkspace(companyId, user.id) })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [router])

  useEffect(() => { void init() }, [init])

  const reload = useCallback(async () => {
    if (!ids.current) return
    const ws = await loadWorkspace(ids.current.companyId, ids.current.userId)
    setState({ status: 'ready', ws })
  }, [])

  if (state.status === 'loading') return <LoadingSpinner />
  if (state.status === 'error') {
    return (
      <CfoPage title="CFO">
        <Card>
          <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>Не удалось загрузить данные: {state.message}</p>
          <PrimaryButton type="button" onClick={() => void init()}>Повторить</PrimaryButton>
        </Card>
      </CfoPage>
    )
  }

  const needsAccount = state.ws.accounts.filter((a) => !a.archived).length === 0 && !path.startsWith('/cfo/settings')
  return (
    <CfoContext.Provider value={{ ws: state.ws, reload }}>
      {needsAccount ? <FirstAccountWizard /> : children}
    </CfoContext.Provider>
  )
}
```

- [ ] **Step 5: Мастер первого счёта**

```tsx
// src/app/cfo/FirstAccountWizard.tsx
'use client'
import { saveAccount } from '@/lib/cfo/data'
import { useCfo } from './CfoWorkspace'
import AccountForm from './AccountForm'
import { Card, CfoPage } from './ui'

export default function FirstAccountWizard() {
  const { ws, reload } = useCfo()
  return (
    <CfoPage title="Начнём учёт">
      <Card className="max-w-xl">
        <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
          Добавьте счёт или кассу, с которых начинаете учёт. Остаток на дату — стартовая точка для движения денег и платёжного календаря.
          Остальные счета можно добавить потом в настройках.
        </p>
        <AccountForm
          operations={ws.operations}
          submitLabel="Начать учёт"
          onSave={async (a) => {
            try {
              await saveAccount(ws, a)
              await reload()
              return null
            } catch (e) {
              return e instanceof Error ? e.message : String(e)
            }
          }}
        />
      </Card>
    </CfoPage>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок. (Страниц разделов ещё нет — `/cfo/overview` пока 404, это ожидаемо до Task 17.)

- [ ] **Step 7: Commit**

```bash
git add src/app/cfo/layout.tsx src/app/cfo/page.tsx src/app/cfo/CfoWorkspace.tsx src/app/cfo/ui.tsx src/app/cfo/AccountForm.tsx src/app/cfo/FirstAccountWizard.tsx
git commit -m "feat(cfo): cabinet shell with admin gate, bootstrap, workspace context and first-account wizard"
```

---

### Task 12: Настройки — компания, счета, статьи

**Files:**
- Create: `src/app/cfo/settings/page.tsx`

**Interfaces:**
- Consumes: `useCfo`, `AccountForm`, `saveAccount`, `saveArticle`, `saveCompanyName`, `setArchived`, `reorder`, `validateArticle`, подписи из `labels.ts`, `useAppDialog` (`{ alert, confirm, dialogElement }`).

- [ ] **Step 1: Страница**

```tsx
// src/app/cfo/settings/page.tsx
'use client'
import { useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { reorder, saveAccount, saveArticle, saveCompanyName, setArchived } from '@/lib/cfo/data'
import { ACCOUNT_KIND_LABEL, ACTIVITY_LABEL, ARTICLE_KIND_LABEL, PNL_GROUP_LABEL } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { validateArticle } from '@/lib/cfo/validate'
import type { Activity, ArticleKind, CfoAccount, CfoArticle, PnlGroup } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import AccountForm from '../AccountForm'
import { Card, CfoPage, ErrorText, Field, GhostButton, PrimaryButton, SectionTitle, inputClass, inputStyle } from '../ui'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function ArticleForm({ initial, onSave, onCancel }: {
  initial?: CfoArticle
  onSave: (a: { name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null }) => Promise<string | null>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<ArticleKind>(initial?.kind ?? 'expense')
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? 'operating')
  const [pnl, setPnl] = useState<PnlGroup | 'none'>(initial ? initial.pnlGroup ?? 'none' : 'opex')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const draft = { name: name.trim(), kind, activity, pnlGroup: pnl === 'none' ? null : pnl }
    const v = validateArticle(draft)
    if (v) { setError(v); return }
    setSaving(true)
    setError(null)
    const err = await onSave(draft)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl p-3" style={{ border: '1px solid var(--nav-border)' }}>
      <Field label="Название статьи">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Тип">
          <select className={inputClass} style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as ArticleKind)}>
            <option value="income">{ARTICLE_KIND_LABEL.income}</option>
            <option value="expense">{ARTICLE_KIND_LABEL.expense}</option>
          </select>
        </Field>
        <Field label="Вид деятельности (БДДС)">
          <select className={inputClass} style={inputStyle} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
            {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
          </select>
        </Field>
        <Field label="Строка БДР">
          <select className={inputClass} style={inputStyle} value={pnl} onChange={(e) => setPnl(e.target.value as PnlGroup | 'none')}>
            {(Object.keys(PNL_GROUP_LABEL) as PnlGroup[]).map((g) => <option key={g} value={g}>{PNL_GROUP_LABEL[g]}</option>)}
            <option value="none">Не идёт в БДР</option>
          </select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</PrimaryButton>
      </div>
    </form>
  )
}

export default function CfoSettings() {
  const { ws, reload } = useCfo()
  const { alert, dialogElement } = useAppDialog()
  const [companyName, setCompanyName] = useState(ws.companyName)
  const [editingAccount, setEditingAccount] = useState<string | 'new' | null>(null)
  const [editingArticle, setEditingArticle] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  async function run(action: () => Promise<void>) {
    try {
      await action()
      await reload()
    } catch (e) {
      await alert(errText(e))
    }
  }

  async function move<T extends { id: string; sort: number }>(table: 'cfo_accounts' | 'cfo_articles', list: T[], index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const ids = list.map((x) => x.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await run(() => reorder(table, ids, list))
  }

  const accounts = ws.accounts.filter((a) => showArchived || !a.archived)
  const articleList = (kind: ArticleKind) => ws.articles.filter((a) => a.kind === kind && (showArchived || !a.archived))

  const accountRow = (a: CfoAccount, i: number, list: CfoAccount[]) => (
    <div key={a.id} className="py-3 flex items-start gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium" style={{ color: a.archived ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
          {a.name}{a.archived && ' · в архиве'}
        </div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {ACCOUNT_KIND_LABEL[a.kind]} · остаток {formatTenge(a.openingBalance)} на {a.openingDate}
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <GhostButton type="button" aria-label="Выше" onClick={() => void move('cfo_accounts', list, i, -1)}>↑</GhostButton>
        <GhostButton type="button" aria-label="Ниже" onClick={() => void move('cfo_accounts', list, i, 1)}>↓</GhostButton>
        <GhostButton type="button" onClick={() => setEditingAccount(a.id)}>Изменить</GhostButton>
        <GhostButton type="button" onClick={() => void run(() => setArchived('cfo_accounts', a.id, !a.archived))}>
          {a.archived ? 'Вернуть' : 'В архив'}
        </GhostButton>
      </div>
      {editingAccount === a.id && (
        <div className="w-full pt-2">
          <AccountForm
            initial={a}
            operations={ws.operations}
            submitLabel="Сохранить"
            onCancel={() => setEditingAccount(null)}
            onSave={async (input) => {
              try { await saveAccount(ws, input); setEditingAccount(null); await reload(); return null } catch (e) { return errText(e) }
            }}
          />
        </div>
      )}
    </div>
  )

  const articleRow = (a: CfoArticle, i: number, list: CfoArticle[]) => (
    <div key={a.id} className="py-3 flex items-start gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium" style={{ color: a.archived ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
          {a.name}{a.archived && ' · в архиве'}
        </div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {ACTIVITY_LABEL[a.activity]} · {a.pnlGroup ? PNL_GROUP_LABEL[a.pnlGroup] : 'не идёт в БДР'}
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <GhostButton type="button" aria-label="Выше" onClick={() => void move('cfo_articles', list, i, -1)}>↑</GhostButton>
        <GhostButton type="button" aria-label="Ниже" onClick={() => void move('cfo_articles', list, i, 1)}>↓</GhostButton>
        <GhostButton type="button" onClick={() => setEditingArticle(a.id)}>Изменить</GhostButton>
        <GhostButton type="button" onClick={() => void run(() => setArchived('cfo_articles', a.id, !a.archived))}>
          {a.archived ? 'Вернуть' : 'В архив'}
        </GhostButton>
      </div>
      {editingArticle === a.id && (
        <div className="w-full pt-2">
          <ArticleForm
            initial={a}
            onCancel={() => setEditingArticle(null)}
            onSave={async (input) => {
              try { await saveArticle(ws, { ...input, id: a.id }); setEditingArticle(null); await reload(); return null } catch (e) { return errText(e) }
            }}
          />
        </div>
      )}
    </div>
  )

  return (
    <CfoPage
      title="Настройки"
      actions={
        <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показывать архив
        </label>
      }
    >
      <Card>
        <SectionTitle>Компания</SectionTitle>
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => { e.preventDefault(); if (companyName.trim()) void run(() => saveCompanyName(ws, companyName.trim())) }}
        >
          <input className={`${inputClass} flex-1 min-w-[200px]`} style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} aria-label="Название компании" />
          <PrimaryButton type="submit">Сохранить</PrimaryButton>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-1">
          <SectionTitle>Счета и кассы</SectionTitle>
          {editingAccount !== 'new' && <PrimaryButton type="button" onClick={() => setEditingAccount('new')}>Добавить счёт</PrimaryButton>}
        </div>
        {editingAccount === 'new' && (
          <div className="mb-3">
            <AccountForm
              operations={ws.operations}
              submitLabel="Добавить"
              onCancel={() => setEditingAccount(null)}
              onSave={async (input) => {
                try { await saveAccount(ws, input); setEditingAccount(null); await reload(); return null } catch (e) { return errText(e) }
              }}
            />
          </div>
        )}
        {accounts.map((a, i, list) => accountRow(a, i, list))}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-1">
          <SectionTitle>Статьи</SectionTitle>
          {editingArticle !== 'new' && <PrimaryButton type="button" onClick={() => setEditingArticle('new')}>Добавить статью</PrimaryButton>}
        </div>
        {editingArticle === 'new' && (
          <div className="mb-3">
            <ArticleForm
              onCancel={() => setEditingArticle(null)}
              onSave={async (input) => {
                try { await saveArticle(ws, input); setEditingArticle(null); await reload(); return null } catch (e) { return errText(e) }
              }}
            />
          </div>
        )}
        {(['income', 'expense'] as ArticleKind[]).map((kind) => (
          <div key={kind} className="mt-3">
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
              {kind === 'income' ? 'Доходы' : 'Расходы'}
            </div>
            {articleList(kind).map((a, i, list) => articleRow(a, i, list))}
          </div>
        ))}
      </Card>
      {dialogElement}
    </CfoPage>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app/cfo/settings/page.tsx
git commit -m "feat(cfo): settings page for company, accounts and articles"
```

---

### Task 13: Операции — журнал, форма, повторы

**Files:**
- Create: `src/app/cfo/OperationForm.tsx`, `src/app/cfo/operations/page.tsx`

**Interfaces:**
- Consumes: `useCfo`, `saveOperation`, `saveRecurrence`, `deleteOperation`, `deleteRecurrence`, `markPaid`, `validateOperation`, `validateRecurrence`, `parseAmountInput`, `tiynToNumber`, `todayIso`, `monthKey`, подписи, `useAppDialog`.
- Produces: `OperationForm({ initial?, onDone, onCancel })` — `onDone: () => Promise<void>`.

- [ ] **Step 1: Форма операции**

```tsx
// src/app/cfo/OperationForm.tsx
'use client'
import { useState } from 'react'
import type { CfoOperation, Direction, OpStatus } from '@/lib/cfo/types'
import { saveOperation, saveRecurrence } from '@/lib/cfo/data'
import { parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { todayIso } from '@/lib/cfo/dates'
import { validateOperation, validateRecurrence } from '@/lib/cfo/validate'
import { useCfo } from './CfoWorkspace'
import { ErrorText, Field, GhostButton, PrimaryButton, Segmented, inputClass, inputStyle } from './ui'

export default function OperationForm({ initial, onDone, onCancel }: { initial?: CfoOperation; onDone: () => Promise<void>; onCancel: () => void }) {
  const { ws } = useCfo()
  const today = todayIso()
  const accounts = ws.accounts.filter((a) => !a.archived || a.id === initial?.accountId || a.id === initial?.toAccountId)

  const [direction, setDirection] = useState<Direction>(initial?.direction ?? 'out')
  const [amount, setAmount] = useState(initial ? String(tiynToNumber(initial.amount)) : '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '')
  const [articleId, setArticleId] = useState(initial?.articleId ?? '')
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? today)
  const [separateAccrual, setSeparateAccrual] = useState(!!initial && initial.accruedOn !== initial.paidOn)
  const [accruedOn, setAccruedOn] = useState(initial?.accruedOn ?? today)
  const [status, setStatus] = useState<OpStatus>(initial?.status ?? 'actual')
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [repeat, setRepeat] = useState(false)
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const articleKind = direction === 'in' ? 'income' : 'expense'
  const articles = ws.articles.filter((a) => a.kind === articleKind && (!a.archived || a.id === initial?.articleId))

  function changeDirection(d: Direction) {
    setDirection(d)
    const kind = d === 'in' ? 'income' : 'expense'
    if (!ws.articles.some((a) => a.id === articleId && a.kind === kind)) setArticleId('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const tiyn = parseAmountInput(amount)
    if (tiyn === null) { setError('Сумма — число, например 150000 или 1 250,50'); return }
    const ctx = { accounts: ws.accounts, articles: ws.articles, today }
    const toAccount = direction === 'transfer' ? toAccountId || null : null
    const article = direction === 'transfer' ? null : articleId || null
    const extra = { counterparty: counterparty.trim() || null, comment: comment.trim() || null }

    setSaving(true)
    setError(null)
    try {
      if (repeat) {
        const rule = { direction, amount: tiyn, accountId, toAccountId: toAccount, articleId: article, dayOfMonth: Number(paidOn.slice(8, 10)), startsOn: paidOn, endsOn: endsOn || null }
        const v = validateRecurrence(rule, ctx)
        if (v) { setError(v); return }
        await saveRecurrence(ws, { ...rule, ...extra })
      } else {
        const draft = { direction, amount: tiyn, accountId, toAccountId: toAccount, articleId: article, paidOn, accruedOn: separateAccrual ? accruedOn : paidOn, status }
        const v = validateOperation(draft, ctx)
        if (v) { setError(v); return }
        await saveOperation(ws, { ...draft, ...extra, id: initial?.id })
      }
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Segmented
          label="Тип операции"
          value={direction}
          onChange={changeDirection}
          options={[{ value: 'out', label: 'Расход' }, { value: 'in', label: 'Приход' }, { value: 'transfer', label: 'Перевод' }]}
        />
        <Segmented
          label="Статус"
          value={status}
          onChange={(s) => { setStatus(s); if (s === 'actual') setRepeat(false) }}
          options={[{ value: 'actual', label: 'Факт' }, { value: 'planned', label: 'План' }]}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Сумма, ₸">
          <input className={inputClass} style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={direction === 'transfer' ? 'Со счёта' : 'Счёт'}>
          <select className={inputClass} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {direction === 'transfer' ? (
          <Field label="На счёт">
            <select className={inputClass} style={inputStyle} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Выберите счёт</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Статья">
            <select className={inputClass} style={inputStyle} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">Выберите статью</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={repeat ? 'Первый платёж' : 'Дата оплаты'}>
          <input type="date" className={inputClass} style={inputStyle} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>

      {direction !== 'transfer' && !repeat && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={separateAccrual} onChange={(e) => setSeparateAccrual(e.target.checked)} />
            Другая дата начисления (для БДР)
          </label>
          {separateAccrual && (
            <Field label="Дата начисления" hint="Например, услуга за март, оплаченная в апреле: начисление — март">
              <input type="date" className={inputClass} style={inputStyle} value={accruedOn} onChange={(e) => setAccruedOn(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Контрагент">
          <input className={inputClass} style={inputStyle} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </Field>
        <Field label="Комментарий">
          <input className={inputClass} style={inputStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>

      {!initial && status === 'planned' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Повторять каждый месяц в этот день
          </label>
          {repeat && (
            <Field label="Повторять до (необязательно)">
              <input type="date" className={inputClass} style={inputStyle} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : initial ? 'Сохранить' : 'Добавить'}</PrimaryButton>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Страница журнала**

```tsx
// src/app/cfo/operations/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { deleteOperation, deleteRecurrence, markPaid } from '@/lib/cfo/data'
import { monthKey, todayIso } from '@/lib/cfo/dates'
import { accountName, dayLabel, DIRECTION_LABEL, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import type { CfoOperation, OpStatus } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import OperationForm from '../OperationForm'
import { Badge, Card, CfoPage, EmptyState, GhostButton, Money, PrimaryButton, SectionTitle, Segmented, inputClass, inputStyle } from '../ui'

const signedAmount = (op: CfoOperation) => (op.direction === 'in' ? op.amount : op.direction === 'out' ? -op.amount : 0)

export default function CfoOperations() {
  const { ws, reload } = useCfo()
  const { alert, confirm, dialogElement } = useAppDialog()
  const today = todayIso()
  const [month, setMonth] = useState(monthKey(today))
  const [accountId, setAccountId] = useState('')
  const [articleId, setArticleId] = useState('')
  const [status, setStatus] = useState<OpStatus | 'all'>('all')
  const [editing, setEditing] = useState<CfoOperation | 'new' | null>(null)

  const list = useMemo(() => ws.operations
    .filter((o) => !month || monthKey(o.paidOn) === month)
    .filter((o) => !accountId || o.accountId === accountId || o.toAccountId === accountId)
    .filter((o) => !articleId || o.articleId === articleId)
    .filter((o) => status === 'all' || o.status === status)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn)), [ws.operations, month, accountId, articleId, status])

  async function run(action: () => Promise<void>) {
    try { await action(); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) }
  }

  const done = async () => { setEditing(null); await reload() }

  return (
    <CfoPage title="Операции" actions={editing === null && <PrimaryButton type="button" onClick={() => setEditing('new')}>Добавить операцию</PrimaryButton>}>
      {editing !== null && (
        <Card>
          <SectionTitle>{editing === 'new' ? 'Новая операция' : 'Изменить операцию'}</SectionTitle>
          <OperationForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={done} onCancel={() => setEditing(null)} />
        </Card>
      )}

      <Card>
        <div className="flex gap-2 flex-wrap items-end">
          <input type="month" aria-label="Месяц" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={month} onChange={(e) => setMonth(e.target.value)} />
          <select aria-label="Счёт" className={`${inputClass} max-w-[200px]`} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Все счета</option>
            {ws.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Статья" className={`${inputClass} max-w-[240px]`} style={inputStyle} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
            <option value="">Все статьи</option>
            {ws.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Segmented label="Статус" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Все' }, { value: 'actual', label: 'Факт' }, { value: 'planned', label: 'План' }]} />
        </div>
      </Card>

      {ws.operations.length === 0 && editing === null ? (
        <EmptyState title="Добавьте первую операцию" hint="Приход, расход или перевод между своими счетами — из них сами строятся БДР, БДДС и календарь." />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {list.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--nav-text-muted)' }}>За этот период операций нет.</p>}
          {list.map((op) => (
            <div key={op.id} className="px-4 py-3 flex items-start gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="w-28 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{dayLabel(op.paidOn)}</div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {op.direction !== 'transfer' && `${accountName(op.accountId, ws.accounts)} · `}
                  {[op.counterparty, op.comment].filter(Boolean).join(' · ') || DIRECTION_LABEL[op.direction]}
                  {op.accruedOn !== op.paidOn && ` · начисление ${op.accruedOn}`}
                </div>
              </div>
              <div className="text-right">
                {op.direction === 'transfer'
                  ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
                  : <Money value={signedAmount(op)} signed className="text-sm font-semibold" />}
                <div className="mt-1">{op.status === 'planned' ? <Badge tone="plan">План</Badge> : <Badge tone="fact">Факт</Badge>}</div>
              </div>
              <div className="w-full flex gap-1 flex-wrap justify-end">
                {op.status === 'planned' && <GhostButton type="button" onClick={() => void run(() => markPaid(ws, op, today))}>Оплачено</GhostButton>}
                <GhostButton type="button" onClick={() => setEditing(op)}>Изменить</GhostButton>
                <GhostButton
                  type="button"
                  onClick={async () => { if (await confirm('Удалить операцию?')) await run(() => deleteOperation(op.id)) }}
                >
                  Удалить
                </GhostButton>
              </div>
            </div>
          ))}
        </Card>
      )}

      {ws.recurrences.length > 0 && (
        <Card>
          <SectionTitle>Повторяющиеся платежи</SectionTitle>
          {ws.recurrences.map((r) => (
            <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(r, ws.accounts, ws.articles)}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {DIRECTION_LABEL[r.direction]} · {formatTenge(r.amount)} · каждое {r.dayOfMonth}-е число с {r.startsOn}{r.endsOn ? ` по ${r.endsOn}` : ''}
                </div>
              </div>
              <GhostButton
                type="button"
                onClick={async () => { if (await confirm('Удалить правило? Уже оплаченные операции останутся.')) await run(() => deleteRecurrence(r.id)) }}
              >
                Удалить
              </GhostButton>
            </div>
          ))}
        </Card>
      )}
      {dialogElement}
    </CfoPage>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок. Если `confirm`/`alert` из `useAppDialog` имеют другую сигнатуру — свериться с `src/components/AppDialog.tsx` (возвращает `{ alert, confirm, dialogElement }`, `confirm` резолвится в boolean).

- [ ] **Step 4: Commit**

```bash
git add src/app/cfo/OperationForm.tsx src/app/cfo/operations/page.tsx
git commit -m "feat(cfo): operations journal with filters, mark-paid and monthly recurrences"
```

---

### Task 14: Платёжный календарь (страница)

**Files:**
- Create: `src/app/cfo/calendar/page.tsx`

**Interfaces:**
- Consumes: `useCfo`, `buildCalendar`, `CALENDAR_HORIZON_DAYS`, `isVirtual`, `markPaid`, даты, подписи.

- [ ] **Step 1: Страница**

```tsx
// src/app/cfo/calendar/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from '@/lib/cfo/calendar'
import { markPaid } from '@/lib/cfo/data'
import { addDays, firstDay, monthKey, todayIso } from '@/lib/cfo/dates'
import { accountName, dayLabel, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { isVirtual } from '@/lib/cfo/recurrence'
import type { CfoOperation } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import { Badge, Card, CfoPage, GhostButton, Money, SectionTitle } from '../ui'

export default function CfoCalendar() {
  const { ws, reload } = useCfo()
  const { alert, dialogElement } = useAppDialog()
  const today = todayIso()
  const [showAll, setShowAll] = useState(false)
  const cal = useMemo(() => buildCalendar({
    accounts: ws.accounts,
    operations: ws.operations,
    recurrences: ws.recurrences,
    today,
    from: firstDay(monthKey(today)),
    to: addDays(today, CALENDAR_HORIZON_DAYS - 1),
  }), [ws, today])

  async function pay(op: CfoOperation) {
    try { await markPaid(ws, op, today); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) }
  }

  const item = (op: CfoOperation) => (
    <div key={op.id} className="flex items-center gap-3 py-2 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {op.direction === 'transfer' ? 'между своими счетами' : accountName(op.accountId, ws.accounts)}
          {op.counterparty && ` · ${op.counterparty}`}
        </div>
      </div>
      {op.status === 'actual' ? <Badge tone="fact">Факт</Badge> : isVirtual(op) ? <Badge tone="plan">Повтор</Badge> : <Badge tone="plan">План</Badge>}
      {op.direction === 'transfer'
        ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
        : <Money value={op.direction === 'in' ? op.amount : -op.amount} signed className="text-sm font-semibold" />}
      {op.status === 'planned' && <GhostButton type="button" onClick={() => void pay(op)}>Оплачено</GhostButton>}
    </div>
  )

  const days = cal.days.filter((d) => showAll || d.items.length > 0 || d.date === today || d.date === cal.firstGap)

  return (
    <CfoPage
      title="Платёжный календарь"
      actions={
        <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Все дни
        </label>
      }
    >
      {cal.firstGap && (
        <Card className="!py-3">
          <p className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>
            Кассовый разрыв {dayLabel(cal.firstGap)}: по плану денег на счетах не хватит. Перенесите платежи или ускорьте поступления.
          </p>
        </Card>
      )}

      {cal.overdue.length > 0 && (
        <Card>
          <SectionTitle>Просрочено — ещё не оплачено</SectionTitle>
          {cal.overdue.map((op) => (
            <div key={op.id}>
              <div className="text-xs pt-2" style={{ color: 'var(--nav-critical)' }}>{dayLabel(op.paidOn)}</div>
              {item(op)}
            </div>
          ))}
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        {days.map((d) => (
          <div key={d.date} className="px-4 py-3" style={{ borderBottom: '1px solid var(--nav-border-soft)', background: d.date === today ? 'var(--nav-accent-soft)' : undefined }}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                {dayLabel(d.date)}{d.date === today && ' · сегодня'}
              </div>
              <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                {d.date >= today ? 'прогноз остатка' : 'остаток'}{' '}
                <span className="tabular-nums font-semibold" style={{ color: d.gap ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>{formatTenge(d.balance)}</span>
              </div>
            </div>
            {d.items.length === 0
              ? <p className="text-xs pt-1" style={{ color: 'var(--nav-text-muted)' }}>Платежей нет</p>
              : d.items.map(item)}
          </div>
        ))}
      </Card>
      {dialogElement}
    </CfoPage>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app/cfo/calendar/page.tsx
git commit -m "feat(cfo): payment calendar page with overdue items and cash-gap banner"
```

---

### Task 15: Сетка плана

**Files:**
- Create: `src/app/cfo/plan/page.tsx`

**Interfaces:**
- Consumes: `useCfo`, `setPlanCells`, `yearMonths`, `addMonths`, `todayIso`, `parseAmountInput`, `shortMonth`, `useAppDialog`.

- [ ] **Step 1: Страница**

```tsx
// src/app/cfo/plan/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { setPlanCells } from '@/lib/cfo/data'
import { addMonths, todayIso, yearMonths } from '@/lib/cfo/dates'
import { shortMonth } from '@/lib/cfo/labels'
import { parseAmountInput } from '@/lib/cfo/money'
import type { ArticleKind } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import { Card, CfoPage, YearPicker } from '../ui'

const show = (t: number) => (t === 0 ? '' : (t / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }))

function PlanCell({ value, label, onCommit, strong = false }: { value: number; label: string; onCommit: (tiyn: number) => void; strong?: boolean }) {
  const [text, setText] = useState(show(value))
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text.trim() === '' ? 0 : parseAmountInput(text)
        if (parsed === null) { setText(show(value)); return }
        if (parsed !== value) onCommit(parsed)
      }}
      className={`w-28 min-h-[40px] rounded-md px-2 text-right text-sm tabular-nums outline-none border border-transparent focus:border-[color:var(--nav-accent)] ${strong ? 'font-semibold' : ''}`}
      style={{ background: 'transparent', color: 'var(--nav-text-primary)' }}
    />
  )
}

export default function CfoPlan() {
  const { ws, reload } = useCfo()
  const { alert, confirm, dialogElement } = useAppDialog()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const months = yearMonths(year)
  const planMap = useMemo(() => new Map(ws.plan.map((p) => [`${p.articleId}|${p.month}`, p.amount])), [ws.plan])
  const valueOf = (articleId: string, month: string) => planMap.get(`${articleId}|${month}`) ?? 0

  async function commit(cells: { articleId: string; month: string; amount: number }[]) {
    try { await setPlanCells(ws, cells); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) }
  }

  const articlesOf = (kind: ArticleKind) => ws.articles.filter((a) => a.kind === kind && (!a.archived || months.some((m) => valueOf(a.id, m) !== 0)))

  async function copyPrevious(month: string) {
    const prev = addMonths(month, -1)
    if (!(await confirm(`Заменить план за ${shortMonth(month)} ${month.slice(0, 4)} значениями прошлого месяца?`))) return
    await commit(ws.articles.filter((a) => !a.archived).map((a) => ({ articleId: a.id, month, amount: valueOf(a.id, prev) })))
  }

  // Годовая сумма делится поровну, остаток тиынов — в декабрь.
  function distribute(articleId: string, total: number) {
    const base = Math.floor(total / 12)
    const rest = total - base * 12
    void commit(months.map((m, i) => ({ articleId, month: m, amount: base + (i === 11 ? rest : 0) })))
  }

  return (
    <CfoPage title="План" actions={<YearPicker value={year} onChange={setYear} />}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Бюджет по статьям на месяц — с ним сравниваются факт в БДР, БДДС и на обзоре. Конкретные будущие платежи по дням заводятся в «Операциях» как плановые.
        Сумма в колонке «Год» делится поровну на 12 месяцев.
      </p>
      <div className="nav-glass rounded-2xl overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
              <th className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[220px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
              {months.map((m) => (
                <th key={m} className="px-1 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>
                  <div className="flex items-center justify-end gap-1">
                    <span>{shortMonth(m)}</span>
                    <button type="button" title="Скопировать из прошлого месяца" aria-label={`Скопировать план из прошлого месяца в ${shortMonth(m)}`} onClick={() => void copyPrevious(m)} className="w-8 h-8 rounded-md text-xs hover:bg-[var(--nav-surface-glass)]">⤺</button>
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>Год</th>
            </tr>
          </thead>
          <tbody>
            {(['income', 'expense'] as ArticleKind[]).map((kind) => (
              <PlanGroup key={kind}>
                <tr>
                  <td colSpan={14} className="sticky left-0 px-3 pt-4 pb-1 text-xs font-semibold uppercase" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
                    {kind === 'income' ? 'Доходы' : 'Расходы'}
                  </td>
                </tr>
                {articlesOf(kind).map((a) => {
                  const total = months.reduce((s, m) => s + valueOf(a.id, m), 0)
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                      <td className="sticky left-0 z-10 px-3 py-1" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }}>{a.name}</td>
                      {months.map((m) => (
                        <td key={m} className="px-1 py-1">
                          <PlanCell key={`${a.id}|${m}|${valueOf(a.id, m)}`} label={`${a.name}, ${shortMonth(m)}`} value={valueOf(a.id, m)} onCommit={(v) => void commit([{ articleId: a.id, month: m, amount: v }])} />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <PlanCell key={`${a.id}|year|${total}`} label={`${a.name}, год`} value={total} strong onCommit={(v) => distribute(a.id, v)} />
                      </td>
                    </tr>
                  )
                })}
              </PlanGroup>
            ))}
          </tbody>
        </table>
      </div>
      {dialogElement}
    </CfoPage>
  )
}

function PlanGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app/cfo/plan/page.tsx
git commit -m "feat(cfo): editable plan grid with copy-from-previous and even yearly split"
```

---

### Task 16: Таблица отчёта, БДР, БДДС

**Files:**
- Create: `src/app/cfo/ReportTable.tsx`, `src/app/cfo/pnl/page.tsx`, `src/app/cfo/cashflow/page.tsx`

**Interfaces:**
- Consumes: `buildPnl`, `PnlRow`, `buildCashflow`, `CashflowRow`, `shortMonth`, `formatTenge`, `yearMonths`, `todayIso`.
- Produces:
  - `type Measure = 'fact' | 'plan' | 'diff'`
  - `type ReportRow = { key: string; label: string; level: 0 | 1 | 2; strong: boolean; toggleKey?: string; parentKey?: string; cells: Record<string, { plan: number | null; fact: number }>; total: { plan: number | null; fact: number }; higherIsBetter: boolean }`
  - `ReportTable({ months, rows, measure, collapsed, onToggle, currentMonth })` — месяцы после `currentMonth` ('YYYY-MM') показывают факт и отклонение как «—» (решение founder'а 07.10.2026 по макету), план — как есть
  - `MEASURE_OPTIONS`

- [ ] **Step 1: Общая таблица**

```tsx
// src/app/cfo/ReportTable.tsx
'use client'
import { shortMonth } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'

export type Measure = 'fact' | 'plan' | 'diff'
export const MEASURE_OPTIONS: { value: Measure; label: string }[] = [
  { value: 'fact', label: 'Факт' },
  { value: 'plan', label: 'План' },
  { value: 'diff', label: 'Отклонение' },
]

export type ReportRow = {
  key: string
  label: string
  level: 0 | 1 | 2
  strong: boolean
  toggleKey?: string
  parentKey?: string
  cells: Record<string, { plan: number | null; fact: number }>
  total: { plan: number | null; fact: number }
  higherIsBetter: boolean
}

// Founder 07.10.2026: a month that hasn't happened yet has no fact — show «—»,
// not «0 ₸». The plan of a future month is real and stays visible.
function Value({ cell, measure, higherIsBetter, future }: { cell: { plan: number | null; fact: number }; measure: Measure; higherIsBetter: boolean; future: boolean }) {
  if (future && measure !== 'plan') return <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
  if (measure === 'fact') return <span style={{ color: cell.fact < 0 ? 'var(--nav-critical)' : undefined }}>{formatTenge(cell.fact)}</span>
  if (cell.plan === null) return <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
  if (measure === 'plan') return <span>{formatTenge(cell.plan)}</span>
  const diff = cell.fact - cell.plan
  if (diff === 0) return <span style={{ color: 'var(--nav-text-muted)' }}>0</span>
  const good = higherIsBetter ? diff > 0 : diff < 0
  const pct = cell.plan !== 0 ? Math.round((diff / Math.abs(cell.plan)) * 100) : null
  return (
    <span style={{ color: good ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
      {diff > 0 ? '+' : ''}{formatTenge(diff)}
      {pct !== null && <span className="block text-[11px] opacity-80">{pct > 0 ? '+' : ''}{pct}%</span>}
    </span>
  )
}

export default function ReportTable({ months, rows, measure, collapsed, onToggle, currentMonth }: {
  months: string[]
  rows: ReportRow[]
  measure: Measure
  collapsed: Set<string>
  onToggle: (key: string) => void
  currentMonth: string
}) {
  const visible = rows.filter((r) => !r.parentKey || !collapsed.has(r.parentKey))
  return (
    <div className="nav-glass rounded-2xl overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
            <th className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[240px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
            {months.map((m) => <th key={m} className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ color: 'var(--nav-text-secondary)' }}>{shortMonth(m)}</th>)}
            <th className="px-3 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.key} style={{ borderBottom: '1px solid var(--nav-border-soft)', background: r.strong && r.level === 0 ? 'var(--nav-surface-glass)' : undefined }}>
              <td className="sticky left-0 z-10 px-3 py-2" style={{ background: 'var(--nav-bg)', paddingLeft: `${12 + r.level * 16}px` }}>
                {r.toggleKey ? (
                  <button type="button" onClick={() => onToggle(r.toggleKey!)} aria-expanded={!collapsed.has(r.toggleKey)} className="min-h-[36px] text-left" style={{ color: 'var(--nav-text-primary)', fontWeight: r.strong ? 600 : 400 }}>
                    <span aria-hidden="true" className="inline-block w-4">{collapsed.has(r.toggleKey) ? '▸' : '▾'}</span>{r.label}
                  </button>
                ) : (
                  <span style={{ color: r.level === 2 ? 'var(--nav-text-secondary)' : 'var(--nav-text-primary)', fontWeight: r.strong ? 600 : 400 }}>{r.label}</span>
                )}
              </td>
              {months.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ fontWeight: r.strong ? 600 : 400 }}>
                  <Value cell={r.cells[m]} measure={measure} higherIsBetter={r.higherIsBetter} future={m > currentMonth} />
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                <Value cell={r.total} measure={measure} higherIsBetter={r.higherIsBetter} future={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: БДР**

```tsx
// src/app/cfo/pnl/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { buildPnl, type PnlRow } from '@/lib/cfo/pnl'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'

// Выше — лучше для выручки, прочих (они со знаком) и итогов; для расходов — наоборот.
function higherIsBetter(r: PnlRow): boolean {
  return r.type === 'total' || r.group === 'revenue' || r.group === 'finance'
}

export default function CfoPnl() {
  const { ws } = useCfo()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [measure, setMeasure] = useState<Measure>('fact')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const months = yearMonths(year)

  const rows: ReportRow[] = useMemo(() => buildPnl({ articles: ws.articles, operations: ws.operations, plan: ws.plan, months }).map((r) => ({
    key: r.key,
    label: r.label,
    level: r.type === 'article' ? 1 : 0,
    strong: r.type !== 'article',
    toggleKey: r.type === 'group' ? r.key : undefined,
    parentKey: r.type === 'article' && r.group ? `g:${r.group}` : undefined,
    cells: r.cells,
    total: r.total,
    higherIsBetter: higherIsBetter(r),
  })), [ws, months])

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <CfoPage title="БДР" actions={<><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Доходы и расходы по дате начисления. Кредиты, вложения и вывод денег собственником, покупка оборудования и переводы между счетами сюда не входят — они в БДДС.
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={monthKey(todayIso())} />
    </CfoPage>
  )
}
```

- [ ] **Step 3: БДДС**

```tsx
// src/app/cfo/cashflow/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { buildCashflow, type CashflowRow } from '@/lib/cfo/cashflow'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'

// Остатки, сальдо и итог — чем больше, тем лучше; секция выплат — наоборот.
// Статьи получают направление из своего kind в маппинге ниже.
function higherIsBetter(r: CashflowRow): boolean {
  if (r.type === 'balance' || r.type === 'activity' || r.type === 'total') return true
  return !r.key.endsWith(':out')
}

export default function CfoCashflow() {
  const { ws } = useCfo()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [measure, setMeasure] = useState<Measure>('fact')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const months = yearMonths(year)

  const rows: ReportRow[] = useMemo(() => {
    const raw = buildCashflow({ accounts: ws.accounts, articles: ws.articles, operations: ws.operations, plan: ws.plan, months })
    const kindOf = new Map(ws.articles.map((a) => [a.id, a.kind]))
    return raw.map((r) => {
      const articleKind = r.type === 'article' ? kindOf.get(r.key.slice(2)) : undefined
      return {
        key: r.key,
        label: r.label,
        level: r.type === 'article' ? 2 : r.type === 'section' ? 1 : 0,
        strong: r.type !== 'article',
        toggleKey: r.type === 'activity' ? r.key : undefined,
        parentKey: (r.type === 'section' || r.type === 'article') && r.activity ? `act:${r.activity}` : undefined,
        cells: r.cells,
        total: r.total,
        higherIsBetter: r.type === 'article' ? articleKind === 'income' : higherIsBetter(r),
      }
    })
  }, [ws, months])

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <CfoPage title="БДДС" actions={<><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Деньги по дате оплаты, по видам деятельности. Остатки — по всем счетам и кассам, переводы между ними не считаются ни поступлением, ни выплатой.
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={monthKey(todayIso())} />
    </CfoPage>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/app/cfo/ReportTable.tsx src/app/cfo/pnl/page.tsx src/app/cfo/cashflow/page.tsx
git commit -m "feat(cfo): БДР and БДДС report pages with plan/fact/deviation switch"
```

---

### Task 17: Обзор (дашборд)

**Files:**
- Create: `src/app/cfo/overview/page.tsx`

**Interfaces:**
- Consumes: `useCfo`, `buildDashboard`, `monthKey`, `todayIso`, `shortMonth`, `monthTitle`, `dayLabel`, `opTitle`, `formatTenge`, recharts (`BarChart`, `Bar`, `XAxis`, `Tooltip`, `ResponsiveContainer`).

- [ ] **Step 1: Страница**

```tsx
// src/app/cfo/overview/page.tsx
'use client'
import { useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { accountBalanceAt } from '@/lib/cfo/balances'
import { buildDashboard } from '@/lib/cfo/dashboard'
import { monthKey, todayIso } from '@/lib/cfo/dates'
import { dayLabel, monthTitle, opTitle, shortMonth } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { useCfo } from '../CfoWorkspace'
import { Card, CfoPage, EmptyState, Money, SectionTitle, inputClass, inputStyle } from '../ui'

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="nav-glass rounded-2xl p-4">
      <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: tone === 'bad' ? 'var(--nav-critical)' : tone === 'good' ? 'var(--nav-success)' : 'var(--nav-text-primary)' }}>{value}</div>
      {sub && <div className="mt-1 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{sub}</div>}
    </div>
  )
}

export default function CfoOverview() {
  const { ws } = useCfo()
  const today = todayIso()
  const [month, setMonth] = useState(monthKey(today))
  const d = useMemo(() => buildDashboard({ accounts: ws.accounts, articles: ws.articles, operations: ws.operations, recurrences: ws.recurrences, plan: ws.plan, month, today }), [ws, month, today])

  if (ws.operations.length === 0 && ws.recurrences.length === 0) {
    return (
      <CfoPage title="Обзор">
        <EmptyState title="Добавьте первую операцию" hint="Как только появятся приходы и расходы, здесь будут выручка, прибыль, запас денег и ближайшие платежи." href="/cfo/operations" cta="Перейти к операциям" />
      </CfoPage>
    )
  }

  // Как в утверждённом макете: «план 5 200 000 ₸ · −7%».
  const planNote = (c: { plan: number; fact: number }) => {
    if (!c.plan) return 'плана нет'
    const pct = Math.round(((c.fact - c.plan) / Math.abs(c.plan)) * 100)
    return `план ${formatTenge(c.plan)} · ${pct > 0 ? '+' : ''}${pct}%`
  }
  const actual = ws.operations.filter((o) => o.status === 'actual')
  const byAccount = ws.accounts
    .filter((a) => !a.archived)
    .map((a) => `${a.name} ${formatTenge(accountBalanceAt(a, actual, today))}`)
    .join(' · ')
  const breakeven = d.breakeven.kind === 'ok' ? formatTenge(d.breakeven.value) : d.breakeven.kind === 'unreachable' ? 'не достигается' : '—'
  const breakevenSub = d.breakeven.kind === 'ok' ? 'выручка в месяц, при которой прибыль = 0' : d.breakeven.kind === 'unreachable' ? 'при текущей марже' : 'нет выручки за месяц'
  const maxExpense = d.expenseStructure[0]?.amount ?? 0

  return (
    <CfoPage
      title="Обзор"
      actions={<input type="month" aria-label="Месяц" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
    >
      {d.firstGap && (
        <Card className="!py-3">
          <p className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>
            Кассовый разрыв {dayLabel(d.firstGap)} — по плановым платежам денег не хватит. <a href="/cfo/calendar" className="underline">Открыть календарь</a>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label={`Выручка · ${monthTitle(month)}`} value={formatTenge(d.revenue.fact)} sub={planNote(d.revenue)} />
        <Kpi label="Валовая маржа" value={d.grossMarginPct === null ? '—' : `${Math.round(d.grossMarginPct)}%`} sub="(выручка − себестоимость) ÷ выручка" />
        <Kpi label="Чистая прибыль" value={formatTenge(d.netProfit.fact)} sub={planNote(d.netProfit)} tone={d.netProfit.fact < 0 ? 'bad' : undefined} />
        <Kpi label="Деньги сейчас" value={formatTenge(d.cashNow)} sub={byAccount || 'на всех счетах и в кассах'} tone={d.cashNow < 0 ? 'bad' : undefined} />
        <Kpi label="Запас денег" value={d.runwayDays === null ? '—' : `${d.runwayDays} дн.`} sub={d.runwayDays === null ? 'нет выплат за 90 дней' : 'без новых поступлений, по средним выплатам за 90 дней'} tone={d.runwayDays !== null && d.runwayDays < 30 ? 'bad' : undefined} />
        <Kpi label="Точка безубыточности" value={breakeven} sub={breakevenSub} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <SectionTitle>Доходы и расходы за 12 месяцев</SectionTitle>
          <div className="flex gap-4 text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--nav-success)' }} />Доходы</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--nav-magenta)' }} />Расходы</span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthly.map((x) => ({ name: shortMonth(x.month), income: x.income / 100, expense: x.expense / 100 }))}>
                <XAxis dataKey="name" tick={{ fill: 'var(--nav-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, name) => [formatTenge(Math.round(Number(v) * 100)), name === 'income' ? 'Доходы' : 'Расходы']}
                  contentStyle={{ background: 'var(--nav-surface-chrome)', border: '1px solid var(--nav-border)', borderRadius: 12, color: 'var(--nav-text-primary)' }}
                  cursor={{ fill: 'var(--nav-surface-glass)' }}
                />
                <Bar dataKey="income" fill="var(--nav-success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="var(--nav-magenta)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>Расходы · {monthTitle(month)}</SectionTitle>
          {d.expenseStructure.length === 0 && <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Расходов за месяц нет.</p>}
          <div className="space-y-2">
            {d.expenseStructure.slice(0, 8).map((x) => (
              <div key={x.articleId}>
                <div className="flex justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--nav-text-primary)' }}>{x.name}</span>
                  <span className="tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(x.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--nav-surface-glass)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${maxExpense ? (x.amount / maxExpense) * 100 : 0}%`, background: 'var(--nav-accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Платежи на 7 дней</SectionTitle>
        {d.upcoming.length === 0 && <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Плановых платежей на неделю нет.</p>}
        {d.upcoming.map((op) => (
          <div key={op.id} className="flex items-center gap-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
            <span className="w-28 text-xs" style={{ color: 'var(--nav-text-muted)' }}>{dayLabel(op.paidOn)}</span>
            <span className="flex-1 min-w-[160px] text-sm" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</span>
            {op.direction === 'transfer'
              ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
              : <Money value={op.direction === 'in' ? op.amount : -op.amount} signed className="text-sm font-semibold" />}
          </div>
        ))}
      </Card>
    </CfoPage>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок. Если типизация `Tooltip.formatter` в recharts 3 не принимает кортеж `[value, name]`, вернуть строку значения и подписать серии через `name` у `<Bar name="Доходы" … />` / `<Bar name="Расходы" … />`.

- [ ] **Step 3: Commit**

```bash
git add src/app/cfo/overview/page.tsx
git commit -m "feat(cfo): overview dashboard with KPIs, 12-month chart, expense mix and 7-day payments"
```

---

### Task 18: Сборка, живая проверка, визуальное QA

**Files:**
- Modify: только если проверка нашла дефекты — точечные правки в файлах `src/app/cfo/*` / `src/lib/cfo/*` с перезапуском затронутых тестов.

- [ ] **Step 1: Полный гейт**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: всё зелёное; в выводе сборки есть маршруты `/cfo/overview`, `/cfo/operations`, `/cfo/calendar`, `/cfo/pnl`, `/cfo/cashflow`, `/cfo/plan`, `/cfo/settings` и `/lp/cfo`.

- [ ] **Step 2: Вход под тестовым админом**

Аккаунт `alikhan2505+aitest@gmail.com` (`is_admin = true`, см. память «Temp admin test account»). Ссылку входа получить через service-role `supabase.auth.admin.generateLink({ type: 'magiclink', email })` одноразовым скриптом внутри проекта (env из `.env.local`), открыть `action_link` в Playwright на `http://localhost:3000` (запущенный `npm run dev`). Скрипт удалить после использования.

- [ ] **Step 3: Сквозной сценарий в браузере**

1. `/cfo` → редирект на `/cfo/overview` → мастер «Начнём учёт». Создать «Kaspi Gold», банк, 1 000 000 ₸ на первое число месяца.
2. Настройки: добавить «Касса» (наличные, 50 000). Убедиться, что 25 статей на месте.
3. Операции: приход «Выручка от продажи товаров» 600 000 (факт, сегодня); расход «Закупка товаров и материалов» 250 000; перевод Kaspi → Касса 20 000; плановый расход «Аренда» 300 000 на 25-е, «повторять каждый месяц».
4. Попробовать фактический расход завтрашней датой — ошибка «Будущая дата — отметьте операцию как плановую».
5. Календарь: повтор аренды в будущих месяцах, прогноз остатка; нажать «Оплачено» на ближайшем вхождении — оно уходит из плана и появляется фактом в журнале.
6. План: ввести выручку 700 000 на текущий месяц, в «Год» по аренде 3 600 000 → по 300 000 в каждом месяце.
7. БДР: факт выручки 600 000, валовая 350 000; перевод отсутствует; переключатель «Отклонение» показывает −100 000 по выручке красным.
8. БДДС: остаток на начало + чистый поток = остаток на конец текущего месяца.
9. Обзор: KPI заполнены, график и структура расходов видны.
10. Ворота: в новом контексте браузера без входа `/cfo/overview` → редирект на `/login`. Входить под чужим реальным аккаунтом для проверки «не-админа» нельзя — ветку `!profile?.is_admin → /products` проверяет ревью кода Task 11, а то, что не-админ не видит чужих данных, уже доказано живой проверкой RLS в Task 1.

- [ ] **Step 4: Визуальное QA**

Скриншоты `/cfo/overview`, `/cfo/operations`, `/cfo/calendar`, `/cfo/pnl` в четырёх режимах: светлая и тёмная тема (`emulateMedia({ colorScheme })` без сохранённого `theme`), десктоп 1440×900 и телефон 390×844. Проверить: таблицы на телефоне скроллятся вбок с закреплённой колонкой статей, текст читается в обеих темах, ничего не обрезано, кнопки не ниже 44px.

- [ ] **Step 5: Очистка тестовых данных**

Удалить данные тестового аккаунта: `delete from cfo_companies where user_id = '<aitest id>';` (каскад удалит счета, статьи, операции, правила, план). Подтвердить `select count(*) from cfo_operations where user_id = '<aitest id>'` → `0`.

- [ ] **Step 6: Commit исправлений (если были)**

```bash
git add <только изменённые в этой задаче файлы>
git commit -m "fix(cfo): issues found in end-to-end and visual QA"
```

---

## Self-Review

**Покрытие спеки:**
- Модель данных (компании, счета, статьи с pnl_group/activity, операции с датами оплаты и начисления, повторы, план) — Task 1, 2, 9.
- Стартовые 25 статей — Task 1 (`cfo_bootstrap`).
- Составные FK и RLS без EXISTS — Task 1, проверено живьём в Step 4.
- Остатки, переводы, тело кредита вне БДР, каскад прибыли — Task 4, 6, 7.
- Календарь с горизонтом 90 дней, просрочка, кассовый разрыв — Task 5, 14.
- Дашборд: выручка, маржа, чистая прибыль, деньги сейчас, запас денег, точка безубыточности, 12 месяцев, структура, 7 дней, разрыв — Task 8, 17.
- Экраны 1–7 и порядок меню — Task 10 (меню), 11–17.
- Первый вход (мастер) — Task 11.
- Телефон: горизонтальный скролл с закреплённой колонкой — Task 15, 16, проверка Task 18.
- Поддомен, лендинг invite, adminOnly, без sitemap — Task 10.
- Проверка ввода (включая будущую дату и сдвиг начала учёта) — Task 3, 11, 13.
- Тесты: юнит на все формулы, живая RLS, визуальное QA — Task 2–8, 1, 18.

**Согласованность типов:** `OperationDraft`/`RecurrenceDraft`/`ValidationContext` объявлены в Task 3 и используются в Task 9 и 13 с теми же полями; `Workspace` — Task 9, потребители — Task 11–17; `Cell` из `pnl.ts` используется в `dashboard.ts`; ключи строк отчётов (`g:`, `a:`, `t:`, `b:`, `act:`, `s:`) зафиксированы в Interfaces и используются в страницах Task 16.
