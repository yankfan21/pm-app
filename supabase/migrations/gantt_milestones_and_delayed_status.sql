-- Run this in the Supabase SQL editor (use "Run", not "run current
-- statement") to add two things to the Gantt/task data model:
--   1. A milestone marker type for tasks (zero-duration, single-date,
--      diamond icon on the Gantt chart).
--   2. A "Delayed" status, manually set by the PM.
--
-- Both are additive - no existing column is dropped or renamed, and no
-- existing row's behavior changes (defaults preserve current behavior).

-- 1. Milestone marker -------------------------------------------------
--
-- NOTE ON NAMING: this is unrelated to the existing `milestones` table
-- (see milestones_schema.sql) and its tasks.milestone_id FK, which is a
-- grouping/Epic entity with its own start_date/end_date range - e.g. "M1:
-- Foundation" grouping several tasks. This is a different concept: a
-- single task marked as a zero-duration diamond event on the Gantt chart
-- (e.g. "Design sign-off", "Go-live"). The two features can coexist on
-- the same task (a milestone-marker task could also belong to a
-- milestone group), but they don't otherwise interact. Flagging the name
-- collision here since both are called "milestone" in PM vocabulary.
--
-- task_type distinguishes a milestone marker from a regular task. Value
-- is 'milestone_marker', not 'milestone' - deliberately avoiding the
-- exact word already used by the milestones table/tasks.milestone_id FK,
-- so a search for "milestone" doesn't turn up two unrelated features
-- under an identical value. A milestone reuses the existing due_date
-- column for its single date (same column a single-date regular task
-- already uses) rather than adding a parallel date field -
-- GanttChart.jsx/ganttLayout.js already treat "only due_date set" as a
-- single-date item; task_type just adds an explicit, queryable
-- distinction on top of that instead of inferring "is this a milestone"
-- from date-shape alone. The check constraint enforces the "no date
-- range" requirement: a milestone marker can never have start_date set.
alter table tasks add column if not exists task_type text not null default 'task';

alter table tasks drop constraint if exists tasks_task_type_check;
alter table tasks add constraint tasks_task_type_check
  check (task_type in ('task', 'milestone_marker'));

alter table tasks drop constraint if exists tasks_milestone_no_start_date_check;
alter table tasks add constraint tasks_milestone_no_start_date_check
  check (task_type <> 'milestone_marker' or start_date is null);

-- 2. Delayed status -----------------------------------------------------
--
-- There is currently no status enum on tasks at all - just a `completed`
-- boolean (true/false), so "not started" and "in progress" aren't
-- actually distinguished today. This adds a real status column with all
-- four values (including the new "Delayed"), backfilled from the
-- existing boolean so no task's displayed state changes.
--
-- `completed` is left in place rather than dropped - the frontend still
-- reads/writes it in several places (the task checkbox in
-- ProjectDetail.jsx, sprint stats, etc.), and migrating every one of
-- those call sites is frontend work that hasn't happened yet. Once the
-- frontend switches to `status` as the source of truth, keeping the two
-- in sync (or dropping `completed` outright) can be a follow-up
-- migration - flagging that now so it isn't forgotten.
--
-- Nothing here auto-computes "delayed" from due_date vs today - it's a
-- plain value the PM sets manually, same as the rest of this table's
-- status columns (backlog_status, board_status).
alter table tasks add column if not exists status text not null default 'not_started';

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'delayed'));

update tasks
  set status = case when completed then 'completed' else 'not_started' end
  where status = 'not_started' and completed = true;
