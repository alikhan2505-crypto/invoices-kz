-- supabase/migrations/print_orders.sql
create table public.print_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  font text not null,
  text text not null,
  ring_at_end boolean not null default false,
  base_color text not null,
  text_color text not null,
  size text not null check (size in ('S','M','L')),
  price int not null,
  customer_name text not null,
  customer_phone text not null,
  note text,
  kaspi_payment_request_id uuid,
  base_stl_path text,
  text_stl_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.print_orders enable row level security;

alter table public.kaspi_payment_requests add column print_order_id uuid;
create unique index kaspi_payment_requests_print_order_pending_idx
  on public.kaspi_payment_requests (print_order_id)
  where (status = 'pending' and print_order_id is not null);

insert into storage.buckets (id, name, public)
values ('print-orders', 'print-orders', true)
on conflict (id) do nothing;
