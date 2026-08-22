-- Run this in the Supabase SQL editor to add the Scoping step (guided
-- project-creation wizard, runs before Charter).

create table if not exists scopings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  qa_answers jsonb not null,
  sufficient boolean,
  created_at timestamptz not null default now()
);

-- One row per project, same as charters/risk_logs - the wizard inserts once
-- and nothing currently re-generates a Scoping in place.
create unique index if not exists scopings_project_id_key
  on scopings (project_id);

-- Same 4-policy shape as risk_logs post phase4_full_lockdown_no_anon.sql:
-- any project member can view, only an owner/editor can insert/update/delete.
-- has_project_access()/can_edit_project() are defined in the phase1/phase4
-- migrations already applied to this project.
alter table scopings enable row level security;

create policy "project members can view" on scopings
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on scopings
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on scopings
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on scopings
  for delete to authenticated using (can_edit_project(project_id));
