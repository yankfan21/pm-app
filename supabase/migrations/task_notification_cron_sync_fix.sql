-- Fixes send_task_due_reminders() still hitting a Resend 429 after two
-- pg_sleep increases (0.5s in task_notification_cron_ratelimit_fix.sql, 1s
-- in task_notification_cron_ratelimit_fix_v2.sql). Root cause: net.http_post
-- is fire-and-forget - it queues the request and returns the request_id
-- immediately, so pg_sleep between calls only paces how fast requests get
-- queued, not how fast pg_net's background worker actually fires them at
-- Resend. It was never a real throttle, just approximate pacing that
-- happened to mostly work.
--
-- Confirmed net.http_collect_response's real signature and return shape in
-- this project before making this change (per project convention - live
-- pg_net version can differ from generic docs, same reason net.http_post's
-- signature was confirmed earlier):
--
--   net.http_collect_response(request_id bigint, async boolean DEFAULT true)
--   returns net.http_response_result
--     - status: net.request_status (pg_net's own lifecycle status - e.g.
--       SUCCESS/ERROR/PENDING - NOT the HTTP status code)
--     - message: text
--     - response: net.http_response
--       - status_code: integer (the actual HTTP status code)
--       - headers: jsonb
--       - body: text
--
-- Fix: pg_sleep removed entirely. After each net.http_post, capture the
-- returned request_id and immediately call
-- net.http_collect_response(request_id, async := false), which blocks until
-- that specific request has actually completed (or the timeout below hits)
-- before the loop moves to the next recipient/task. This makes sends
-- genuinely sequential - each one waits for the prior send to actually
-- finish - instead of being approximately spaced by a sleep timer that
-- doesn't know when the real HTTP call landed. Resend's rate limit is
-- inherently respected by this: only one request is ever in flight at a
-- time, so there's no "2 requests/second" to accidentally exceed.
--
-- (collected).status and (collected).response.status_code are logged via
-- raise notice after every collect, so a failed send (pg_net-level error, or
-- an HTTP error status from the Edge Function/Resend) is visible in Postgres
-- logs without needing to separately query net._http_response.
--
-- timeout_milliseconds := 10000 kept on the net.http_post calls themselves
-- (task_notification_cron_timeout_fix.sql) - unrelated concern, still valid.
-- net.http_collect_response itself only takes (request_id, async) per the
-- confirmed signature above - no separate timeout parameter of its own, so
-- there's nothing to pass here; the blocking wait is bounded by the
-- request's own timeout_milliseconds from the http_post call that queued it.
--
-- Everything else unchanged from task_notification_cron_ratelimit_fix_v2.sql
-- - same row selection (Rule A / Rule B by row shape), same reminder-day
-- logic, same recipients/dedup. See task_notification_cron.sql's header
-- comments for the full original rationale; not repeated here.
--
-- create or replace function, so this is safe to run regardless of whether
-- task_notification_cron_ratelimit_fix_v2.sql has fired yet - it just
-- replaces the body in place, no DROP needed.

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
  v_request_id bigint;
  v_collected net.http_response_result;
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
        v_request_id := net.http_post(
          url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object(
            'event_type', v_reminder_event,
            'recipient_user_id', rec.assignee_user_id,
            'recipient_email', v_assignee_email,
            'task_id', rec.task_id,
            'task_title', rec.title,
            'project_id', rec.project_id,
            'project_name', (select name from projects where id = rec.project_id),
            'due_date', rec.due_date,
            'reminder_label', v_reminder_label
          ),
          timeout_milliseconds := 10000
        );

        v_collected := net.http_collect_response(v_request_id, async := false);
        raise notice 'send_task_due_reminders: assignee send for task % - pg_net status=%, http status=%',
          rec.task_id, (v_collected).status, (v_collected).response.status_code;
      end if;
    elsif rec.assignee_name is not null then
      raise notice 'send_task_due_reminders: task % assigned via free-text assignee_name (%), no user_id - skipping assignee notification', rec.task_id, rec.assignee_name;
    end if;

    -- Project owner, if the project has one (unclaimed projects have
    -- owner_id null - nothing to notify) and isn't the same person as the
    -- assignee (avoid sending the same reminder twice to one inbox).
    if rec.owner_id is not null and rec.owner_id is distinct from rec.assignee_user_id then
      v_request_id := net.http_post(
        url := 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'event_type', v_reminder_event,
          'recipient_user_id', rec.owner_id,
          'recipient_email', rec.owner_email,
          'task_id', rec.task_id,
          'task_title', rec.title,
          'project_id', rec.project_id,
          'project_name', (select name from projects where id = rec.project_id),
          'due_date', rec.due_date,
          'reminder_label', v_reminder_label
        ),
        timeout_milliseconds := 10000
      );

      v_collected := net.http_collect_response(v_request_id, async := false);
      raise notice 'send_task_due_reminders: owner send for task % - pg_net status=%, http status=%',
        rec.task_id, (v_collected).status, (v_collected).response.status_code;
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- Verify afterward: re-run the manual test
-- (select public.send_task_due_reminders();) and check the raise notices in
-- the SQL editor's output/logs - expect status=SUCCESS and http status=200
-- for every send, no 429s anywhere:
--
--   select id, url, status_code, created
--   from net._http_response
--   order by created desc
--   limit 25;
