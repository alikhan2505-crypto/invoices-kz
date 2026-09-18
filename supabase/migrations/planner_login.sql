alter table public.salon_sites
  add column owner_profile_id uuid references public.profiles(id);

create table public.planner_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references public.salon_sites(id),
  status text not null default 'pending' check (status in ('pending','confirmed')),
  owner_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index planner_sessions_code_idx on public.planner_sessions (code);
alter table public.planner_sessions enable row level security;
