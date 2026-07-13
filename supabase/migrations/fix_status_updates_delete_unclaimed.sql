-- Reverses one part of fix_six_doctypes_unclaimed_access.sql's deliberate
-- "UPDATE/DELETE stays owner-only" decision for status_updates specifically:
-- DELETE now gets the same is_project_unclaimed(project_id) carve-out
-- already applied to SELECT/INSERT on this table (and to DELETE on
-- tasks/charters), so a logged-in user can delete a Status Update entry on
-- an unclaimed project, matching what canEdit already implies in the UI
-- since commit 13fa312 ("Grant editor role to logged-in users on unclaimed
-- projects").
--
-- Scope: status_updates DELETE only. UPDATE on status_updates, and every
-- policy on every other table, is untouched.

alter policy "project editors can delete" on status_updates
  using (can_edit_project(project_id) or is_project_unclaimed(project_id));

-- Verify afterward - expect the qual text to contain both conditions:
--
--   select policyname, cmd, qual
--   from pg_policies
--   where tablename = 'status_updates' and policyname = 'project editors can delete';
