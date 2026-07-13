-- Single clean step to take the live database from its currently
-- confirmed-partial state straight to fully correct - no more
-- discovering one partial-application gap at a time.
--
-- Confirmed live state as of 2026-07-13 before this runs:
--   - is_project_unclaimed(project_id) function: LIVE (confirmed via
--     create_is_project_unclaimed_function.sql having been run)
--   - tasks/charters "project members can view" policies: LIVE, but still
--     the OLD condition (using (has_project_access(project_id)) only) -
--     the "or is_project_unclaimed(project_id)" extension from an earlier
--     pass never actually applied, because the full phase4_lockdown_rls.sql
--     run stops partway through on a policy-already-exists collision on
--     projects, before reaching either this policy update or the 8 anon
--     policies below.
--   - The 8 anon policies (tasks/charters x select/insert/update/delete,
--     scoped to is_project_unclaimed(project_id)): NOT live yet.
--
-- This snippet contains only what's still missing: the two ALTER POLICY
-- statements, then the 8 anon CREATE POLICY statements from
-- anon_write_unclaimed_tasks_charters.sql, unchanged. Nothing here
-- touches the function itself or anything already confirmed live.

alter policy "project members can view" on tasks
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

alter policy "project members can view" on charters
  using (has_project_access(project_id) or is_project_unclaimed(project_id));

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

-- Verify afterward - both should return true/8 respectively:
--
--   select
--     (select count(*) from pg_policies where tablename = 'tasks' and policyname = 'project members can view' and qual like '%is_project_unclaimed%') = 1
--     and (select count(*) from pg_policies where tablename = 'charters' and policyname = 'project members can view' and qual like '%is_project_unclaimed%') = 1
--     as select_policies_updated;
--
--   select count(*) from pg_policies
--   where tablename in ('tasks', 'charters') and roles = '{anon}';
