alter table public.print_orders add column ring_size text not null default 'M' check (ring_size in ('S','M','L'));
