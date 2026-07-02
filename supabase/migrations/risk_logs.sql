-- Run this in the Supabase SQL editor to add the Risk Log feature.

create table if not exists risk_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  risks jsonb not null default '[]'::jsonb,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists risk_logs_project_id_key
  on risk_logs (project_id);

-- This Supabase project auto-enables RLS (deny-all) on new tables, unlike
-- the older charters/projects/tasks tables. This app has no per-user auth
-- (the anon key talks to Postgres directly), so grant the anon role full
-- access explicitly via a policy, rather than trying to disable RLS - a
-- plain `disable row level security` here has twice failed to actually
-- stick (see supabase/migrations/README.md).
alter table risk_logs enable row level security;

drop policy if exists "anon full access" on risk_logs;
create policy "anon full access" on risk_logs
  for all
  to anon
  using (true)
  with check (true);
