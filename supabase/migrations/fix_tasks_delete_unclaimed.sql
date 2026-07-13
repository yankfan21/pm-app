-- Same reversal as fix_tasks_update_unclaimed.sql and
-- fix_status_updates_delete_unclaimed.sql, for tasks DELETE:
-- "project editors can delete" on tasks was left can_edit_project-only (no
-- is_project_unclaimed carve-out), flagged separately rather than fixed
-- alongside the UPDATE migration since it was a distinct decision. Kept as
-- its own file rather than appended to fix_tasks_update_unclaimed.sql so
-- each migration stays a single, independently-runnable unit regardless of
-- whether the other has already been applied.
--
-- Scope: tasks DELETE only.

alter policy "project editors can delete" on tasks
  using (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward:
--
--   select policyname, cmd, qual
--   from pg_policies
--   where tablename = 'tasks' and policyname = 'project editors can delete';
