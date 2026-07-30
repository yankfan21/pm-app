-- Adds rate-limit hardening on top of task_notification_cron_sync_fix.sql.
--
-- Root cause (confirmed against pg_net source, supabase/pg_net):
-- net._await_response really does block the calling backend (polls
-- net._http_response every 50ms until the row exists), so the sync fix's
-- own sequencing is correct. But pg_net's background worker doesn't fire
-- one request at a time - each wake cycle it does
-- consume_request_queue(batch_size), fires everything it just consumed
-- concurrently via curl_multi, then inserts all the responses in ONE
-- transaction before committing. now() is frozen at transaction start, so
-- every row from that batch gets an identical net._http_response.created
-- timestamp regardless of real send order. If our next net.http_post lands
-- in the queue before the worker's next consume_request_queue call, it gets
-- swept into the same batch as a request that's still in flight or just
-- completed, and both get fired to Resend concurrently - no explicit
-- synchronization in the sync fix prevents this, since it only serializes
-- our loop's *perception* of completion, not the worker's dispatch
-- grouping.
--
-- Fix (two parts, applied after each of the two existing
-- net.http_collect_response(..., async := false) calls - assignee send and
-- owner send):
--
-- 1. pg_sleep(0.12) immediately after collecting each response, before the
--    loop can proceed to the next net.http_post. Adds a floor under actual
--    throughput (~8.3 req/sec worst case) independent of pg_net's batching,
--    so sustained load stays under Resend's 10 req/sec cap even if the
--    worker groups sends together.
--
-- 2. One retry on 429: if (v_collected).response.status_code = 429, wait 1s
--    then re-issue the same net.http_post body once, collect its response
--    (with the same pg_sleep(0.12) pacing applied after), and log success
--    or failure via raise notice. No further retries - a 429 on the retry
--    is logged and the loop moves on, so a persistent outage can't hang the
--    cron job.
--
-- All Rule A/Rule B task selection, reminder_label logic, and
-- assignee/owner skip conditions are unchanged from the live function - see
-- task_notification_cron.sql and task_notification_cron_sync_fix.sql for
-- that history. This migration only touches the two send blocks.
--
-- create or replace function, safe to run regardless of what's currently
-- live - replaces the body in place, no DROP needed.

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
        perform pg_sleep(0.12);

        if (v_collected).response.status_code = 429 then
          raise notice 'send_task_due_reminders: assignee send for task % got 429, retrying once after 1s', rec.task_id;
          perform pg_sleep(1);

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
          perform pg_sleep(0.12);

          if (v_collected).response.status_code = 429 then
            raise notice 'send_task_due_reminders: assignee retry for task % also got 429, giving up', rec.task_id;
          else
            raise notice 'send_task_due_reminders: assignee retry for task % succeeded - http status=%', rec.task_id, (v_collected).response.status_code;
          end if;
        end if;

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
      perform pg_sleep(0.12);

      if (v_collected).response.status_code = 429 then
        raise notice 'send_task_due_reminders: owner send for task % got 429, retrying once after 1s', rec.task_id;
        perform pg_sleep(1);

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
        perform pg_sleep(0.12);

        if (v_collected).response.status_code = 429 then
          raise notice 'send_task_due_reminders: owner retry for task % also got 429, giving up', rec.task_id;
        else
          raise notice 'send_task_due_reminders: owner retry for task % succeeded - http status=%', rec.task_id, (v_collected).response.status_code;
        end if;
      end if;

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
-- for every send (including any that needed a retry), no un-retried 429s:
--
--   select id, status_code, content, error_msg, created
--   from net._http_response
--   order by created desc
--   limit 25;
