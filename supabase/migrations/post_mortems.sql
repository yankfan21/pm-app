-- Run this in the Supabase SQL editor to add the Post-Mortem feature.
-- Mirrors charters.sql's shape and access setup.

create table if not exists post_mortems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  objectives_met text,
  what_went_well text,
  variances text,
  root_causes text,
  lessons_learned text,
  recommendations text,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists post_mortems_project_id_key
  on post_mortems (project_id);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table post_mortems enable row level security;

drop policy if exists "anon full access" on post_mortems;
create policy "anon full access" on post_mortems
  for all
  to anon
  using (true)
  with check (true);
