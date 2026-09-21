-- Products connected to an account (stage 1 of the "menu shows only what you
-- use" step of the product split, 21.09.2026). Replaces the browser-only
-- localStorage choice, which did not follow the person across subdomains.
-- NULL = not chosen yet (the app shows everything, as before).
-- Values: invoices, kaspiShop, kaspiApi, aiAgent, salon (wildberries is locked).
-- A preference, not an entitlement: plans and admin rights are checked elsewhere.
alter table public.profiles add column if not exists enabled_products text[];

-- Existing accounts keep what they actually used; admins keep everything.
update public.profiles p set enabled_products = (
  select coalesce(nullif(array_remove(array[
    case when exists (select 1 from public.invoices i where i.user_id = p.id) then 'invoices' end,
    case when exists (select 1 from public.kaspi_connections c where c.user_id = p.id)
           or exists (select 1 from public.kaspi_payment_requests r where r.user_id = p.id) then 'kaspiApi' end,
    case when exists (select 1 from public.kaspi_shop_connections s where s.user_id = p.id) then 'kaspiShop' end,
    case when exists (select 1 from public.ai_agents a where a.user_id = p.id) then 'aiAgent' end,
    case when exists (select 1 from public.salon_sites w where w.created_by = p.id) then 'salon' end
  ], null), '{}'::text[]), array['invoices'])
) where p.enabled_products is null and coalesce(p.is_admin, false) = false;

update public.profiles set enabled_products = array['invoices','kaspiShop','kaspiApi','aiAgent','salon']
where enabled_products is null and coalesce(is_admin, false) = true;
