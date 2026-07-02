-- Run this in the Supabase SQL editor (use "Run", not "run current
-- statement") to add optional start/due dates to tasks, ahead of the
-- Gantt chart feature.
--
-- `tasks` is one of the original tables and already has working anon
-- access, so unlike the newer document tables (see
-- supabase/migrations/README.md) this migration does not need any RLS
-- policy changes - just the two new nullable columns.

alter table tasks add column if not exists start_date date;
alter table tasks add column if not exists due_date date;
