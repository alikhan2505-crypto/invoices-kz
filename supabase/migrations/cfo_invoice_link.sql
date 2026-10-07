-- CFO ↔ счета invoices.kz (applied 2026-10-07).
-- invoice_id: операция-приход, проведённая из оплаченного счёта; уникальность не
-- даёт провести один счёт дважды. Внешнего ключа нет намеренно: строка всё равно
-- принадлежит владельцу (RLS), а удаление счёта не должно трогать учёт.
alter table public.cfo_operations add column invoice_id uuid;
create unique index cfo_operations_invoice_once on public.cfo_operations (user_id, invoice_id) where invoice_id is not null;
-- Учитывать ли неоплаченные счета как ожидаемые поступления в прогнозе.
alter table public.cfo_companies add column count_invoices boolean not null default true;
