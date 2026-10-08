-- CFO (applied 2026-10-08): режим кабинета «бизнес / семейный бюджет» и отметка
-- о пройденном туре. Оба поля владелец меняет сам из браузера.
alter table public.cfo_companies add column mode text not null default 'business' check (mode in ('business','family'));
alter table public.cfo_companies add column tour_done_at timestamptz;
grant update (mode, tour_done_at) on public.cfo_companies to authenticated;
