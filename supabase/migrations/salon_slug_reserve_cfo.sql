-- cfo — поддомен кабинета CFO: салону такой slug не выдаём (applied 2026-10-08).
alter table public.salon_sites drop constraint salon_sites_slug_reserved;
alter table public.salon_sites add constraint salon_sites_slug_reserved check (slug not in ('www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'invoices', 'shop', 'pay', 'kaspi', 'agent', 'salon', 'docs', 'my', 'wb', 'bot', 'cfo'));
