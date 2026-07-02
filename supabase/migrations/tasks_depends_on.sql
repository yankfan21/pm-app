-- Run this in the Supabase SQL editor (use "Run", not "run current
-- statement") to let a task depend on another task in the same project,
-- powering dependency lines on the Gantt chart.
--
-- Same situation as tasks_start_due_dates.sql: `tasks` already has working
-- anon access, so no RLS policy changes needed here - just the column.
--
-- Single dependency per task for v1 (not a list of dependencies) - simpler
-- to build and covers the common case. `on delete set null` means deleting
-- a task clears it as a dependency for anything that pointed to it, rather
-- than erroring or cascading.

alter table tasks add column if not exists depends_on uuid references tasks(id) on delete set null;
