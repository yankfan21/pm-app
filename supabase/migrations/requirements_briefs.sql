-- Run this in the Supabase SQL editor to add the Requirements/Discovery Brief feature.
-- Mirrors the existing `charters` table's shape and access setup - if your `charters`
-- table has RLS policies enabled, apply the equivalent policies here too.

create table if not exists requirements_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  problem_statement text,
  objectives text,
  scope_in text,
  scope_out text,
  functional_requirements text,
  constraints text,
  assumptions text,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists requirements_briefs_project_id_key
  on requirements_briefs (project_id);

-- This Supabase project auto-enables RLS (deny-all) on new tables, unlike
-- `charters`/`projects`/`tasks` which predate that setting. This app has no
-- per-user auth (the anon key talks to Postgres directly), so mirror those
-- tables' effectively-open access rather than leaving inserts/updates blocked.
alter table requirements_briefs disable row level security;
