-- Bug found 2026-07-15 while smoke-testing Phase 2/3 as a real logged-in
-- user (not anon, and not on an already-existing project): a fresh
-- INSERT into projects by an authenticated user always failed with "new
-- row violates row-level security policy for table projects", even though
-- owner_id was correctly set to auth.uid() and the INSERT's own WITH CHECK
-- (owner_id = auth.uid()) is satisfied on its own - confirmed by retrying
-- the identical request without the return=representation header, which
-- succeeds (201, no body).
--
-- Root cause: supabase-js's .insert().select().single() (used by
-- NewProjectFlow.jsx for every project creation) sends
-- "Prefer: return=representation", which makes PostgREST select the row
-- back through the table's SELECT policy in the same statement as the
-- INSERT. The SELECT policy's only path for an owned project is
-- has_project_access(id), a security definer function that re-queries
-- projects/project_collaborators from scratch - and that nested subquery,
-- evaluated as part of the same command as the row's own INSERT, does not
-- reliably see the row's own just-written owner_id yet. The result: any
-- logged-in user creating a brand-new project got a hard failure on
-- something that should always succeed - anonymous project creation never
-- hit this (its SELECT path is the plain "owner_id is null" column check,
-- no subquery), and it never surfaced on any other table (tasks, charters,
-- etc.) either, since their has_project_access(project_id) subquery always
-- points at a project row that already existed before that statement, not
-- one created in the very same statement.
--
-- Fix: add a direct, no-subquery fast path (owner_id = auth.uid()) ahead
-- of has_project_access(id) - evaluated against the row's own data with no
-- separate query, so it can't be affected by the same-statement visibility
-- gotcha. Purely additive (OR), doesn't change who can see what beyond
-- fixing this one gap.

drop policy if exists "project members can view" on projects;
create policy "project members can view" on projects
  for select to authenticated
  using (owner_id = auth.uid() OR has_project_access(id) OR owner_id is null);

-- Verify afterward - expect the qual to contain all three conditions:
--
--   select qual from pg_policies
--   where tablename = 'projects' and policyname = 'project members can view';
