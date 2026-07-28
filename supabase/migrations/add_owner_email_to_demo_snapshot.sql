-- Fixes schema drift on projects_demo_snapshot: capture_demo_snapshot()
-- failed with "projects_demo_snapshot is missing column owner_email
-- present on projects".
--
-- projects_demo_snapshot was created 2026-07-16 (demo_projects_nightly_reset.sql,
-- `like projects including defaults`). add_owner_email_to_projects.sql
-- (2026-07-27) added projects.owner_email afterward and was never followed
-- up with a matching snapshot-table column - same drift class as
-- fix_tasks_demo_snapshot_missing_columns.sql already hit once for tasks.
--
-- Verified this is the ONLY drift: every other `alter table projects add
-- column` migration (owner_id, methodology, is_demo) predates the
-- 2026-07-16 snapshot-table creation, so those columns were already
-- present when `like projects including defaults` ran. No `alter table
-- projects drop column` exists in the migration history either.
--
-- Appended at the end, matching type (text) - capture_demo_snapshot() does
-- `insert into projects_demo_snapshot select * from projects`, which maps
-- by ordinal position, not name. owner_email is the last column on the
-- live projects table (it was appended via ALTER TABLE), so it must be
-- last here too for that select * to line up.

alter table projects_demo_snapshot add column if not exists owner_email text;

select public.capture_demo_snapshot();

-- Verify afterward:
--
--   select column_name from information_schema.columns
--   where table_name = 'projects_demo_snapshot' and column_name = 'owner_email';
--   -- expect 1 row
