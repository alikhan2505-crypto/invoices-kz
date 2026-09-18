alter table public.ai_agents
  add column salon_site_id uuid references public.salon_sites(id);

create table public.salon_bookings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.salon_sites(id),
  master_name text,
  service_name text not null,
  client_name text,
  client_phone text,
  starts_at timestamptz not null,
  duration_minutes int,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  conversation_id uuid references public.ai_agent_conversations(id),
  source text not null default 'manual' check (source in ('ai_draft','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index salon_bookings_site_starts_idx on public.salon_bookings (site_id, starts_at);

create table public.ai_agent_booking_drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id),
  conversation_id uuid not null references public.ai_agent_conversations(id),
  site_id uuid not null references public.salon_sites(id),
  service_name text not null,
  master_name text,
  starts_at timestamptz not null,
  duration_minutes int,
  customer_name text,
  customer_phone text,
  notes text,
  status text not null default 'pending_approval' check (status in ('pending_approval','confirming','confirmed','rejected','error')),
  error_message text,
  booking_id uuid references public.salon_bookings(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_agent_booking_drafts_site_idx on public.ai_agent_booking_drafts (site_id, status);

alter table public.salon_bookings enable row level security;
alter table public.ai_agent_booking_drafts enable row level security;
