-- Run this in the Supabase SQL editor to add the Team Newsletter feature.
-- Mirrors requirements_briefs.sql's shape and access setup.

create table if not exists team_newsletters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  highlights text,
  upcoming_milestones text,
  shoutouts text,
  links text,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_newsletters_project_id_key
  on team_newsletters (project_id);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table team_newsletters enable row level security;

drop policy if exists "anon full access" on team_newsletters;
create policy "anon full access" on team_newsletters
  for all
  to anon
  using (true)
  with check (true);
