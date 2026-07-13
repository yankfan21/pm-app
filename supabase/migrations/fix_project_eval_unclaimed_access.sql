-- Fixes two RLS gaps on project_evaluations found while testing "Evaluate
-- now" from the dashboard, 2026-07-13.
--
-- Problem 1: "project editors can insert" requires can_edit_project(),
-- which requires ownership/collaborator membership - so a logged-in user
-- clicking "Evaluate now" on an unclaimed project (owner_id is null) hits
-- "new row violates row-level security policy for table
-- project_evaluations". The login gate added earlier today was meant to
-- stop anonymous cost abuse of the LLM call, not restrict evaluation to
-- project owners only - unclaimed projects should be evaluable by any
-- logged-in user, same as they're already viewable/editable on
-- tasks/charters pre-claim.
--
-- Problem 2: no anon SELECT policy exists on this table at all, unlike
-- tasks/charters/projects, which all already carve out anon SELECT for
-- unclaimed projects. Without it, the color-coded health badge on the
-- dashboard/All Projects list can't render for a true anonymous visitor
-- even on an unclaimed project.
--
-- Standalone file rather than editing phase4_lockdown_rls.sql directly -
-- that file already ran (with its project_evaluations section using the
-- old can_edit_project()-only INSERT check), so re-running the whole file
-- would hit the same "policy already exists" collision seen earlier
-- today. This applies just the incremental fix.
--
-- Scope, deliberately narrow:
--   - INSERT (authenticated): gets the is_project_unclaimed(project_id)
--     carve-out, additive via OR - can_edit_project() alone still works
--     exactly as before for claimed projects.
--   - SELECT (anon): new policy, scoped to unclaimed projects only, same
--     shape as the existing tasks/charters anon SELECT policies.
--   - UPDATE/DELETE: untouched, still can_edit_project(project_id) only,
--     both roles. Editing/deleting an existing evaluation is not the
--     action that needs to work pre-claim - only generating a new one is.
--   - No anon INSERT/UPDATE/DELETE anywhere in this file - creating an
--     evaluation stays login-gated, which was the entire point of
--     today's earlier fix.

alter policy "project editors can insert" on project_evaluations
  with check (can_edit_project(project_id) or is_project_unclaimed(project_id));

create policy "anyone can view evaluations on unclaimed projects" on project_evaluations
  for select
  to anon
  using (is_project_unclaimed(project_id));

-- Verify afterward:
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where tablename = 'project_evaluations'
--   order by cmd, policyname;
--
-- Expect: INSERT policy's with_check now contains both can_edit_project
-- and is_project_unclaimed; a new SELECT policy for role {anon} exists;
-- UPDATE/DELETE policies unchanged from before this file ran.
