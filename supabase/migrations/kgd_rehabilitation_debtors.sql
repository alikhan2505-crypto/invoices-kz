-- 26.10.2026: проверка «реабилитационная процедура» контрагента по списку КГД.
-- У КГД нет поиска по БИН: сервис bankrupt-service/debtors/all отдаёт весь список
-- сразу (около 350 записей, 650 КБ, 17 секунд). Поэтому раз в сутки крон
-- /api/cron/kgd-rehabilitation скачивает список целиком и кладёт сюда, а проверка
-- по БИН читает одну строку по первичному ключу.
--
-- Хранятся только: БИН/ИИН, название, дата вступления решения в силу, регион.
-- Персональные данные из ответа КГД (ФИО администраторов, директоров, учредителей,
-- телефоны, почты) НЕ сохраняются.
--
-- kind:
--   'rehabilitation' - в отношении лица действует реабилитационная процедура
--                      (список debtors/all, procedureType REHABILITATION);
--   'terminated'     - реабилитация прекращена определением суда
--                      (список debtors, courtDecision.status PROCEDURE_TERMINATED).
-- entry_force_date: для 'rehabilitation' дата вступления решения о процедуре в
-- силу (у КГД иногда пусто), для 'terminated' дата вступления в силу определения
-- о прекращении (по Алматы).
--
-- Поза как у остальных служебных таблиц: RLS включён, политик нет, доступ только
-- у service-role. Пока таблицы нет, продукт ведёт себя как раньше: строка
-- «Реабилитация» нигде не показывается. Идемпотентно (можно запускать повторно).
create table if not exists public.kgd_rehabilitation_debtors (
  identifier text primary key,
  kind text not null check (kind in ('rehabilitation', 'terminated')),
  name text,
  entry_force_date date,
  region text,
  fetched_at timestamptz not null default now()
);

-- Проверка свежести берёт самую новую fetched_at по всей таблице.
create index if not exists kgd_rehabilitation_debtors_fetched_at_idx
  on public.kgd_rehabilitation_debtors (fetched_at desc);

alter table public.kgd_rehabilitation_debtors enable row level security;

comment on table public.kgd_rehabilitation_debtors is
  'Суточная выгрузка списка КГД по реабилитационной процедуре (крон /api/cron/kgd-rehabilitation). Только БИН, название, дата, регион; без персональных данных. Доступ только service-role.';
comment on column public.kgd_rehabilitation_debtors.kind is
  'rehabilitation: процедура действует; terminated: прекращена определением суда.';
comment on column public.kgd_rehabilitation_debtors.entry_force_date is
  'Дата вступления решения в силу (для terminated: определения о прекращении, по Алматы). Может быть пустой: у КГД бывает не заполнена.';
comment on column public.kgd_rehabilitation_debtors.fetched_at is
  'Когда строка подтверждена свежей выгрузкой. Строки, которых нет в свежей выгрузке, крон удаляет.';
