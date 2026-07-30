-- Fixes send_task_due_reminders() (split_task_reminder_scanner_and_drainer.sql)
-- inserting a fresh task_reminder_queue row every single scan, with nothing
-- to stop the same (task, recipient) pair from queuing duplicate reminders -
-- flagged as a known accepted gap when the queue was introduced, closing it
-- here.
--
-- Two different dedup windows, since the two event types mean different
-- things by "duplicate":
--   - task_due_soon: only fires once per task at exactly 3-days-out and once
--     at 1-day-out (each a distinct reminder_label - "in 3 days" vs
--     "tomorrow"), so guard on (task_id, recipient, event_type,
--     reminder_label) with no time bound - a given label should only ever be
--     queued once per task per recipient, period.
--   - task_overdue: label changes every day ("3 days overdue", "4 days
--     overdue", ...) by design (task_notification_cron.sql: "re-sent daily
--     once overdue"), so reminder_label can't be part of the guard or every
--     day's row would look unique. Guard on (task_id, recipient, event_type)
--     within a rolling 7-day window instead - blocks the scanner from
--     re-queuing the same overdue task if it's already been queued once
--     today (or any day in the last week), while still allowing a new row
--     once that window rolls past.
--
-- Scanner's row-finding logic (Rule A / Rule B) and reminder-day logic are
-- unchanged - only the two INSERT sites gain a NOT EXISTS guard. Recipient
-- context matters: the assignee and owner are checked against their own
-- prior rows (recipient_user_id), not each other's, so a project owner who
-- hasn't been reminded yet still gets queued even if the assignee already
-- was.
--
-- create index if not exists / create or replace function, so this is safe
-- to run more than once.

-- ── index ────────────────────────────────────────────────────────────────
-- Backs both guards' lookups (task_id + event_type always in the WHERE,
-- created_at for the overdue window, reminder_label checked in-row after).

create index if not exists task_reminder_queue_dedup_idx
  on task_reminder_queue (task_id, event_type, created_at);

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
      elsif not exists (
        select 1 from task_reminder_queue existing
        where existing.task_id = rec.task_id
          and existing.recipient_user_id = rec.assignee_user_id
          and (
            (v_reminder_event = 'task_due_soon' and existing.event_type = 'task_due_soon' and existing.reminder_label = v_reminder_label)
            or
            (v_reminder_event = 'task_overdue' and existing.event_type = 'task_overdue' and existing.created_at > now() - interval '7 days')
          )
      ) then
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.assignee_user_id, v_assignee_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      else
        raise notice 'send_task_due_reminders: assignee already queued for task % / % within dedup window, skipping', rec.task_id, v_reminder_event;
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
      elsif not exists (
        select 1 from task_reminder_queue existing
        where existing.task_id = rec.task_id
          and existing.recipient_user_id = rec.owner_id
          and (
            (v_reminder_event = 'task_due_soon' and existing.event_type = 'task_due_soon' and existing.reminder_label = v_reminder_label)
            or
            (v_reminder_event = 'task_overdue' and existing.event_type = 'task_overdue' and existing.created_at > now() - interval '7 days')
          )
      ) then
        insert into task_reminder_queue (
          task_id, recipient_user_id, recipient_email, event_type,
          task_title, project_id, project_name, due_date, reminder_label
        )
        values (
          rec.task_id, rec.owner_id, rec.owner_email, v_reminder_event,
          rec.title, rec.project_id, (select name from projects where id = rec.project_id),
          rec.due_date, v_reminder_label
        );
      else
        raise notice 'send_task_due_reminders: owner already queued for task % / % within dedup window, skipping', rec.task_id, v_reminder_event;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.send_task_due_reminders() from public, anon, authenticated;

-- Verify afterward:
--
--   select indexname from pg_indexes where tablename = 'task_reminder_queue';
--
-- Manual test - run twice back to back, second run should queue nothing new
-- for any task/recipient already covered by the first:
--
--   select public.send_task_due_reminders();
--   select task_id, recipient_user_id, event_type, reminder_label, created_at
--   from task_reminder_queue order by created_at desc limit 20;
--   select public.send_task_due_reminders();
--   select count(*) from task_reminder_queue; -- should be unchanged from before this second call
