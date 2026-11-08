-- 08.11.2026: касса без комиссии 2%. Флаг ставит только админ, прямо в базе, без интерфейса.
-- Пример: касса основателя, через неё по /api/kaspi/pay принимает оплату Qutty kun.
-- Код читает колонку в src/lib/kaspiPay/wallet.ts (isCommissionExempt), поэтому
-- миграцию применять ДО выкладки кода.
alter table public.kaspi_connections
  add column if not exists commission_exempt boolean not null default false;
