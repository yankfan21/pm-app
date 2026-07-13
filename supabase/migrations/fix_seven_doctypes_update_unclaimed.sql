-- Same reversal as fix_tasks_update_unclaimed.sql, extended to the 7
-- remaining tables confirmed to have the identical gap: "project editors
-- can update" was left can_edit_project-only (no is_project_unclaimed
-- carve-out), while SELECT/INSERT already have it - so editing an existing
-- Charter/Requirements Brief/Risk Log/Budget Tracker/Exec Comms Plan/Team
-- Newsletter/Post-Mortem hard-crashes with PostgREST's "Cannot coerce the
-- result to a single JSON object" on an unclaimed project, same as tasks
-- did: the blocked UPDATE matches 0 rows, and the chained .select().single()
-- throws on the empty result.
--
-- Tables: charters, requirements_briefs, risk_logs, budget_trackers,
-- exec_comms_plans, team_newsletters, post_mortems.
--
-- Scope: UPDATE only. DELETE on these 7 tables has the identical gap (same
-- can_edit_project-only policy, no carve-out - confirmed on all 7) but is
-- left untouched here, same as tasks DELETE was handled as its own explicit
-- step rather than bundled into the UPDATE fix.

alter policy "project editors can update" on charters
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on requirements_briefs
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on risk_logs
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on budget_trackers
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on exec_comms_plans
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on team_newsletters
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

alter policy "project editors can update" on post_mortems
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward - expect all 7 rows to show both conditions in qual/with_check:
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in (
--     'charters', 'requirements_briefs', 'risk_logs', 'budget_trackers',
--     'exec_comms_plans', 'team_newsletters', 'post_mortems'
--   ) and policyname = 'project editors can update'
--   order by tablename;
