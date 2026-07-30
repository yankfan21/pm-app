-- STEP 1 of splitting send_task_due_reminders() into a fast scanner +
-- batched drainer (see split_task_reminder_scanner_and_drainer.sql). Root
-- cause being fixed: the old function did synchronous net.http_post +
-- net.http_collect_response inline for every due/overdue recipient (up to
-- 246 calls at current volume, each with pacing/retry sleeps) - that blows
-- the 2-minute statement_timeout in one cron run.
--
-- This table is the hand-off point: the scanner (still on the 0 13 * * *
-- daily schedule) enumerates due/overdue (task, recipient) pairs fast, with
-- no HTTP calls, and inserts one 'pending' row per pair here. A separate
-- once-a-minute drainer job then works through the backlog in small batches,
-- so no single cron invocation is on the hook for all sends at once.

create table if not exists task_reminder_queue (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  recipient_user_id uuid,
  recipient_email text not null,
  event_type text not null,
  task_title text not null,
  project_id uuid not null,
  project_name text,
  due_date date,
  reminder_label text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists task_reminder_queue_status_created_at_idx
  on task_reminder_queue (status, created_at);

-- Verify afterward:
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'task_reminder_queue' order by ordinal_position;
