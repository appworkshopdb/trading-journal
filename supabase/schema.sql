-- =====================================================================
--  Trading Journal – Supabase-Schema
--  Ausführen im Supabase Dashboard: SQL Editor -> New query -> Run
--  Idempotent: kann mehrfach ausgeführt werden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabellen
-- ---------------------------------------------------------------------

-- Ein Eintrag pro Kalendertag: Gewinn/Verlust, Notiz, Tags, Bildverweise
create table if not exists public.day_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  pnl         numeric(14,2),                 -- null = kein Ergebnis eingetragen
  note        text not null default '',
  note_color  text,                          -- Farb-ID der Notiz: blau|orange|lila|gelb|pink|grau
  tags        text[] not null default '{}',
  images      jsonb not null default '[]',   -- [{ "id": "...", "path": "<user_id>/<date>/<file>", "name": "..." }]
  fields      jsonb not null default '[]',   -- Auswertung des Tages: [{ "id": "...", "value": "...", "label": "..." }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- Freie Notizen (Strategien, Regeln, Erkenntnisse)
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Checklisten mit Punkten als JSON
create table if not exists public.checklists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  items       jsonb not null default '[]',   -- [{ "id": "...", "text": "...", "done": false }]
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Nachrüsten für bereits bestehende Projekte (create table if not exists ergänzt keine Spalten):
alter table public.day_entries add column if not exists note_color text;
alter table public.day_entries add column if not exists fields jsonb not null default '[]';

create index if not exists day_entries_user_date_idx on public.day_entries (user_id, date);
create index if not exists notes_user_updated_idx    on public.notes (user_id, updated_at desc);
create index if not exists checklists_user_pos_idx   on public.checklists (user_id, position);

-- ---------------------------------------------------------------------
-- 2) Row Level Security: jeder sieht/ändert nur eigene Zeilen
-- ---------------------------------------------------------------------

alter table public.day_entries enable row level security;
alter table public.notes       enable row level security;
alter table public.checklists  enable row level security;

drop policy if exists "own day_entries" on public.day_entries;
create policy "own day_entries" on public.day_entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own checklists" on public.checklists;
create policy "own checklists" on public.checklists
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3) Storage: privater Bucket "screenshots"
--    Pfadschema: <user_id>/<YYYY-MM-DD>/<datei>  -> erster Ordner = Besitzer
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 10485760, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "screenshots select own" on storage.objects;
create policy "screenshots select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "screenshots insert own" on storage.objects;
create policy "screenshots insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "screenshots update own" on storage.objects;
create policy "screenshots update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "screenshots delete own" on storage.objects;
create policy "screenshots delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 4) Fertig. Danach im Dashboard:
--    Authentication -> Users -> "Add user" (E-Mail + Passwort, Auto Confirm an)
--    Authentication -> Providers -> Email -> "Allow new users to sign up" AUS
-- ---------------------------------------------------------------------
