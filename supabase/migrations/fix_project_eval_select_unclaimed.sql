-- Follow-up to fix_project_eval_unclaimed_access.sql, same day: that file
-- extended project_evaluations' authenticated INSERT policy with the
-- is_project_unclaimed(project_id) carve-out but missed the authenticated
-- SELECT policy ("project members can view"), which still only allows
-- has_project_access(project_id).
--
-- Confirmed via direct SQL: INSERT alone succeeds on an unclaimed project,
-- but Supabase's .insert().select().single() pattern always does a
-- SELECT-back immediately after the INSERT to return the created row -
-- and that SELECT is what's actually failing, surfacing to the user as
-- "new row violates row-level security policy for table
-- project_evaluations" even though the row was created. Same fix shape as
-- the tasks/charters SELECT policies extended earlier today.
--
-- Scope, deliberately narrow: only this SELECT policy's USING clause
-- changes. INSERT/UPDATE/DELETE (authenticated) and the anon SELECT
-- policy added in fix_project_eval_unclaimed_access.sql are already
-- correct and untouched here.

alter policy "project members can view" on project_evaluations
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

-- Verify afterward:
--
--   select policyname, cmd, roles, qual
--   from pg_policies
--   where tablename = 'project_evaluations' and cmd = 'SELECT'
--   order by roles;
--
-- Expect: the authenticated SELECT policy's qual now contains both
-- has_project_access and is_project_unclaimed; the anon SELECT policy is
-- unchanged.
