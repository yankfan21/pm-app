-- Read-only verification: confirms the trigger-based guardrails described in
-- enforce_task_project_consistency.sql, fix_enforce_task_project_consistency_
-- null_not_reject.sql, task_dependencies_schema.sql, and task_dependency_
-- cycle_guard_fix.sql are actually attached/enabled in the LIVE database
-- (file presence in supabase/migrations/ doesn't guarantee that - see
-- task_dependency_cycle_guard_fix.sql's own header for a case where a
-- migration was pasted but silently rolled back before landing).
--
-- Two independent checks below. The Supabase SQL editor's "Run" only shows
-- the LAST statement's result set - if you click Run on the whole file
-- you'll only see check 2's output. To see both, either run each numbered
-- block separately (select it, then Run), or run the whole file twice and
-- comment out the other block each time.
--
-- Neither check writes anything - safe to run as many times as needed.

-- ============================================================
-- 1. Are all four triggers attached and enabled?
-- ============================================================
-- Expect exactly 4 rows back, all with tgenabled = 'O' (origin - the normal
-- "enabled" state). 'D' means disabled; a missing row means the trigger was
-- never created (or was created and then rolled back) in this database.

select
  tgname,
  tgrelid::regclass as table_name,
  tgenabled,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgname in (
  'enforce_task_project_consistency',
  'cleanup_stale_task_dependencies',
  'enforce_task_dependency_project_consistency',
  'prevent_task_dependency_cycles'
)
order by tgname;

-- ============================================================
-- 2. Do any current tasks rows have a stale sprint_id/milestone_id?
-- ============================================================
-- Same shape as scratch-stale-task-refs-check.sql. These would be rows that
-- went stale BEFORE enforce_task_project_consistency existed (or while it
-- was disabled/missing) - the trigger only corrects a row when it's next
-- written to, so this won't fix anything by itself. 0 rows back = nothing
-- left to clean up.

select id, project_id, sprint_id, milestone_id
from tasks
where (sprint_id is not null and not exists (
        select 1 from sprints s where s.id = tasks.sprint_id and s.project_id = tasks.project_id))
   or (milestone_id is not null and not exists (
        select 1 from milestones m where m.id = tasks.milestone_id and m.project_id = tasks.project_id));
