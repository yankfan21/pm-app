-- PHASE 4 (FINAL) - full lockdown, no anonymous access anywhere.
--
-- Supersedes supabase/migrations/phase4_lockdown_rls.sql, which was never
-- fully applied (it stopped partway through on a policy-already-exists
-- collision - see finish_unclaimed_project_access.sql) and whose remaining
-- intent was then overtaken by a different decision: the ~10 migrations
-- dated 2026-07-13 (create_is_project_unclaimed_function.sql,
-- anon_write_unclaimed_tasks_charters.sql, finish_unclaimed_project_access.sql,
-- fix_six_doctypes_unclaimed_access.sql, fix_seven_doctypes_update_unclaimed.sql,
-- fix_project_eval_*.sql, fix_tasks_*_unclaimed.sql,
-- fix_status_updates_delete_unclaimed.sql) made anonymous access to
-- "unclaimed" projects a permanent supported feature instead.
--
-- Decision 2026-07-15: reverse that pivot entirely. Every table below
-- requires an authenticated session with real project membership - no anon
-- role policies anywhere, no is_project_unclaimed() carve-outs anywhere.
-- Run phase4_backfill_named_project_owners.sql FIRST (gives WMS Tower App
-- and Life Dashboard App a real owner before this migration removes the
-- only thing currently making an unowned project reachable).
--
-- owner_id stays NULLABLE. Do not run phase3_require_project_owner.sql's
-- "set not null" - every project other than the two named above is
-- deliberately left owner_id null after this runs (disposable test data, or
-- earmarked for a future reseed-as-demo pass), and that statement would
-- fail immediately against that data. A null-owner project isn't a special
-- case in the policies below - it's simply unreachable, by anyone, because
-- no policy anywhere carves out owner_id is null. That's the intended
-- effect, not a gap.
--
-- Also brings milestones/sprints/sprint_retros into the access-control
-- model for the first time - they were added after phase1
-- (milestones_schema.sql, product_backlog_schema.sql, sprint_retros_schema.sql)
-- and were only ever given the fully-open "anon full access" +
-- "authenticated full access (temporary)" policies every table started
-- with, matching the site's pre-auth "stays open" posture at the time. They
-- were never brought into the owner/editor/viewer model phase4_lockdown_rls.sql
-- defined for the original 12 tables - without this, those three tables
-- would still be wide open to anyone post-cutover regardless of everything
-- else this migration does.
--
-- Every drop/create pair below is idempotent and written to converge to the
-- same end state regardless of which partial prior migration already ran -
-- deliberately not using ALTER POLICY (which requires guessing the current
-- condition correctly first), given this repo's documented history of
-- partial-application surprises on exactly this table set.

-- ── projects ────────────────────────────────────────────────────────────

drop policy if exists "anon full access" on projects;
drop policy if exists "authenticated full access (temporary)" on projects;
drop policy if exists "anyone can view unclaimed projects" on projects;
drop policy if exists "anon can create unowned projects" on projects;
drop policy if exists "authenticated users can claim unowned projects" on projects;
drop policy if exists "project members can view" on projects;
drop policy if exists "authenticated users can create projects" on projects;
drop policy if exists "project editors can update" on projects;
drop policy if exists "owner can delete" on projects;

-- owner_id = auth.uid() is a deliberate, direct fast path ahead of
-- has_project_access(id) - not redundant. has_project_access() re-queries
-- projects/project_collaborators from scratch, and that nested subquery
-- can't reliably see a row's own owner_id from within the same INSERT
-- statement that just wrote it - which is exactly what supabase-js's
-- .insert().select().single() does on every project creation (it sends
-- Prefer: return=representation, so the SELECT policy runs as part of the
-- same statement as the INSERT). Without this direct check, every
-- logged-in user's project creation fails outright - found and fixed
-- 2026-07-15, see fix_projects_select_after_insert.sql for the full
-- writeup. Anonymous project creation never hit this (its own path here,
-- owner_id is null, is a plain column check, no subquery), and it never
-- affected any other table either, since their has_project_access(project_id)
-- always points at a project row that already existed before that
-- statement.
create policy "project members can view" on projects
  for select to authenticated
  using (owner_id = auth.uid() OR has_project_access(id));

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

-- ── project_collaborators ───────────────────────────────────────────────
-- Unaffected by the anon/unclaimed pivot (always owner-gated, no anon
-- policy ever existed here) - included for completeness/idempotency only.

drop policy if exists "authenticated full access (temporary)" on project_collaborators;
drop policy if exists "project members can view collaborators" on project_collaborators;
drop policy if exists "owner can add collaborators" on project_collaborators;
drop policy if exists "owner can update collaborators" on project_collaborators;
drop policy if exists "owner can remove collaborators" on project_collaborators;

create policy "project members can view collaborators" on project_collaborators
  for select to authenticated using (has_project_access(project_id));
create policy "owner can add collaborators" on project_collaborators
  for insert to authenticated with check (is_project_owner(project_id));
create policy "owner can update collaborators" on project_collaborators
  for update to authenticated using (is_project_owner(project_id)) with check (is_project_owner(project_id));
create policy "owner can remove collaborators" on project_collaborators
  for delete to authenticated using (is_project_owner(project_id));

-- ── every plain project_id-scoped table ─────────────────────────────────
-- tasks, charters, requirements_briefs, risk_logs, exec_comms_plans,
-- team_newsletters, budget_trackers, status_updates, document_versions,
-- post_mortems, project_evaluations, milestones, sprints: identical
-- 4-policy shape (view = any project member; insert/update/delete = owner
-- or editor). milestones/sprints get this shape for the first time; the
-- other 11 had it already, just with anon/unclaimed carve-outs layered on
-- top of varying completeness - all removed here.

-- tasks ------------------------------------------------------------------
drop policy if exists "anon full access" on tasks;
drop policy if exists "authenticated full access (temporary)" on tasks;
drop policy if exists "anyone can view tasks on unclaimed projects" on tasks;
drop policy if exists "anyone can create tasks on unclaimed projects" on tasks;
drop policy if exists "anyone can update tasks on unclaimed projects" on tasks;
drop policy if exists "anyone can delete tasks on unclaimed projects" on tasks;
drop policy if exists "authenticated can create tasks on unclaimed projects" on tasks;
drop policy if exists "project members can view" on tasks;
drop policy if exists "project editors can insert" on tasks;
drop policy if exists "project editors can update" on tasks;
drop policy if exists "project editors can delete" on tasks;

create policy "project members can view" on tasks for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on tasks for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on tasks for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on tasks for delete to authenticated using (can_edit_project(project_id));

-- charters -----------------------------------------------------------------
drop policy if exists "anon full access" on charters;
drop policy if exists "authenticated full access (temporary)" on charters;
drop policy if exists "anyone can view charters on unclaimed projects" on charters;
drop policy if exists "anyone can create charters on unclaimed projects" on charters;
drop policy if exists "anyone can update charters on unclaimed projects" on charters;
drop policy if exists "anyone can delete charters on unclaimed projects" on charters;
drop policy if exists "project members can view" on charters;
drop policy if exists "project editors can insert" on charters;
drop policy if exists "project editors can update" on charters;
drop policy if exists "project editors can delete" on charters;

create policy "project members can view" on charters for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on charters for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on charters for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on charters for delete to authenticated using (can_edit_project(project_id));

-- requirements_briefs -------------------------------------------------------
drop policy if exists "anon full access" on requirements_briefs;
drop policy if exists "authenticated full access (temporary)" on requirements_briefs;
drop policy if exists "project members can view" on requirements_briefs;
drop policy if exists "project editors can insert" on requirements_briefs;
drop policy if exists "project editors can update" on requirements_briefs;
drop policy if exists "project editors can delete" on requirements_briefs;

create policy "project members can view" on requirements_briefs for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on requirements_briefs for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on requirements_briefs for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on requirements_briefs for delete to authenticated using (can_edit_project(project_id));

-- risk_logs ------------------------------------------------------------------
drop policy if exists "anon full access" on risk_logs;
drop policy if exists "authenticated full access (temporary)" on risk_logs;
drop policy if exists "project members can view" on risk_logs;
drop policy if exists "project editors can insert" on risk_logs;
drop policy if exists "project editors can update" on risk_logs;
drop policy if exists "project editors can delete" on risk_logs;

create policy "project members can view" on risk_logs for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on risk_logs for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on risk_logs for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on risk_logs for delete to authenticated using (can_edit_project(project_id));

-- exec_comms_plans ------------------------------------------------------------
drop policy if exists "anon full access" on exec_comms_plans;
drop policy if exists "authenticated full access (temporary)" on exec_comms_plans;
drop policy if exists "project members can view" on exec_comms_plans;
drop policy if exists "project editors can insert" on exec_comms_plans;
drop policy if exists "project editors can update" on exec_comms_plans;
drop policy if exists "project editors can delete" on exec_comms_plans;

create policy "project members can view" on exec_comms_plans for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on exec_comms_plans for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on exec_comms_plans for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on exec_comms_plans for delete to authenticated using (can_edit_project(project_id));

-- team_newsletters ---------------------------------------------------------------
drop policy if exists "anon full access" on team_newsletters;
drop policy if exists "authenticated full access (temporary)" on team_newsletters;
drop policy if exists "project members can view" on team_newsletters;
drop policy if exists "project editors can insert" on team_newsletters;
drop policy if exists "project editors can update" on team_newsletters;
drop policy if exists "project editors can delete" on team_newsletters;

create policy "project members can view" on team_newsletters for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on team_newsletters for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on team_newsletters for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on team_newsletters for delete to authenticated using (can_edit_project(project_id));

-- budget_trackers ------------------------------------------------------------------
drop policy if exists "anon full access" on budget_trackers;
drop policy if exists "authenticated full access (temporary)" on budget_trackers;
drop policy if exists "project members can view" on budget_trackers;
drop policy if exists "project editors can insert" on budget_trackers;
drop policy if exists "project editors can update" on budget_trackers;
drop policy if exists "project editors can delete" on budget_trackers;

create policy "project members can view" on budget_trackers for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on budget_trackers for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on budget_trackers for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on budget_trackers for delete to authenticated using (can_edit_project(project_id));

-- status_updates -----------------------------------------------------------------
drop policy if exists "anon full access" on status_updates;
drop policy if exists "authenticated full access (temporary)" on status_updates;
drop policy if exists "project members can view" on status_updates;
drop policy if exists "project editors can insert" on status_updates;
drop policy if exists "project editors can update" on status_updates;
drop policy if exists "project editors can delete" on status_updates;

create policy "project members can view" on status_updates for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on status_updates for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on status_updates for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on status_updates for delete to authenticated using (can_edit_project(project_id));

-- document_versions --------------------------------------------------------------
drop policy if exists "anon full access" on document_versions;
drop policy if exists "authenticated full access (temporary)" on document_versions;
drop policy if exists "project members can view" on document_versions;
drop policy if exists "project editors can insert" on document_versions;
drop policy if exists "project editors can update" on document_versions;
drop policy if exists "project editors can delete" on document_versions;

create policy "project members can view" on document_versions for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on document_versions for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on document_versions for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on document_versions for delete to authenticated using (can_edit_project(project_id));

-- post_mortems ---------------------------------------------------------------------
drop policy if exists "anon full access" on post_mortems;
drop policy if exists "authenticated full access (temporary)" on post_mortems;
drop policy if exists "project members can view" on post_mortems;
drop policy if exists "project editors can insert" on post_mortems;
drop policy if exists "project editors can update" on post_mortems;
drop policy if exists "project editors can delete" on post_mortems;

create policy "project members can view" on post_mortems for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on post_mortems for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on post_mortems for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on post_mortems for delete to authenticated using (can_edit_project(project_id));

-- project_evaluations ----------------------------------------------------------------
drop policy if exists "anon full access" on project_evaluations;
drop policy if exists "authenticated full access (temporary)" on project_evaluations;
drop policy if exists "anyone can view evaluations on unclaimed projects" on project_evaluations;
drop policy if exists "project members can view" on project_evaluations;
drop policy if exists "project editors can insert" on project_evaluations;
drop policy if exists "project editors can update" on project_evaluations;
drop policy if exists "project editors can delete" on project_evaluations;

create policy "project members can view" on project_evaluations for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on project_evaluations for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on project_evaluations for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on project_evaluations for delete to authenticated using (can_edit_project(project_id));

-- milestones -------------------------------------------------------------------------
-- First time this table gets the real model - previously wide open to
-- anon + authenticated (milestones_schema.sql, reasserted by
-- fix_milestones_anon_insert_policy.sql).
drop policy if exists "anon full access" on milestones;
drop policy if exists "authenticated full access (temporary)" on milestones;
drop policy if exists "project members can view" on milestones;
drop policy if exists "project editors can insert" on milestones;
drop policy if exists "project editors can update" on milestones;
drop policy if exists "project editors can delete" on milestones;

create policy "project members can view" on milestones for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on milestones for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on milestones for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on milestones for delete to authenticated using (can_edit_project(project_id));

-- sprints ----------------------------------------------------------------------------
-- Same as milestones: first time this table gets the real model
-- (product_backlog_schema.sql only ever gave it the wide-open policies).
drop policy if exists "anon full access" on sprints;
drop policy if exists "authenticated full access (temporary)" on sprints;
drop policy if exists "project members can view" on sprints;
drop policy if exists "project editors can insert" on sprints;
drop policy if exists "project editors can update" on sprints;
drop policy if exists "project editors can delete" on sprints;

create policy "project members can view" on sprints for select to authenticated using (has_project_access(project_id));
create policy "project editors can insert" on sprints for insert to authenticated with check (can_edit_project(project_id));
create policy "project editors can update" on sprints for update to authenticated using (can_edit_project(project_id)) with check (can_edit_project(project_id));
create policy "project editors can delete" on sprints for delete to authenticated using (can_edit_project(project_id));

-- sprint_retros ------------------------------------------------------------------------
-- Bespoke: this table has no project_id column, only sprint_id - resolve to
-- the owning project via a subquery against sprints on every check, same
-- has_project_access/can_edit_project helpers as everywhere else.
drop policy if exists "anon full access" on sprint_retros;
drop policy if exists "authenticated full access (temporary)" on sprint_retros;
drop policy if exists "project members can view" on sprint_retros;
drop policy if exists "project editors can insert" on sprint_retros;
drop policy if exists "project editors can update" on sprint_retros;
drop policy if exists "project editors can delete" on sprint_retros;

create policy "project members can view" on sprint_retros
  for select to authenticated
  using (has_project_access((select s.project_id from sprints s where s.id = sprint_retros.sprint_id)));
create policy "project editors can insert" on sprint_retros
  for insert to authenticated
  with check (can_edit_project((select s.project_id from sprints s where s.id = sprint_retros.sprint_id)));
create policy "project editors can update" on sprint_retros
  for update to authenticated
  using (can_edit_project((select s.project_id from sprints s where s.id = sprint_retros.sprint_id)))
  with check (can_edit_project((select s.project_id from sprints s where s.id = sprint_retros.sprint_id)));
create policy "project editors can delete" on sprint_retros
  for delete to authenticated
  using (can_edit_project((select s.project_id from sprints s where s.id = sprint_retros.sprint_id)));

-- ── cleanup: drop the now-unused unclaimed-project helper ───────────────
-- Safe only after every policy referencing it above has been dropped/
-- replaced, which is guaranteed by the ordering of this file.

drop function if exists public.is_project_unclaimed(uuid);

-- Sanity check -------------------------------------------------------------
-- Run this afterward and confirm:
--   (a) zero rows with roles = '{anon}' anywhere in the list
--   (b) zero rows with qual or with_check mentioning is_project_unclaimed
--   (c) every project-scoped table has exactly 4 rows (select/insert/update/delete)
--
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, cmd;
