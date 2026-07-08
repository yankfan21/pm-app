-- PHASE 4 of the auth/access-control rollout - THE ACTUAL CUTOVER.
--
-- Run this ONLY after:
--   1. phase1_access_control_schema.sql has been run
--   2. Phase 2's frontend (login page, RequireAuth, etc.) is deployed
--   3. phase3_require_project_owner.sql's backfill + NOT NULL have been done
--
-- After this runs, an unauthenticated request or a request from a user who
-- isn't a project's owner/collaborator returns zero rows (reads) or is
-- rejected (writes) - anon access and the phase1 temporary open-to-anyone-
-- authenticated policy are both removed here, replaced by real per-project
-- policies built on phase1's is_project_owner/has_project_access/
-- can_edit_project helper functions.
--
-- The same 4-policy shape is applied identically to every project-scoped
-- table (view = any project member; insert/update/delete = owner or
-- editor, never a viewer) - projects and project_collaborators are
-- bespoke since neither has a plain project_id column to check the same
-- way every other table does.

-- projects ---------------------------------------------------------------

drop policy if exists "anon full access" on projects;
drop policy if exists "authenticated full access (temporary)" on projects;

create policy "project members can view" on projects
  for select to authenticated
  using (has_project_access(id));

create policy "authenticated users can create projects" on projects
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "project editors can update" on projects
  for update to authenticated
  using (can_edit_project(id))
  with check (can_edit_project(id));

create policy "owner can delete" on projects
  for delete to authenticated
  using (is_project_owner(id));

-- project_collaborators ---------------------------------------------------

drop policy if exists "authenticated full access (temporary)" on project_collaborators;

create policy "project members can view collaborators" on project_collaborators
  for select to authenticated
  using (has_project_access(project_id));

create policy "owner can add collaborators" on project_collaborators
  for insert to authenticated
  with check (is_project_owner(project_id));

create policy "owner can update collaborators" on project_collaborators
  for update to authenticated
  using (is_project_owner(project_id))
  with check (is_project_owner(project_id));

create policy "owner can remove collaborators" on project_collaborators
  for delete to authenticated
  using (is_project_owner(project_id));

-- tasks --------------------------------------------------------------------

drop policy if exists "anon full access" on tasks;
drop policy if exists "authenticated full access (temporary)" on tasks;

create policy "project members can view" on tasks
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on tasks
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on tasks
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on tasks
  for delete to authenticated using (can_edit_project(project_id));

-- charters -------------------------------------------------------------------

drop policy if exists "anon full access" on charters;
drop policy if exists "authenticated full access (temporary)" on charters;

create policy "project members can view" on charters
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on charters
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on charters
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on charters
  for delete to authenticated using (can_edit_project(project_id));

-- requirements_briefs --------------------------------------------------------

drop policy if exists "anon full access" on requirements_briefs;
drop policy if exists "authenticated full access (temporary)" on requirements_briefs;

create policy "project members can view" on requirements_briefs
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on requirements_briefs
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on requirements_briefs
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on requirements_briefs
  for delete to authenticated using (can_edit_project(project_id));

-- risk_logs --------------------------------------------------------------------

drop policy if exists "anon full access" on risk_logs;
drop policy if exists "authenticated full access (temporary)" on risk_logs;

create policy "project members can view" on risk_logs
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on risk_logs
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on risk_logs
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on risk_logs
  for delete to authenticated using (can_edit_project(project_id));

-- exec_comms_plans --------------------------------------------------------------

drop policy if exists "anon full access" on exec_comms_plans;
drop policy if exists "authenticated full access (temporary)" on exec_comms_plans;

create policy "project members can view" on exec_comms_plans
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on exec_comms_plans
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on exec_comms_plans
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on exec_comms_plans
  for delete to authenticated using (can_edit_project(project_id));

-- team_newsletters ---------------------------------------------------------------

drop policy if exists "anon full access" on team_newsletters;
drop policy if exists "authenticated full access (temporary)" on team_newsletters;

create policy "project members can view" on team_newsletters
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on team_newsletters
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on team_newsletters
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on team_newsletters
  for delete to authenticated using (can_edit_project(project_id));

-- budget_trackers ------------------------------------------------------------------

drop policy if exists "anon full access" on budget_trackers;
drop policy if exists "authenticated full access (temporary)" on budget_trackers;

create policy "project members can view" on budget_trackers
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on budget_trackers
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on budget_trackers
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on budget_trackers
  for delete to authenticated using (can_edit_project(project_id));

-- status_updates -----------------------------------------------------------------

drop policy if exists "anon full access" on status_updates;
drop policy if exists "authenticated full access (temporary)" on status_updates;

create policy "project members can view" on status_updates
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on status_updates
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on status_updates
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on status_updates
  for delete to authenticated using (can_edit_project(project_id));

-- document_versions --------------------------------------------------------------

drop policy if exists "anon full access" on document_versions;
drop policy if exists "authenticated full access (temporary)" on document_versions;

create policy "project members can view" on document_versions
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on document_versions
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on document_versions
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on document_versions
  for delete to authenticated using (can_edit_project(project_id));

-- post_mortems ---------------------------------------------------------------------

drop policy if exists "anon full access" on post_mortems;
drop policy if exists "authenticated full access (temporary)" on post_mortems;

create policy "project members can view" on post_mortems
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on post_mortems
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on post_mortems
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on post_mortems
  for delete to authenticated using (can_edit_project(project_id));

-- project_evaluations ----------------------------------------------------------------

drop policy if exists "anon full access" on project_evaluations;
drop policy if exists "authenticated full access (temporary)" on project_evaluations;

create policy "project members can view" on project_evaluations
  for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on project_evaluations
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on project_evaluations
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on project_evaluations
  for delete to authenticated using (can_edit_project(project_id));

-- Sanity check --------------------------------------------------------------------
-- Run this afterward and confirm no "anon" row remains for any of the
-- tables above, and no leftover differently-named permissive policy
-- survives on tasks/charters/projects (they predate the migrations folder,
-- so their original policy name isn't recorded in this repo):
--
--   select tablename, policyname, roles, cmd from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
