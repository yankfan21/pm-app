-- Extends the same is_project_unclaimed(project_id) carve-out already
-- applied to tasks/charters/project_evaluations to the 6 remaining
-- project-scoped document tables, which have the identical bug: confirmed
-- via live query on 2026-07-13 that each of these has exactly 4
-- authenticated-only policies (SELECT via has_project_access, INSERT/
-- UPDATE/DELETE via can_edit_project) and zero anon policies - so on an
-- unclaimed project (owner_id is null), a logged-in user's INSERT is
-- rejected outright (can_edit_project requires ownership/collaborator
-- membership, which nobody has pre-claim), and even where INSERT might
-- otherwise succeed, Supabase's .insert().select().single() pattern's
-- automatic SELECT-back fails too, since the SELECT policy has the same
-- ownership requirement - exactly the two-part failure diagnosed and
-- fixed on project_evaluations earlier today.
--
-- Tables: budget_trackers, exec_comms_plans, requirements_briefs,
-- risk_logs, status_updates, team_newsletters.
--
-- Scope, deliberately matching the project_evaluations fix exactly:
--   - SELECT (authenticated "project members can view"): extended with
--     OR is_project_unclaimed(project_id).
--   - INSERT (authenticated "project editors can insert"): extended with
--     OR is_project_unclaimed(project_id).
--   - UPDATE/DELETE: untouched, still can_edit_project(project_id) only -
--     editing/deleting an existing record stays owner-only; only creating
--     a new one and viewing needs to work pre-claim.
--   - No anon policies added on any of these 6 tables - that's a
--     separate, not-yet-made decision (like the public-write model given
--     to tasks/charters), out of scope for this pass.

-- budget_trackers ---------------------------------------------------------

alter policy "project members can view" on budget_trackers
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on budget_trackers
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- exec_comms_plans ---------------------------------------------------------

alter policy "project members can view" on exec_comms_plans
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on exec_comms_plans
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- requirements_briefs -------------------------------------------------------

alter policy "project members can view" on requirements_briefs
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on requirements_briefs
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- risk_logs -----------------------------------------------------------------

alter policy "project members can view" on risk_logs
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on risk_logs
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- status_updates -------------------------------------------------------------

alter policy "project members can view" on status_updates
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on status_updates
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- team_newsletters -------------------------------------------------------------

alter policy "project members can view" on team_newsletters
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can insert" on team_newsletters
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward - expect 12 rows, one SELECT and one INSERT per table,
-- each with both has_project_access/can_edit_project AND
-- is_project_unclaimed in the qual/with_check text; UPDATE/DELETE rows for
-- these same 6 tables should show unchanged, ownership-only conditions:
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in (
--     'budget_trackers', 'exec_comms_plans', 'requirements_briefs',
--     'risk_logs', 'status_updates', 'team_newsletters'
--   )
--   order by tablename, cmd;
