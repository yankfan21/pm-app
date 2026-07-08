-- Run this in the Supabase SQL editor to add the Evaluate Project feature.
--
-- Like status_updates, this is a repeatable dated log (many rows per
-- project, no unique index on project_id) rather than the usual
-- one-row-per-project document shape - each evaluation is an immutable,
-- timestamped diagnostic snapshot, not something the PM edits, so there's
-- no qa_answers or updated_at either.

create table if not exists project_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  health_status text not null,
  rationale text,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table project_evaluations enable row level security;

drop policy if exists "anon full access" on project_evaluations;
create policy "anon full access" on project_evaluations
  for all
  to anon
  using (true)
  with check (true);
