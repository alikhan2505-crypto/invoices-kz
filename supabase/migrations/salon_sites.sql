-- Генератор сайтов для салонов красоты: черновики, сгенерированные варианты
-- и опубликованный снимок HTML. Применяется вручную через панель Supabase —
-- см. supabase/migrations/README.md.

create table if not exists public.salon_sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  salon jsonb not null,
  pattern text not null,
  status text not null default 'draft',
  published_variant_id uuid,
  published_html text,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salon_sites_status_check check (status in ('draft', 'published')),
  -- Поддомен собирается как {slug}.invoices.kz, поэтому slug обязан быть
  -- валидной меткой DNS: строчные буквы, цифры и дефис внутри.
  constraint salon_sites_slug_check check (slug ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$'),
  -- Служебные имена заняты самой платформой: отдать их салону — значит
  -- увести на лендинг тех, кто шёл на www или api.
  constraint salon_sites_slug_reserved check (
    slug not in ('www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'invoices', 'shop', 'pay', 'kaspi', 'agent', 'salon', 'docs', 'my', 'wb', 'bot')
  )
);

create table if not exists public.salon_site_variants (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.salon_sites(id) on delete cascade,
  variant_no int not null,
  direction text not null,
  html text not null,
  created_at timestamptz not null default now(),
  unique (site_id, variant_no)
);

create index if not exists salon_site_variants_site_id_idx on public.salon_site_variants (site_id);

-- Читает и пишет только служебная роль: весь доступ идёт через админские
-- маршруты /api/salon-sites, которые сами проверяют profiles.is_admin.
-- RLS включена без единой политики — то есть обычная сессия не видит ничего,
-- а service role проходит мимо RLS.
alter table public.salon_sites enable row level security;
alter table public.salon_site_variants enable row level security;
