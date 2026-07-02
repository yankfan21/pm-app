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
-- (the anon key talks to Postgres directly), so mirror those tables'
-- effectively-open access rather than leaving inserts/updates blocked.
alter table risk_logs disable row level security;
