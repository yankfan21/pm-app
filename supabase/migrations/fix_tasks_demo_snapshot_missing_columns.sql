-- Fixes schema drift on tasks_demo_snapshot caught by
-- verify_demo_snapshot_schema() (added by add_phases_to_demo_reset.sql)
-- when add_issue_logs_to_demo_reset.sql ran and re-triggered that check.
--
-- tasks_demo_snapshot was last patched by add_phases_to_demo_reset.sql
-- (2026-07-17, for tasks.phase_id) but two later migrations against tasks
-- were never followed up with a matching snapshot-table fix:
--   - gantt_milestones_and_delayed_status.sql (2026-07-17) added
--     task_type, status
--   - tasks_assignee.sql (2026-07-19) added assignee_user_id, assignee_name
--
-- Same "append at the end, matching type" approach as add_phases_to_demo_reset.sql
-- used for phase_id - no constraints copied over (snapshot tables never
-- enforce business rules, just storage - see that migration's reasoning).
-- Order matters here: appended in the same order these columns were added
-- to the live tasks table, so ordinal position keeps matching for the
-- plain `select *` tasks_demo_snapshot restore in
-- demo_projects_nightly_reset.sql / add_phases_to_demo_reset.sql.
--
-- Run this BEFORE re-running add_issue_logs_to_demo_reset.sql (its
-- verify_demo_snapshot_schema() call will keep failing on this same drift
-- until it's fixed here first).

alter table tasks_demo_snapshot add column if not exists task_type text;
alter table tasks_demo_snapshot add column if not exists status text;
alter table tasks_demo_snapshot add column if not exists assignee_user_id uuid;
alter table tasks_demo_snapshot add column if not exists assignee_name text;

-- Verify afterward:
--
--   select column_name from information_schema.columns
--   where table_name = 'tasks_demo_snapshot'
--     and column_name in ('task_type', 'status', 'assignee_user_id', 'assignee_name');
--   -- expect 4 rows
