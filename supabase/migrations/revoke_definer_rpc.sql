-- 12.10.2026, аудит платформы (применено в два шага: revoke_definer_rpc +
-- revoke_definer_rpc_public). Советник Supabase показал, что три SECURITY
-- DEFINER функции доступны через REST RPC — в том числе анониму, потому что
-- у функций оставался дефолтный грант PUBLIC (=X/postgres):
--  * enforce_invoice_limit() — функция триггера; EXECUTE вызывающего не нужен,
--    права проверяются у владельца при создании триггера;
--  * invoice_limit_for(uuid) — отдавала лимит счетов любого пользователя по id;
--  * is_admin_user(uuid) — authenticated оставляем, её используют 6 RLS-политик
--    (profiles, payment_requests, promo_codes, webhook_logs), которые
--    исполняются с правами запрашивающей роли.
revoke execute on function public.enforce_invoice_limit() from public, anon, authenticated;
revoke execute on function public.invoice_limit_for(uuid) from public, anon, authenticated;
revoke execute on function public.is_admin_user(uuid) from public, anon;
grant execute on function public.is_admin_user(uuid) to authenticated;
-- Итоговые ACL: enforce_invoice_limit / invoice_limit_for — только postgres и
-- service_role; is_admin_user — плюс authenticated.
