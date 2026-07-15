-- SUPERSEDED as of 2026-07-15 - DO NOT RUN THIS.
--
-- This file was never fully applied (stopped partway through on a
-- policy-already-exists collision - see finish_unclaimed_project_access.sql)
-- and the anon/is_project_unclaimed carve-out model it was extended with
-- afterward (across ~10 migrations dated 2026-07-13) has since been
-- reversed. Use phase4_backfill_named_project_owners.sql followed by
-- phase4_full_lockdown_no_anon.sql instead - that pair removes every anon
-- policy and is_project_unclaimed() carve-out below, and additionally
-- covers milestones/sprints/sprint_retros, which this file never touched.
--
-- Kept for history only. Original description follows.
--
-- PHASE 4 of the auth/access-control rollout - THE ACTUAL CUTOVER.
--
-- Run this ONLY after:
--   1. phase1_access_control_schema.sql has been run
--   2. Phase 2's frontend (login page, RequireAuth, etc.) is deployed
--   3. phase3_require_project_owner.sql's backfill + NOT NULL have been done
--      - SUPERSEDED as of 2026-07-13, see that file - do NOT run it.
--        owner_id must stay nullable permanently now that anonymous
--        project creation is a supported, ongoing feature, not just
--        pre-rollout legacy data. The projects policies below were
--        written assuming owner_id can be null indefinitely.
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
--
-- projects is further bespoke on top of that: owner_id is nullable (see
-- above), and anonymous project creation must keep working permanently,
-- so projects gets extra anon policies and a narrow "claim" update policy
-- that no other table in this migration has. Confirmed against live data
-- on 2026-07-13: 16 of 19 existing projects currently have owner_id null
-- (phase3 was never run) - without the anon/owner_id-is-null carve-outs
-- below, all 16 would become completely unreadable and unclaimable the
-- moment this migration runs, not just future anon-created ones.
--
-- That same owner_id-is-null carve-out has to reach every other
-- project-scoped table's SELECT policy too, or logged-in users hit a
-- silent-empty-result trap on real data: found 2026-07-13 testing against
-- WMS Tower App (project_id 46fb50a1-916b-4a20-9a15-5a15c952a750, owner_id
-- null, 20+ real tasks) - has_project_access(project_id) alone is false
-- for an ownerless project (no owner, no collaborator row can exist
-- either, since only an owner can add one), so a logged-in user's tasks
-- query returned zero rows despite the data being intact. is_project_unclaimed()
-- below is the reusable version of the inline "owner_id is null" check
-- projects' own policy uses directly - projects doesn't need the helper
-- since it's already querying itself, but every other table needs to
-- join back to projects to ask the same question, hence a function
-- instead of repeating the same subquery in every table's policy.
-- Applied so far to tasks and charters only (2026-07-13) - the same gap
-- likely exists on every other project-scoped table below
-- (requirements_briefs, risk_logs, exec_comms_plans, team_newsletters,
-- budget_trackers, status_updates, document_versions, post_mortems,
-- project_evaluations all currently only use has_project_access(project_id)
-- with no ownerless-project carve-out) - not fixed here since it wasn't
-- confirmed against real hidden data the way tasks/charters were, but
-- worth auditing before this migration ships.

create or replace function public.is_project_unclaimed(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects where id = p_project_id and owner_id is null
  );
$$;

grant execute on function public.is_project_unclaimed(uuid) to authenticated;

-- projects ---------------------------------------------------------------

drop policy if exists "anon full access" on projects;
drop policy if exists "authenticated full access (temporary)" on projects;

create policy "project members can view" on projects
  for select to authenticated
  using (has_project_access(id) or owner_id is null);

-- Anonymous visitors need to be able to see unclaimed projects too -
-- both ones they just created (owner_id is null right after an anon
-- insert - there's no auth.uid() to have set) and any other project
-- still sitting unclaimed, including the 16 pre-existing rows above.
create policy "anyone can view unclaimed projects" on projects
  for select to anon
  using (owner_id is null);

create policy "authenticated users can create projects" on projects
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Anonymous project creation is a permanent, supported feature (not
-- legacy/temporary) - decided 2026-07-13. Scoped tightly to owner_id is
-- null so anon can never set owner_id to someone else's id.
create policy "anon can create unowned projects" on projects
  for insert to anon
  with check (owner_id is null);

create policy "project editors can update" on projects
  for update to authenticated
  using (can_edit_project(id))
  with check (can_edit_project(id));

-- Additive, not a replacement for the policy above: lets any logged-in
-- user claim an unowned project by setting themselves as owner. Only
-- applies while owner_id is currently null (using clause) and only
-- allows setting it to the claimant's own id (with check) - never
-- loosens access to a project that already has an owner, and can't be
-- used to reassign an already-claimed project to someone else.
create policy "authenticated users can claim unowned projects" on projects
  for update to authenticated
  using (owner_id is null)
  with check (owner_id = auth.uid());

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
  for select to authenticated using (has_project_access(project_id) or is_project_unclaimed(project_id));
create policy "project editors can insert" on tasks
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on tasks
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on tasks
  for delete to authenticated using (can_edit_project(project_id));

-- Deliberate risk-accepted decision, 2026-07-13: unclaimed projects
-- (owner_id is null) are fully open to anon on tasks/charters specifically
-- - view AND write, no account needed - while claimed projects stay fully
-- private via the authenticated-only policies above. Scoped tightly to
-- is_project_unclaimed(project_id): the instant a project's owner_id gets
-- set (via the "claim" policy on projects), that function starts
-- returning false for it and all 4 of these policies stop applying to it
-- automatically - no per-project cleanup needed. Deliberately not
-- extended to any other table or to the authenticated policies above.
create policy "anyone can view tasks on unclaimed projects" on tasks
  for select to anon
  using (is_project_unclaimed(project_id));
create policy "anyone can create tasks on unclaimed projects" on tasks
  for insert to anon
  with check (is_project_unclaimed(project_id));
create policy "anyone can update tasks on unclaimed projects" on tasks
  for update to anon
  using (is_project_unclaimed(project_id))
  with check (is_project_unclaimed(project_id));
create policy "anyone can delete tasks on unclaimed projects" on tasks
  for delete to anon
  using (is_project_unclaimed(project_id));

-- charters -------------------------------------------------------------------

drop policy if exists "anon full access" on charters;
drop policy if exists "authenticated full access (temporary)" on charters;

create policy "project members can view" on charters
  for select to authenticated using (has_project_access(project_id) or is_project_unclaimed(project_id));
create policy "project editors can insert" on charters
  for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on charters
  for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on charters
  for delete to authenticated using (can_edit_project(project_id));

-- Same deliberate risk-accepted decision as tasks above, same reasoning.
create policy "anyone can view charters on unclaimed projects" on charters
  for select to anon
  using (is_project_unclaimed(project_id));
create policy "anyone can create charters on unclaimed projects" on charters
  for insert to anon
  with check (is_project_unclaimed(project_id));
create policy "anyone can update charters on unclaimed projects" on charters
  for update to anon
  using (is_project_unclaimed(project_id))
  with check (is_project_unclaimed(project_id));
create policy "anyone can delete charters on unclaimed projects" on charters
  for delete to anon
  using (is_project_unclaimed(project_id));

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
