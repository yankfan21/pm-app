-- Extends project_evaluations' authenticated UPDATE policy with the
-- is_project_unclaimed(project_id) carve-out that INSERT and SELECT
-- already have.
--
-- Background: phase4_lockdown_rls.sql created "project editors can update"
-- with can_edit_project(project_id) only. fix_project_eval_unclaimed_access.sql
-- then added the carve-out to INSERT, and fix_project_eval_select_unclaimed.sql
-- to SELECT, but both deliberately left UPDATE alone - at the time, the
-- only thing UPDATE could mean was a PM editing an existing evaluation,
-- which is not an action that needs to work pre-claim.
--
-- That reasoning no longer covers every case. The Overview "Update Progress"
-- button now persists its recomputed metrics onto the latest evaluation row
-- (project-eval's metrics_only branch), which is an UPDATE. Without this
-- change, on an unclaimed project (owner_id is null) a logged-in user can
-- INSERT an evaluation and SELECT it back, but the metrics refresh matches
-- zero rows and silently fails to save - the exact asymmetry the two fixes
-- above were written to remove.
--
-- Scope, deliberately narrow:
--   - UPDATE (authenticated): gets the carve-out on BOTH using and
--     with_check, additive via OR. can_edit_project() alone still works
--     exactly as before for claimed projects. Both clauses are needed -
--     `using` decides which rows are visible to update, `with_check`
--     decides whether the resulting row is still allowed.
--   - INSERT/SELECT/DELETE: untouched.
--   - No anon policy anywhere in this file. Anonymous users still cannot
--     write to this table at all, which is what the Phase 4 lockdown and
--     the LLM cost gate both depend on.

alter policy "project editors can update" on project_evaluations
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward:
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where tablename = 'project_evaluations'
--   order by cmd, policyname;
--
-- Expect: the UPDATE policy's qual AND with_check each now contain both
-- can_edit_project and is_project_unclaimed; INSERT/SELECT/DELETE policies
-- unchanged; still no anon row for anything but SELECT.
