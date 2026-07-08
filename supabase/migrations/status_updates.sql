-- Run this in the Supabase SQL editor to add the Status Update feature.
--
-- Unlike the other per-project document tables, this is a repeatable dated
-- log: many rows per project, no unique index on project_id, and no
-- qa_answers (it's a plain PM-authored form, not an AI Q&A intake).

create table if not exists status_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  what_got_done text,
  whats_blocked text,
  whats_coming_up text,
  created_at timestamptz not null default now()
);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table status_updates enable row level security;

drop policy if exists "anon full access" on status_updates;
create policy "anon full access" on status_updates
  for all
  to anon
  using (true)
  with check (true);
