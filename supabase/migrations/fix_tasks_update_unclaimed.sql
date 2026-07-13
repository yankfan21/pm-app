-- Same reversal as fix_status_updates_delete_unclaimed.sql, for tasks
-- UPDATE: "project editors can update" on tasks was left can_edit_project-
-- only (no is_project_unclaimed carve-out) while SELECT/INSERT already had
-- it, so toggleComplete/updateTaskField (and the Sprint Board/Backlog's own
-- task updates) hard-crash with PostgREST's "Cannot coerce the result to a
-- single JSON object" on an unclaimed project - the UPDATE matches 0 rows,
-- and the chained .select().single() throws on the empty result.
--
-- Scope: tasks UPDATE only. tasks DELETE has the identical gap (same
-- can_edit_project-only policy, no carve-out) but is left untouched here -
-- that's a separate decision, flagged separately, not fixed as a side
-- effect of this migration.

alter policy "project editors can update" on tasks
  using (can_edit_project(project_id) or is_project_unclaimed(project_id))
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward - expect both conditions in qual and with_check:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename = 'tasks' and policyname = 'project editors can update';
