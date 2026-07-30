-- STEP 2 of splitting send_task_due_reminders() into a fast scanner +
-- batched drainer. Requires create_task_reminder_queue.sql to have already
-- been run.
--
-- Problem: the old send_task_due_reminders() (fix_task_reminder_rate_limiting.sql)
-- did synchronous net.http_post + net.http_collect_response(async := false)
-- inline for every due/overdue (task, recipient) pair - up to 246 calls at
-- current volume, each paced by pg_sleep(0.12) plus a pg_sleep(1) + retry on
-- any 429. That's minutes of blocking work inside one cron invocation,
-- against a 2-minute statement_timeout.
--
-- Fix: same Rule A / Rule B task-finding logic (unchanged, copied verbatim
-- from the live function), but instead of sending inline, it now inserts one
-- 'pending' row per (task, recipient) into task_reminder_queue - no HTTP
-- calls, no sleeps, returns almost immediately regardless of volume. A new
-- drain_task_reminder_queue() function does the actual sending, in batches
-- of 25, on its own once-a-minute schedule - so no single invocation is ever
-- on the hook for more than 25 sends' worth of pacing/retry sleeps
-- (worst case ~25 * (0.12 + up to 1s retry) seconds, well under the
-- 2-minute timeout).
--
-- create or replace function, so both are safe to run regardless of prior
-- state - no DROP needed.

-- ── scanner ──────────────────────────────────────────────────────────────

create or replace function public.send_task_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_days_until_due integer;
  v_reminder_event text;
  v_reminder_label text;
  v_assignee_email text;
begin
  for rec in
    -- Rule A: Waterfall/Hybrid Gantt tasks (not in a sprint)
    select t.id as task_id, t.project_id, t.title, t.due_date,
           t.assignee_user_id, t.assignee_name,
           p.owner_id, p.owner_email
    from tasks t
    join projects p on p.id = t.project_id
    where t.sprint_id is null
      and t.task_type = 'task'
      and t.status <> 'completed'
      and t.due_date is not null
      and (
        (t.due_date - current_date) in (3, 1)
        or t.due_date < current_date
      )

    union all

    -- Rule B: in-sprint items (Agile or Hybrid) pulled onto the sprint board
    select t.id as task_id, t.project_id, t.title, t.due_date,
           t.assignee_user_id, t.assignee_name,
           p.owner_id, p.owner_email
    from tasks t
    join projects p on p.id = t.project_id
    where t.sprint_id is not null
      -- board_status is nullable (sprint_board_schema.sql - an item can be
      -- pulled into a sprint before ever being moved on the Kanban board, so
      -- board_status starts null, not 'todo'). `<> 'done'` alone would
      -- silently exclude those never-yet-boarded rows (NULL <> 'done' is
      -- NULL, not true, in a WHERE clause) - explicitly treating null as
      -- "not done" here.
      and (t.board_status is null or t.board_status <> 'done')
      and t.due_date is not null
      and (
        (t.due_date - current_date) in (3, 1)
        or t.due_date < current_date
      )
  loop
    v_days_until_due := rec.due_date - current_date;

    if v_days_until_due = 3 then
      v_reminder_event := 'task_due_soon';
      v_reminder_label := 'in 3 days';
    elsif v_days_until_due = 1 then
      v_reminder_event := 'task_due_soon';
      v_reminder_label := 'tomorrow';
    else
      v_reminder_event := 'task_overdue';
      v_reminder_label := abs(v_days_until_due) || ' day' || (case when abs(v_days_until_due) = 1 then '' else 's' end) || ' overdue';
    end if;

    -- Assignee, if a real user is attached.
    if rec.assignee_user_id is not null then
      select email into v_assignee_email from auth.users where id = rec.assignee_user_id;
      if v_assignee_email is null then
        raise notice 'send_task_due_reminders: no auth.users row for assignee_user_id % on task %, skipping', rec.assignee_user_id, rec.task_id;
      else
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.assignee_user_id, v_assignee_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      end if;
    elsif rec.assignee_name is not null then
      raise notice 'send_task_due_reminders: task % assigned via free-text assignee_name (%), no user_id - skipping assignee notification', rec.task_id, rec.assignee_name;
    end if;

    -- Project owner, if the project has one (unclaimed projects have
    -- owner_id null - nothing to notify) and isn't the same person as the
    -- assignee (avoid sending the same reminder twice to one inbox).
    if rec.owner_id is not null and rec.owner_id is distinct from rec.assignee_user_id then
      if rec.owner_email is null then
        raise notice 'send_task_due_reminders: no owner_email for project %, task %, skipping owner notification', rec.project_id, rec.task_id;
      else
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.owner_id, rec.owner_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- ── drainer ──────────────────────────────────────────────────────────────
-- Same send + pacing (pg_sleep 0.12) + 429-retry-once (pg_sleep 1) logic as
-- the old inline function, just moved to operate on queue rows instead of
-- the raw task scan. Batch of 25 per invocation, run every minute - clears a
-- 246-row backlog in ~10 minutes, each individual run staying well under the
-- 2-minute statement_timeout.

create or replace function public.drain_task_reminder_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_request_id bigint;
  v_collected net.http_response_result;
begin
  for rec in
    select id, task_id, recipient_user_id, recipient_email, event_type,
           task_title, project_id, project_name, due_date, reminder_label, attempts
    from task_reminder_queue
    where status = 'pending'
    order by created_at asc
    limit 25
  loop
    v_request_id := net.http_post(
      url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'event_type', rec.event_type,
        'recipient_user_id', rec.recipient_user_id,
        'recipient_email', rec.recipient_email,
        'task_id', rec.task_id,
        'task_title', rec.task_title,
        'project_id', rec.project_id,
        'project_name', rec.project_name,
        'due_date', rec.due_date,
        'reminder_label', rec.reminder_label
      ),
      timeout_milliseconds := 10000
    );

    v_collected := net.http_collect_response(v_request_id, async := false);
    perform pg_sleep(0.12);

    if (v_collected).response.status_code = 429 then
      raise notice 'drain_task_reminder_queue: queue row % got 429, retrying once after 1s', rec.id;
      perform pg_sleep(1);

      v_request_id := net.http_post(
        url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'event_type', rec.event_type,
          'recipient_user_id', rec.recipient_user_id,
          'recipient_email', rec.recipient_email,
          'task_id', rec.task_id,
          'task_title', rec.task_title,
          'project_id', rec.project_id,
          'project_name', rec.project_name,
          'due_date', rec.due_date,
          'reminder_label', rec.reminder_label
        ),
        timeout_milliseconds := 10000
      );

      v_collected := net.http_collect_response(v_request_id, async := false);
      perform pg_sleep(0.12);
    end if;

    if (v_collected).response.status_code between 200 and 299 then
      update task_reminder_queue
      set status = 'sent', sent_at = now(), attempts = attempts + 1
      where id = rec.id;
      raise notice 'drain_task_reminder_queue: queue row % sent - pg_net status=%, http status=%',
        rec.id, (v_collected).status, (v_collected).response.status_code;
    else
      update task_reminder_queue
      set status = 'failed', attempts = attempts + 1
      where id = rec.id;
      raise notice 'drain_task_reminder_queue: queue row % failed - pg_net status=%, http status=%',
        rec.id, (v_collected).status, (v_collected).response.status_code;
    end if;
  end loop;
end;
$$;

revoke all on function public.drain_task_reminder_queue() from public, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- task_reminder_queue holds recipient emails and is only ever touched by
-- the two security definer functions above (owned by postgres) - no
-- authenticated-user-facing policy needed. RLS on with zero policies means
-- anon/authenticated get nothing via PostgREST, matching the "every new
-- table gets the real authenticated-only model from day one" convention
-- this project has followed since phase4 lockdown (see
-- notification_preferences_schema.sql).

alter table task_reminder_queue enable row level security;

-- ── schedule ─────────────────────────────────────────────────────────────
-- Scanner keeps the same daily 13:00 UTC cadence, now just queues instead of
-- sending. Drainer is new: every minute, idempotent unschedule/schedule by
-- jobname, same pattern as every other cron job in this project.

select cron.unschedule(jobid) from cron.job where jobname = 'daily-task-due-reminders';

select cron.schedule(
  'daily-task-due-reminders',
  '0 13 * * *',
  $$select public.send_task_due_reminders();$$
);

select cron.unschedule(jobid) from cron.job where jobname = 'drain-task-reminder-queue';

select cron.schedule(
  'drain-task-reminder-queue',
  '* * * * *',
  $$select public.drain_task_reminder_queue();$$
);

-- Verify afterward:
--
--   select jobname, schedule, active from cron.job
--   where jobname in ('daily-task-due-reminders', 'drain-task-reminder-queue');
--
-- Manual test without waiting for the schedule:
--
--   select public.send_task_due_reminders();
--   select status, count(*) from task_reminder_queue group by status;
--   select public.drain_task_reminder_queue();
--   select status, count(*) from task_reminder_queue group by status;
--
-- Check raise notices in the SQL editor's output/logs for per-row
-- pg_net status / http status, same as the old function's logging style.
