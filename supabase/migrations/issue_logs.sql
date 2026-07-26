-- Run this in the Supabase SQL editor to add the Issues Log feature.
--
-- Issues Log is a separate entity from Risk Log (risk_logs.sql) - risks are
-- things that MAY happen, issues are things that DID/ARE happening. No
-- linked_risk_id, no risk-to-issue conversion tracking - deliberately not
-- linked, per product decision.
--
-- Same one-row-per-project/jsonb-array shape as risk_logs: `issues` holds
-- the array of {id, description, priority, owner, status, resolution,
-- resolution_date} objects, edited in place by IssueLogView.jsx.
--
-- Written after Phase 4's full lockdown (phase4_full_lockdown_no_anon.sql)
-- already shipped, so this goes straight to the authenticated-only policy
-- shape every other project_id-scoped table ended up with (view = any
-- project member, insert/update/delete = owner or editor - see that
-- migration's risk_logs section, lines 167-178) instead of the anon-first
-- policy risk_logs.sql originally shipped with and later had to migrate
-- away from. No is_project_unclaimed() carve-out: that helper belonged to
-- an earlier, since-reversed model (the 2026-07-13 anon/unclaimed pivot -
-- see fix_seven_doctypes_update_unclaimed.sql) and was deliberately dropped
-- by phase4_full_lockdown_no_anon.sql:332 ("no is_project_unclaimed()
-- carve-outs anywhere") - it does not exist live.

create table if not exists issue_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  issues jsonb not null default '[]'::jsonb,
  qa_answers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists issue_logs_project_id_key
  on issue_logs (project_id);

alter table issue_logs enable row level security;

drop policy if exists "project members can view" on issue_logs;
drop policy if exists "project editors can insert" on issue_logs;
drop policy if exists "project editors can update" on issue_logs;
drop policy if exists "project editors can delete" on issue_logs;

create policy "project members can view" on issue_logs
  for select to authenticated using (has_project_access(project_id));

create policy "project editors can insert" on issue_logs
  for insert to authenticated with check (can_edit_project(project_id));

create policy "project editors can update" on issue_logs
  for update to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

create policy "project editors can delete" on issue_logs
  for delete to authenticated using (can_edit_project(project_id));
