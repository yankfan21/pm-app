-- Run this in the Supabase SQL editor to add the Exec Comms Plan feature.
-- Mirrors requirements_briefs.sql's shape and access setup.

create table if not exists exec_comms_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status_summary text,
  key_decisions text,
  risks_blockers text,
  ask text,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists exec_comms_plans_project_id_key
  on exec_comms_plans (project_id);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table exec_comms_plans enable row level security;

drop policy if exists "anon full access" on exec_comms_plans;
create policy "anon full access" on exec_comms_plans
  for all
  to anon
  using (true)
  with check (true);
