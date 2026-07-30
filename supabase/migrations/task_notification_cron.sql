-- STEP 4 of "Automated task notifications via Resend". Daily cron job that
-- finds due-soon/overdue items and calls send-task-notification for each
-- recipient. Follows the same function-plus-idempotent-cron.schedule pattern
-- as demo_projects_nightly_reset.sql's nightly-demo-reset job.
--
-- Requires enable_pg_net.sql (net.http_post) and
-- task_assignment_notification_trigger.sql's Edge Function contract to
-- already be in place - this migration doesn't redefine the payload shape,
-- it reuses it.
--
-- ── Which rows qualify: implemented by row shape, not projects.methodology ──
--
-- The spec describes two rule sets, "Waterfall/Hybrid tasks" (task_type +
-- due_date + status) and "Agile items" (sprint_id + board_status). Read
-- literally as a methodology-column gate, that leaves a real gap: Hybrid
-- projects use BOTH mechanisms on the same `tasks` table (plain Gantt tasks
-- AND sprint-board items pulled off their backlog - see
-- product_backlog_schema.sql / sprint_board_schema.sql) - a project.methodology
-- = 'hybrid' gate would have to arbitrarily pick one rule set and silently
-- drop the other for every Hybrid project's rows.
--
-- Implemented here by row shape instead, which covers Hybrid correctly with
-- no methodology lookup needed at all:
--   - sprint_id is not null -> treated as an in-sprint item (rule B:
--     board_status), regardless of project methodology.
--   - else, task_type = 'task' -> treated as a Gantt task (rule A: status +
--     due_date), regardless of project methodology.
-- A row can't be both (sprint_id not null takes priority), so nothing is
-- double-processed. Pure Agile projects' un-sprinted backlog items have no
-- sprint_id and are excluded by rule B's own filter either way, matching
-- "raw backlog items... excluded entirely" from the spec. Flagging this
-- interpretation choice explicitly since it's a deviation from a literal
-- methodology-column read.
--
-- ── Reminder days ──
--
-- Exactly the 3 checkpoints named in the spec: due in 3 days, due in 1 day,
-- and overdue (due_date < today, any amount - re-sent every day this job
-- runs while still overdue, per "sent daily once overdue"). A task due
-- *today* (days_until_due = 0) is not covered by any of the 3 - not a
-- checkpoint the spec listed, so left out rather than guessed at.
--
-- ── Recipients ──
--
-- Both the assignee (assignee_user_id only - assignee_name free-text is
-- skipped with a raise notice, no email to send it to, same as the
-- assignment trigger) and the project owner (owner_id/owner_email straight
-- off the projects row) get notified, per the spec. If the owner is also the
-- assignee, only one email goes out (deduped below) rather than two
-- identical ones.
--
-- No separate "already sent today" ledger table - this job is scheduled to
-- run once daily, so one pass = one email per qualifying (task, recipient)
-- pair naturally. Running restore_demo_projects()-style ad hoc re-runs of
-- this function on the same day would re-send duplicates, same tradeoff
-- demo_projects_nightly_reset.sql accepts for its own job - not solved here,
-- flagging it as a known gap rather than adding an unrequested tracking
-- table.

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
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- ── schedule ─────────────────────────────────────────────────────────────
-- 13:00 UTC daily - adjust to whatever local morning time you actually want
-- before running this file (pg_cron times are UTC). Idempotent, same as
-- nightly-demo-reset: unschedules any existing job of the same name first.

select cron.unschedule(jobid) from cron.job where jobname = 'daily-task-due-reminders';

select cron.schedule(
  'daily-task-due-reminders',
  '0 13 * * *',
  $$select public.send_task_due_reminders();$$
);

-- Verify afterward:
--
--   select jobname, schedule, active from cron.job where jobname = 'daily-task-due-reminders';
--
-- To test immediately without waiting for the schedule:
--   select public.send_task_due_reminders();
--
-- Then check pg_net actually fired the outbound calls:
--   select id, url, status_code, created
--   from net._http_response
--   order by created desc
--   limit 20;
