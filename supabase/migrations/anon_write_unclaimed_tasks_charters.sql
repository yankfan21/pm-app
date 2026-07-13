-- Standalone follow-up to phase4_lockdown_rls.sql: the full file failed
-- partway through on "policy 'project members can view' for table
-- 'projects' already exists" (confirmed the projects/tasks/charters
-- SELECT policies from earlier passes are already live) before it reached
-- these 8 new anon policies. This snippet contains ONLY the net-new
-- CREATE POLICY statements - no DROP, no re-creation of anything that
-- already exists. Requires is_project_unclaimed(project_id) to already
-- exist (added earlier in phase4_lockdown_rls.sql) - confirm that ran
-- before running this.
--
-- Deliberate risk-accepted decision, 2026-07-13: unclaimed projects
-- (owner_id is null) are fully open to anon on tasks/charters specifically
-- - view AND write, no account needed - while claimed projects stay fully
-- private via the existing authenticated-only policies. Scoped tightly to
-- is_project_unclaimed(project_id): the instant a project's owner_id gets
-- set (via the "claim" policy on projects), that function starts
-- returning false for it and all 8 of these policies stop applying to it
-- automatically - no per-project cleanup needed. Not extended to any
-- other table or to the authenticated policies.

create policy "anyone can view tasks on unclaimed projects" on tasks
  for select to anon
  using (is_project_unclaimed(project_id));
create policy "anyone can create tasks on unclaimed projects" on tasks
  for insert to anon
  with check (is_project_unclaimed(project_id));
create policy "anyone can update tasks on unclaimed projects" on tasks
  for update to anon
  using (is_project_unclaimed(project_id))
  with check (is_project_unclaimed(project_id));
create policy "anyone can delete tasks on unclaimed projects" on tasks
  for delete to anon
  using (is_project_unclaimed(project_id));

create policy "anyone can view charters on unclaimed projects" on charters
  for select to anon
  using (is_project_unclaimed(project_id));
create policy "anyone can create charters on unclaimed projects" on charters
  for insert to anon
  with check (is_project_unclaimed(project_id));
create policy "anyone can update charters on unclaimed projects" on charters
  for update to anon
  using (is_project_unclaimed(project_id))
  with check (is_project_unclaimed(project_id));
create policy "anyone can delete charters on unclaimed projects" on charters
  for delete to anon
  using (is_project_unclaimed(project_id));
