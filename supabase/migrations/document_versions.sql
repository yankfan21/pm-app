-- Run this in the Supabase SQL editor to add generic document versioning.
--
-- This backs the version history for Exec Comms Plan / Team Newsletter (the
-- first document types to get versioning), but is deliberately generic
-- (doc_type + jsonb content) so other document types can reuse it later
-- without a schema change. The "current" version always lives in the doc
-- type's own table (e.g. exec_comms_plans); a row here is a superseded
-- snapshot, written at the moment a new version is accepted.

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  doc_type text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists document_versions_project_doc_idx
  on document_versions (project_id, doc_type, created_at desc);

-- This app has no per-user auth (the anon key talks to Postgres directly),
-- so grant the anon role full access explicitly via a policy - see
-- supabase/migrations/README.md.
alter table document_versions enable row level security;

drop policy if exists "anon full access" on document_versions;
create policy "anon full access" on document_versions
  for all
  to anon
  using (true)
  with check (true);
