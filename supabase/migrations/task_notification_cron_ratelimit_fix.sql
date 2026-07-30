-- Fixes a 429 from Resend hit during testing of send_task_due_reminders()
-- (task_notification_cron.sql): 11 net.http_post calls fired back-to-back
-- with no delay, tripping Resend's per-second rate limit on one of them.
--
-- Fix: pg_sleep(0.5) after every net.http_post call in the loop (both the
-- assignee send and the owner send). This is a once-daily, low-volume batch
-- job (one project's worth of due/overdue tasks, not a mass mailer), so a
-- flat half-second pause per email is an acceptable, simple fix - no retry
-- logic or queueing added, matching the ask.
--
-- Everything else is unchanged from task_notification_cron.sql - same row
-- selection (Rule A / Rule B by row shape), same reminder-day logic, same
-- recipients/dedup. See that file's header comments for the full rationale;
-- not repeated here.
--
-- create or replace function, so this is safe to run after
-- task_notification_cron.sql regardless of whether that function has fired
-- yet - it just replaces the body in place, no DROP needed.

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
        perform net.http_post(
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
          )
        );
        -- Resend rate-limits per second - this loop can fire many sends back
        -- to back with nothing else to naturally space them out. Once-daily
        -- batch job, so a flat pause per send is fine.
        perform pg_sleep(0.5);
      end if;
    elsif rec.assignee_name is not null then
      raise notice 'send_task_due_reminders: task % assigned via free-text assignee_name (%), no user_id - skipping assignee notification', rec.task_id, rec.assignee_name;
    end if;

    -- Project owner, if the project has one (unclaimed projects have
    -- owner_id null - nothing to notify) and isn't the same person as the
    -- assignee (avoid sending the same reminder twice to one inbox).
    if rec.owner_id is not null and rec.owner_id is distinct from rec.assignee_user_id then
      perform net.http_post(
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
        )
      );
      perform pg_sleep(0.5);
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- Verify afterward: re-run the manual test from task_notification_cron.sql
-- (select public.send_task_due_reminders();) and confirm no 429 in
-- net._http_response.status_code across the batch:
--
--   select id, url, status_code, created
--   from net._http_response
--   order by created desc
--   limit 20;
